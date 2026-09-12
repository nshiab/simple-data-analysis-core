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

Deno.test("paths returns every simple route in all traversal directions", async () => {
  const sdb = new SimpleDB();
  try {
    const expected = sdb.newTable("outgoingOracle")
      .loadData("test/data/graphs/expected/paths.csv")
      .filter(`"case" = 'baseline-A-D-outgoing'`)
      .removeColumns("case");
    for (
      const [name, options] of [
        ["defaultOutgoing", undefined],
        ["explicitOutgoing", { direction: "outgoing" as const }],
      ] as const
    ) {
      const actual = loadScenario(sdb, name, "baseline");
      const result = options === undefined
        ? actual.paths("source", "target", "edgeId", "A", "D")
        : actual.paths("source", "target", "edgeId", "A", "D", options);
      assertEquals(await result.getData(), await expected.getData());
    }

    const incomingExpected = sdb.newTable("incomingOracle")
      .loadData("test/data/graphs/expected/paths.csv")
      .filter(`"case" = 'baseline-E-A-incoming'`)
      .removeColumns("case");
    const incoming = loadScenario(sdb, "incoming", "baseline")
      .paths("source", "target", "edgeId", "E", "A", {
        direction: "incoming",
      });
    assertEquals(await incoming.getData(), await incomingExpected.getData());

    const bothExpected = sdb.newTable("bothOracle")
      .loadData("test/data/graphs/expected/paths.csv")
      .filter(`"case" = 'single-B-A-both'`)
      .removeColumns("case");
    const both = loadScenario(sdb, "both", "single")
      .paths("source", "target", "edgeId", "B", "A", {
        direction: "both",
      });
    assertEquals(await both.getData(), await bothExpected.getData());
  } finally {
    await sdb.close();
  }
});

Deno.test("paths preserves parallel edges, all weighted alternatives, and cumulative costs", async () => {
  const sdb = new SimpleDB();
  try {
    for (
      const [scenario, start, end, caseName] of [
        ["parallel", "A", "C", "parallel-A-C-weighted"],
        ["weighted", "A", "E", "weighted-A-E-weighted"],
        ["zero-cycle", "A", "C", "zero-cycle-A-C-weighted"],
        ["fraction-weight", "A", "C", "fraction-weight-A-C-weighted"],
      ] as const
    ) {
      const expected = sdb.newTable(`${scenario}Oracle`)
        .loadData("test/data/graphs/expected/paths.csv")
        .filter(`"case" = '${caseName}'`)
        .removeColumns("case");
      const actual = loadScenario(sdb, `${scenario}Actual`, scenario, true)
        .paths("source", "target", "edgeId", start, end, {
          weight: "weight",
        });
      assertEquals(await actual.getData(), await expected.getData(), scenario);
    }

    const unweighted = loadScenario(sdb, "unweightedAlternatives", "weighted")
      .paths("source", "target", "edgeId", "A", "E");
    assertEquals(
      (await unweighted.getData()).filter((row) => row.step === 1).map((
        row,
      ) => [row.pathId, row.edgeId, row.weight, row.distance]),
      [[0, "W1", 1, 1], [1, "W2", 1, 1], [2, "W5", 1, 1]],
    );

    const selfLoop = loadScenario(sdb, "selfLoop", "self-loop")
      .paths("source", "target", "edgeId", "A", "B");
    assertEquals((await selfLoop.getData()).map((row) => row.edgeId), ["L2"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("paths uses typed deterministic edge sequences for numeric and string IDs", async () => {
  const sdb = new SimpleDB();
  try {
    const numeric = sdb.newTable("numeric")
      .loadData("test/data/graphs/numeric.csv")
      .paths("source", "target", "edgeId", 0, 10, { weight: "weight" });
    assertEquals(
      (await numeric.getData()).map((
        row,
      ) => [row.pathId, row.step, row.edgeId]),
      [[0, 1, 0], [1, 1, 1], [1, 2, 2]],
    );
    assertEquals(await numeric.getTypes(), {
      pathId: "BIGINT",
      step: "BIGINT",
      edgeId: "BIGINT",
      source: "BIGINT",
      target: "BIGINT",
      weight: "HUGEINT",
      distance: "HUGEINT",
    });

    const edgeRows = [
      { edgeId: "b", source: "A", target: "B" },
      { edgeId: "A", source: "A", target: "B" },
      { edgeId: "x", source: "B", target: "C" },
    ];
    for (const [index, rows] of [edgeRows, edgeRows.toReversed()].entries()) {
      const result = sdb.newTable(`strings${index}`).loadArray(rows)
        .paths("source", "target", "edgeId", "A", "C");
      assertEquals(
        (await result.getData()).map((row) => [row.pathId, row.edgeId]),
        [[0, "A"], [0, "x"], [1, "b"], [1, "x"]],
      );
    }

    const wide = sdb.newTable("wideRoutes");
    await sdb.customQuery(`CREATE TABLE "wideRoutes" AS
      SELECT edgeId::BIGNUM AS edgeId, source, target, weight::HUGEINT AS weight
      FROM (VALUES
        ('10000000000000000000000000000000000000000', 'A', 'B',
          '170141183460469231731687303715884105727'),
        ('2', 'A', 'B', '170141183460469231731687303715884105727'),
        ('3', 'B', 'C', '1')
      ) edges(edgeId, source, target, weight)`);
    const wideRows = await wide.paths(
      "source",
      "target",
      "edgeId",
      "A",
      "C",
      { weight: "weight" },
    ).getData();
    assertEquals(wideRows.map((row) => [row.pathId, row.step, row.edgeId]), [
      [0, 1, "2"],
      [0, 2, "3"],
      [1, 1, "10000000000000000000000000000000000000000"],
      [1, 2, "3"],
    ]);
    assertEquals(
      wideRows.filter((row) => row.step === 2).map((row) => row.distance),
      [
        "170141183460469231731687303715884105728",
        "170141183460469231731687303715884105728",
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("paths preserves exact decimal accumulators", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("decimalRoutes");
    await sdb.customQuery(`CREATE TABLE "decimalRoutes" AS
      SELECT * FROM (VALUES
        (0, 'A', 'B', 99999999999999999999.25::DECIMAL(22,2)),
        (1, 'B', 'C', 0.50::DECIMAL(22,2))
      ) edges(edgeId, source, target, weight)`);
    const result = table.paths("source", "target", "edgeId", "A", "C", {
      weight: "weight",
    });
    assertEquals((await result.getData()).map((row) => row.distance), [
      "99999999999999999999.25",
      "99999999999999999999.75",
    ]);
    assertEquals((await result.getTypes()).distance, "DECIMAL(38,2)");
  } finally {
    await sdb.close();
  }
});

Deno.test("paths preserves an empty typed result for unknown and disconnected endpoints", async () => {
  const sdb = new SimpleDB();
  try {
    const empty = sdb.newTable("emptyPaths");
    await sdb.customQuery(`CREATE TABLE "emptyPaths" (
      edgeId VARCHAR, source VARCHAR, target VARCHAR, weight DECIMAL(8,3)
    )`);
    empty.paths("source", "target", "edgeId", "A", "B", {
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
      distance: "DECIMAL(38,3)",
    });
    assertEquals(
      await loadScenario(sdb, "unknown", "baseline")
        .paths("source", "target", "edgeId", "A", "unknown").getData(),
      [],
    );
    assertEquals(
      await loadScenario(sdb, "disconnected", "baseline")
        .paths("source", "target", "edgeId", "A", "G").getData(),
      [],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("paths validates arguments and schema cheaply", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      () => table.paths("source", "target", "edgeId", "A", "A"),
      TypeError,
      "start and end must be different",
    );
    assertThrows(
      () =>
        table.paths(
          "source",
          "target",
          "edgeId",
          ["A"] as unknown as string,
          "B",
        ),
      TypeError,
      "start must be one node ID",
    );
    assertThrows(
      () =>
        table.paths(
          "source",
          "target",
          "edgeId",
          "A",
          ["B"] as unknown as string,
        ),
      TypeError,
      "end must be one node ID",
    );
    assertThrows(
      () => table.paths(1 as unknown as string, "target", "edgeId", "A", "B"),
      TypeError,
      "paths() source must be a string",
    );
    assertThrows(
      () => table.paths("source", "target", 1 as unknown as string, "A", "B"),
      TypeError,
      "paths() edgeId must be a string",
    );
    assertThrows(
      () =>
        table.paths("source", "target", "edgeId", "A", "B", {
          direction: "sideways" as "outgoing",
        }),
      TypeError,
      'options.direction must be "outgoing", "incoming", or "both"',
    );
    assertThrows(
      () =>
        table.paths("source", "target", "edgeId", "A", "B", {
          weight: 1 as unknown as string,
        }),
      TypeError,
      "options.weight must be a string",
    );
    assertThrows(
      () =>
        table.paths(
          "source",
          "target",
          "edgeId",
          "A",
          "B",
          null as unknown as Record<string, never>,
        ),
      TypeError,
      "options must be an object",
    );
    assertEquals(table.pendingOps.length, 0);

    const withoutId = sdb.newTable("withoutId")
      .loadData("test/data/graphs/without-edge-id.csv");
    await assertRejects(
      () => withoutId.paths("source", "target", "edgeId", "A", "C").run(),
      Error,
      'the column "edgeId" does not exist',
    );
    const unsupported = sdb.newTable("unsupported")
      .loadData("test/data/graphs/unsupported-types.csv");
    await assertRejects(
      () =>
        unsupported.paths(
          "stringTarget",
          "stringTarget",
          "booleanEdgeId",
          "A",
          "B",
        ).run(),
      TypeError,
      "requires string or whole-number edge IDs",
    );
    const numeric = sdb.newTable("numericMismatch")
      .loadData("test/data/graphs/numeric.csv");
    await assertRejects(
      () => numeric.paths("source", "target", "edgeId", "0", "10").run(),
      TypeError,
      "start contains string IDs",
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("paths supports output destinations, snapshots, custom names, and addId", async () => {
  const sdb = new SimpleDB();
  try {
    const overwritten = loadScenario(sdb, "overwritten", "baseline");
    assertStrictEquals(
      overwritten.paths("source", "target", "edgeId", "A", "D", {
        outputTable: false,
      }),
      overwritten,
    );
    assertEquals(await overwritten.getColumns(), [
      "pathId",
      "step",
      "edgeId",
      "source",
      "target",
      "weight",
      "distance",
    ]);

    const source = loadScenario(sdb, "preserved", "baseline");
    const options: {
      direction: "incoming" | "outgoing";
      outputTable: string;
    } = { direction: "incoming", outputTable: "namedPaths" };
    const named = source.paths(
      "source",
      "target",
      "edgeId",
      "D",
      "A",
      options,
    ).filter("step = 2");
    options.direction = "outgoing";
    options.outputTable = "changed";
    assertEquals(named.name, "namedPaths");
    assertEquals((await named.getData()).map((row) => row.target), ["A", "A"]);
    assertEquals(await source.getRowCount(), 6);

    const generated = source.paths(
      "source",
      "target",
      "edgeId",
      "F",
      "G",
      { outputTable: true },
    );
    assertEquals(generated.name === source.name, false);
    assertEquals((await generated.getData()).map((row) => row.edgeId), ["B6"]);

    const custom = sdb.newTable("custom")
      .loadData("test/data/graphs/custom-columns.csv")
      .paths("ORIGIN", "Destination", "flightId", "A", "C", {
        weight: "COST",
      });
    assertEquals((await custom.getData()).map((row) => row.edgeId), [
      "F1",
      "F2",
    ]);

    const numericId = sdb.newTable("generatedNumeric")
      .loadData("test/data/graphs/without-edge-id.csv")
      .addId("edgeId")
      .paths("source", "target", "edgeId", "A", "C");
    assertEquals((await numericId.getData()).map((row) => row.edgeId), [0, 1]);
    const prefixedId = sdb.newTable("generatedPrefixed")
      .loadData("test/data/graphs/without-edge-id.csv")
      .addId("edgeId", { prefix: "edge-" })
      .paths("source", "target", "edgeId", "A", "C");
    assertEquals((await prefixedId.getData()).map((row) => row.edgeId), [
      "edge-0",
      "edge-1",
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("paths uses native uncapped simple-route enumeration and avoids relation aliases", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const table = sdb.newTable("graph_routes").loadArray([
      { edgeId: "E1", source: "A", target: "B" },
      { edgeId: "E2", source: "B", target: "C" },
    ]).paths("source", "target", "edgeId", "A", "C");
    await table.run();
    const query = observer.queries.find((entry) =>
      entry.query.includes("graph_complete_routes")
    )?.query ?? "";
    assertStringIncludes(query, "WITH RECURSIVE");
    assertStringIncludes(query, "graph_to_end");
    assertStringIncludes(query, "list_contains");
    assertStringIncludes(query, "UNNEST");
    assertStringIncludes(query, '"graph_routes_1"');
    assertEquals(query.includes("LIMIT"), false);

    const edges = Array.from({ length: 140 }, (_, edgeId) => ({
      edgeId,
      source: edgeId,
      target: edgeId + 1,
    }));
    const deep = await sdb.newTable("deepPaths").loadArray(edges)
      .paths("source", "target", "edgeId", 0, 140).getData();
    assertEquals(deep.length, 140);
    assertEquals(deep.at(-1)?.distance, 140);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

Deno.test("paths output records its source as a cache dependency", async () => {
  let computationRuns = 0;
  const unique = crypto.randomUUID().replaceAll("-", "");
  const outputName = `pathsCacheOutput${unique}`;
  const sourceName = `pathsCacheSource${unique}`;
  const compute = (source: SimpleTable) => async (output: SimpleTable) => {
    computationRuns++;
    const result = source.paths(
      "source",
      "target",
      "edgeId",
      "A",
      "C",
      { outputTable: true },
    );
    output.loadArray(await result.getData());
    await result.removeTable();
  };

  const firstSdb = new SimpleDB();
  try {
    const source = firstSdb.newTable(sourceName).loadArray([
      { edgeId: "E1", source: "A", target: "B" },
      { edgeId: "E2", source: "B", target: "C" },
    ]);
    await firstSdb.newTable(outputName).cache(compute(source));
  } finally {
    await firstSdb.close();
  }

  const secondSdb = new SimpleDB();
  try {
    const source = secondSdb.newTable(sourceName).loadArray([
      { edgeId: "E3", source: "A", target: "C" },
    ]);
    const output = secondSdb.newTable(outputName);
    await output.cache(compute(source));
    assertEquals(computationRuns, 2);
    assertEquals((await output.getData()).map((row) => row.edgeId), ["E3"]);
  } finally {
    await secondSdb.close();
  }
});

Deno.test("paths custom-column weighted JSDoc examples match their tables", async () => {
  const sdb = new SimpleDB();
  try {
    const flights = sdb.newTable("flights").loadArray([
      { flightId: "F1", origin: "A", destination: "D", minutes: 10 },
      { flightId: "F2", origin: "A", destination: "B", minutes: 1 },
      { flightId: "F3", origin: "B", destination: "D", minutes: 2 },
    ]);
    assertEquals(
      await flights.paths(
        "origin",
        "destination",
        "flightId",
        "A",
        "D",
        { weight: "minutes", outputTable: true },
      ).getData(),
      [
        {
          pathId: 0,
          step: 1,
          edgeId: "F1",
          source: "A",
          target: "D",
          weight: 10,
          distance: 10,
        },
        {
          pathId: 1,
          step: 1,
          edgeId: "F2",
          source: "A",
          target: "B",
          weight: 1,
          distance: 1,
        },
        {
          pathId: 1,
          step: 2,
          edgeId: "F3",
          source: "B",
          target: "D",
          weight: 2,
          distance: 3,
        },
      ],
    );
    assertEquals(
      (await flights.paths(
        "origin",
        "destination",
        "flightId",
        "A",
        "D",
        { outputTable: true },
      ).getData()).map((row) => [row.pathId, row.distance]),
      [[0, 1], [1, 1], [1, 2]],
    );
    assertEquals(
      (await flights.paths(
        "origin",
        "destination",
        "flightId",
        "D",
        "A",
        {
          direction: "incoming",
          weight: "minutes",
          outputTable: true,
        },
      ).getData()).map((row) => [
        row.pathId,
        row.edgeId,
        row.source,
        row.target,
        row.distance,
      ]),
      [
        [0, "F1", "D", "A", 10],
        [1, "F3", "D", "B", 2],
        [1, "F2", "B", "A", 3],
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("paths and shortestPath match independent simple-route enumeration", async () => {
  const edges = [
    { edgeId: 10, source: 0, target: 1, weight: 0 },
    { edgeId: 2, source: 0, target: 1, weight: 0.5 },
    { edgeId: 30, source: 1, target: 2, weight: 0 },
    { edgeId: 4, source: 2, target: 1, weight: 0 },
    { edgeId: 50, source: 2, target: 3, weight: 2 },
    { edgeId: 6, source: 1, target: 3, weight: 4 },
    { edgeId: 70, source: 0, target: 3, weight: 8 },
    { edgeId: 8, source: 1, target: 1, weight: 0 },
    { edgeId: 90, source: 4, target: 5, weight: 1 },
  ];
  type Edge = typeof edges[number];
  const sdb = new SimpleDB();
  try {
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      const start = direction === "incoming" ? 3 : 0;
      const end = direction === "incoming" ? 0 : 3;
      const reversed = edges.map((edge) => ({
        ...edge,
        source: edge.target,
        target: edge.source,
      }));
      const directed = direction === "outgoing"
        ? edges
        : direction === "incoming"
        ? reversed
        : [...edges, ...reversed];
      const routes: Edge[][] = [];
      const visit = (node: number, visited: number[], route: Edge[]) => {
        if (node === end) {
          routes.push(route);
          return;
        }
        for (const edge of directed) {
          if (edge.source === node && !visited.includes(edge.target)) {
            visit(edge.target, [...visited, edge.target], [...route, edge]);
          }
        }
      };
      visit(start, [start], []);
      routes.sort((left, right) => {
        for (let i = 0; i < Math.min(left.length, right.length); i++) {
          if (left[i].edgeId !== right[i].edgeId) {
            return left[i].edgeId - right[i].edgeId;
          }
        }
        return left.length - right.length;
      });
      for (const weighted of [false, true]) {
        const cost = (route: Edge[]) =>
          route.reduce((sum, edge) => sum + (weighted ? edge.weight : 1), 0);
        const minimum = Math.min(...routes.map(cost));
        for (const method of ["paths", "shortestPath"] as const) {
          const selected = method === "paths"
            ? routes
            : routes.filter((route) => cost(route) === minimum);
          const expected = selected.flatMap((route, pathId) => {
            let distance = 0;
            return route.map((edge, index) => {
              const weight = weighted ? edge.weight : 1;
              distance += weight;
              return {
                pathId,
                step: index + 1,
                edgeId: edge.edgeId,
                source: edge.source,
                target: edge.target,
                weight,
                distance,
              };
            });
          });
          for (const rows of [edges, edges.toReversed()]) {
            const table = sdb.newTable().loadArray(rows);
            assertEquals(
              await table[method]("source", "target", "edgeId", start, end, {
                direction,
                ...(weighted ? { weight: "weight" } : {}),
              }).getData(),
              expected,
              `${method}: ${direction}, weighted=${weighted}`,
            );
          }
        }
      }
    }
  } finally {
    await sdb.close();
  }
});
