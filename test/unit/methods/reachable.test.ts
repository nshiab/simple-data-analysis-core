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

Deno.test("reachable defaults to outgoing and supports every direction", async () => {
  const sdb = new SimpleDB();
  try {
    const outgoing = loadScenario(sdb, "outgoing", "baseline")
      .reachable("source", "target", "A");
    const explicitOutgoing = loadScenario(sdb, "explicitOutgoing", "baseline")
      .reachable("source", "target", "A", { direction: "outgoing" });
    const incoming = loadScenario(sdb, "incoming", "baseline")
      .reachable("source", "target", "E", { direction: "incoming" });
    const both = loadScenario(sdb, "both", "baseline")
      .reachable("source", "target", "B", { direction: "both" });

    const expectedOutgoing = [
      { start: "A", node: "A" },
      { start: "A", node: "B" },
      { start: "A", node: "C" },
      { start: "A", node: "D" },
      { start: "A", node: "E" },
    ];
    assertEquals(await outgoing.getData(), expectedOutgoing);
    assertEquals(await explicitOutgoing.getData(), expectedOutgoing);
    assertEquals(await incoming.getData(), [
      { start: "E", node: "A" },
      { start: "E", node: "B" },
      { start: "E", node: "C" },
      { start: "E", node: "D" },
      { start: "E", node: "E" },
    ]);
    assertEquals(await both.getData(), [
      { start: "B", node: "A" },
      { start: "B", node: "B" },
      { start: "B", node: "C" },
      { start: "B", node: "D" },
      { start: "B", node: "E" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable includes known sinks and source-only nodes", async () => {
  const sdb = new SimpleDB();
  try {
    const sink = loadScenario(sdb, "sink", "baseline")
      .reachable("source", "target", "E");
    const sourceOnly = loadScenario(sdb, "sourceOnly", "baseline")
      .reachable("source", "target", "F", { direction: "incoming" });
    assertEquals(await sink.getData(), [{ start: "E", node: "E" }]);
    assertEquals(await sourceOnly.getData(), [{ start: "F", node: "F" }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable sorts shuffled multi-start results in every direction", async () => {
  const sdb = new SimpleDB();
  const edges = [
    { source: "A", target: "B" },
    { source: "B", target: "C" },
    { source: "X", target: "Y" },
  ];
  const nodes = {
    outgoing: { A: ["B", "C"], C: [] },
    incoming: { A: [], C: ["A", "B"] },
    both: { A: ["B", "C"], C: ["A", "B"] },
  };
  try {
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      const expected = ["A", "C"].flatMap((start) =>
        nodes[direction][start as "A" | "C"].map((node) => ({ start, node }))
      );
      for (const rows of [edges, edges.toReversed()]) {
        assertEquals(
          await sdb.newTable().loadArray(rows)
            .reachable("source", "target", ["C", "unknown", "A"], {
              direction,
              includeStart: false,
            }).getData(),
          expected,
        );
      }
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable follows a chain beyond common recursive hop limits", async () => {
  const sdb = new SimpleDB();
  try {
    const length = 1100;
    const rows = Array.from({ length }, (_, source) => ({
      source,
      target: source + 1,
    }));
    assertEquals(
      await sdb.newTable().loadArray(rows)
        .reachable("source", "target", 0).getData(),
      Array.from({ length: length + 1 }, (_, node) => ({ start: 0, node })),
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable scalar and singleton-array calls are equivalent", async () => {
  const sdb = new SimpleDB();
  try {
    const source = loadScenario(sdb, "singleton", "baseline");
    const scalar = source.reachable("source", "target", "A", {
      outputTable: true,
    });
    const singleton = source.reachable("source", "target", ["A"], {
      outputTable: true,
    });
    assertEquals(await scalar.getData(), await singleton.getData());
    assertEquals(await scalar.getColumns(), ["start", "node"]);
    assertEquals(await singleton.getColumns(), ["start", "node"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable evaluates shuffled starts independently and omits unknown starts", async () => {
  const sdb = new SimpleDB();
  try {
    const starts = ["F", "unknown", "A"];
    const table = loadScenario(sdb, "multiple", "baseline");
    table.reachable("source", "target", starts);
    starts[0] = "changed-after-call";

    assertEquals(await table.getData(), [
      { start: "A", node: "A" },
      { start: "A", node: "B" },
      { start: "A", node: "C" },
      { start: "A", node: "D" },
      { start: "A", node: "E" },
      { start: "F", node: "F" },
      { start: "F", node: "G" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable includeStart false excludes only each own start through cycles", async () => {
  const sdb = new SimpleDB();
  try {
    const table = loadScenario(sdb, "perStart", "cycle")
      .reachable("source", "target", ["B", "unknown", "A"], {
        includeStart: false,
      });
    assertEquals(await table.getData(), [
      { start: "A", node: "B" },
      { start: "A", node: "C" },
      { start: "A", node: "D" },
      { start: "A", node: "E" },
      { start: "B", node: "A" },
      { start: "B", node: "C" },
      { start: "B", node: "D" },
      { start: "B", node: "E" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable terminates on cycles and deduplicates convergence and parallel edges", async () => {
  const sdb = new SimpleDB();
  try {
    const cycle = loadScenario(sdb, "cycle", "cycle")
      .reachable("source", "target", "A", { includeStart: false });
    const parallel = loadScenario(sdb, "parallel", "parallel")
      .reachable("source", "target", "A");
    const selfLoop = loadScenario(sdb, "selfLoop", "self-loop")
      .reachable("source", "target", "A", { includeStart: true });
    const singleLoop = loadScenario(sdb, "singleLoop", "single-loop")
      .reachable("source", "target", "A", { includeStart: false });

    assertEquals(await cycle.getData(), [
      { start: "A", node: "B" },
      { start: "A", node: "C" },
      { start: "A", node: "D" },
      { start: "A", node: "E" },
    ]);
    assertEquals(await parallel.getData(), [
      { start: "A", node: "A" },
      { start: "A", node: "B" },
      { start: "A", node: "C" },
    ]);
    assertEquals(await selfLoop.getData(), [
      { start: "A", node: "A" },
      { start: "A", node: "B" },
    ]);
    assertEquals(await singleLoop.getData(), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable supports overwrite and source-preserving output tables", async () => {
  const sdb = new SimpleDB();
  try {
    const overwritten = loadScenario(sdb, "overwritten", "baseline");
    assertStrictEquals(
      overwritten.reachable("source", "target", "A", {
        outputTable: false,
      }),
      overwritten,
    );
    assertEquals(await overwritten.getColumns(), ["start", "node"]);

    const source = loadScenario(sdb, "preserved", "baseline");
    const named = source.reachable("source", "target", "A", {
      outputTable: "namedReachable",
    }).filter("node = 'E'");
    assertEquals(named.name, "namedReachable");
    assertEquals(await named.getData(), [{ start: "A", node: "E" }]);
    assertEquals(await source.getRowCount(), 6);
    assertEquals(await source.getColumns(), ["source", "target"]);

    const generated = source.reachable("source", "target", "F", {
      outputTable: true,
    });
    assertEquals(generated.name.startsWith("table"), true);
    assertEquals(generated.name === source.name, false);
    assertEquals(await generated.getData(), [
      { start: "F", node: "F" },
      { start: "F", node: "G" },
    ]);
    assertEquals(await source.getRowCount(), 6);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable snapshots starts and options before queued execution", async () => {
  const sdb = new SimpleDB();
  try {
    const starts = ["E"];
    const options: {
      direction: "incoming" | "outgoing";
      includeStart: boolean;
      outputTable: string;
    } = {
      direction: "incoming",
      includeStart: false,
      outputTable: "incomingSnapshot",
    };
    const result = loadScenario(sdb, "snapshots", "baseline")
      .reachable("source", "target", starts, options);
    starts[0] = "A";
    options.direction = "outgoing";
    options.includeStart = true;
    options.outputTable = "changed";

    assertEquals(result.name, "incomingSnapshot");
    assertEquals(await result.getData(), [
      { start: "E", node: "A" },
      { start: "E", node: "B" },
      { start: "E", node: "C" },
      { start: "E", node: "D" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable uses fixed output names and preserves empty schemas", async () => {
  const sdb = new SimpleDB();
  try {
    const custom = sdb.newTable("custom")
      .loadData("test/data/graphs/custom-columns.csv")
      .reachable("ORIGIN", "Destination", "A");
    assertEquals(await custom.getData(), [
      { start: "A", node: "A" },
      { start: "A", node: "B" },
      { start: "A", node: "C" },
    ]);
    assertEquals(await custom.getColumns(), ["start", "node"]);

    const empty = sdb.newTable("emptyGraph");
    await sdb.customQuery(
      'CREATE TABLE "emptyGraph" (source VARCHAR, target VARCHAR)',
    );
    empty.reachable("source", "target", "A");
    assertEquals(await empty.getData(), []);
    assertEquals(await empty.getTypes(), { start: "VARCHAR", node: "VARCHAR" });

    const unknown = loadScenario(sdb, "unknown", "baseline")
      .reachable("source", "target", "unknown");
    assertEquals(await unknown.getData(), []);
    assertEquals(await unknown.getTypes(), {
      start: "VARCHAR",
      node: "VARCHAR",
    });
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable supports numeric zero, numeric ordering, and wide exact integers", async () => {
  const sdb = new SimpleDB();
  try {
    const numeric = sdb.newTable("numeric")
      .loadData("test/data/graphs/numeric.csv")
      .reachable("source", "target", [2, 0]);
    assertEquals(await numeric.getData(), [
      { start: 0, node: 0 },
      { start: 0, node: 2 },
      { start: 0, node: 10 },
      { start: 2, node: 2 },
      { start: 2, node: 10 },
    ]);
    assertEquals(await numeric.getTypes(), { start: "BIGINT", node: "BIGINT" });

    const wide = sdb.newTable("wideIntegerGraph");
    await sdb.customQuery(`CREATE TABLE "wideIntegerGraph" AS
      SELECT * FROM (VALUES
        (1::BIGINT, 9007199254740993::BIGINT),
        (9007199254740993::BIGINT, 9007199254740995::BIGINT)
      ) edges(source, target)`);
    wide.reachable("source", "target", 9007199254740993n)
      .convert({ start: "string", node: "string" });
    assertEquals(await wide.getData(), [
      { start: "9007199254740993", node: "9007199254740993" },
      { start: "9007199254740993", node: "9007199254740995" },
    ]);

    const bounded = sdb.newTable("boundedIds");
    await sdb.customQuery(`CREATE TABLE "boundedIds" AS SELECT
      0::TINYINT AS source, 1::TINYINT AS target`);
    assertEquals(
      await bounded.reachable("source", "target", [128, 0]).getData(),
      [
        { start: 0, node: 0 },
        { start: 0, node: 1 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable preserves exact decimal endpoint types through recursion", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("decimalGraph");
    await sdb.customQuery(`CREATE TABLE "decimalGraph" AS
      SELECT * FROM (VALUES
        (1::DECIMAL(20,0), 9007199254740993::DECIMAL(20,0)),
        (9007199254740993::DECIMAL(20,0), 9007199254740995::DECIMAL(20,0))
      ) edges(source, target)`);
    table.reachable("source", "target", 9007199254740993n);
    assertEquals(await table.getTypes(), {
      start: "DECIMAL(20,0)",
      node: "DECIMAL(20,0)",
    });
    assertEquals(await table.getData(), [
      { start: "9007199254740993", node: "9007199254740993" },
      { start: "9007199254740993", node: "9007199254740995" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable preserves binary recursion and ordering under endpoint collations", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("collatedReachability");
    await sdb.customQuery(`CREATE TABLE "collatedReachability" (
      source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE
    ); INSERT INTO "collatedReachability" VALUES
      ('A', 'b'), ('a', 'B'), ('b', 'C'), ('B', 'D')`);
    assertEquals(
      await table.reachable("source", "target", ["a", "A"]).getData(),
      [
        { start: "A", node: "A" },
        { start: "A", node: "C" },
        { start: "A", node: "b" },
        { start: "a", node: "B" },
        { start: "a", node: "D" },
        { start: "a", node: "a" },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable validates starts and options before queuing", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      () => table.reachable("source", "target", []),
      TypeError,
      "reachable() start must not be an empty array.",
    );
    assertThrows(
      () => table.reachable("source", "target", ["A", "A"]),
      TypeError,
      'reachable() start contains duplicate IDs: "A".',
    );
    assertThrows(
      () => table.reachable("source", "target", [0, 0n]),
      TypeError,
      "reachable() start contains duplicate IDs: 0n.",
    );
    assertThrows(
      () => table.reachable("source", "target", ["1", 1]),
      TypeError,
      "reachable() start must not mix string and numeric IDs.",
    );
    assertThrows(
      () => table.reachable("source", "target", Number.MAX_SAFE_INTEGER + 1),
      TypeError,
      "is not a safe whole number",
    );
    assertThrows(
      () =>
        table.reachable("source", "target", "A", {
          direction: "sideways" as "outgoing",
        }),
      TypeError,
      'reachable() options.direction must be "outgoing", "incoming", or "both".',
    );
    assertThrows(
      () =>
        table.reachable("source", "target", "A", {
          includeStart: "yes" as unknown as boolean,
        }),
      TypeError,
      "reachable() options.includeStart must be a boolean.",
    );
    assertThrows(
      () =>
        table.reachable("source", "target", "A", {
          outputTable: 1 as unknown as boolean,
        }),
      TypeError,
      "reachable() options.outputTable must be a string or boolean.",
    );
    assertThrows(
      () =>
        table.reachable(
          "source",
          "target",
          "A",
          null as unknown as Record<string, never>,
        ),
      TypeError,
      "reachable() options must be an object.",
    );
    assertThrows(
      () => table.reachable(1 as unknown as string, "target", "A"),
      TypeError,
      "reachable() source must be a string.",
    );
    assertThrows(
      () => table.reachable("source", 1 as unknown as string, "A"),
      TypeError,
      "reachable() target must be a string.",
    );
    assertEquals(table.pendingOps.length, 0);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable rejects missing, unsupported, and incompatible endpoint types", async () => {
  const sdb = new SimpleDB();
  try {
    const missing = sdb.newTable("missing").loadArray([{ source: "A" }]);
    await assertRejects(
      () => missing.reachable("source", "target", "A").run(),
      Error,
      'reachable() the column "target" does not exist',
    );

    const unsupported = sdb.newTable("unsupported")
      .loadData("test/data/graphs/unsupported-types.csv");
    await assertRejects(
      () => unsupported.reachable("dateSource", "stringTarget", "A").run(),
      Error,
      'column "dateSource" has type DATE',
    );

    const incompatible = sdb.newTable("incompatible")
      .loadArray([{ source: 1, target: "1" }]);
    await assertRejects(
      () => incompatible.reachable("source", "target", 1).run(),
      Error,
      "requires compatible source and target ID types",
    );

    const numeric = sdb.newTable("numericMismatch")
      .loadData("test/data/graphs/numeric.csv");
    await assertRejects(
      () => numeric.reachable("source", "target", "0").run(),
      Error,
      "start contains string IDs",
    );

    const lossy = sdb.newTable("lossy");
    await sdb.customQuery(
      'CREATE TABLE "lossy" (source BIGINT, target DOUBLE)',
    );
    await assertRejects(
      () => lossy.reachable("source", "target", 1).run(),
      Error,
      "without losing ID precision",
    );

    const floating = sdb.newTable("unrepresentableFloat");
    await sdb.customQuery(`CREATE TABLE "unrepresentableFloat" AS SELECT
      16777216::FLOAT AS source, 0::FLOAT AS target`);
    await assertRejects(
      () => floating.reachable("source", "target", 16777217).run(),
      Error,
      "FLOAT cannot represent exactly",
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable rejects output table name collisions before queuing graph work", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("source")
      .loadArray([{ source: "A", target: "B" }]);
    await source.run();
    sdb.newTable("namedReachable");
    assertThrows(
      () =>
        source.reachable("source", "target", "A", {
          outputTable: "NAMEDREACHABLE",
        }),
      Error,
      "Table NAMEDREACHABLE already exists.",
    );
    assertEquals(source.pendingOps.length, 0);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable output records its source as a cache dependency", async () => {
  let computationRuns = 0;
  const unique = crypto.randomUUID().replaceAll("-", "");
  const outputName = `reachableCacheOutput${unique}`;
  const sourceName = `reachableCacheSource${unique}`;
  const compute = (source: SimpleTable) => async (output: SimpleTable) => {
    computationRuns++;
    const result = source.reachable("source", "target", "A", {
      outputTable: true,
    });
    output.loadArray(await result.getData());
    await result.removeTable();
  };

  const firstSdb = new SimpleDB();
  try {
    const source = firstSdb.newTable(sourceName)
      .loadArray([{ source: "A", target: "B" }]);
    const output = firstSdb.newTable(outputName);
    await output.cache(compute(source));
    assertEquals(await output.getData(), [
      { start: "A", node: "A" },
      { start: "A", node: "B" },
    ]);
  } finally {
    await firstSdb.close();
  }

  const secondSdb = new SimpleDB();
  try {
    const source = secondSdb.newTable(sourceName)
      .loadArray([{ source: "A", target: "C" }]);
    const output = secondSdb.newTable(outputName);
    await output.cache(compute(source));
    assertEquals(computationRuns, 2);
    assertEquals(await output.getData(), [
      { start: "A", node: "A" },
      { start: "A", node: "C" },
    ]);
  } finally {
    await secondSdb.close();
  }
});

Deno.test("reachable internal relations do not shadow input table names", async () => {
  const sdb = new SimpleDB();
  try {
    for (
      const name of [
        "graph_start_values",
        "GRAPH_STARTS",
        "graph_edges",
        "GRAPH_NODES",
        "graph_reachable",
      ]
    ) {
      const table = sdb.newTable(name)
        .loadArray([{ source: "A", target: "B" }]);
      await table.run();
      assertEquals(
        await table.reachable("source", "target", "A").getData(),
        [
          { start: "A", node: "A" },
          { start: "A", node: "B" },
        ],
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable preserves queued source and output operation order", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("changingSource")
      .loadArray([{ source: "A", target: "B" }]);
    const result = source.reachable("source", "target", "A", {
      outputTable: true,
    });
    source.loadArray([{ source: "A", target: "C" }]);
    assertEquals(await result.getData(), [
      { start: "A", node: "A" },
      { start: "A", node: "B" },
    ]);
    assertEquals(await source.getData(), [{ source: "A", target: "C" }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable uses native node-only recursive SQL", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const table = loadScenario(sdb, "recursiveShape", "cycle")
      .reachable("source", "target", "A");
    await table.run();
    const query = observer.queries.find((entry) =>
      entry.query.includes("graph_reachable") &&
      entry.query.includes("CREATE OR REPLACE TABLE")
    )?.query;
    assertStringIncludes(query ?? "", "WITH RECURSIVE");
    assertStringIncludes(query ?? "", '"__start_key", "__node_key"');
    assertEquals(query?.includes("path"), false);
    assertEquals(query?.includes("depth"), false);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

Deno.test("reachable JSDoc examples return their complete displayed outputs", async () => {
  const sdb = new SimpleDB();
  const edges = [
    { origin: "A", destination: "B" },
    { origin: "A", destination: "C" },
    { origin: "B", destination: "D" },
    { origin: "C", destination: "D" },
    { origin: "D", destination: "A" },
  ];
  const allFromA = [
    { start: "A", node: "A" },
    { start: "A", node: "B" },
    { start: "A", node: "C" },
    { start: "A", node: "D" },
  ];
  const allFromB = [
    { start: "B", node: "A" },
    { start: "B", node: "B" },
    { start: "B", node: "C" },
    { start: "B", node: "D" },
  ];
  try {
    assertEquals(
      await sdb.newTable().loadArray(edges)
        .reachable("origin", "destination", "A", {
          outputTable: "reachableFromA",
        }).getData(),
      allFromA,
    );
    assertEquals(
      await sdb.newTable().loadArray(edges)
        .reachable("origin", "destination", "A", { includeStart: false })
        .getData(),
      allFromA.slice(1),
    );
    assertEquals(
      await sdb.newTable().loadArray(edges)
        .reachable("origin", "destination", "B", { direction: "incoming" })
        .getData(),
      allFromB,
    );
    assertEquals(
      await sdb.newTable().loadArray(edges)
        .reachable("origin", "destination", "B", { direction: "both" })
        .getData(),
      allFromB,
    );
    assertEquals(
      await sdb.newTable().loadArray(edges)
        .reachable("origin", "destination", ["B", "A"]).getData(),
      [...allFromA, ...allFromB],
    );
  } finally {
    await sdb.close();
  }
});
