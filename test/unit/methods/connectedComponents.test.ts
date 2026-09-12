import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { observeSdaQueries } from "../../../benchmarks/queryProfile.ts";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import type SimpleTable from "../../../src/class/SimpleTable.ts";

function loadScenario(
  sdb: SimpleDB,
  name: string,
  scenario: string,
): SimpleTable {
  return sdb.newTable(name)
    .loadData("test/data/graphs/edges.csv")
    .filter(`scenario = '${scenario}'`)
    .selectColumns(["source", "target"]);
}

function partitions(rows: Record<string, unknown>[]) {
  return [...Map.groupBy(rows, (row) => row.componentId).values()]
    .map((group) => group.map((row) => row.node));
}

Deno.test("connectedComponents defaults to weak and finds baseline groups", async () => {
  const sdb = new SimpleDB();
  try {
    const expected = [
      { node: "A", componentId: 0 },
      { node: "B", componentId: 0 },
      { node: "C", componentId: 0 },
      { node: "D", componentId: 0 },
      { node: "E", componentId: 0 },
      { node: "F", componentId: 1 },
      { node: "G", componentId: 1 },
    ];
    assertEquals(
      await loadScenario(sdb, "defaultWeak", "baseline")
        .connectedComponents("source", "target").getData(),
      expected,
    );
    assertEquals(
      await loadScenario(sdb, "explicitWeak", "baseline")
        .connectedComponents("source", "target", { mode: "weak" }).getData(),
      expected,
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents strong mode requires mutual directed reachability", async () => {
  const sdb = new SimpleDB();
  try {
    const baseline = loadScenario(sdb, "baselineStrong", "baseline")
      .connectedComponents("source", "target", { mode: "strong" });
    assertEquals(await baseline.getData(), [
      { node: "A", componentId: 0 },
      { node: "B", componentId: 1 },
      { node: "C", componentId: 2 },
      { node: "D", componentId: 3 },
      { node: "E", componentId: 4 },
      { node: "F", componentId: 5 },
      { node: "G", componentId: 6 },
    ]);

    const cycle = loadScenario(sdb, "cycleStrong", "cycle")
      .connectedComponents("source", "target", { mode: "strong" });
    assertEquals(await cycle.getData(), [
      { node: "A", componentId: 0 },
      { node: "B", componentId: 0 },
      { node: "C", componentId: 0 },
      { node: "D", componentId: 0 },
      { node: "E", componentId: 0 },
      { node: "F", componentId: 1 },
      { node: "G", componentId: 2 },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents matches every shared fixture oracle case", async () => {
  const cases = [
    ["baseline-weak", "baseline", "weak"],
    ["baseline-strong", "baseline", "strong"],
    ["component-chain-weak", "component-chain", "weak"],
    ["component-chain-strong", "component-chain", "strong"],
    ["component-cycle-weak", "component-cycle", "weak"],
    ["component-cycle-strong", "component-cycle", "strong"],
    ["single-loop-weak", "single-loop", "weak"],
    ["single-loop-strong", "single-loop", "strong"],
  ] as const;
  const sdb = new SimpleDB();
  try {
    const oracle = sdb.newTable("componentOracle")
      .loadData("test/data/graphs/expected/connected_components.csv");
    for (const [index, [caseName, scenario, mode]] of cases.entries()) {
      const expected = oracle.clone()
        .filter(`"case" = '${caseName}'`)
        .removeColumns("case");
      const actual = loadScenario(sdb, `oracleActual${index}`, scenario)
        .connectedComponents("source", "target", { mode });
      assertEquals(await actual.getData(), await expected.getData(), caseName);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents partitions are independent of edge orientation, duplicates, and rows", async () => {
  const rows = [
    { source: "D", target: "C" },
    { source: "A", target: "B" },
    { source: "A", target: "B" },
    { source: "B", target: "B" },
    { source: "Y", target: "X" },
  ];
  const reversed = rows.toReversed().map(({ source, target }) => ({
    source: target,
    target: source,
  }));
  const sdb = new SimpleDB();
  try {
    for (const [index, edges] of [rows, reversed].entries()) {
      const result = await sdb.newTable(`weakOrientation${index}`)
        .loadArray(edges)
        .connectedComponents("source", "target").getData();
      assertEquals(partitions(result), [["A", "B"], ["C", "D"], ["X", "Y"]]);
      assertEquals(result, [
        { node: "A", componentId: 0 },
        { node: "B", componentId: 0 },
        { node: "C", componentId: 1 },
        { node: "D", componentId: 1 },
        { node: "X", componentId: 2 },
        { node: "Y", componentId: 2 },
      ]);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents labels and rows stay deterministic across permutations", async () => {
  const rows = [
    { source: "D", target: "C" },
    { source: "C", target: "D" },
    { source: "B", target: "A" },
    { source: "A", target: "B" },
    { source: "Y", target: "Z" },
  ];
  const sdb = new SimpleDB();
  try {
    for (const mode of ["weak", "strong"] as const) {
      const outputs = [];
      for (const [index, edges] of [rows, rows.toReversed()].entries()) {
        outputs.push(
          await sdb.newTable(`${mode}Permutation${index}`).loadArray(edges)
            .connectedComponents("source", "target", { mode }).getData(),
        );
      }
      assertEquals(outputs[0], outputs[1]);
      assertEquals(outputs[0], [
        { node: "A", componentId: 0 },
        { node: "B", componentId: 0 },
        { node: "C", componentId: 1 },
        { node: "D", componentId: 1 },
        { node: "Y", componentId: 2 },
        { node: "Z", componentId: mode === "weak" ? 2 : 3 },
      ]);
      assertEquals(
        partitions(outputs[0]),
        mode === "weak"
          ? [["A", "B"], ["C", "D"], ["Y", "Z"]]
          : [["A", "B"], ["C", "D"], ["Y"], ["Z"]],
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents preserves exact numeric IDs and numeric ordering", async () => {
  const sdb = new SimpleDB();
  try {
    const numeric = sdb.newTable("numericComponents");
    await sdb.customQuery(`CREATE TABLE "numericComponents" AS
      SELECT * FROM (VALUES
        (10::BIGINT, 20::BIGINT),
        (0::BIGINT, 2::BIGINT),
        (2::BIGINT, 0::BIGINT)
      ) edges(source, target)`);
    numeric.connectedComponents("source", "target", { mode: "strong" });
    assertEquals(await numeric.getData(), [
      { node: 0, componentId: 0 },
      { node: 2, componentId: 0 },
      { node: 10, componentId: 1 },
      { node: 20, componentId: 2 },
    ]);
    assertEquals(await numeric.getTypes(), {
      node: "BIGINT",
      componentId: "BIGINT",
    });

    const wide = sdb.newTable("wideComponents");
    await sdb.customQuery(`CREATE TABLE "wideComponents" AS
      SELECT * FROM (VALUES
        (9007199254740995::BIGINT, 9007199254740993::BIGINT),
        (9007199254740993::BIGINT, 9007199254740995::BIGINT),
        (0::BIGINT, 1::BIGINT)
      ) edges(source, target)`);
    wide.connectedComponents("source", "target", { mode: "strong" })
      .convert({ node: "string" });
    assertEquals(await wide.getData(), [
      { node: "0", componentId: 0 },
      { node: "1", componentId: 1 },
      { node: "9007199254740993", componentId: 2 },
      { node: "9007199254740995", componentId: 2 },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents uses byte-sensitive string identity despite collations", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("collatedComponents");
    await sdb.customQuery(`CREATE TABLE "collatedComponents" (
      source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE
    ); INSERT INTO "collatedComponents" VALUES
      ('a', 'b'), ('A', 'B')`);
    assertEquals(
      await table.connectedComponents("source", "target").getData(),
      [
        { node: "A", componentId: 0 },
        { node: "B", componentId: 0 },
        { node: "a", componentId: 1 },
        { node: "b", componentId: 1 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents uses fixed names for custom columns and preserves empty schemas", async () => {
  const sdb = new SimpleDB();
  try {
    const custom = sdb.newTable("customComponents")
      .loadData("test/data/graphs/custom-columns.csv")
      .connectedComponents("ORIGIN", "Destination");
    assertEquals(await custom.getData(), [
      { node: "A", componentId: 0 },
      { node: "B", componentId: 0 },
      { node: "C", componentId: 0 },
    ]);
    assertEquals(await custom.getColumns(), ["node", "componentId"]);

    const empty = sdb.newTable("emptyComponents");
    await sdb.customQuery(
      'CREATE TABLE "emptyComponents" (source VARCHAR, target VARCHAR)',
    );
    empty.connectedComponents("source", "target");
    assertEquals(await empty.getData(), []);
    assertEquals(await empty.getTypes(), {
      node: "VARCHAR",
      componentId: "BIGINT",
    });
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents supports overwrite and source-preserving outputs", async () => {
  const sdb = new SimpleDB();
  try {
    const defaultOverwrite = sdb.newTable("defaultOverwrite")
      .loadArray([{ source: "A", target: "B" }]);
    assertStrictEquals(
      defaultOverwrite.connectedComponents("source", "target"),
      defaultOverwrite,
    );
    assertEquals(await defaultOverwrite.getColumns(), ["node", "componentId"]);

    const explicitOverwrite = sdb.newTable("explicitOverwrite")
      .loadArray([{ source: "A", target: "B" }]);
    assertStrictEquals(
      explicitOverwrite.connectedComponents("source", "target", {
        outputTable: false,
      }),
      explicitOverwrite,
    );
    assertEquals(await explicitOverwrite.getRowCount(), 2);

    const source = sdb.newTable("preservedComponents")
      .loadArray([{ source: "A", target: "B" }]);
    const named = source.connectedComponents("source", "target", {
      outputTable: "namedComponents",
    }).filter("node = 'B'");
    assertEquals(named.name, "namedComponents");
    assertEquals(await named.getData(), [{ node: "B", componentId: 0 }]);
    assertEquals(await source.getData(), [{ source: "A", target: "B" }]);

    const generated = source.connectedComponents("source", "target", {
      mode: "strong",
      outputTable: true,
    });
    assertEquals(generated.name.startsWith("table"), true);
    assertEquals(generated.name === source.name, false);
    assertEquals(await generated.getRowCount(), 2);
    assertEquals(await source.getColumns(), ["source", "target"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents snapshots options before queued execution", async () => {
  const sdb = new SimpleDB();
  try {
    const options: {
      mode: "weak" | "strong";
      outputTable: string;
    } = { mode: "strong", outputTable: "componentSnapshot" };
    const result = sdb.newTable("snapshotSource")
      .loadArray([{ source: "A", target: "B" }])
      .connectedComponents("source", "target", options);
    options.mode = "weak";
    options.outputTable = "changed";
    assertEquals(result.name, "componentSnapshot");
    assertEquals(await result.getData(), [
      { node: "A", componentId: 0 },
      { node: "B", componentId: 1 },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents validates arguments before queuing", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      () => table.connectedComponents(1 as unknown as string, "target"),
      TypeError,
      "connectedComponents() source must be a string.",
    );
    assertThrows(
      () => table.connectedComponents("source", 1 as unknown as string),
      TypeError,
      "connectedComponents() target must be a string.",
    );
    assertThrows(
      () =>
        table.connectedComponents(
          "source",
          "target",
          null as unknown as Record<string, never>,
        ),
      TypeError,
      "connectedComponents() options must be an object.",
    );
    assertThrows(
      () =>
        table.connectedComponents("source", "target", {
          mode: "sideways" as "weak",
        }),
      TypeError,
      'connectedComponents() options.mode must be "weak" or "strong".',
    );
    assertThrows(
      () =>
        table.connectedComponents("source", "target", {
          outputTable: 1 as unknown as boolean,
        }),
      TypeError,
      "connectedComponents() options.outputTable must be a string or boolean.",
    );
    assertEquals(table.pendingOps.length, 0);
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents rejects schema errors without data validation scans", async () => {
  const sdb = new SimpleDB();
  try {
    const missing = sdb.newTable("missingComponentColumn")
      .loadArray([{ source: "A" }]);
    await assertRejects(
      () => missing.connectedComponents("source", "target").run(),
      Error,
      'connectedComponents() the column "target" does not exist',
    );

    const unsupported = sdb.newTable("unsupportedComponents")
      .loadData("test/data/graphs/unsupported-types.csv");
    await assertRejects(
      () => unsupported.connectedComponents("dateSource", "stringTarget").run(),
      TypeError,
      'column "dateSource" has type DATE',
    );

    const incompatible = sdb.newTable("incompatibleComponents")
      .loadArray([{ source: 1, target: "1" }]);
    await assertRejects(
      () => incompatible.connectedComponents("source", "target").run(),
      TypeError,
      "requires compatible source and target ID types",
    );

    const lossy = sdb.newTable("lossyComponents");
    await sdb.customQuery(
      'CREATE TABLE "lossyComponents" (source BIGINT, target DOUBLE)',
    );
    await assertRejects(
      () => lossy.connectedComponents("source", "target").run(),
      TypeError,
      "without losing ID precision",
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents rejects output collisions before queuing graph work", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("componentSource")
      .loadArray([{ source: "A", target: "B" }]);
    await source.run();
    sdb.newTable("namedComponents");
    assertThrows(
      () =>
        source.connectedComponents("source", "target", {
          outputTable: "NAMEDCOMPONENTS",
        }),
      Error,
      "Table NAMEDCOMPONENTS already exists.",
    );
    assertEquals(source.pendingOps.length, 0);
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents preserves queued source and output operation order", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("changingComponentSource")
      .loadArray([{ source: "A", target: "B" }]);
    const result = source.connectedComponents("source", "target", {
      outputTable: true,
    });
    source.loadArray([{ source: "A", target: "C" }]);
    assertEquals(await result.getData(), [
      { node: "A", componentId: 0 },
      { node: "B", componentId: 0 },
    ]);
    assertEquals(await source.getData(), [{ source: "A", target: "C" }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents output records its source as a cache dependency", async () => {
  let computationRuns = 0;
  const unique = crypto.randomUUID().replaceAll("-", "");
  const outputName = `componentsCacheOutput${unique}`;
  const sourceName = `componentsCacheSource${unique}`;
  const compute = (source: SimpleTable) => async (output: SimpleTable) => {
    computationRuns++;
    const result = source.connectedComponents("source", "target", {
      outputTable: true,
    });
    output.loadArray(await result.getData());
    await result.removeTable();
  };

  const firstSdb = new SimpleDB();
  try {
    const source = firstSdb.newTable(sourceName)
      .loadArray([{ source: "A", target: "B" }]);
    await firstSdb.newTable(outputName).cache(compute(source));
  } finally {
    await firstSdb.close();
  }
  const secondSdb = new SimpleDB();
  try {
    const source = secondSdb.newTable(sourceName).loadArray([
      { source: "A", target: "B" },
      { source: "C", target: "D" },
    ]);
    const output = secondSdb.newTable(outputName);
    await output.cache(compute(source));
    assertEquals(computationRuns, 2);
    assertEquals(partitions(await output.getData()), [["A", "B"], ["C", "D"]]);
  } finally {
    await secondSdb.close();
  }
});

Deno.test("connectedComponents uses native recursion without path enumeration", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const source = loadScenario(sdb, "componentQueryShape", "cycle");
    await source.connectedComponents("source", "target", {
      outputTable: true,
    }).run();
    await source.connectedComponents("source", "target", {
      mode: "strong",
      outputTable: true,
    }).run();
    const queries = observer.queries.filter((entry) =>
      entry.query.includes("graph_component_roots")
    ).map((entry) => entry.query);
    assertEquals(queries.length, 2);
    assertStringIncludes(queries[0], "WITH RECURSIVE");
    assertStringIncludes(queries[0], "USING KEY");
    assertStringIncludes(queries[0], "recurring.");
    assertStringIncludes(queries[1], "graph_reachable");
    for (const query of queries) {
      assertEquals(query.includes("list_contains"), false);
      assertEquals(query.includes("pathId"), false);
    }
  } finally {
    observer.restore();
    await sdb.close();
  }
});

Deno.test("connectedComponents internal relations do not shadow input table names", async () => {
  const sdb = new SimpleDB();
  try {
    for (
      const [index, name] of [
        "graph_edges",
        "GRAPH_NODES",
        "graph_component_labels",
        "GRAPH_REACHABLE",
        "graph_component_members",
        "GRAPH_COMPONENT_ROOTS",
      ].entries()
    ) {
      const table = sdb.newTable(name)
        .loadArray([{ source: "A", target: "B" }]);
      await table.run();
      assertEquals(
        await table.connectedComponents("source", "target", {
          mode: index % 2 === 0 ? "weak" : "strong",
        }).getRowCount(),
        2,
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents weak mode scales through a deep chain", async () => {
  const length = 300;
  const sdb = new SimpleDB();
  try {
    const rows = await sdb.newTable("deepComponents")
      .loadArray(
        Array.from({ length }, (_, source) => ({
          source,
          target: source + 1,
        })),
      )
      .connectedComponents("source", "target").getData();
    assertEquals(rows.length, length + 1);
    assertEquals(rows.at(0), { node: 0, componentId: 0 });
    assertEquals(rows.at(-1), { node: length, componentId: 0 });
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents JSDoc examples return their displayed outputs", async () => {
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await sdb.newTable().loadArray([
        { origin: "A", destination: "B" },
        { origin: "C", destination: "D" },
      ]).connectedComponents("origin", "destination").getData(),
      [
        { node: "A", componentId: 0 },
        { node: "B", componentId: 0 },
        { node: "C", componentId: 1 },
        { node: "D", componentId: 1 },
      ],
    );

    const graph = sdb.newTable("componentExample").loadArray([
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ]);
    assertEquals(
      await graph.connectedComponents("source", "target", {
        outputTable: true,
      }).getData(),
      [
        { node: "A", componentId: 0 },
        { node: "B", componentId: 0 },
        { node: "C", componentId: 0 },
      ],
    );
    assertEquals(
      await graph.connectedComponents("source", "target", {
        mode: "strong",
        outputTable: true,
      }).getData(),
      [
        { node: "A", componentId: 0 },
        { node: "B", componentId: 1 },
        { node: "C", componentId: 2 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents preserves empty numeric schemas in both modes", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("emptyNumericComponents");
    await sdb.customQuery(
      'CREATE TABLE "emptyNumericComponents" (source BIGINT, target BIGINT)',
    );
    for (const mode of ["weak", "strong"] as const) {
      const result = table.connectedComponents("source", "target", {
        mode,
        outputTable: true,
      });
      assertEquals(await result.getData(), []);
      assertEquals(await result.getTypes(), {
        node: "BIGINT",
        componentId: "BIGINT",
      });
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents preserves exact decimal identity and labels in both modes", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("decimalComponents");
    await sdb.customQuery(`CREATE TABLE "decimalComponents" AS
      SELECT source::DECIMAL(38, 0) AS source, target::DECIMAL(38, 0) AS target
      FROM (VALUES
        ('9007199254740995', '9007199254740993'),
        ('9007199254740993', '9007199254740995'),
        ('0', '-10'), ('-10', '0'), ('2', '2')
      ) edges(source, target)`);
    for (const mode of ["weak", "strong"] as const) {
      const result = table.connectedComponents("source", "target", {
        mode,
        outputTable: true,
      });
      assertEquals(await result.getTypes(), {
        node: "DECIMAL(38,0)",
        componentId: "BIGINT",
      });
      assertEquals(await result.convert({ node: "string" }).getData(), [
        { node: "-10", componentId: 0 },
        { node: "0", componentId: 0 },
        { node: "2", componentId: 1 },
        { node: "9007199254740993", componentId: 2 },
        { node: "9007199254740995", componentId: 2 },
      ]);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents preserves strict string labels in both modes", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("strictStringComponents");
    await sdb.customQuery(`CREATE TABLE "strictStringComponents" (
      source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE
    ); INSERT INTO "strictStringComponents" VALUES
      ('a', 'b'), ('b', 'a'), ('A', 'B'), ('B', 'A'),
      ('001', '1'), ('1', '001'), (' A', ' A'), ('é', 'é')`);
    for (const mode of ["weak", "strong"] as const) {
      assertEquals(
        await table.connectedComponents("source", "target", {
          mode,
          outputTable: true,
        }).getData(),
        [
          { node: " A", componentId: 0 },
          { node: "001", componentId: 1 },
          { node: "1", componentId: 1 },
          { node: "A", componentId: 2 },
          { node: "B", componentId: 2 },
          { node: "a", componentId: 3 },
          { node: "b", componentId: 3 },
          { node: "é", componentId: 4 },
        ],
      );
    }
  } finally {
    await sdb.close();
  }
});
