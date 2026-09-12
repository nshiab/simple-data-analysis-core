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

type Id = string | number;
type Edge = { source: Id; target: Id };

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

function compareIds(left: Id, right: Id): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left !== "string" || typeof right !== "string") {
    throw new TypeError("Oracle IDs must use one family.");
  }
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  for (
    let index = 0;
    index < Math.min(leftBytes.length, rightBytes.length);
    index++
  ) {
    if (leftBytes[index] !== rightBytes[index]) {
      return leftBytes[index] - rightBytes[index];
    }
  }
  return leftBytes.length - rightBytes.length;
}

function topologicalOracle(edges: Edge[]): Id[] {
  const remaining = new Set(
    edges.flatMap(({ source, target }) => [source, target]),
  );
  const result: Id[] = [];
  while (remaining.size > 0) {
    const eligible = [...remaining].filter((node) =>
      !edges.some(({ source, target }) =>
        target === node && remaining.has(source)
      )
    ).toSorted(compareIds);
    if (eligible.length === 0) throw new Error("cycle");
    const selected = eligible[0];
    result.push(selected);
    remaining.delete(selected);
  }
  return result;
}

function assertTopologicalResult(
  edges: Edge[],
  rows: Record<string, unknown>[],
) {
  const nodes = rows.map((row) => row.node as Id);
  assertEquals(nodes, topologicalOracle(edges));
  assertEquals(new Set(nodes).size, nodes.length);
  assertEquals(
    rows.map((row) => row.order),
    rows.map((_, index) => index + 1),
  );
  const positions = new Map(nodes.map((node, index) => [node, index]));
  for (const { source, target } of edges) {
    const sourcePosition = positions.get(source);
    const targetPosition = positions.get(target);
    assertEquals(sourcePosition !== undefined, true);
    assertEquals(targetPosition !== undefined, true);
    assertEquals(
      sourcePosition! < targetPosition!,
      true,
      `${source} -> ${target}`,
    );
  }
}

Deno.test("topologicalSort matches the shared baseline and duplicate-edge oracles", async () => {
  const sdb = new SimpleDB();
  try {
    const oracle = sdb.newTable("topologicalOracle")
      .loadData("test/data/graphs/expected/topological_sort.csv");
    for (
      const [index, scenario] of ["baseline", "parallel", "single"].entries()
    ) {
      const actual = loadScenario(sdb, `topologicalFixture${index}`, scenario)
        .topologicalSort("source", "target");
      const expected = oracle.clone()
        .filter(`"case" = '${scenario}'`)
        .removeColumns("case");
      assertEquals(await actual.getData(), await expected.getData(), scenario);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("topologicalSort selects the smallest eligible ID at every step", async () => {
  const edges: Edge[] = [
    { source: "D", target: "E" },
    { source: "A", target: "C" },
    { source: "F", target: "G" },
    { source: "B", target: "D" },
    { source: "A", target: "B" },
    { source: "C", target: "D" },
    { source: "A", target: "B" },
  ];
  const expected = ["A", "B", "C", "D", "E", "F", "G"];
  const sdb = new SimpleDB();
  try {
    for (const [index, rows] of [edges, edges.toReversed()].entries()) {
      const result = await sdb.newTable(`topologicalPermutation${index}`)
        .loadArray(rows)
        .topologicalSort("source", "target")
        .getData();
      assertEquals(result.map((row) => row.node), expected);
      assertTopologicalResult(edges, result);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("topologicalSort orders numeric IDs numerically and preserves wide identities", async () => {
  const edges: Edge[] = [
    { source: 10, target: 20 },
    { source: 0, target: 2 },
    { source: 2, target: 20 },
    { source: -3, target: 20 },
  ];
  const sdb = new SimpleDB();
  try {
    const numeric = sdb.newTable("numericTopological").loadArray(edges)
      .topologicalSort("source", "target");
    const rows = await numeric.getData();
    assertEquals(rows, [
      { node: -3, order: 1 },
      { node: 0, order: 2 },
      { node: 2, order: 3 },
      { node: 10, order: 4 },
      { node: 20, order: 5 },
    ]);
    assertTopologicalResult(edges, rows);
    assertEquals(await numeric.getTypes(), { node: "DOUBLE", order: "BIGINT" });

    const wide = sdb.newTable("wideTopological");
    await sdb.customQuery(`CREATE TABLE "wideTopological" AS
      SELECT * FROM (VALUES
        (9007199254740995::BIGINT, 9007199254740997::BIGINT),
        (9007199254740993::BIGINT, 9007199254740997::BIGINT),
        (0::BIGINT, 1::BIGINT)
      ) edges(source, target)`);
    wide.topologicalSort("source", "target").convert({ node: "string" });
    assertEquals(await wide.getData(), [
      { node: "0", order: 1 },
      { node: "1", order: 2 },
      { node: "9007199254740993", order: 3 },
      { node: "9007199254740995", order: 4 },
      { node: "9007199254740997", order: 5 },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("topologicalSort preserves binary string identity under collations", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("collatedTopological");
    await sdb.customQuery(`CREATE TABLE "collatedTopological" (
      source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE
    ); INSERT INTO "collatedTopological" VALUES
      ('a', 'z'), ('A', 'Z'), ('001', '1')`);
    assertEquals(
      await table.topologicalSort("source", "target").getData(),
      [
        { node: "001", order: 1 },
        { node: "1", order: 2 },
        { node: "A", order: 3 },
        { node: "Z", order: 4 },
        { node: "a", order: 5 },
        { node: "z", order: 6 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("topologicalSort uses fixed output names and keeps typed empty results", async () => {
  const sdb = new SimpleDB();
  try {
    const custom = sdb.newTable("customTopological")
      .loadData("test/data/graphs/custom-columns.csv")
      .topologicalSort("ORIGIN", "Destination");
    assertEquals(await custom.getData(), [
      { node: "A", order: 1 },
      { node: "B", order: 2 },
      { node: "C", order: 3 },
    ]);
    assertEquals(await custom.getColumns(), ["node", "order"]);

    const empty = sdb.newTable("emptyTopological");
    await sdb.customQuery(
      'CREATE TABLE "emptyTopological" (source VARCHAR, target VARCHAR)',
    );
    empty.topologicalSort("source", "target");
    assertEquals(await empty.getData(), []);
    assertEquals(await empty.getTypes(), { node: "VARCHAR", order: "BIGINT" });

    const numericEmpty = sdb.newTable("emptyNumericTopological");
    await sdb.customQuery(
      'CREATE TABLE "emptyNumericTopological" (source BIGINT, target INTEGER)',
    );
    numericEmpty.topologicalSort("source", "target");
    assertEquals(await numericEmpty.getData(), []);
    assertEquals(await numericEmpty.getTypes(), {
      node: "BIGINT",
      order: "BIGINT",
    });
  } finally {
    await sdb.close();
  }
});

Deno.test("topologicalSort supports overwrite and source-preserving outputs", async () => {
  const sdb = new SimpleDB();
  try {
    const defaultOverwrite = sdb.newTable("defaultTopological")
      .loadArray([{ source: "A", target: "B" }]);
    assertStrictEquals(
      defaultOverwrite.topologicalSort("source", "target"),
      defaultOverwrite,
    );
    assertEquals(await defaultOverwrite.getColumns(), ["node", "order"]);

    const explicitOverwrite = sdb.newTable("explicitTopological")
      .loadArray([{ source: "A", target: "B" }]);
    assertStrictEquals(
      explicitOverwrite.topologicalSort("source", "target", {
        outputTable: false,
      }),
      explicitOverwrite,
    );
    assertEquals(await explicitOverwrite.getRowCount(), 2);

    const source = sdb.newTable("preservedTopological")
      .loadArray([{ source: "A", target: "B" }]);
    const named = source.topologicalSort("source", "target", {
      outputTable: "namedTopological",
    }).filter("node = 'B'");
    assertEquals(named.name, "namedTopological");
    assertEquals(await named.getData(), [{ node: "B", order: 2 }]);
    assertEquals(await source.getData(), [{ source: "A", target: "B" }]);

    const generated = source.topologicalSort("source", "target", {
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

Deno.test("topologicalSort rejects cycles without replacing the source", async () => {
  const sdb = new SimpleDB();
  try {
    const cases: { name: string; edges: Edge[] }[] = [
      {
        name: "directedCycle",
        edges: [
          { source: "A", target: "B" },
          { source: "B", target: "A" },
        ],
      },
      { name: "selfLoop", edges: [{ source: "A", target: "A" }] },
      {
        name: "partialCycle",
        edges: [
          { source: "A", target: "B" },
          { source: "C", target: "D" },
          { source: "D", target: "C" },
        ],
      },
    ];
    for (const { name, edges } of cases) {
      const table = sdb.newTable(name).loadArray(edges);
      await table.run();
      await assertRejects(
        () => table.topologicalSort("source", "target").run(),
        Error,
        "contains a directed cycle",
      );
      assertEquals(await table.getData(), edges);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("topologicalSort cycle failure survives downstream limits, projections and filters", async () => {
  const edges = [
    { source: "A", target: "B" },
    { source: "C", target: "D" },
    { source: "D", target: "C" },
  ];
  const sdb = new SimpleDB();
  try {
    const limited = sdb.newTable("limitedCyclicTopological").loadArray(edges);
    await assertRejects(
      () => limited.topologicalSort("source", "target").selectRows(1).getData(),
      Error,
      "contains a directed cycle",
    );

    const filtered = sdb.newTable("filteredCyclicTopological").loadArray(edges);
    await assertRejects(
      () =>
        filtered.topologicalSort("source", "target")
          .filter("node = 'A'")
          .getData(),
      Error,
      "contains a directed cycle",
    );

    for (
      const [index, transform] of [
        (table: SimpleTable) => table.selectColumns("order"),
        (table: SimpleTable) => table.filter('"order" > 0'),
        (table: SimpleTable) => table.filter("node = 'missing'"),
        (table: SimpleTable) => table.selectRows(0),
        (table: SimpleTable) => table.filter("FALSE"),
      ].entries()
    ) {
      const projected = sdb.newTable(`projectedCyclicTopological${index}`)
        .loadArray(edges).topologicalSort("source", "target");
      await assertRejects(
        () => transform(projected).getData(),
        Error,
        "contains a directed cycle",
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("topologicalSort validates arguments and schema cheaply", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      () => table.topologicalSort(1 as unknown as string, "target"),
      TypeError,
      "topologicalSort() source must be a string.",
    );
    assertThrows(
      () => table.topologicalSort("source", 1 as unknown as string),
      TypeError,
      "topologicalSort() target must be a string.",
    );
    assertThrows(
      () => table.topologicalSort("source", "target", null as never),
      TypeError,
      "topologicalSort() options must be an object.",
    );
    assertThrows(
      () =>
        table.topologicalSort("source", "target", { outputTable: 1 as never }),
      TypeError,
      "topologicalSort() options.outputTable must be a string or boolean.",
    );
    assertEquals(table.pendingOps.length, 0);

    const missing = sdb.newTable("missingTopologicalColumn")
      .loadArray([{ source: "A" }]);
    await assertRejects(
      () => missing.topologicalSort("source", "target").run(),
      Error,
      'topologicalSort() the column "target" does not exist',
    );

    const unsupported = sdb.newTable("unsupportedTopological")
      .loadData("test/data/graphs/unsupported-types.csv");
    await assertRejects(
      () => unsupported.topologicalSort("dateSource", "stringTarget").run(),
      TypeError,
      'column "dateSource" has type DATE',
    );

    const incompatible = sdb.newTable("incompatibleTopological")
      .loadArray([{ source: 1, target: "1" }]);
    await assertRejects(
      () => incompatible.topologicalSort("source", "target").run(),
      TypeError,
      "requires compatible source and target ID types",
    );

    const lossy = sdb.newTable("lossyTopological");
    await sdb.customQuery(
      'CREATE TABLE "lossyTopological" (source BIGINT, target DOUBLE)',
    );
    await assertRejects(
      () => lossy.topologicalSort("source", "target").run(),
      TypeError,
      "without losing ID precision",
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("topologicalSort snapshots options and rejects output collisions", async () => {
  const sdb = new SimpleDB();
  try {
    const options: { outputTable: string } = {
      outputTable: "topologicalSnapshot",
    };
    const result = sdb.newTable("topologicalSnapshotSource")
      .loadArray([{ source: "A", target: "B" }])
      .topologicalSort("source", "target", options);
    options.outputTable = "changed";
    assertEquals(result.name, "topologicalSnapshot");
    assertEquals(await result.getData(), [
      { node: "A", order: 1 },
      { node: "B", order: 2 },
    ]);

    const source = sdb.newTable("topologicalCollisionSource")
      .loadArray([{ source: "A", target: "B" }]);
    await source.run();
    sdb.newTable("existingTopologicalOutput");
    assertThrows(
      () =>
        source.topologicalSort("source", "target", {
          outputTable: "EXISTINGTOPOLOGICALOUTPUT",
        }),
      Error,
      "Table EXISTINGTOPOLOGICALOUTPUT already exists.",
    );
    assertEquals(source.pendingOps.length, 0);
  } finally {
    await sdb.close();
  }
});

Deno.test("topologicalSort preserves queued source and output operation order", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("changingTopologicalSource")
      .loadArray([{ source: "A", target: "B" }]);
    const result = source.topologicalSort("source", "target", {
      outputTable: true,
    });
    source.loadArray([{ source: "A", target: "C" }]);
    assertEquals(await result.getData(), [
      { node: "A", order: 1 },
      { node: "B", order: 2 },
    ]);
    assertEquals(await source.getData(), [{ source: "A", target: "C" }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("topologicalSort output records its source as a cache dependency", async () => {
  let computationRuns = 0;
  const unique = crypto.randomUUID().replaceAll("-", "");
  const outputName = `topologicalCacheOutput${unique}`;
  const sourceName = `topologicalCacheSource${unique}`;
  const compute = (source: SimpleTable) => async (output: SimpleTable) => {
    computationRuns++;
    const result = source.topologicalSort("source", "target", {
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
    assertEquals(await output.getData(), [
      { node: "A", order: 1 },
      { node: "B", order: 2 },
      { node: "C", order: 3 },
      { node: "D", order: 4 },
    ]);
  } finally {
    await secondSdb.close();
  }
});

Deno.test("topologicalSort uses one native sorting computation without path enumeration", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const edges = Array.from({ length: 140 }, (_, source) => ({
      source,
      target: source + 1,
    })).toReversed();
    const result = await sdb.newTable("graph_topological_order")
      .loadArray(edges)
      .topologicalSort("source", "target")
      .getData();
    assertEquals(result.length, 141);
    assertEquals(result.at(-1), { node: 140, order: 141 });

    const queries = observer.queries.filter((entry) =>
      entry.query.includes("graph_topological_result")
    ).map((entry) => entry.query);
    assertEquals(queries.length, 1);
    assertStringIncludes(queries[0], "WITH RECURSIVE");
    assertStringIncludes(queries[0], "list_contains");
    assertStringIncludes(queries[0], '"graph_topological_order_1"');
    assertStringIncludes(queries[0], "contains a directed cycle");
    assertEquals(queries[0].includes("findCycles"), false);
    assertEquals(queries[0].includes("pathId"), false);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

Deno.test("topologicalSort internal relations do not shadow input table names", async () => {
  const sdb = new SimpleDB();
  try {
    for (
      const [index, name] of [
        "graph_edges",
        "GRAPH_NODES",
        "graph_topological_order",
        "GRAPH_TOPOLOGICAL_RESULT",
      ].entries()
    ) {
      assertEquals(
        await sdb.newTable(name).loadArray([
          { source: "A", target: "B" },
        ]).topologicalSort("source", "target").getData(),
        [{ node: "A", order: 1 }, { node: "B", order: 2 }],
        `relation ${index}`,
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("topologicalSort JSDoc examples return their displayed outputs", async () => {
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await sdb.newTable("dinnerPlan").loadArray([
        { prerequisite: "Buy ingredients", task: "Cook dinner" },
        { prerequisite: "Cook dinner", task: "Eat dinner" },
        { prerequisite: "Set table", task: "Eat dinner" },
      ]).topologicalSort("prerequisite", "task").getData(),
      [
        { node: "Buy ingredients", order: 1 },
        { node: "Cook dinner", order: 2 },
        { node: "Set table", order: 3 },
        { node: "Eat dinner", order: 4 },
      ],
    );

    const connections = sdb.newTable("documentedTopologicalOutput")
      .loadArray([
        { source: "A", target: "B" },
        { source: "B", target: "C" },
      ]);
    assertEquals(
      await connections.topologicalSort("source", "target", {
        outputTable: "dependencyOrder",
      }).getData(),
      [
        { node: "A", order: 1 },
        { node: "B", order: 2 },
        { node: "C", order: 3 },
      ],
    );
    assertEquals(await connections.getData(), [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ]);
  } finally {
    await sdb.close();
  }
});
