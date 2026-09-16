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
import buildGraphTemporalReachabilitySql from "../../../src/helpers/buildGraphTemporalReachabilitySql.ts";
import prepareGraphTemporalSql, {
  prepareGraphTemporalOptions,
} from "../../../src/helpers/prepareGraphTemporalSql.ts";
import { prepareGraphSql } from "../../../src/helpers/prepareGraphTraversal.ts";
import quoteIdentifier from "../../../src/helpers/quoteIdentifier.ts";
import {
  connectionEvents,
  equalTimeEvents,
  standaloneEvent,
} from "../../helpers/chronologicalGraphFixtures.ts";
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

const chronologicalBase = Date.parse("2025-01-01T00:00:00.000Z");

function chronologicalRows(
  events: ReferenceChronologicalEvent<string, string>[],
) {
  return events.map((event) => ({
    edgeId: event.edgeId,
    source: event.source,
    target: event.target,
    startTime: event.startTime === null
      ? null
      : new Date(chronologicalBase + Number(event.startTime)),
    endTime: event.endTime === null
      ? null
      : new Date(chronologicalBase + Number(event.endTime)),
  }));
}

function referenceReachable(
  events: ReferenceChronologicalEvent<string, string>[],
  starts: string[],
  direction: "incoming" | "outgoing",
  minGap: bigint,
  strictOrdering: boolean,
) {
  return starts.toSorted().flatMap((start) => {
    const nodes = new Set<string>();
    for (
      const route of enumerateChronologicalRoutes(events, start, {
        direction,
        maxSteps: Math.max(events.length, 1),
        minGap,
        simpleNodes: false,
        strictOrdering,
      })
    ) {
      const last = route.at(-1);
      if (last !== undefined) nodes.add(last.target);
    }
    return [...nodes].toSorted().map((node) => ({ start, node }));
  });
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

Deno.test("reachable returns no rows when the start has no connections in the chosen direction", async () => {
  const sdb = new SimpleDB();
  try {
    const sink = loadScenario(sdb, "sink", "baseline")
      .reachable("source", "target", "E");
    const sourceOnly = loadScenario(sdb, "sourceOnly", "baseline")
      .reachable("source", "target", "F", { direction: "incoming" });
    assertEquals(await sink.getData(), []);
    assertEquals(await sourceOnly.getData(), []);
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
    both: { A: ["A", "B", "C"], C: ["A", "B", "C"] },
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
      Array.from({ length }, (_, index) => ({ start: 0, node: index + 1 })),
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

Deno.test("reachable preserves empty and quoted string IDs with quoted endpoint columns", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      { 'from"node': "", "to node": "O'Reilly" },
      { 'from"node': "O'Reilly", "to node": 'quote"node' },
      { 'from"node': 'quote"node', "to node": "" },
    ]);
    assertEquals(
      await table.reachable('from"node', "to node", ["O'Reilly", ""])
        .getData(),
      [
        { start: "", node: "" },
        { start: "", node: "O'Reilly" },
        { start: "", node: 'quote"node' },
        { start: "O'Reilly", node: "" },
        { start: "O'Reilly", node: "O'Reilly" },
        { start: "O'Reilly", node: 'quote"node' },
      ],
    );
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
      { start: "A", node: "B" },
      { start: "A", node: "C" },
      { start: "A", node: "D" },
      { start: "A", node: "E" },
      { start: "F", node: "G" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable includes each start reached again through a cycle", async () => {
  const sdb = new SimpleDB();
  try {
    const table = loadScenario(sdb, "perStart", "cycle")
      .reachable("source", "target", ["B", "unknown", "A"]);
    assertEquals(await table.getData(), [
      { start: "A", node: "A" },
      { start: "A", node: "B" },
      { start: "A", node: "C" },
      { start: "A", node: "D" },
      { start: "A", node: "E" },
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

Deno.test("reachable terminates on cycles and deduplicates convergence and parallel edges", async () => {
  const sdb = new SimpleDB();
  try {
    const cycle = loadScenario(sdb, "cycle", "cycle")
      .reachable("source", "target", "A");
    const parallel = loadScenario(sdb, "parallel", "parallel")
      .reachable("source", "target", "A");
    const selfLoop = loadScenario(sdb, "selfLoop", "self-loop")
      .reachable("source", "target", "A");
    const singleLoop = loadScenario(sdb, "singleLoop", "single-loop")
      .reachable("source", "target", "A");

    assertEquals(await cycle.getData(), [
      { start: "A", node: "A" },
      { start: "A", node: "B" },
      { start: "A", node: "C" },
      { start: "A", node: "D" },
      { start: "A", node: "E" },
    ]);
    assertEquals(await parallel.getData(), [
      { start: "A", node: "B" },
      { start: "A", node: "C" },
    ]);
    assertEquals(await selfLoop.getData(), [
      { start: "A", node: "A" },
      { start: "A", node: "B" },
    ]);
    assertEquals(await singleLoop.getData(), [{ start: "A", node: "A" }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable includes only starts that connections actually lead back to", async () => {
  const sdb = new SimpleDB();
  try {
    const edges = [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "C", target: "B" },
      { source: "C", target: "D" },
    ];
    for (const direction of ["outgoing", "incoming"] as const) {
      const rows = direction === "outgoing"
        ? edges
        : edges.map(({ source, target }) => ({
          source: target,
          target: source,
        }));
      assertEquals(
        await sdb.newTable().loadArray(rows)
          .reachable("source", "target", ["D", "B", "A"], { direction })
          .getData(),
        [
          { start: "A", node: "B" },
          { start: "A", node: "C" },
          { start: "A", node: "D" },
          { start: "B", node: "B" },
          { start: "B", node: "C" },
          { start: "B", node: "D" },
        ],
      );
    }
    assertEquals(
      await sdb.newTable().loadArray([{ source: "A", target: "B" }])
        .reachable("source", "target", "A", { direction: "both" }).getData(),
      [{ start: "A", node: "A" }, { start: "A", node: "B" }],
    );
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
      outputTable: string;
    } = {
      direction: "incoming",
      outputTable: "incomingSnapshot",
    };
    const result = loadScenario(sdb, "snapshots", "baseline")
      .reachable("source", "target", starts, options);
    starts[0] = "A";
    options.direction = "outgoing";
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
      { start: 0, node: 2 },
      { start: 0, node: 10 },
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
      { start: "9007199254740993", node: "9007199254740995" },
    ]);

    const bounded = sdb.newTable("boundedIds");
    await sdb.customQuery(`CREATE TABLE "boundedIds" AS SELECT
      0::TINYINT AS source, 1::TINYINT AS target`);
    assertEquals(
      await bounded.reachable("source", "target", [128, 0]).getData(),
      [
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
        { start: "A", node: "C" },
        { start: "A", node: "b" },
        { start: "a", node: "B" },
        { start: "a", node: "D" },
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
      "reachable() startNodes must not be an empty array.",
    );
    assertThrows(
      () => table.reachable("source", "target", ["A", "A"]),
      TypeError,
      'reachable() startNodes contains duplicate IDs: "A".',
    );
    assertThrows(
      () => table.reachable("source", "target", [0, 0n]),
      TypeError,
      "reachable() startNodes contains duplicate IDs: 0n.",
    );
    assertThrows(
      () => table.reachable("source", "target", ["1", 1]),
      TypeError,
      "reachable() startNodes must not mix string and numeric IDs.",
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
      "reachable() sourceColumn must be a string.",
    );
    assertThrows(
      () => table.reachable("source", 1 as unknown as string, "A"),
      TypeError,
      "reachable() targetColumn must be a string.",
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
      "startNodes contain string IDs",
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
        .reachable("origin", "destination", "A").getData(),
      allFromA,
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

Deno.test("reachable chronological traversal keeps valid first events and enforces connection gaps", async () => {
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await sdb.newTable().loadArray(chronologicalRows(standaloneEvent))
        .reachable("source", "target", "Toronto", {
          startTimeColumn: "startTime",
          endTimeColumn: "endTime",
          minGapMs: 60,
        }).getData(),
      [{ start: "Toronto", node: "Ottawa" }],
    );
    assertEquals(
      await sdb.newTable().loadArray(chronologicalRows(standaloneEvent))
        .reachable("source", "target", "Toronto", {
          endTimeColumn: "endTime",
        }).getData(),
      [{ start: "Toronto", node: "Ottawa" }],
    );

    assertEquals(
      await sdb.newTable().loadArray(chronologicalRows(connectionEvents))
        .reachable("source", "target", "A", {
          startTimeColumn: "startTime",
          endTimeColumn: "endTime",
          minGapMs: 60,
        }).getData(),
      [
        { start: "A", node: "B" },
        { start: "A", node: "D" },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable chronological traversal retains competing last-event states", async () => {
  const sdb = new SimpleDB();
  const events: ReferenceChronologicalEvent<string, string>[] = [
    { edgeId: "AB", source: "A", target: "B", startTime: 1n, endTime: 1n },
    {
      edgeId: "BC-late",
      source: "B",
      target: "C",
      startTime: 2n,
      endTime: 6n,
    },
    {
      edgeId: "BC-early",
      source: "B",
      target: "C",
      startTime: 3n,
      endTime: 3n,
    },
    { edgeId: "CD", source: "C", target: "D", startTime: 4n, endTime: 4n },
    { edgeId: "DE", source: "D", target: "E", startTime: 5n, endTime: 5n },
  ];
  try {
    assertEquals(
      await sdb.newTable().loadArray(chronologicalRows(events))
        .reachable("source", "target", "A", {
          startTimeColumn: "startTime",
          endTimeColumn: "endTime",
        }).getData(),
      ["B", "C", "D", "E"].map((node) => ({ start: "A", node })),
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable chronological incoming traversal follows actual predecessors", async () => {
  const sdb = new SimpleDB();
  const events: ReferenceChronologicalEvent<string, string>[] = [
    { edgeId: "F1", source: "A", target: "B", startTime: 1n, endTime: 2n },
    { edgeId: "F2", source: "B", target: "C", startTime: 3n, endTime: 4n },
    { edgeId: "late", source: "X", target: "B", startTime: 4n, endTime: 5n },
  ];
  try {
    assertEquals(
      await sdb.newTable().loadArray(chronologicalRows(events))
        .reachable("source", "target", "C", {
          direction: "incoming",
          startTimeColumn: "startTime",
          endTimeColumn: "endTime",
          minGapMs: 1,
        }).getData(),
      [
        { start: "C", node: "A" },
        { start: "C", node: "B" },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable chronological traversal handles starts, parallel events, returns, equal times, and input order", async () => {
  const sdb = new SimpleDB();
  const events: ReferenceChronologicalEvent<string, string>[] = [
    ...equalTimeEvents,
    { edgeId: "E1-copy", source: "A", target: "B", startTime: 1n, endTime: 1n },
    { edgeId: "E3", source: "B", target: "C", startTime: 2n, endTime: 2n },
  ];
  const expected = [
    { start: "A", node: "A" },
    { start: "A", node: "B" },
    { start: "A", node: "C" },
    { start: "B", node: "A" },
    { start: "B", node: "B" },
    { start: "B", node: "C" },
  ];
  try {
    for (const ordered of [events, events.toReversed()]) {
      assertEquals(
        await sdb.newTable().loadArray(chronologicalRows(ordered))
          .reachable("source", "target", ["unknown", "B", "A"], {
            startTimeColumn: "startTime",
            strictOrdering: false,
          }).getData(),
        expected,
      );
    }
    assertEquals(
      await sdb.newTable().loadArray(chronologicalRows(events))
        .reachable("source", "target", "A", {
          startTimeColumn: "startTime",
        }).getData(),
      [
        { start: "A", node: "B" },
        { start: "A", node: "C" },
      ],
    );
    assertEquals(
      await sdb.newTable().loadArray(chronologicalRows([
        {
          edgeId: "self",
          source: "C",
          target: "C",
          startTime: 1n,
          endTime: 1n,
        },
      ])).reachable("source", "target", "C", {
        startTimeColumn: "startTime",
      }).getData(),
      [{ start: "C", node: "C" }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable chronological results match the independent evaluator on generated tiny graphs", async () => {
  const sdb = new SimpleDB();
  const nodes = ["A", "B", "C", "D"];
  try {
    for (let seed = 0; seed < 12; seed++) {
      let randomState = seed + 1;
      const random = (limit: number) => {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return (randomState >>> 16) % limit;
      };
      const events: ReferenceChronologicalEvent<string, string>[] = Array.from(
        { length: 6 },
        (_, index) => {
          const start = BigInt(random(7));
          const duration = (seed + index) % 5 === 0 ? -1n : BigInt(index % 3);
          return {
            edgeId: `${seed}-${index}`,
            source: nodes[random(nodes.length)],
            target: nodes[random(nodes.length)],
            startTime: (seed + index) % 11 === 0 ? null : start,
            endTime: start + duration,
          };
        },
      );
      const strictOrdering = seed % 3 !== 0;
      const minGap = BigInt(seed % 2);
      const starts = ["A", "C", "unknown"];
      for (const direction of ["outgoing", "incoming"] as const) {
        const expected = referenceReachable(
          events,
          starts,
          direction,
          minGap,
          strictOrdering,
        );
        for (const ordered of [events, events.toReversed()]) {
          assertEquals(
            await sdb.newTable().loadArray(chronologicalRows(ordered))
              .reachable("source", "target", starts, {
                direction,
                startTimeColumn: "startTime",
                endTimeColumn: "endTime",
                minGapMs: Number(minGap),
                strictOrdering,
              }).getData(),
            expected,
            `seed ${seed}, ${direction}, ${strictOrdering}`,
          );
        }
      }
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable chronological traversal preserves exact IDs and queued temporal schemas", async () => {
  const sdb = new SimpleDB();
  try {
    const wide = sdb.newTable("wideChronologicalReachability");
    await sdb.customQuery(`CREATE TABLE "wideChronologicalReachability" AS
      SELECT * FROM (VALUES
        (9007199254740993::BIGINT, 9007199254740995::BIGINT,
          TIMESTAMP '2025-01-01 00:00:00'),
        (9007199254740995::BIGINT, 9007199254740997::BIGINT,
          TIMESTAMP '2025-01-01 00:00:01')
      ) edges(source, target, time)`);
    wide.reachable("source", "target", 9007199254740993n, {
      startTimeColumn: "time",
    }).convert({ start: "string", node: "string" });
    assertEquals(await wide.getData(), [
      { start: "9007199254740993", node: "9007199254740995" },
      { start: "9007199254740993", node: "9007199254740997" },
    ]);

    const queuedOptions: {
      startTimeColumn: string;
      strictOrdering: boolean;
    } = { startTimeColumn: "time", strictOrdering: true };
    const queued = sdb.newTable().loadArray([
      { source: "A", target: "B", time: "2025-01-01 00:00:00" },
      { source: "B", target: "C", time: "2025-01-01 00:00:01" },
    ]).convert({ time: "datetime" })
      .reachable("source", "target", "A", queuedOptions);
    queuedOptions.startTimeColumn = "missing";
    queuedOptions.strictOrdering = false;
    assertEquals(await queued.getData(), [
      { start: "A", node: "B" },
      { start: "A", node: "C" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable validates chronological options before queuing and columns at execution", async () => {
  const sdb = new SimpleDB();
  try {
    const unqueued = sdb.newTable();
    assertThrows(
      () => unqueued.reachable("source", "target", "A", { minGapMs: 0 }),
      TypeError,
      "require options.startTimeColumn or options.endTimeColumn",
    );
    assertThrows(
      () =>
        unqueued.reachable("source", "target", "A", {
          direction: "both",
          startTimeColumn: "time",
        }),
      TypeError,
      'options.direction cannot be "both"',
    );
    assertThrows(
      () =>
        unqueued.reachable("source", "target", "A", {
          startTimeColumn: 1 as unknown as string,
        }),
      TypeError,
      "options.startTimeColumn must be a string",
    );
    assertEquals(unqueued.pendingOps.length, 0);

    const missing = sdb.newTable().loadArray([
      { source: "A", target: "B", time: new Date(chronologicalBase) },
    ]);
    await assertRejects(
      () =>
        missing.reachable("source", "target", "A", {
          startTimeColumn: "missing",
        }).run(),
      Error,
      'column "missing" does not exist',
    );
    const unsupported = sdb.newTable().loadArray([
      { source: "A", target: "B", time: 1 },
    ]);
    await assertRejects(
      () =>
        unsupported.reachable("source", "target", "A", {
          startTimeColumn: "time",
        }).run(),
      TypeError,
      "requires DATE or TIMESTAMP chronological columns",
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable chronological SQL materializes finite last-event state", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  const width = 5;
  const layers = 5;
  const events = Array.from(
    { length: layers },
    (_, layer) =>
      Array.from(
        { length: width },
        (_, from) =>
          Array.from({ length: width }, (_, to) => ({
            source: layer === 0 ? "start" : `L${layer}-${from}`,
            target: `L${layer + 1}-${to}`,
            time: new Date(chronologicalBase + layer * 1000),
          })),
      ).flat(),
  ).flat();
  try {
    const source = sdb.newTable("temporalStateGrowth").loadArray(events);
    await source.run();
    const result = source
      .reachable("source", "target", ["start", "L1-0"], {
        startTimeColumn: "time",
        outputTable: true,
      });
    assertEquals((await result.getData()).length, 45);
    const query = observer.queries.find((entry) =>
      entry.query.includes("graph_reachable_states") &&
      entry.query.includes("CREATE OR REPLACE TABLE")
    )?.query ?? "";
    assertStringIncludes(query, "AS MATERIALIZED");
    assertStringIncludes(query, '"__event_id", "__event_start", "__event_end"');
    assertEquals(query.includes("list_append"), false);
    assertEquals(query.includes("path"), false);

    const schema = {
      source: "VARCHAR",
      target: "VARCHAR",
      time: "TIMESTAMP",
    };
    const prepared = prepareGraphSql(
      quoteIdentifier(source.name),
      schema,
      "source",
      "target",
      "reachable()",
    );
    const temporal = prepareGraphTemporalSql(
      schema,
      prepareGraphTemporalOptions(
        { startTimeColumn: "time" },
        "outgoing",
        "reachable()",
      )!,
      "reachable()",
    );
    const startsSelect = `SELECT ${quoteIdentifier("start")},
      ${prepared.key(quoteIdentifier("start"))} AS ${quoteIdentifier("__key")}
      FROM (VALUES ('start'), ('L1-0')) AS ${quoteIdentifier("start_values")}(${
      quoteIdentifier("start")
    })`;
    const measured = buildGraphTemporalReachabilitySql(
      prepared,
      startsSelect,
      "outgoing",
      temporal,
    );
    assertEquals(
      await sdb.runQuery(
        `${measured.withClause}
        SELECT count(*) AS ${quoteIdentifier("stateCount")}
        FROM ${measured.reachableRelation}`,
        sdb.connection,
        true,
        {
          explainSQL: false,
          logSQL: false,
          method: "reachable() state measurement",
          parameters: null,
          values: [temporal.gapParameter],
        },
      ),
      [{ stateCount: 205 }],
    );
    // 125 physical events and two starts bound retained state to 250 rows.
    // The measured 205 states replace 5^6 possible full routes from one start.
    assertEquals(events.length * 2, 250);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

Deno.test("reachable chronological recursion preserves nanoseconds and binary node identity", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("graph_reachable_states");
    await sdb.customQuery(`CREATE TABLE "graph_reachable_states" (
      source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE,
      time TIMESTAMP_NS
    ); INSERT INTO "graph_reachable_states" VALUES
      ('A', 'b', '2025-01-01 00:00:00.000000001'),
      ('b', 'C', '2025-01-01 00:00:00.000000002'),
      ('a', 'B', '2025-01-01 00:00:00.000000001'),
      ('B', 'D', '2025-01-01 00:00:00.000000002')`);
    assertEquals(
      await source.reachable("source", "target", ["a", "A"], {
        startTimeColumn: "TIME",
        outputTable: true,
      }).getData(),
      [
        { start: "A", node: "C" },
        { start: "A", node: "b" },
        { start: "a", node: "B" },
        { start: "a", node: "D" },
      ],
    );
    assertEquals(
      await source.reachable("source", "target", ["C", "D"], {
        direction: "incoming",
        endTimeColumn: "time",
        outputTable: true,
      }).getData(),
      [
        { start: "C", node: "A" },
        { start: "C", node: "b" },
        { start: "D", node: "B" },
        { start: "D", node: "a" },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("reachable internal all-node starts use valid events and retain isolated endpoints", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("graph_starts");
    await sdb.customQuery(`CREATE TABLE "graph_starts" AS
      SELECT * FROM (VALUES
        ('A', 'X', TIMESTAMP '2025-01-01 10:00:00'),
        ('X', 'B', TIMESTAMP '2025-01-01 11:00:00'),
        ('B', 'A', TIMESTAMP '2025-01-01 01:00:00'),
        ('I', 'J', TIMESTAMP '2025-01-01 12:00:00'),
        ('invalid', 'missing', NULL::TIMESTAMP)
      ) edges(source, target, time)`);
    const schema = { source: "VARCHAR", target: "VARCHAR", time: "TIMESTAMP" };
    const prepared = prepareGraphSql(
      quoteIdentifier(source.name),
      schema,
      "source",
      "target",
      "reachable()",
    );
    const temporal = prepareGraphTemporalSql(
      schema,
      prepareGraphTemporalOptions(
        { startTimeColumn: "time" },
        "outgoing",
        "reachable()",
      )!,
      "reachable()",
    );
    const reachability = buildGraphTemporalReachabilitySql(
      prepared,
      (edges) =>
        `SELECT "__from" AS "start", "__from_key" AS "__key" FROM ${edges}
        UNION SELECT "__to", "__to_key" FROM ${edges}`,
      "outgoing",
      temporal,
    );
    assertEquals(
      await sdb.runQuery(
        `${reachability.withClause}
        SELECT DISTINCT start, node FROM ${reachability.reachableRelation}
        ORDER BY start, node`,
        sdb.connection,
        true,
        {
          explainSQL: false,
          logSQL: false,
          method: "all-node reachability probe",
          parameters: null,
          values: [temporal.gapParameter],
        },
      ),
      [
        { start: "A", node: "B" },
        { start: "A", node: "X" },
        { start: "B", node: "A" },
        { start: "B", node: "B" },
        { start: "B", node: "X" },
        { start: "I", node: "J" },
        { start: "X", node: "B" },
      ],
    );
  } finally {
    await sdb.close();
  }
});
