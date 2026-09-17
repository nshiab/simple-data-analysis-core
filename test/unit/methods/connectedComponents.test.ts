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
import {
  enumerateChronologicalRoutes,
  type ReferenceChronologicalEvent,
} from "../../helpers/enumerateChronologicalRoutes.ts";

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

function referenceTemporalComponents(
  events: ReferenceChronologicalEvent<string, number>[],
  options: { minGap?: bigint; strictOrdering?: boolean } = {},
) {
  const nodes = [
    ...new Set(
      events.flatMap((event) =>
        event.startTime !== null && event.endTime !== null &&
          event.endTime >= event.startTime
          ? [event.source, event.target]
          : []
      ),
    ),
  ].sort(compareBinaryStrings);
  const reachable = new Map<string, Set<string>>();
  for (const node of nodes) {
    const reached = new Set([node]);
    for (
      const route of enumerateChronologicalRoutes(events, node, {
        maxSteps: Math.max(events.length, 1),
        minGap: options.minGap,
        simpleNodes: false,
        strictOrdering: options.strictOrdering,
      })
    ) {
      reached.add(route.at(-1)!.target);
    }
    reachable.set(node, reached);
  }

  const cliques: string[][] = [];
  for (let mask = 1; mask < 2 ** nodes.length; mask++) {
    const members = nodes.filter((_, index) => (mask & 2 ** index) !== 0);
    const clique = members.every((left) =>
      members.every((right) =>
        left === right ||
        (reachable.get(left)!.has(right) && reachable.get(right)!.has(left))
      )
    );
    if (!clique) continue;
    const maximal = nodes.every((candidate) =>
      members.includes(candidate) ||
      members.some((member) =>
        !reachable.get(candidate)!.has(member) ||
        !reachable.get(member)!.has(candidate)
      )
    );
    if (maximal) cliques.push(members);
  }
  cliques.sort(compareMemberLists);
  return cliques.flatMap((members, componentId) =>
    members.map((node) => ({ node, componentId }))
  );
}

function compareBinaryStrings(left: string, right: string): number {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index++) {
    if (leftBytes[index] !== rightBytes[index]) {
      return leftBytes[index] - rightBytes[index];
    }
  }
  return leftBytes.length - rightBytes.length;
}

function compareMemberLists(left: string[], right: string[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const comparison = compareBinaryStrings(left[index], right[index]);
    if (comparison !== 0) return comparison;
  }
  return left.length - right.length;
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
      "connectedComponents() sourceColumn must be a string.",
    );
    assertThrows(
      () => table.connectedComponents("source", 1 as unknown as string),
      TypeError,
      "connectedComponents() targetColumn must be a string.",
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

Deno.test("connectedComponents executes all four complete JSDoc examples", async () => {
  const firstDb = new SimpleDB();
  try {
    const table = firstDb.newTable().loadArray([
      { origin: "A", destination: "B" },
      { origin: "C", destination: "D" },
    ]);
    await table
      .connectedComponents("origin", "destination")
      .log();
    assertEquals(await table.getData(), [
      { node: "A", componentId: 0 },
      { node: "B", componentId: 0 },
      { node: "C", componentId: 1 },
      { node: "D", componentId: 1 },
    ]);
  } finally {
    await firstDb.close();
  }

  const secondDb = new SimpleDB();
  try {
    const graph = secondDb.newTable().loadArray([
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ]);
    await graph
      .connectedComponents("source", "target")
      .log();
    assertEquals(await graph.getData(), [
      { node: "A", componentId: 0 },
      { node: "B", componentId: 0 },
      { node: "C", componentId: 0 },
    ]);
  } finally {
    await secondDb.close();
  }

  const thirdDb = new SimpleDB();
  try {
    const graph = thirdDb.newTable().loadArray([
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ]);
    await graph
      .connectedComponents("source", "target", {
        mode: "strong",
      })
      .log();
    assertEquals(await graph.getData(), [
      { node: "A", componentId: 0 },
      { node: "B", componentId: 1 },
      { node: "C", componentId: 2 },
    ]);
  } finally {
    await thirdDb.close();
  }

  const fourthDb = new SimpleDB();
  try {
    const transactions = fourthDb.newTable().loadArray([
      { source: "B", target: "C", time: new Date("2025-01-01T08:00:00Z") },
      { source: "C", target: "B", time: new Date("2025-01-01T09:00:00Z") },
      { source: "A", target: "B", time: new Date("2025-01-01T10:00:00Z") },
      { source: "B", target: "A", time: new Date("2025-01-01T11:00:00Z") },
    ]);
    await transactions
      .connectedComponents("source", "target", {
        mode: "strong",
        startTimeColumn: "time",
      })
      .log();
    assertEquals(await transactions.getData(), [
      { node: "A", componentId: 0 },
      { node: "B", componentId: 0 },
      { node: "B", componentId: 1 },
      { node: "C", componentId: 1 },
    ]);
  } finally {
    await fourthDb.close();
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

Deno.test("connectedComponents closes the documented chain into one strong group", async () => {
  const sdb = new SimpleDB();
  try {
    const rows = await sdb.newTable().loadArray([
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "C", target: "A" },
    ]).connectedComponents("source", "target", { mode: "strong" }).getData();
    assertEquals(rows, [
      { node: "A", componentId: 0 },
      { node: "B", componentId: 0 },
      { node: "C", componentId: 0 },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents preserves compatible numeric endpoint types and quoted names", async () => {
  const cases = [
    ["TINYINT", "SMALLINT", "SMALLINT"],
    ["INTEGER", "UINTEGER", "BIGINT"],
    ["FLOAT", "DOUBLE", "DOUBLE"],
    ["DECIMAL(8,2)", "DECIMAL(10,3)", "DECIMAL(10,3)"],
    ["BIGNUM", "BIGINT", "BIGNUM"],
  ];
  const sdb = new SimpleDB();
  try {
    for (
      const [index, [sourceType, targetType, outputType]] of cases.entries()
    ) {
      const table = sdb.newTable(`compatibleComponentTypes${index}`);
      await sdb.customQuery(`CREATE TABLE "${table.name}" AS
        SELECT source::${sourceType} AS "From Node",
          target::${targetType} AS "To""Node"
        FROM (VALUES (10, 20), (20, 10), (-2, 0), (0, 0))
          edges(source, target)`);
      for (const mode of ["weak", "strong"] as const) {
        const result = table.connectedComponents("from node", 'to"node', {
          mode,
          outputTable: true,
        });
        assertEquals(await result.getTypes(), {
          node: outputType,
          componentId: "BIGINT",
        });
        assertEquals(await result.convert({ node: "number" }).getData(), [
          { node: -2, componentId: 0 },
          { node: 0, componentId: mode === "weak" ? 0 : 1 },
          { node: 10, componentId: mode === "weak" ? 1 : 2 },
          { node: 20, componentId: mode === "weak" ? 1 : 2 },
        ]);
      }
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents keeps one-way bridges between strong groups separate", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      { source: 20, target: 30 },
      { source: 30, target: 20 },
      { source: 30, target: 2 },
      { source: 2, target: 10 },
      { source: 10, target: 2 },
      { source: 10, target: -1 },
      { source: 40, target: 30 },
      { source: 40, target: 30 },
      { source: 100, target: 100 },
    ]);
    const strong = table.connectedComponents("source", "target", {
      mode: "strong",
      outputTable: true,
    });
    assertEquals(await strong.getData(), [
      { node: -1, componentId: 0 },
      { node: 2, componentId: 1 },
      { node: 10, componentId: 1 },
      { node: 20, componentId: 2 },
      { node: 30, componentId: 2 },
      { node: 40, componentId: 3 },
      { node: 100, componentId: 4 },
    ]);
    assertEquals(
      await table.connectedComponents("source", "target").getData(),
      [-1, 2, 10, 20, 30, 40, 100].map((node) => ({
        node,
        componentId: node === 100 ? 1 : 0,
      })),
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents returns the documented overlapping chronological groups", async () => {
  const sdb = new SimpleDB();
  try {
    const transactions = sdb.newTable("temporalComponentExample").loadArray([
      { source: "B", target: "C", time: new Date("2025-01-01T08:00:00Z") },
      { source: "C", target: "B", time: new Date("2025-01-01T09:00:00Z") },
      { source: "A", target: "B", time: new Date("2025-01-01T10:00:00Z") },
      { source: "B", target: "A", time: new Date("2025-01-01T11:00:00Z") },
    ]);
    assertEquals(
      await transactions.connectedComponents("source", "target", {
        mode: "strong",
        startTimeColumn: "time",
        outputTable: true,
      }).getData(),
      [
        { node: "A", componentId: 0 },
        { node: "B", componentId: 0 },
        { node: "B", componentId: 1 },
        { node: "C", componentId: 1 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents allows chronological journeys through outside nodes", async () => {
  const sdb = new SimpleDB();
  try {
    const events = sdb.newTable("outsideComponentIntermediary").loadArray([
      { source: "B", target: "A", time: new Date("2025-01-01T01:00:00Z") },
      { source: "A", target: "X", time: new Date("2025-01-01T10:00:00Z") },
      { source: "X", target: "B", time: new Date("2025-01-01T11:00:00Z") },
    ]);
    assertEquals(
      await events.connectedComponents("source", "target", {
        mode: "strong",
        startTimeColumn: "time",
        outputTable: true,
      }).getData(),
      [
        { node: "A", componentId: 0 },
        { node: "B", componentId: 0 },
        { node: "B", componentId: 1 },
        { node: "X", componentId: 1 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents enforces chronological mode and option activation", () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      () =>
        table.connectedComponents("source", "target", {
          startTimeColumn: "time",
        }),
      TypeError,
      'chronological options require options.mode to be explicitly set to "strong"',
    );
    assertThrows(
      () =>
        table.connectedComponents("source", "target", {
          mode: "weak",
          endTimeColumn: "time",
        }),
      TypeError,
      'chronological options require options.mode to be explicitly set to "strong"',
    );
    assertThrows(
      () =>
        table.connectedComponents("source", "target", {
          mode: "strong",
          minGapMs: 0,
        }),
      TypeError,
      "options.minGapMs and options.strictOrdering require",
    );
    assertThrows(
      () =>
        table.connectedComponents("source", "target", {
          mode: "strong",
          strictOrdering: false,
        }),
      TypeError,
      "options.minGapMs and options.strictOrdering require",
    );
  } finally {
    void sdb.close();
  }
});

Deno.test("connectedComponents applies strict ordering and inclusive gaps", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("componentGapBoundaries");
    await sdb.customQuery(`CREATE TABLE "componentGapBoundaries" AS
      SELECT * FROM (VALUES
        ('A', 'X', TIMESTAMP '2025-01-01 08:00:00', TIMESTAMP '2025-01-01 09:00:00'),
        ('X', 'B', TIMESTAMP '2025-01-01 10:00:00', TIMESTAMP '2025-01-01 10:00:00'),
        ('B', 'A', TIMESTAMP '2025-01-01 07:00:00', TIMESTAMP '2025-01-01 07:00:00')
      ) events(source, target, departure, arrival)`);
    const base = {
      mode: "strong" as const,
      startTimeColumn: "departure",
      endTimeColumn: "arrival",
      outputTable: true,
    };
    assertEquals(
      partitions(
        await table.connectedComponents("source", "target", {
          ...base,
          minGapMs: 60 * 60 * 1000,
        }).getData(),
      ),
      [["A", "B"], ["B", "X"]],
    );
    assertEquals(
      partitions(
        await table.connectedComponents("source", "target", {
          ...base,
          minGapMs: 60 * 60 * 1000 + 1,
        }).getData(),
      ),
      [["A"], ["B"], ["X"]],
    );
    assertEquals(
      partitions(
        await table.connectedComponents("source", "target", {
          mode: "strong",
          endTimeColumn: "arrival",
          minGapMs: 60 * 60 * 1000,
          outputTable: true,
        }).getData(),
      ),
      [["A", "B"], ["B", "X"]],
    );

    const equal = sdb.newTable("componentStrictOrdering").loadArray([
      { source: "A", target: "X", time: new Date("2025-01-01T10:00:00Z") },
      { source: "X", target: "B", time: new Date("2025-01-01T10:00:00Z") },
      { source: "B", target: "A", time: new Date("2025-01-01T09:00:00Z") },
    ]);
    assertEquals(
      partitions(
        await equal.connectedComponents("source", "target", {
          mode: "strong",
          startTimeColumn: "time",
          outputTable: true,
        }).getData(),
      ),
      [["A"], ["B", "X"]],
    );
    assertEquals(
      partitions(
        await equal.connectedComponents("source", "target", {
          mode: "strong",
          startTimeColumn: "time",
          strictOrdering: false,
          outputTable: true,
        }).getData(),
      ),
      [["A", "B"], ["B", "X"]],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents retains valid event nodes and excludes invalid events", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("componentValidEvents");
    await sdb.customQuery(`CREATE TABLE "componentValidEvents" AS
      SELECT * FROM (VALUES
        ('A', 'B', TIMESTAMP '2025-01-01 01:00:00', TIMESTAMP '2025-01-01 02:00:00'),
        ('S', 'S', TIMESTAMP '2025-01-01 03:00:00', TIMESTAMP '2025-01-01 03:00:00'),
        ('bad-null', 'missing', NULL::TIMESTAMP, NULL::TIMESTAMP),
        ('bad-order', 'missing-2', TIMESTAMP '2025-01-01 05:00:00', TIMESTAMP '2025-01-01 04:00:00')
      ) events(source, target, departure, arrival)`);
    const result = table.connectedComponents("source", "target", {
      mode: "strong",
      startTimeColumn: "departure",
      endTimeColumn: "arrival",
      outputTable: true,
    });
    assertEquals(await result.getData(), [
      { node: "A", componentId: 0 },
      { node: "B", componentId: 1 },
      { node: "S", componentId: 2 },
    ]);

    const empty = sdb.newTable("emptyTemporalComponents");
    await sdb.customQuery(`CREATE TABLE "emptyTemporalComponents" (
      source VARCHAR, target VARCHAR, time TIMESTAMP)`);
    const emptyResult = empty.connectedComponents("source", "target", {
      mode: "strong",
      startTimeColumn: "time",
    });
    assertEquals(await emptyResult.getData(), []);
    assertEquals(await emptyResult.getTypes(), {
      node: "VARCHAR",
      componentId: "BIGINT",
    });
    const invalid = sdb.newTable("invalidOnlyTemporalComponents");
    await sdb.customQuery(`CREATE TABLE "${invalid.name}" AS
      SELECT * FROM (VALUES
        ('A', 'B', NULL::TIMESTAMP),
        ('C', 'D', TIMESTAMP 'infinity'),
        ('E', 'F', TIMESTAMP '-infinity')
      ) events(source, target, time)`);
    assertEquals(
      await invalid.connectedComponents("source", "target", {
        mode: "strong",
        startTimeColumn: "time",
      }).getData(),
      [],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents matches independent exhaustive temporal components", async () => {
  let state = 0x206199;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const baseTime = Date.UTC(2025, 0, 1);
  const sdb = new SimpleDB();
  try {
    for (let fixture = 0; fixture < 6; fixture++) {
      const events = Array.from({ length: 8 }, (_, edgeId) => {
        const startTime = BigInt(random() % 5);
        return {
          edgeId,
          source: String.fromCharCode(65 + random() % 5),
          target: String.fromCharCode(65 + random() % 5),
          startTime,
          endTime: startTime + BigInt(random() % 2),
        } satisfies ReferenceChronologicalEvent<string, number>;
      });
      for (const strictOrdering of [true, false]) {
        const expected = referenceTemporalComponents(events, {
          strictOrdering,
        });
        for (
          const [order, ordered] of [events, events.toReversed()].entries()
        ) {
          const rows = ordered.map((event) => ({
            source: event.source,
            target: event.target,
            departure: new Date(baseTime + Number(event.startTime) * 1000),
            arrival: new Date(baseTime + Number(event.endTime) * 1000),
          }));
          const actual = await sdb.newTable(
            `referenceComponents${fixture}_${strictOrdering}_${order}`,
          ).loadArray(rows).connectedComponents("source", "target", {
            mode: "strong",
            startTimeColumn: "departure",
            endTimeColumn: "arrival",
            strictOrdering,
          }).getData();
          assertEquals(
            actual,
            expected,
            `${fixture}/${strictOrdering}/${order}`,
          );
        }
      }
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents enumerates every four-node mutual graph", async () => {
  const nodes = ["A", "B", "C", "D"];
  const pairs = nodes.flatMap((left, index) =>
    nodes.slice(index + 1).map((right) => [left, right])
  );
  const sdb = new SimpleDB();
  try {
    // Strict equal times prohibit transfers, so each of the 64 undirected
    // graphs is represented exactly. Self-events retain isolated vertices.
    // The independent oracle enumerates routes and all subsets, not pivots.
    for (let mask = 0; mask < 2 ** pairs.length; mask++) {
      const endpoints = nodes.map((node) => [node, node]);
      for (const [index, [left, right]] of pairs.entries()) {
        if ((mask & 2 ** index) !== 0) {
          endpoints.push([left, right], [right, left]);
        }
      }
      const events = endpoints.map(([source, target], edgeId) => ({
        source,
        target,
        edgeId,
        startTime: 0n,
        endTime: 0n,
      }));
      const table = sdb.newTable(`allMutualGraphs${mask}`).loadArray(
        events.toReversed().map(({ source, target }) => ({
          source,
          target,
          time: new Date("2025-01-01T00:00:00Z"),
        })),
      );
      assertEquals(
        await table.connectedComponents("source", "target", {
          mode: "strong",
          startTimeColumn: "time",
        }).getData(),
        referenceTemporalComponents(events),
        `mutual graph ${mask}`,
      );
      await table.removeTable();
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents temporal IDs use exact typed key order", async () => {
  const sdb = new SimpleDB();
  try {
    const values = [
      "('A', 'b', TIMESTAMP '2025-01-01 00:00:00')",
      "('b', 'A', TIMESTAMP '2025-01-01 00:00:00')",
      "('a', 'B', TIMESTAMP '2025-01-01 00:00:00')",
      "('B', 'a', TIMESTAMP '2025-01-01 00:00:00')",
    ];
    for (const [index, ordered] of [values, values.toReversed()].entries()) {
      const strings = sdb.newTable(`collatedTemporalComponents${index}`);
      await sdb.customQuery(`CREATE TABLE "${strings.name}" (
        source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE,
        time TIMESTAMP
      ); INSERT INTO "${strings.name}" VALUES
        ${ordered.join(",\n        ")}`);
      assertEquals(
        await strings.connectedComponents("source", "target", {
          mode: "strong",
          startTimeColumn: "time",
          outputTable: true,
        }).getData(),
        [
          { node: "A", componentId: 0 },
          { node: "b", componentId: 0 },
          { node: "B", componentId: 1 },
          { node: "a", componentId: 1 },
        ],
      );
    }

    const wide = sdb.newTable("wideTemporalComponents");
    await sdb.customQuery(`CREATE TABLE "wideTemporalComponents" AS
      SELECT source::HUGEINT AS source, target::HUGEINT AS target, time
      FROM (VALUES
        ('9007199254740995', '9007199254740993', TIMESTAMP '2025-01-01'),
        ('9007199254740993', '9007199254740995', TIMESTAMP '2025-01-01'),
        ('0', '1', TIMESTAMP '2025-01-01')
      ) events(source, target, time)`);
    const wideResult = wide.connectedComponents("source", "target", {
      mode: "strong",
      startTimeColumn: "time",
    }).convert({ node: "string" });
    assertEquals(await wideResult.getData(), [
      { node: "0", componentId: 0 },
      { node: "1", componentId: 1 },
      { node: "9007199254740993", componentId: 2 },
      { node: "9007199254740995", componentId: 2 },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents preserves temporal queues, outputs, and option snapshots", async () => {
  const sdb = new SimpleDB();
  try {
    const options: {
      mode: "strong";
      outputTable: string;
      startTimeColumn: string;
      strictOrdering: boolean;
    } = {
      mode: "strong",
      outputTable: "temporalComponentOutput",
      startTimeColumn: "time",
      strictOrdering: false,
    };
    const source = sdb.newTable("temporalComponentQueue").loadArray([
      { source: "A", target: "B", time: "2025-01-01T00:00:00Z" },
      { source: "B", target: "A", time: "2025-01-01T00:00:00Z" },
    ]).convert({ time: "timestamp" });
    const result = source.connectedComponents("source", "target", options)
      .filter("node = 'B'");
    options.startTimeColumn = "changed";
    options.strictOrdering = true;
    options.outputTable = "changedOutput";
    source.loadArray([
      { source: "X", target: "Y", time: "2025-01-02T00:00:00Z" },
    ]);
    assertEquals(result.name, "temporalComponentOutput");
    assertEquals(await result.getData(), [{ node: "B", componentId: 0 }]);
    assertEquals(await source.getData(), [
      { source: "X", target: "Y", time: "2025-01-02T00:00:00Z" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents temporal output records its source cache dependency", async () => {
  let computationRuns = 0;
  const unique = crypto.randomUUID().replaceAll("-", "");
  const outputName = `temporalComponentsCacheOutput${unique}`;
  const sourceName = `temporalComponentsCacheSource${unique}`;
  const compute = (source: SimpleTable) => async (output: SimpleTable) => {
    computationRuns++;
    const result = source.connectedComponents("source", "target", {
      mode: "strong",
      startTimeColumn: "time",
      strictOrdering: false,
      outputTable: true,
    });
    output.loadArray(await result.getData());
    await result.removeTable();
  };
  const firstRows = [
    { source: "A", target: "B", time: new Date("2025-01-01T00:00:00Z") },
    { source: "B", target: "A", time: new Date("2025-01-01T00:00:00Z") },
  ];

  const firstSdb = new SimpleDB();
  try {
    await firstSdb.newTable(outputName).cache(
      compute(firstSdb.newTable(sourceName).loadArray(firstRows)),
    );
  } finally {
    await firstSdb.close();
  }
  const secondSdb = new SimpleDB();
  try {
    const source = secondSdb.newTable(sourceName).loadArray([
      ...firstRows,
      { source: "C", target: "C", time: new Date("2025-01-01T00:00:00Z") },
    ]);
    const output = secondSdb.newTable(outputName);
    await output.cache(compute(source));
    assertEquals(computationRuns, 2);
    assertEquals(await output.getData(), [
      { node: "A", componentId: 0 },
      { node: "B", componentId: 0 },
      { node: "C", componentId: 1 },
    ]);
  } finally {
    await secondSdb.close();
  }
});

Deno.test("connectedComponents validates chronological columns from the queued schema", async () => {
  const sdb = new SimpleDB();
  try {
    const missing = sdb.newTable("missingComponentTime")
      .loadArray([{ source: "A", target: "B" }])
      .connectedComponents("source", "target", {
        mode: "strong",
        startTimeColumn: "time",
      });
    await assertRejects(
      () => missing.run(),
      Error,
      'the column "time" does not exist',
    );

    const wrongType = sdb.newTable("wrongComponentTime")
      .loadArray([{ source: "A", target: "B", time: 1 }])
      .connectedComponents("source", "target", {
        mode: "strong",
        startTimeColumn: "time",
      });
    await assertRejects(
      () => wrongType.run(),
      TypeError,
      "requires DATE or TIMESTAMP chronological columns",
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents clique siblings retain earlier noncandidate vertices", async () => {
  const undirectedEdges = [[0, 1], [0, 3], [1, 2]] as const;
  const time = new Date("2025-01-01T00:00:00Z");
  const rows = undirectedEdges.flatMap(([left, right]) => [
    { source: left, target: right, time },
    { source: right, target: left, time },
  ]);
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await sdb.newTable("componentSiblingCandidates").loadArray(rows)
        .connectedComponents("source", "target", {
          mode: "strong",
          startTimeColumn: "time",
        }).getData(),
      [
        { node: 0, componentId: 0 },
        { node: 1, componentId: 0 },
        { node: 0, componentId: 1 },
        { node: 3, componentId: 1 },
        { node: 1, componentId: 2 },
        { node: 2, componentId: 2 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents preserves nanosecond gap boundaries", async () => {
  const sdb = new SimpleDB();
  try {
    for (const offset of [999, 1000, 1001]) {
      const table = sdb.newTable(`nanosecondComponents${offset}`);
      await sdb.customQuery(`CREATE TABLE "${table.name}" AS
        SELECT * FROM (VALUES
          ('A', 'X', TIMESTAMP_NS '2025-01-01 00:00:00.000000000'),
          ('X', 'B', TIMESTAMP_NS '2025-01-01 00:00:00.${
        offset.toString().padStart(9, "0")
      }'),
          ('B', 'A', TIMESTAMP_NS '2024-12-31 23:59:59.999999000')
        ) events(source, target, time)`);
      assertEquals(
        partitions(
          await table.connectedComponents("source", "target", {
            mode: "strong",
            startTimeColumn: "time",
            minGapMs: 0.001,
            outputTable: true,
          }).getData(),
        ),
        offset < 1000 ? [["A"], ["B", "X"]] : [["A", "B"], ["B", "X"]],
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("connectedComponents temporal relations do not shadow the input", async () => {
  const sdb = new SimpleDB();
  try {
    for (
      const [index, name] of [
        "graph_starts",
        "GRAPH_EDGES",
        "graph_component_nodes",
        "GRAPH_MUTUAL_ADJACENCY",
        "graph_clique_search",
      ].entries()
    ) {
      const time = new Date("2025-01-01T00:00:00Z");
      const table = sdb.newTable(name).loadArray([
        { source: "A", target: "B", time },
        { source: "B", target: "A", time },
      ]);
      await table.run();
      assertEquals(
        await table.connectedComponents("source", "target", {
          mode: "strong",
          startTimeColumn: "time",
          outputTable: `temporalCollisionOutput${index}`,
        }).getData(),
        [
          { node: "A", componentId: 0 },
          { node: "B", componentId: 0 },
        ],
      );
    }
  } finally {
    await sdb.close();
  }
});
