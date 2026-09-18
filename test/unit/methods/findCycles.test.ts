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
  weighted = false,
): SimpleTable {
  const columns = weighted
    ? ["edgeId", "source", "target", "weight"]
    : ["edgeId", "source", "target"];
  return sdb.newTable(name)
    .loadData("test/data/graphs/edges.csv")
    .filter(`scenario = '${scenario}'`)
    .selectColumns(columns);
}

function expectedCase(sdb: SimpleDB, name: string, caseName: string) {
  return sdb.newTable(name)
    .loadData("test/data/graphs/expected/find_cycles.csv")
    .filter(`"case" = '${caseName}'`)
    .removeColumns("case");
}

Deno.test("findCycles defaults to outgoing with omitted or empty options", async () => {
  const sdb = new SimpleDB();
  try {
    const expected = await expectedCase(
      sdb,
      "defaultOracle",
      "triangle-outgoing",
    ).getData();
    assertEquals(
      await loadScenario(sdb, "implicitDefault", "triangle")
        .findCycles("source", "target", "edgeId").getData(),
      expected,
    );
    for (
      const [index, options] of [{}, { direction: "outgoing" as const }]
        .entries()
    ) {
      assertEquals(
        await loadScenario(sdb, `defaultOptions${index}`, "triangle")
          .findCycles("source", "target", "edgeId", options).getData(),
        expected,
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles returns directed and undirected cycles in canonical orientation", async () => {
  const sdb = new SimpleDB();
  try {
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      const actual = loadScenario(sdb, `triangle_${direction}`, "triangle")
        .findCycles("source", "target", "edgeId", {
          direction,
          outputTable: true,
        });
      const expected = expectedCase(
        sdb,
        `triangle_${direction}_oracle`,
        `triangle-${direction}`,
      );
      assertEquals(await actual.getData(), await expected.getData());
    }

    const undirected = loadScenario(
      sdb,
      "undirected_triangle",
      "undirected-triangle",
    );
    assertEquals(
      await undirected.findCycles("source", "target", "edgeId", {
        direction: "both",
        outputTable: true,
      }).getData(),
      await expectedCase(
        sdb,
        "undirected_oracle",
        "undirected-triangle-both",
      ).getData(),
    );
    for (const direction of ["outgoing", "incoming"] as const) {
      assertEquals(
        await undirected.findCycles("source", "target", "edgeId", {
          direction,
          outputTable: true,
        }).getData(),
        [],
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles enumerates every directed cycle without rotation duplicates", async () => {
  const sdb = new SimpleDB();
  try {
    const actual = loadScenario(sdb, "branching_cycle", "cycle")
      .findCycles("source", "target", "edgeId");
    assertEquals(
      await actual.getData(),
      await expectedCase(sdb, "branching_cycle_oracle", "cycle-outgoing")
        .getData(),
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles handles self-loops and distinct parallel-edge cycles", async () => {
  const sdb = new SimpleDB();
  try {
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      const loop = loadScenario(sdb, `loop_${direction}`, "self-loop", true)
        .findCycles("source", "target", "edgeId", {
          direction,
          weight: "weight",
        });
      assertEquals(
        await loop.getData(),
        await expectedCase(
          sdb,
          `loop_${direction}_oracle`,
          `self-loop-${direction}-weighted`,
        ).getData(),
      );
    }

    for (
      const [scenario, caseName] of [
        ["parallel", "parallel-both-weighted"],
        ["parallel-opposite", "parallel-opposite-both-weighted"],
      ] as const
    ) {
      const result = loadScenario(sdb, scenario, scenario, true).findCycles(
        "source",
        "target",
        "edgeId",
        { direction: "both", weight: "weight" },
      );
      assertEquals(
        await result.getData(),
        await expectedCase(sdb, `${scenario}_oracle`, caseName).getData(),
      );
    }

    for (const direction of ["outgoing", "incoming", "both"] as const) {
      assertEquals(
        await loadScenario(sdb, `single_${direction}`, "single")
          .findCycles("source", "target", "edgeId", { direction })
          .getData(),
        [],
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles preserves weights, floating sums, and numeric identity ordering", async () => {
  const sdb = new SimpleDB();
  try {
    const zero = loadScenario(sdb, "zero", "zero-cycle", true).findCycles(
      "source",
      "target",
      "edgeId",
      { weight: "weight" },
    );
    assertEquals(
      await zero.getData(),
      await expectedCase(sdb, "zero_oracle", "zero-cycle-weighted").getData(),
    );

    for (const direction of ["outgoing", "incoming", "both"] as const) {
      const numeric = sdb.newTable(`numeric_${direction}`)
        .loadData("test/data/graphs/numeric-cycle.csv")
        .findCycles("source", "target", "edgeId", { direction });
      const expected = sdb.newTable(`numeric_${direction}_oracle`)
        .loadData("test/data/graphs/expected/numeric/find_cycles.csv")
        .filter(`"case" = 'numeric-cycle-${direction}'`)
        .removeColumns("case");
      assertEquals(await numeric.getData(), await expected.getData());
    }

    const floating = sdb.newTable("float_cycle");
    await sdb.customQuery(`CREATE TABLE "float_cycle" AS
      SELECT * FROM (VALUES
        (3, 0, 1, 0.1::FLOAT),
        (1, 1, 2, 0.2::FLOAT),
        (2, 2, 0, 0.3::FLOAT)
      ) AS edges(edgeId, source, target, weight)`);
    assertEquals(
      await floating.findCycles("source", "target", "edgeId", {
        weight: "weight",
      }).getTypes(),
      {
        pathId: "BIGINT",
        step: "BIGINT",
        edgeId: "INTEGER",
        source: "INTEGER",
        target: "INTEGER",
        weight: "FLOAT",
        total: "FLOAT",
      },
    );
    const floatRows = await floating.getData();
    assertEquals(floatRows.map((row) => row.edgeId), [3, 1, 2]);
    assertEquals(
      floatRows.at(-1)?.total,
      Math.fround(
        Math.fround(Math.fround(0.1) + Math.fround(0.2)) + Math.fround(0.3),
      ),
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles preserves distinct edge combinations and is row-order deterministic", async () => {
  const edges = [
    { edgeId: "E4", source: "C", target: "A", weight: 4 },
    { edgeId: "E2", source: "A", target: "B", weight: 2 },
    { edgeId: "E3", source: "B", target: "C", weight: 3 },
    { edgeId: "E1", source: "A", target: "B", weight: 1 },
  ];
  const sdb = new SimpleDB();
  try {
    const run = (name: string, rows: typeof edges) =>
      sdb.newTable(name).loadArray(rows).findCycles(
        "source",
        "target",
        "edgeId",
        { weight: "weight" },
      ).getData();
    const expected = [
      [0, "E1", 1, 1],
      [0, "E3", 3, 4],
      [0, "E4", 4, 8],
      [1, "E2", 2, 2],
      [1, "E3", 3, 5],
      [1, "E4", 4, 9],
    ];
    const project = (rows: Awaited<ReturnType<typeof run>>) =>
      rows.map((row) => [row.pathId, row.edgeId, row.weight, row.total]);
    assertEquals(project(await run("ordered_cycles", edges)), expected);
    assertEquals(
      project(await run("shuffled_cycles", edges.toReversed())),
      expected,
    );

    const numeric = await sdb.newTable("numeric_cycle_order").loadArray([
      { edgeId: 30, source: 1, target: 0 },
      { edgeId: 40, source: 2, target: 0 },
      { edgeId: 10, source: 0, target: 1 },
      { edgeId: 2, source: 0, target: 2 },
    ]).findCycles("source", "target", "edgeId").getData();
    assertEquals(
      numeric.map((row) => [row.pathId, row.edgeId]),
      [[0, 2], [0, 40], [1, 10], [1, 30]],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles validates required arguments and schema without data audits", async () => {
  const sdb = new SimpleDB();
  try {
    const table = loadScenario(sdb, "validation", "triangle");
    assertThrows(
      () => table.findCycles(1 as unknown as string, "target", "edgeId"),
      TypeError,
      "sourceColumn must be a string",
    );
    assertThrows(
      () => table.findCycles("source", "target", 1 as unknown as string),
      TypeError,
      "edgeId must be a string",
    );
    assertThrows(
      () =>
        table.findCycles("source", "target", "edgeId", {
          direction: "sideways" as "outgoing",
        }),
      TypeError,
      "options.direction must be",
    );
    assertThrows(
      () => table.findCycles("source", "target", "edgeId", null as never),
      TypeError,
      "options must be an object",
    );
    assertThrows(
      () =>
        table.findCycles("source", "target", "edgeId", {
          weight: 1 as unknown as string,
        }),
      TypeError,
      "options.weight must be a string",
    );

    await assertRejects(
      () =>
        loadScenario(sdb, "missing_column", "triangle").findCycles(
          "missing",
          "target",
          "edgeId",
        ).run(),
      Error,
      'column "missing" does not exist',
    );
    await assertRejects(
      () =>
        sdb.newTable("without_id")
          .loadData("test/data/graphs/without-edge-id.csv")
          .findCycles("source", "target", "edgeId").run(),
      Error,
      'column "edgeId" does not exist',
    );
    await assertRejects(
      () =>
        sdb.newTable("unsupported_id")
          .loadData("test/data/graphs/unsupported-types.csv")
          .findCycles("dateSource", "stringTarget", "booleanEdgeId").run(),
      TypeError,
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles keeps typed empty outputs and supports output snapshots", async () => {
  const sdb = new SimpleDB();
  try {
    const empty = sdb.newTable("empty_cycles");
    await sdb.customQuery(`CREATE TABLE "empty_cycles" (
      edgeId VARCHAR, source VARCHAR, target VARCHAR, weight DECIMAL(8,3)
    )`);
    empty.findCycles("source", "target", "edgeId", {
      weight: "weight",
    });
    assertEquals(await empty.getData(), []);
    assertEquals(await empty.getTypes(), {
      pathId: "BIGINT",
      step: "BIGINT",
      edgeId: "VARCHAR",
      source: "VARCHAR",
      target: "VARCHAR",
      weight: "DECIMAL(38,3)",
      total: "DECIMAL(38,3)",
    });

    const overwritten = loadScenario(sdb, "overwritten_cycles", "triangle");
    assertStrictEquals(
      overwritten.findCycles("source", "target", "edgeId", {
        outputTable: false,
      }),
      overwritten,
    );
    assertEquals((await overwritten.getData()).length, 3);

    const source = loadScenario(sdb, "preserved_cycles", "triangle");
    const options: {
      direction: "incoming" | "outgoing";
      outputTable: string;
      weight?: string;
    } = {
      direction: "incoming",
      outputTable: "namedCycles",
    };
    const named = source.findCycles("source", "target", "edgeId", options)
      .filter("step = 1");
    options.direction = "outgoing";
    options.outputTable = "changed";
    options.weight = "changed";
    assertEquals(named.name, "namedCycles");
    assertEquals((await named.getData()).map((row) => row.edgeId), ["T3"]);
    assertEquals(await source.getRowCount(), 3);
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles accepts custom and generated edge IDs", async () => {
  const sdb = new SimpleDB();
  try {
    const custom = sdb.newTable("custom_cycles").loadArray([
      { flightId: "F1", ORIGIN: "A", Destination: "B", COST: 1 },
      { flightId: "F2", ORIGIN: "B", Destination: "C", COST: 2 },
      { flightId: "F3", ORIGIN: "C", Destination: "A", COST: 3 },
    ]).findCycles("origin", "destination", "flightId", {
      weight: "cost",
    });
    assertEquals(
      (await custom.getData()).map((row) => [row.edgeId, row.total]),
      [["F1", 1], ["F2", 3], ["F3", 6]],
    );

    const rows = [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "C", target: "A" },
    ];
    const numeric = sdb.newTable("generated_numeric_cycles").loadArray(rows)
      .addId("edgeId").findCycles("source", "target", "edgeId");
    const prefixed = sdb.newTable("generated_prefixed_cycles").loadArray(rows)
      .addId("edgeId", { prefix: "edge-" }).findCycles(
        "source",
        "target",
        "edgeId",
      );
    assertEquals((await numeric.getData()).map((row) => row.edgeId), [0, 1, 2]);
    assertEquals((await prefixed.getData()).map((row) => row.edgeId), [
      "edge-0",
      "edge-1",
      "edge-2",
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles uses native uncapped simple-cycle enumeration and avoids aliases", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const edges = Array.from({ length: 140 }, (_, edgeId) => ({
      edgeId,
      source: edgeId,
      target: edgeId + 1,
    }));
    edges.push({ edgeId: 140, source: 140, target: 0 });
    const result = await sdb.newTable("graph_cycle_walks").loadArray(edges)
      .findCycles("source", "target", "edgeId").getData();
    assertEquals(result.length, 141);
    assertEquals(result.at(-1)?.total, 141);

    const query = observer.queries.find((entry) =>
      entry.query.includes("graph_complete_cycles")
    )?.query ?? "";
    assertStringIncludes(query, "WITH RECURSIVE");
    assertStringIncludes(query, "list_contains");
    assertStringIncludes(query, "UNNEST");
    assertStringIncludes(query, '"graph_cycle_walks_1"');
    assertEquals(query.includes("LIMIT"), false);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

Deno.test("findCycles preserves binary string identity under collations", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("collated_cycles");
    await sdb.customQuery(`CREATE TABLE "collated_cycles" (
      edgeId VARCHAR COLLATE NOCASE,
      source VARCHAR COLLATE NOCASE,
      target VARCHAR COLLATE NOCASE
    ); INSERT INTO "collated_cycles" VALUES
      ('z', 'A', 'b'), ('a', 'b', 'A'),
      ('m', 'a', 'B'), ('A', 'B', 'a')`);
    assertEquals(
      await table.findCycles("source", "target", "edgeId").getData(),
      [
        {
          pathId: 0,
          step: 1,
          edgeId: "A",
          source: "B",
          target: "a",
          weight: 1,
          total: 1,
        },
        {
          pathId: 0,
          step: 2,
          edgeId: "m",
          source: "a",
          target: "B",
          weight: 1,
          total: 2,
        },
        {
          pathId: 1,
          step: 1,
          edgeId: "z",
          source: "A",
          target: "b",
          weight: 1,
          total: 1,
        },
        {
          pathId: 1,
          step: 2,
          edgeId: "a",
          source: "b",
          target: "A",
          weight: 1,
          total: 2,
        },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles widens exact weight accumulators", async () => {
  const sdb = new SimpleDB();
  try {
    const decimal = sdb.newTable("decimal_cycles");
    await sdb.customQuery(`CREATE TABLE "decimal_cycles" AS
      SELECT * FROM (VALUES
        (1, 0, 1, 99999999999999999999.25::DECIMAL(22,2)),
        (2, 1, 0, 0.50::DECIMAL(22,2))
      ) AS edges(edgeId, source, target, weight)`);
    decimal.findCycles("source", "target", "edgeId", {
      weight: "weight",
    }).convert({ weight: "string", total: "string" });
    assertEquals(await decimal.getData(), [
      {
        pathId: 0,
        step: 1,
        edgeId: 1,
        source: 0,
        target: 1,
        weight: "99999999999999999999.25",
        total: "99999999999999999999.25",
      },
      {
        pathId: 0,
        step: 2,
        edgeId: 2,
        source: 1,
        target: 0,
        weight: "0.50",
        total: "99999999999999999999.75",
      },
    ]);

    const integers = sdb.newTable("wide_integer_cycles");
    await sdb.customQuery(`CREATE TABLE "wide_integer_cycles" AS
      SELECT * FROM (VALUES
        (1, 0, 1, 18446744073709551615::UBIGINT),
        (2, 1, 0, 18446744073709551615::UBIGINT)
      ) AS edges(edgeId, source, target, weight)`);
    const result = integers.findCycles("source", "target", "edgeId", {
      weight: "weight",
    });
    assertEquals((await result.getTypes()).total, "HUGEINT");
    result.convert({ weight: "string", total: "string" });
    assertEquals(
      (await result.getData()).at(-1)?.total,
      "36893488147419103230",
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles output records its source as a cache dependency", async () => {
  let computationRuns = 0;
  const unique = crypto.randomUUID().replaceAll("-", "");
  const outputName = `cyclesCacheOutput${unique}`;
  const sourceName = `cyclesCacheSource${unique}`;
  const compute = (source: SimpleTable) => async (output: SimpleTable) => {
    computationRuns++;
    const result = source.findCycles("source", "target", "edgeId", {
      outputTable: true,
    });
    output.loadArray(await result.getData());
    await result.removeTable();
  };

  const firstSdb = new SimpleDB();
  try {
    const source = firstSdb.newTable(sourceName).loadArray([
      { edgeId: "E1", source: "A", target: "B" },
      { edgeId: "E2", source: "B", target: "A" },
    ]);
    await firstSdb.newTable(outputName).cache(compute(source));
  } finally {
    await firstSdb.close();
  }

  const secondSdb = new SimpleDB();
  try {
    const source = secondSdb.newTable(sourceName).loadArray([
      { edgeId: "E3", source: "A", target: "A" },
    ]);
    const output = secondSdb.newTable(outputName);
    await output.cache(compute(source));
    assertEquals(computationRuns, 2);
    assertEquals((await output.getData()).map((row) => row.edgeId), ["E3"]);
  } finally {
    await secondSdb.close();
  }
});

Deno.test("findCycles matches an independent permutation oracle in every mode", async () => {
  type Id = string | number;
  type Edge = { edgeId: Id; source: Id; target: Id; weight: number };
  type Direction = "outgoing" | "incoming" | "both";
  const encoder = new TextEncoder();
  const compare = (left: Id, right: Id): number => {
    if (typeof left === "number" && typeof right === "number") {
      return left - right;
    }
    const a = encoder.encode(String(left));
    const b = encoder.encode(String(right));
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
  };
  const compareCycles = (left: Edge[], right: Edge[]): number => {
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      const order = compare(left[i].edgeId, right[i].edgeId);
      if (order !== 0) return order;
    }
    return left.length - right.length;
  };
  const oracle = (edges: Edge[], direction: Direction) => {
    const nodes = [
      ...new Set(edges.flatMap((edge) => [edge.source, edge.target])),
    ];
    const cycles = new Map<string, Edge[]>();
    const record = (cycle: Edge[]) => {
      if (new Set(cycle.map((edge) => edge.edgeId)).size !== cycle.length) {
        return;
      }
      const smallest = cycle.reduce(
        (best, edge, index) =>
          compare(edge.source, cycle[best].source) < 0 ? index : best,
        0,
      );
      let normalized = [...cycle.slice(smallest), ...cycle.slice(0, smallest)];
      if (direction === "both") {
        const reversed = normalized.toReversed().map((edge) => ({
          ...edge,
          source: edge.target,
          target: edge.source,
        }));
        if (compareCycles(reversed, normalized) < 0) normalized = reversed;
      }
      cycles.set(
        JSON.stringify(normalized.map((edge) => edge.edgeId)),
        normalized,
      );
    };
    // Enumerate node permutations first, then their Cartesian edge choices.
    // Unlike the SQL walk, normalize only after constructing complete cycles.
    const chooseEdges = (order: Id[], cycle: Edge[] = []) => {
      if (cycle.length === order.length) {
        record(cycle);
        return;
      }
      const source = order[cycle.length];
      const target = order[(cycle.length + 1) % order.length];
      for (const edge of edges) {
        const forward = edge.source === source && edge.target === target;
        const backward = edge.target === source && edge.source === target;
        if (
          (direction !== "incoming" && forward) ||
          (direction !== "outgoing" && backward)
        ) {
          chooseEdges(order, [...cycle, { ...edge, source, target }]);
        }
      }
    };
    const permutations = (order: Id[], remaining: Id[]) => {
      if (order.length > 0) chooseEdges(order);
      for (const node of remaining) {
        permutations(
          [...order, node],
          remaining.filter((value) => value !== node),
        );
      }
    };
    permutations([], nodes);
    return [...cycles.values()].sort(compareCycles).flatMap((cycle, pathId) => {
      let total = 0;
      return cycle.map((edge, index) => {
        total += edge.weight;
        return { pathId, step: index + 1, ...edge, total };
      });
    });
  };

  const numeric: Edge[] = [
    { edgeId: 10, source: 10, target: 0, weight: 0.25 },
    { edgeId: 2, source: 2, target: 10, weight: 0.5 },
    { edgeId: 30, source: 0, target: 2, weight: 2 },
    { edgeId: 4, source: 0, target: 2, weight: 1.25 },
    { edgeId: 0, source: 2, target: 0, weight: 0 },
    { edgeId: 6, source: 10, target: 2, weight: 4 },
    { edgeId: 7, source: 2, target: 2, weight: 0 },
    { edgeId: 8, source: 20, target: 30, weight: 5 },
    { edgeId: 9, source: 30, target: 20, weight: 6 },
  ];
  const edgeIds = ["10", "2", "A", "a", "a|b", "a|", "", "é", "Z"];
  const nodeIds = new Map<Id, Id>([
    [0, "a"],
    [2, "A"],
    [10, "a|"],
    [20, "\u{10000}"],
    [30, "\uE000"],
  ]);
  const strings = numeric.map((edge, index) => ({
    ...edge,
    edgeId: edgeIds[index],
    source: nodeIds.get(edge.source)!,
    target: nodeIds.get(edge.target)!,
  }));
  const sdb = new SimpleDB();
  try {
    for (
      const [kind, edges] of [["numeric", numeric], [
        "strings",
        strings,
      ]] as const
    ) {
      for (const direction of ["outgoing", "incoming", "both"] as const) {
        const expected = oracle(edges, direction);
        for (const [order, rows] of [edges, edges.toReversed()].entries()) {
          const actual = await sdb.newTable(
            `oracle_${kind}_${direction}_${order}`,
          )
            .loadArray(rows)
            .findCycles("source", "target", "edgeId", {
              direction,
              weight: "weight",
            }).getData();
          assertEquals(
            actual,
            expected,
            `${kind}, ${direction}, order ${order}`,
          );
        }
      }
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles executes all six JSDoc examples with their displayed rows", async () => {
  const sdb = new SimpleDB();
  const triangleRows = [
    { edgeId: "E1", source: "A", target: "B" },
    { edgeId: "E2", source: "B", target: "C" },
    { edgeId: "E3", source: "C", target: "A" },
  ];
  const expectedRows = (
    rows: [number, number, string, string, string, number, number][],
  ) =>
    rows.map(([pathId, step, edgeId, source, target, weight, total]) => ({
      pathId,
      step,
      edgeId,
      source,
      target,
      weight,
      total,
    }));
  const forwardRows = expectedRows([
    [0, 1, "E1", "A", "B", 1, 1],
    [0, 2, "E2", "B", "C", 1, 2],
    [0, 3, "E3", "C", "A", 1, 3],
  ]);
  try {
    {
      const triangle = sdb.newTable("doc_cycles_outgoing").loadArray(
        triangleRows,
      );
      await triangle
        .findCycles("source", "target", "edgeId")
        .log();
      assertEquals(await triangle.getData(), forwardRows);
    }
    {
      const triangle = sdb.newTable("doc_cycles_incoming").loadArray(
        triangleRows,
      );
      await triangle
        .findCycles("source", "target", "edgeId", { direction: "incoming" })
        .log();
      assertEquals(
        await triangle.getData(),
        expectedRows([
          [0, 1, "E3", "A", "C", 1, 1],
          [0, 2, "E2", "C", "B", 1, 2],
          [0, 3, "E1", "B", "A", 1, 3],
        ]),
      );
    }
    {
      const triangle = sdb.newTable("doc_cycles_both").loadArray(triangleRows);
      await triangle
        .findCycles("source", "target", "edgeId", { direction: "both" })
        .log();
      assertEquals(await triangle.getData(), forwardRows);
    }
    {
      const parallelAndLoop = sdb.newTable("doc_cycles_parallel").loadArray([
        { edgeId: "P1", source: "A", target: "B", cost: 1 },
        { edgeId: "P2", source: "A", target: "B", cost: 2 },
        { edgeId: "L1", source: "C", target: "C", cost: 4 },
      ]);
      await parallelAndLoop
        .findCycles("source", "target", "edgeId", {
          direction: "both",
          weight: "cost",
        })
        .log();
      assertEquals(
        await parallelAndLoop.getData(),
        expectedRows([
          [0, 1, "L1", "C", "C", 4, 4],
          [1, 1, "P1", "A", "B", 1, 1],
          [1, 2, "P2", "B", "A", 2, 3],
        ]),
      );
    }
    {
      const flights = sdb.newTable("doc_cycles_flights").loadArray([
        { flightId: "F1", origin: "A", destination: "B", minutes: 1 },
        { flightId: "F2", origin: "B", destination: "C", minutes: 2 },
        { flightId: "F3", origin: "C", destination: "A", minutes: 3 },
      ]);
      await flights
        .findCycles("origin", "destination", "flightId", {
          weight: "minutes",
        })
        .log();
      assertEquals(
        await flights.getData(),
        expectedRows([
          [0, 1, "F1", "A", "B", 1, 1],
          [0, 2, "F2", "B", "C", 2, 3],
          [0, 3, "F3", "C", "A", 3, 6],
        ]),
      );
    }
    {
      const unnumberedConnections = sdb.newTable("doc_cycles_generated")
        .loadArray([
          { source: "A", target: "B" },
          { source: "B", target: "C" },
          { source: "C", target: "A" },
        ]);
      await unnumberedConnections
        .addId("edgeId", { prefix: "edge-" })
        .findCycles("source", "target", "edgeId")
        .log();
      assertEquals(
        await unnumberedConnections.getData(),
        expectedRows([
          [0, 1, "edge-0", "A", "B", 1, 1],
          [0, 2, "edge-1", "B", "C", 1, 2],
          [0, 3, "edge-2", "C", "A", 1, 3],
        ]),
      );
    }
  } finally {
    await sdb.close();
  }
});
