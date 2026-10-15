import { test, expect } from "vite-plus/test";
import { assertRejects, assertThrows } from "../../helpers/assertions.ts";

import { observeSdaQueries } from "../../../benchmarks/queryProfile.ts";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import type SimpleTable from "../../../src/class/SimpleTable.ts";

type Id = string | number;
type Edge = { source: Id; target: Id };

function loadScenario(sdb: SimpleDB, name: string, scenario: string): SimpleTable {
  return sdb
    .newTable(name)
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
  for (let index = 0; index < Math.min(leftBytes.length, rightBytes.length); index++) {
    if (leftBytes[index] !== rightBytes[index]) {
      return leftBytes[index] - rightBytes[index];
    }
  }
  return leftBytes.length - rightBytes.length;
}

function topologicalOracle(edges: Edge[]): Id[] {
  const remaining = new Set(edges.flatMap(({ source, target }) => [source, target]));
  const result: Id[] = [];
  while (remaining.size > 0) {
    const eligible = [...remaining]
      .filter(
        (node) => !edges.some(({ source, target }) => target === node && remaining.has(source)),
      )
      .toSorted(compareIds);
    if (eligible.length === 0) throw new Error("cycle");
    const selected = eligible[0];
    result.push(selected);
    remaining.delete(selected);
  }
  return result;
}

function groupedTopologicalOracle(edges: Edge[]) {
  const unseen = new Set(edges.flatMap(({ source, target }) => [source, target]));
  const groups: Set<Id>[] = [];
  while (unseen.size > 0) {
    const start = [...unseen].toSorted(compareIds)[0];
    const group = new Set<Id>([start]);
    const pending = [start];
    unseen.delete(start);
    while (pending.length > 0) {
      const node = pending.pop()!;
      for (const { source, target } of edges) {
        const neighbor = source === node ? target : target === node ? source : undefined;
        if (neighbor !== undefined && unseen.delete(neighbor)) {
          group.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    groups.push(group);
  }
  return groups.flatMap((group, componentId) =>
    topologicalOracle(edges.filter(({ source }) => group.has(source))).map((node, index) => ({
      node,
      componentId,
      order: index + 1,
    })),
  );
}

function assertTopologicalResult(edges: Edge[], rows: Record<string, unknown>[]) {
  expect(rows).toStrictEqual(groupedTopologicalOracle(edges));
  const positions = new Map(rows.map((row, index) => [row.node, index]));
  for (const { source, target } of edges) {
    expect(positions.get(source)! < positions.get(target)!).toStrictEqual(true);
  }
}

test("topologicalSort matches the shared baseline and duplicate-edge oracles", async () => {
  const sdb = new SimpleDB();
  try {
    const oracle = sdb
      .newTable("topologicalOracle")
      .loadData("test/data/graphs/expected/topological_sort.csv");
    for (const [index, scenario] of ["baseline", "parallel", "single"].entries()) {
      const actual = loadScenario(sdb, `topologicalFixture${index}`, scenario).topologicalSort(
        "source",
        "target",
      );
      const expected = oracle.clone().filter(`"case" = '${scenario}'`).removeColumns("case");
      expect(await actual.getData(), scenario).toStrictEqual(await expected.getData());
    }
  } finally {
    await sdb.close();
  }
});

test("topologicalSort selects the smallest eligible ID at every step", async () => {
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
      const result = await sdb
        .newTable(`topologicalPermutation${index}`)
        .loadArray(rows)
        .topologicalSort("source", "target")
        .getData();
      expect(result.map((row) => row.node)).toStrictEqual(expected);
      assertTopologicalResult(edges, result);
    }
  } finally {
    await sdb.close();
  }
});

test("topologicalSort groups independent nodes and restarts orders", async () => {
  const sdb = new SimpleDB();
  try {
    const scenarios: Edge[][] = [
      [
        { source: "A", target: "D" },
        { source: "B", target: "C" },
      ],
      [
        { source: "Z", target: "A" },
        { source: "B", target: "C" },
      ],
      [
        { source: 10, target: 20 },
        { source: 2, target: 30 },
      ],
      [
        { source: "10", target: "20" },
        { source: "2", target: "30" },
      ],
    ];
    for (const edges of scenarios) {
      for (const rows of [edges, edges.toReversed()]) {
        const source = sdb.newTable().loadArray(rows);
        const actual = await source
          .topologicalSort("source", "target", {
            outputTable: true,
          })
          .getData();
        assertTopologicalResult(edges, actual);
        const components = await source.connectedComponents("source", "target").getData();
        const ids = new Map(components.map((row) => [row.node, row.componentId]));
        for (const row of actual) {
          expect(row.componentId).toStrictEqual(ids.get(row.node));
        }
      }
    }
  } finally {
    await sdb.close();
  }
});

test("topologicalSort orders numeric IDs numerically and preserves wide identities", async () => {
  const edges: Edge[] = [
    { source: 10, target: 20 },
    { source: 0, target: 2 },
    { source: 2, target: 20 },
    { source: -3, target: 20 },
  ];
  const sdb = new SimpleDB();
  try {
    const numeric = sdb
      .newTable("numericTopological")
      .loadArray(edges)
      .topologicalSort("source", "target");
    const rows = await numeric.getData();
    expect(rows).toStrictEqual([
      { node: -3, componentId: 0, order: 1 },
      { node: 0, componentId: 0, order: 2 },
      { node: 2, componentId: 0, order: 3 },
      { node: 10, componentId: 0, order: 4 },
      { node: 20, componentId: 0, order: 5 },
    ]);
    assertTopologicalResult(edges, rows);
    expect(await numeric.getTypes()).toStrictEqual({
      node: "DOUBLE",
      componentId: "BIGINT",
      order: "BIGINT",
    });

    const wide = sdb.newTable("wideTopological");
    await sdb.customQuery(`CREATE TABLE "wideTopological" AS
      SELECT * FROM (VALUES
        (9007199254740995::BIGINT, 9007199254740997::BIGINT),
        (9007199254740993::BIGINT, 9007199254740997::BIGINT),
        (0::BIGINT, 1::BIGINT)
      ) edges(source, target)`);
    wide.topologicalSort("source", "target").convert({ node: "string" });
    expect(await wide.getData()).toStrictEqual([
      { node: "0", componentId: 0, order: 1 },
      { node: "1", componentId: 0, order: 2 },
      { node: "9007199254740993", componentId: 1, order: 1 },
      { node: "9007199254740995", componentId: 1, order: 2 },
      { node: "9007199254740997", componentId: 1, order: 3 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("topologicalSort preserves binary string identity under collations", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("collatedTopological");
    await sdb.customQuery(`CREATE TABLE "collatedTopological" (
      source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE
    ); INSERT INTO "collatedTopological" VALUES
      ('a', 'z'), ('A', 'Z'), ('001', '1')`);
    expect(await table.topologicalSort("source", "target").getData()).toStrictEqual([
      { node: "001", componentId: 0, order: 1 },
      { node: "1", componentId: 0, order: 2 },
      { node: "A", componentId: 1, order: 1 },
      { node: "Z", componentId: 1, order: 2 },
      { node: "a", componentId: 2, order: 1 },
      { node: "z", componentId: 2, order: 2 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("topologicalSort uses fixed output names and keeps typed empty results", async () => {
  const sdb = new SimpleDB();
  try {
    const custom = sdb
      .newTable("customTopological")
      .loadData("test/data/graphs/custom-columns.csv")
      .topologicalSort("ORIGIN", "Destination");
    expect(await custom.getData()).toStrictEqual([
      { node: "A", componentId: 0, order: 1 },
      { node: "B", componentId: 0, order: 2 },
      { node: "C", componentId: 0, order: 3 },
    ]);
    expect(await custom.getColumns()).toStrictEqual(["node", "componentId", "order"]);

    const empty = sdb.newTable("emptyTopological");
    await sdb.customQuery('CREATE TABLE "emptyTopological" (source VARCHAR, target VARCHAR)');
    empty.topologicalSort("source", "target");
    expect(await empty.getData()).toStrictEqual([]);
    expect(await empty.getTypes()).toStrictEqual({
      node: "VARCHAR",
      componentId: "BIGINT",
      order: "BIGINT",
    });

    const numericEmpty = sdb.newTable("emptyNumericTopological");
    await sdb.customQuery('CREATE TABLE "emptyNumericTopological" (source BIGINT, target INTEGER)');
    numericEmpty.topologicalSort("source", "target");
    expect(await numericEmpty.getData()).toStrictEqual([]);
    expect(await numericEmpty.getTypes()).toStrictEqual({
      node: "BIGINT",
      componentId: "BIGINT",
      order: "BIGINT",
    });
  } finally {
    await sdb.close();
  }
});

test("topologicalSort supports overwrite and source-preserving outputs", async () => {
  const sdb = new SimpleDB();
  try {
    const defaultOverwrite = sdb
      .newTable("defaultTopological")
      .loadArray([{ source: "A", target: "B" }]);
    expect(defaultOverwrite.topologicalSort("source", "target")).toBe(defaultOverwrite);
    expect(await defaultOverwrite.getColumns()).toStrictEqual(["node", "componentId", "order"]);

    const explicitOverwrite = sdb
      .newTable("explicitTopological")
      .loadArray([{ source: "A", target: "B" }]);
    expect(
      explicitOverwrite.topologicalSort("source", "target", {
        outputTable: false,
      }),
    ).toBe(explicitOverwrite);
    expect(await explicitOverwrite.getRowCount()).toStrictEqual(2);

    const source = sdb.newTable("preservedTopological").loadArray([{ source: "A", target: "B" }]);
    const named = source
      .topologicalSort("source", "target", {
        outputTable: "namedTopological",
      })
      .filter("node = 'B'");
    expect(named.name).toStrictEqual("namedTopological");
    expect(await named.getData()).toStrictEqual([
      {
        node: "B",
        componentId: 0,
        order: 2,
      },
    ]);
    expect(await source.getData()).toStrictEqual([{ source: "A", target: "B" }]);

    const generated = source.topologicalSort("source", "target", {
      outputTable: true,
    });
    expect(generated.name.startsWith("table")).toStrictEqual(true);
    expect(generated.name === source.name).toStrictEqual(false);
    expect(await generated.getRowCount()).toStrictEqual(2);
    expect(await source.getColumns()).toStrictEqual(["source", "target"]);
  } finally {
    await sdb.close();
  }
});

test("topologicalSort rejects cycles without replacing the source", async () => {
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
      expect(await table.getData()).toStrictEqual(edges);
    }
  } finally {
    await sdb.close();
  }
});

test("topologicalSort cycle failure survives downstream limits, projections and filters", async () => {
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
      () => filtered.topologicalSort("source", "target").filter("node = 'A'").getData(),
      Error,
      "contains a directed cycle",
    );

    for (const [index, transform] of [
      (table: SimpleTable) => table.selectColumns("order"),
      (table: SimpleTable) => table.filter('"order" > 0'),
      (table: SimpleTable) => table.filter("node = 'missing'"),
      (table: SimpleTable) => table.selectRows(0),
      (table: SimpleTable) => table.filter("FALSE"),
    ].entries()) {
      const projected = sdb
        .newTable(`projectedCyclicTopological${index}`)
        .loadArray(edges)
        .topologicalSort("source", "target");
      await assertRejects(() => transform(projected).getData(), Error, "contains a directed cycle");
    }
  } finally {
    await sdb.close();
  }
});

test("topologicalSort validates arguments and schema cheaply", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      () => table.topologicalSort(1 as unknown as string, "target"),
      TypeError,
      "topologicalSort() sourceColumn must be a string.",
    );
    assertThrows(
      () => table.topologicalSort("source", 1 as unknown as string),
      TypeError,
      "topologicalSort() targetColumn must be a string.",
    );
    assertThrows(
      () => table.topologicalSort("source", "target", null as never),
      TypeError,
      "topologicalSort() options must be an object.",
    );
    assertThrows(
      () => table.topologicalSort("source", "target", { outputTable: 1 as never }),
      TypeError,
      "topologicalSort() options.outputTable must be a string or boolean.",
    );
    expect(table.pendingOps.length).toStrictEqual(0);

    const missing = sdb.newTable("missingTopologicalColumn").loadArray([{ source: "A" }]);
    await assertRejects(
      () => missing.topologicalSort("source", "target").run(),
      Error,
      'topologicalSort() the column "target" does not exist',
    );

    const unsupported = sdb
      .newTable("unsupportedTopological")
      .loadData("test/data/graphs/unsupported-types.csv");
    await assertRejects(
      () => unsupported.topologicalSort("dateSource", "stringTarget").run(),
      TypeError,
      'column "dateSource" has type DATE',
    );

    const incompatible = sdb
      .newTable("incompatibleTopological")
      .loadArray([{ source: 1, target: "1" }]);
    await assertRejects(
      () => incompatible.topologicalSort("source", "target").run(),
      TypeError,
      "requires compatible source and target ID types",
    );

    const lossy = sdb.newTable("lossyTopological");
    await sdb.customQuery('CREATE TABLE "lossyTopological" (source BIGINT, target DOUBLE)');
    await assertRejects(
      () => lossy.topologicalSort("source", "target").run(),
      TypeError,
      "without losing ID precision",
    );
  } finally {
    await sdb.close();
  }
});

test("topologicalSort snapshots options and rejects output collisions", async () => {
  const sdb = new SimpleDB();
  try {
    const options: { outputTable: string } = {
      outputTable: "topologicalSnapshot",
    };
    const result = sdb
      .newTable("topologicalSnapshotSource")
      .loadArray([{ source: "A", target: "B" }])
      .topologicalSort("source", "target", options);
    options.outputTable = "changed";
    expect(result.name).toStrictEqual("topologicalSnapshot");
    expect(await result.getData()).toStrictEqual([
      { node: "A", componentId: 0, order: 1 },
      { node: "B", componentId: 0, order: 2 },
    ]);

    const source = sdb
      .newTable("topologicalCollisionSource")
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
    expect(source.pendingOps.length).toStrictEqual(0);
  } finally {
    await sdb.close();
  }
});

test("topologicalSort preserves queued source and output operation order", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb
      .newTable("changingTopologicalSource")
      .loadArray([{ source: "A", target: "B" }]);
    const result = source.topologicalSort("source", "target", {
      outputTable: true,
    });
    source.loadArray([{ source: "A", target: "C" }]);
    expect(await result.getData()).toStrictEqual([
      { node: "A", componentId: 0, order: 1 },
      { node: "B", componentId: 0, order: 2 },
    ]);
    expect(await source.getData()).toStrictEqual([{ source: "A", target: "C" }]);
  } finally {
    await sdb.close();
  }
});

test("topologicalSort output records its source as a cache dependency", async () => {
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
    const source = firstSdb.newTable(sourceName).loadArray([{ source: "A", target: "B" }]);
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
    expect(computationRuns).toStrictEqual(2);
    expect(await output.getData()).toStrictEqual([
      { node: "A", componentId: 0, order: 1 },
      { node: "B", componentId: 0, order: 2 },
      { node: "C", componentId: 1, order: 1 },
      { node: "D", componentId: 1, order: 2 },
    ]);
  } finally {
    await secondSdb.close();
  }
});

test("topologicalSort uses one native sorting computation without path enumeration", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const edges = Array.from({ length: 140 }, (_, source) => ({
      source,
      target: source + 1,
    })).toReversed();
    const result = await sdb
      .newTable("graph_topological_order")
      .loadArray(edges)
      .topologicalSort("source", "target")
      .getData();
    expect(result.length).toStrictEqual(141);
    expect(result.at(-1)).toStrictEqual({ node: 140, componentId: 0, order: 141 });

    const queries = observer.queries
      .filter((entry) => entry.query.includes("graph_topological_result"))
      .map((entry) => entry.query);
    expect(queries.length).toStrictEqual(1);
    expect(queries[0]).toContain("WITH RECURSIVE");
    expect(queries[0]).toContain("list_contains");
    expect(queries[0]).toContain('"graph_topological_order_1"');
    expect(queries[0]).toContain("contains a directed cycle");
    expect(queries[0].includes("findCycles")).toStrictEqual(false);
    expect(queries[0].includes("pathId")).toStrictEqual(false);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

test("topologicalSort internal relations do not shadow input table names", async () => {
  const sdb = new SimpleDB();
  try {
    for (const [index, name] of [
      "graph_edges",
      "GRAPH_NODES",
      "graph_topological_order",
      "GRAPH_TOPOLOGICAL_RESULT",
      "graph_component_edges",
      "graph_component_labels",
      "graph_component_roots",
      "graph_ordered_nodes",
    ].entries()) {
      expect(
        await sdb
          .newTable(name)
          .loadArray([{ source: "A", target: "B" }])
          .topologicalSort("source", "target")
          .getData(),
        `relation ${index}`,
      ).toStrictEqual([
        { node: "A", componentId: 0, order: 1 },
        {
          node: "B",
          componentId: 0,
          order: 2,
        },
      ]);
    }
  } finally {
    await sdb.close();
  }
});

test("topologicalSort executes both complete JSDoc examples and displays ordered rows", async () => {
  const examples = [
    {
      edges: [
        { source: "A", target: "B" },
        { source: "B", target: "C" },
        { source: "D", target: "C" },
      ],
      expected: [
        { node: "A", componentId: 0, order: 1 },
        { node: "B", componentId: 0, order: 2 },
        { node: "D", componentId: 0, order: 3 },
        { node: "C", componentId: 0, order: 4 },
      ],
    },
    {
      edges: [
        { source: "A", target: "D" },
        { source: "B", target: "C" },
      ],
      expected: [
        { node: "A", componentId: 0, order: 1 },
        { node: "D", componentId: 0, order: 2 },
        { node: "B", componentId: 1, order: 1 },
        { node: "C", componentId: 1, order: 2 },
      ],
    },
  ];
  for (const { edges, expected } of examples) {
    const sdb = new SimpleDB();
    const originalLog = console.log;
    const displayed: string[] = [];
    try {
      const table = sdb.newTable().loadArray(edges);
      console.log = (...args: unknown[]) => {
        displayed.push(args.map(String).join(" "));
        originalLog(...args);
      };
      await table.topologicalSort("source", "target").log();
      console.log = originalLog;
      expect(await table.getData()).toStrictEqual(expected);
      const displayedCells = displayed
        .map((line) =>
          line
            .split("\x1b")
            .map((part) => part.replace(/^\[[0-9;]*m/, ""))
            .join(""),
        )
        .filter((line) => line.startsWith("│"))
        .map((line) =>
          line
            .split("│")
            .slice(1, -1)
            .map((cell) => cell.trim()),
        );
      expect(displayedCells).toStrictEqual([
        ["node", "componentId", "order"],
        ...expected.map(({ node, componentId, order }) => [
          node,
          String(componentId),
          String(order),
        ]),
      ]);
    } finally {
      console.log = originalLog;
      await sdb.close();
    }
  }
});

test("topologicalSort retains exact decimal components and fractional ready-node order", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("decimalTopological");
    await sdb.customQuery(`CREATE TABLE "decimalTopological" AS
      SELECT source::DECIMAL(38, 2) AS source,
        target::DECIMAL(38, 2) AS target
      FROM (VALUES
        ('9007199254740995.01', '9007199254740997.01'),
        ('9007199254740993.01', '9007199254740997.01'),
        ('-0.25', '2.50'), ('-0.50', '10.50'), ('2.50', '10.50')
      ) edges(source, target)`);
    table.topologicalSort("source", "target");
    expect(await table.getTypes()).toStrictEqual({
      node: "DECIMAL(38,2)",
      componentId: "BIGINT",
      order: "BIGINT",
    });
    expect(await table.convert({ node: "string" }).getData()).toStrictEqual([
      { node: "-0.50", componentId: 0, order: 1 },
      { node: "-0.25", componentId: 0, order: 2 },
      { node: "2.50", componentId: 0, order: 3 },
      { node: "10.50", componentId: 0, order: 4 },
      { node: "9007199254740993.01", componentId: 1, order: 1 },
      { node: "9007199254740995.01", componentId: 1, order: 2 },
      { node: "9007199254740997.01", componentId: 1, order: 3 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("topologicalSort rejects cycles in preserved outputs despite empty downstream results", async () => {
  const edges = [
    { source: "A", target: "B" },
    { source: "C", target: "D" },
    { source: "D", target: "C" },
  ];
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable().loadArray(edges);
    for (const outputTable of [true, "namedCyclicTopological"] as const) {
      const result = source.topologicalSort("source", "target", {
        outputTable,
      });
      await assertRejects(
        () => result.filter("componentId = 0").selectRows(0).getData(),
        Error,
        "contains a directed cycle",
      );
      expect(await source.getData()).toStrictEqual(edges);
    }
  } finally {
    await sdb.close();
  }
});
