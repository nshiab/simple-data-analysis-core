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

const chronologicalBase = Date.parse("2025-01-01T00:00:00.000Z");

function chronologicalRows<EdgeId>(
  events: ReferenceChronologicalEvent<string, EdgeId>[],
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

function referencePathRows(
  events: ReferenceChronologicalEvent<string, number>[],
  start: string,
  end: string,
  direction: "incoming" | "outgoing",
  minGap: bigint,
  strictOrdering: boolean,
) {
  const routes = enumerateChronologicalRoutes(events, start, {
    direction,
    end,
    maxSteps: Math.max(events.length, 1),
    minGap,
    strictOrdering,
  }).toSorted((left, right) => {
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      const difference = left[index].event.edgeId - right[index].event.edgeId;
      if (difference !== 0) return difference;
    }
    return left.length - right.length;
  });
  return routes.flatMap((route, pathId) =>
    route.map((routeStep, index) => ({
      pathId,
      step: index + 1,
      edgeId: routeStep.event.edgeId,
      source: routeStep.source,
      target: routeStep.target,
      weight: 1,
      total: index + 1,
    }))
  );
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
      ) => [row.pathId, row.edgeId, row.weight, row.total]),
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
      total: "HUGEINT",
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
      wideRows.filter((row) => row.step === 2).map((row) => row.total),
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
    assertEquals((await result.getData()).map((row) => row.total), [
      "99999999999999999999.25",
      "99999999999999999999.75",
    ]);
    assertEquals((await result.getTypes()).total, "DECIMAL(38,2)");
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
      total: "DECIMAL(38,3)",
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
      "paths() sourceColumn must be a string",
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
      "total",
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
    assertEquals(deep.at(-1)?.total, 140);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

for (const chronological of [false, true]) {
  Deno.test(`paths ${chronological ? "chronological" : "static"} output records its source as a cache dependency`, async () => {
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
        {
          outputTable: true,
          ...(chronological ? { startTimeColumn: "time" } : {}),
        },
      );
      output.loadArray(await result.getData());
      await result.removeTable();
    };

    const firstSdb = new SimpleDB();
    try {
      const source = firstSdb.newTable(sourceName).loadArray([
        {
          edgeId: "E1",
          source: "A",
          target: "B",
          time: new Date(chronologicalBase),
        },
        {
          edgeId: "E2",
          source: "B",
          target: "C",
          time: new Date(chronologicalBase + 1000),
        },
      ]);
      await firstSdb.newTable(outputName).cache(compute(source));
    } finally {
      await firstSdb.close();
    }

    const secondSdb = new SimpleDB();
    try {
      const source = secondSdb.newTable(sourceName).loadArray([
        {
          edgeId: "E3",
          source: "A",
          target: "C",
          time: new Date(chronologicalBase),
        },
      ]);
      const output = secondSdb.newTable(outputName);
      await output.cache(compute(source));
      assertEquals(computationRuns, 2);
      assertEquals((await output.getData()).map((row) => row.edgeId), ["E3"]);
    } finally {
      await secondSdb.close();
    }
  });
}

Deno.test("paths custom-column weighted JSDoc examples match their tables", async () => {
  const sdb = new SimpleDB();
  try {
    const flights = () =>
      sdb.newTable().loadArray([
        { flightId: "F1", origin: "A", destination: "D", minutes: 10 },
        { flightId: "F2", origin: "A", destination: "B", minutes: 1 },
        { flightId: "F3", origin: "B", destination: "D", minutes: 2 },
      ]);
    assertEquals(
      await flights().paths(
        "origin",
        "destination",
        "flightId",
        "A",
        "D",
        { weight: "minutes" },
      ).getData(),
      [
        {
          pathId: 0,
          step: 1,
          edgeId: "F1",
          source: "A",
          target: "D",
          weight: 10,
          total: 10,
        },
        {
          pathId: 1,
          step: 1,
          edgeId: "F2",
          source: "A",
          target: "B",
          weight: 1,
          total: 1,
        },
        {
          pathId: 1,
          step: 2,
          edgeId: "F3",
          source: "B",
          target: "D",
          weight: 2,
          total: 3,
        },
      ],
    );
    assertEquals(
      (await flights().paths(
        "origin",
        "destination",
        "flightId",
        "A",
        "D",
      ).getData()).map((row) => [row.pathId, row.total]),
      [[0, 1], [1, 1], [1, 2]],
    );
    assertEquals(
      (await flights().paths(
        "origin",
        "destination",
        "flightId",
        "D",
        "A",
        {
          direction: "incoming",
          weight: "minutes",
        },
      ).getData()).map((row) => [
        row.pathId,
        row.edgeId,
        row.source,
        row.target,
        row.total,
      ]),
      [
        [0, "F1", "D", "A", 10],
        [1, "F3", "D", "B", 2],
        [1, "F2", "B", "A", 3],
      ],
    );

    const scheduledFlights = () =>
      sdb.newTable().loadArray([
        {
          flightId: "F1",
          origin: "A",
          destination: "B",
          departureTime: new Date("2025-01-01T08:00:00Z"),
          arrivalTime: new Date("2025-01-01T10:00:00Z"),
          minutes: 2,
        },
        {
          flightId: "F2",
          origin: "B",
          destination: "C",
          departureTime: new Date("2025-01-01T09:00:00Z"),
          arrivalTime: new Date("2025-01-01T10:00:00Z"),
          minutes: 9,
        },
        {
          flightId: "F3",
          origin: "B",
          destination: "D",
          departureTime: new Date("2025-01-01T11:00:00Z"),
          arrivalTime: new Date("2025-01-01T12:00:00Z"),
          minutes: 3,
        },
      ]);
    for (
      const [start, end, direction, expected] of [
        ["A", "D", "outgoing", [
          [0, 1, "F1", "A", "B", 2, 2],
          [0, 2, "F3", "B", "D", 3, 5],
        ]],
        ["D", "A", "incoming", [
          [0, 1, "F3", "D", "B", 3, 3],
          [0, 2, "F1", "B", "A", 2, 5],
        ]],
      ] as const
    ) {
      const result = scheduledFlights().paths(
        "origin",
        "destination",
        "flightId",
        start,
        end,
        {
          direction,
          startTimeColumn: "departureTime",
          endTimeColumn: "arrivalTime",
          minGapMs: 60 * 60 * 1000,
          weight: "minutes",
        },
      );
      await result.log();
      assertEquals(
        (await result.getData()).map((row) => [
          row.pathId,
          row.step,
          row.edgeId,
          row.source,
          row.target,
          row.weight,
          row.total,
        ]),
        expected.map((row) => [...row]),
      );
    }
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
            let total = 0;
            return route.map((edge, index) => {
              const weight = weighted ? edge.weight : 1;
              total += weight;
              return {
                pathId,
                step: index + 1,
                edgeId: edge.edgeId,
                source: edge.source,
                target: edge.target,
                weight,
                total,
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

Deno.test("paths runs all five JSDoc examples with their full ordered output", async () => {
  const examples = [
    {
      input: [
        { edgeId: "E1", source: "A", target: "B" },
        { edgeId: "E2", source: "A", target: "C" },
        { edgeId: "E3", source: "B", target: "D" },
        { edgeId: "E4", source: "C", target: "D" },
      ],
      run: async (connections: SimpleTable) => {
        await connections
          .paths("source", "target", "edgeId", "A", "D")
          .log();
      },
      expected: [
        [0, 1, "E1", "A", "B", 1, 1],
        [0, 2, "E3", "B", "D", 1, 2],
        [1, 1, "E2", "A", "C", 1, 1],
        [1, 2, "E4", "C", "D", 1, 2],
      ],
    },
    {
      input: [
        { source: "A", target: "B" },
        { source: "B", target: "D" },
      ],
      run: async (unnumberedConnections: SimpleTable) => {
        await unnumberedConnections
          .addId("edgeId", { prefix: "edge-" })
          .paths("source", "target", "edgeId", "A", "D")
          .log();
      },
      expected: [
        [0, 1, "edge-0", "A", "B", 1, 1],
        [0, 2, "edge-1", "B", "D", 1, 2],
      ],
    },
    ...[
      {
        run: async (flights: SimpleTable) => {
          await flights
            .paths("origin", "destination", "flightId", "A", "D", {
              weight: "minutes",
            })
            .log();
        },
        expected: [
          [0, 1, "F1", "A", "D", 10, 10],
          [1, 1, "F2", "A", "B", 1, 1],
          [1, 2, "F3", "B", "D", 2, 3],
        ],
      },
      {
        run: async (flights: SimpleTable) => {
          await flights
            .paths("origin", "destination", "flightId", "A", "D")
            .log();
        },
        expected: [
          [0, 1, "F1", "A", "D", 1, 1],
          [1, 1, "F2", "A", "B", 1, 1],
          [1, 2, "F3", "B", "D", 1, 2],
        ],
      },
      {
        run: async (flights: SimpleTable) => {
          await flights
            .paths("origin", "destination", "flightId", "D", "A", {
              direction: "incoming",
              weight: "minutes",
            })
            .log();
        },
        expected: [
          [0, 1, "F1", "D", "A", 10, 10],
          [1, 1, "F3", "D", "B", 2, 2],
          [1, 2, "F2", "B", "A", 1, 3],
        ],
      },
    ].map((example) => ({
      ...example,
      input: [
        { flightId: "F1", origin: "A", destination: "D", minutes: 10 },
        { flightId: "F2", origin: "A", destination: "B", minutes: 1 },
        { flightId: "F3", origin: "B", destination: "D", minutes: 2 },
      ],
    })),
  ];
  for (const example of examples) {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().loadArray(example.input);
      await example.run(table);
      const columns = [
        "pathId",
        "step",
        "edgeId",
        "source",
        "target",
        "weight",
        "total",
      ];
      assertEquals(await table.getColumns(), columns);
      assertEquals(
        await table.getData(),
        example.expected.map((values) =>
          Object.fromEntries(
            columns.map((column, index) => [column, values[index]]),
          )
        ),
      );
    } finally {
      await sdb.close();
    }
  }
});

Deno.test("paths includes every parallel-edge combination without a route-count cap", async () => {
  const sdb = new SimpleDB();
  try {
    const edges = Array.from({ length: 9 }, (_, source) => [
      { edgeId: source * 2, source, target: source + 1 },
      { edgeId: source * 2 + 1, source, target: source + 1 },
    ]).flat();
    const table = sdb.newTable().loadArray(edges);
    const result = table.paths("source", "target", "edgeId", 0, 9, {
      outputTable: true,
    });
    const expected = Array.from(
      { length: 512 },
      (_, pathId) =>
        Array.from({ length: 9 }, (_, source) => ({
          pathId,
          step: source + 1,
          edgeId: source * 2 + ((pathId >> (8 - source)) & 1),
          source,
          target: source + 1,
          weight: 1,
          total: source + 1,
        })),
    ).flat();
    assertEquals(await result.getData(), expected);
    assertEquals(await table.getData(), edges);
    assertEquals(
      await table.paths("source", "target", "edgeId", -1, 9, {
        outputTable: true,
      }).getData(),
      [],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("paths chronological traversal keeps first events and enforces both-column connections", async () => {
  const sdb = new SimpleDB();
  try {
    const flights = [
      {
        edgeId: "F1",
        source: "A",
        target: "B",
        startTime: new Date("2025-01-01T08:00:00Z"),
        endTime: new Date("2025-01-01T10:00:00Z"),
      },
      {
        edgeId: "F2",
        source: "B",
        target: "C",
        startTime: new Date("2025-01-01T09:00:00Z"),
        endTime: new Date("2025-01-01T10:00:00Z"),
      },
      {
        edgeId: "F3",
        source: "B",
        target: "D",
        startTime: new Date("2025-01-01T11:00:00Z"),
        endTime: new Date("2025-01-01T12:00:00Z"),
      },
    ];
    assertEquals(
      await sdb.newTable().loadArray(flights)
        .paths("source", "target", "edgeId", "A", "D", {
          startTimeColumn: "startTime",
          endTimeColumn: "endTime",
          minGapMs: 60 * 60 * 1000,
        }).getData(),
      [
        {
          pathId: 0,
          step: 1,
          edgeId: "F1",
          source: "A",
          target: "B",
          weight: 1,
          total: 1,
        },
        {
          pathId: 0,
          step: 2,
          edgeId: "F3",
          source: "B",
          target: "D",
          weight: 1,
          total: 2,
        },
      ],
    );
    assertEquals(
      await sdb.newTable().loadArray(flights)
        .paths("source", "target", "edgeId", "A", "C", {
          startTimeColumn: "startTime",
          endTimeColumn: "endTime",
          minGapMs: 60 * 60 * 1000,
        }).getData(),
      [],
    );
    assertEquals(
      await sdb.newTable().loadArray([flights[0]])
        .paths("source", "target", "edgeId", "A", "B", {
          startTimeColumn: "startTime",
          endTimeColumn: "endTime",
          minGapMs: Number.MAX_SAFE_INTEGER,
        }).getData(),
      [{
        pathId: 0,
        step: 1,
        edgeId: "F1",
        source: "A",
        target: "B",
        weight: 1,
        total: 1,
      }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("paths chronological traversal supports timestamp fallbacks and ordering boundaries", async () => {
  const sdb = new SimpleDB();
  const equal = [
    {
      edgeId: "E1",
      source: "A",
      target: "B",
      startTime: new Date(chronologicalBase),
      endTime: new Date(chronologicalBase),
    },
    {
      edgeId: "E2",
      source: "B",
      target: "C",
      startTime: new Date(chronologicalBase),
      endTime: new Date(chronologicalBase),
    },
  ];
  try {
    for (const column of ["startTimeColumn", "endTimeColumn"] as const) {
      assertEquals(
        await sdb.newTable().loadArray(equal)
          .paths("source", "target", "edgeId", "A", "C", {
            [column]: column === "startTimeColumn" ? "startTime" : "endTime",
          }).getData(),
        [],
      );
      assertEquals(
        (await sdb.newTable().loadArray(equal)
          .paths("source", "target", "edgeId", "A", "C", {
            [column]: column === "startTimeColumn" ? "startTime" : "endTime",
            strictOrdering: false,
          }).getData()).map((row) => row.edgeId),
        ["E1", "E2"],
      );
    }

    const boundary = [
      { ...equal[0], endTime: new Date(chronologicalBase + 1000) },
      {
        ...equal[1],
        startTime: new Date(chronologicalBase + 2000),
        endTime: new Date(chronologicalBase + 3000),
      },
    ];
    assertEquals(
      (await sdb.newTable().loadArray(boundary)
        .paths("source", "target", "edgeId", "A", "C", {
          startTimeColumn: "startTime",
          endTimeColumn: "endTime",
          minGapMs: 1000,
        }).getData()).map((row) => row.edgeId),
      ["E1", "E2"],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("paths chronological traversal preserves incoming orientation, parallel IDs, and weights", async () => {
  const sdb = new SimpleDB();
  const rows = [
    {
      edgeId: "F1",
      source: "A",
      target: "B",
      weight: 2,
      startTime: new Date(chronologicalBase + 1000),
      endTime: new Date(chronologicalBase + 2000),
    },
    {
      edgeId: "F1-copy",
      source: "A",
      target: "B",
      weight: 4,
      startTime: new Date(chronologicalBase + 1000),
      endTime: new Date(chronologicalBase + 2000),
    },
    {
      edgeId: "F2",
      source: "B",
      target: "C",
      weight: 3,
      startTime: new Date(chronologicalBase + 3000),
      endTime: new Date(chronologicalBase + 4000),
    },
  ];
  const expected = [
    [0, 1, "F2", "C", "B", 3, 3],
    [0, 2, "F1", "B", "A", 2, 5],
    [1, 1, "F2", "C", "B", 3, 3],
    [1, 2, "F1-copy", "B", "A", 4, 7],
  ];
  try {
    for (const ordered of [rows, rows.toReversed()]) {
      const result = await sdb.newTable().loadArray(ordered)
        .paths("source", "target", "edgeId", "C", "A", {
          direction: "incoming",
          startTimeColumn: "startTime",
          endTimeColumn: "endTime",
          minGapMs: 1000,
          weight: "weight",
        }).getData();
      assertEquals(
        result.map((row) => [
          row.pathId,
          row.step,
          row.edgeId,
          row.source,
          row.target,
          row.weight,
          row.total,
        ]),
        expected,
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("paths chronological results match the independent evaluator on generated tiny graphs", async () => {
  const sdb = new SimpleDB();
  const nodes = ["A", "B", "C", "D"];
  try {
    for (let seed = 0; seed < 8; seed++) {
      let state = seed + 1;
      const random = (limit: number) => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return (state >>> 16) % limit;
      };
      const generated: ReferenceChronologicalEvent<string, number>[] = [
        { edgeId: 0, source: "A", target: "D", startTime: 0n, endTime: 0n },
        ...Array.from({ length: 6 }, (_, offset) => {
          const startTime = BigInt(random(5));
          const edgeId = offset + 1;
          return {
            edgeId,
            source: nodes[random(nodes.length)],
            target: nodes[random(nodes.length)],
            startTime,
            endTime: startTime,
          };
        }),
      ];
      for (const direction of ["outgoing", "incoming"] as const) {
        const start = direction === "outgoing" ? "A" : "D";
        const end = direction === "outgoing" ? "D" : "A";
        for (const strictOrdering of [false, true]) {
          const minGap = BigInt(seed % 2);
          const expected = referencePathRows(
            generated,
            start,
            end,
            direction,
            minGap,
            strictOrdering,
          );
          for (const ordered of [generated, generated.toReversed()]) {
            assertEquals(
              await sdb.newTable().loadArray(chronologicalRows(ordered))
                .paths("source", "target", "edgeId", start, end, {
                  direction,
                  startTimeColumn: "startTime",
                  endTimeColumn: "endTime",
                  minGapMs: Number(minGap),
                  strictOrdering,
                }).getData(),
              expected,
              `seed ${seed}, ${direction}, strict=${strictOrdering}`,
            );
          }
        }
      }
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("paths chronological traversal preserves nanoseconds and exact endpoint IDs", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("nanosecondPaths");
    await sdb.customQuery(`CREATE TABLE "nanosecondPaths" AS
      SELECT * FROM (VALUES
        (1::BIGINT, 9007199254740993::BIGINT, 9007199254740995::BIGINT,
          TIMESTAMP_NS '2025-01-01 00:00:00.000000001'),
        (2::BIGINT, 9007199254740995::BIGINT, 9007199254740997::BIGINT,
          TIMESTAMP_NS '2025-01-01 00:00:00.000000002')
      ) edges(edgeId, source, target, time)`);
    table.paths(
      "source",
      "target",
      "edgeId",
      9007199254740993n,
      9007199254740997n,
      { startTimeColumn: "TIME" },
    ).convert({ source: "string", target: "string" });
    assertEquals(await table.getData(), [
      {
        pathId: 0,
        step: 1,
        edgeId: 1,
        source: "9007199254740993",
        target: "9007199254740995",
        weight: 1,
        total: 1,
      },
      {
        pathId: 0,
        step: 2,
        edgeId: 2,
        source: "9007199254740995",
        target: "9007199254740997",
        weight: 1,
        total: 2,
      },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("paths validates and snapshots chronological options before queued execution", async () => {
  const sdb = new SimpleDB();
  try {
    const unqueued = sdb.newTable();
    assertThrows(
      () =>
        unqueued.paths("source", "target", "edgeId", "A", "B", {
          minGapMs: 0,
        }),
      TypeError,
      "require options.startTimeColumn or options.endTimeColumn",
    );
    assertThrows(
      () =>
        unqueued.paths("source", "target", "edgeId", "A", "B", {
          direction: "both",
          startTimeColumn: "time",
        }),
      TypeError,
      'options.direction cannot be "both"',
    );
    assertEquals(unqueued.pendingOps.length, 0);

    const options = {
      startTimeColumn: "time",
      strictOrdering: true,
      outputTable: "chronologicalPathSnapshot",
    };
    const source = sdb.newTable().loadArray([
      { edgeId: "E1", source: "A", target: "B", time: "2025-01-01 00:00:00" },
      { edgeId: "E2", source: "B", target: "C", time: "2025-01-01 00:00:01" },
    ]).convert({ time: "datetime" });
    const result = source.paths(
      "source",
      "target",
      "edgeId",
      "A",
      "C",
      options,
    );
    options.startTimeColumn = "missing";
    options.strictOrdering = false;
    options.outputTable = "changed";
    assertEquals(result.name, "chronologicalPathSnapshot");
    assertEquals((await result.getData()).map((row) => row.edgeId), [
      "E1",
      "E2",
    ]);
    assertEquals(await source.getRowCount(), 2);

    const missing = sdb.newTable().loadArray([
      { edgeId: "E", source: "A", target: "B", time: new Date() },
    ]);
    await assertRejects(
      () =>
        missing.paths("source", "target", "edgeId", "A", "B", {
          startTimeColumn: "missing",
        }).run(),
      Error,
      'column "missing" does not exist',
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("paths retains actual event continuity and terminates equal-time cycles", async () => {
  const sdb = new SimpleDB();
  const events: ReferenceChronologicalEvent<string, number>[] = [
    { edgeId: 1, source: "A", target: "B", startTime: 0n, endTime: 10n },
    { edgeId: 2, source: "A", target: "B", startTime: 0n, endTime: 20n },
    { edgeId: 3, source: "B", target: "C", startTime: 10n, endTime: 10n },
    { edgeId: 4, source: "C", target: "B", startTime: 10n, endTime: 10n },
    { edgeId: 5, source: "B", target: "B", startTime: 10n, endTime: 10n },
    { edgeId: 6, source: "C", target: "D", startTime: 11n, endTime: 12n },
    { edgeId: 7, source: "B", target: "D", startTime: 21n, endTime: 22n },
    { edgeId: 8, source: "D", target: "C", startTime: 23n, endTime: 24n },
  ];
  try {
    for (const direction of ["outgoing", "incoming"] as const) {
      const start = direction === "outgoing" ? "A" : "D";
      const end = direction === "outgoing" ? "D" : "A";
      for (const strictOrdering of [false, true]) {
        const expected = referencePathRows(
          events,
          start,
          end,
          direction,
          0n,
          strictOrdering,
        );
        assertEquals(
          [...new Set(expected.map((row) => row.pathId))].length,
          strictOrdering ? 2 : 3,
        );
        for (const ordered of [events, events.toReversed()]) {
          assertEquals(
            await sdb.newTable().loadArray(chronologicalRows(ordered))
              .paths("source", "target", "edgeId", start, end, {
                direction,
                startTimeColumn: "startTime",
                endTimeColumn: "endTime",
                strictOrdering,
              }).getData(),
            expected,
          );
        }
      }
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("paths binds quoted endpoints and preserves mixed timestamp precision and decimal totals", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("graph_event_rows");
    await sdb.customQuery(`CREATE TABLE "graph_event_rows" AS
      SELECT * FROM (VALUES
        (9007199254740993::BIGINT, 'A''?', 'B',
          TIMESTAMP_NS '2025-01-01 00:00:00',
          TIMESTAMP '2025-01-01 00:00:00.001000', 0.1::DECIMAL(10, 2)),
        (9007199254740995::BIGINT, 'B', 'D?',
          TIMESTAMP_NS '2025-01-01 00:00:00.002000000',
          TIMESTAMP '2025-01-01 00:00:00.003000', 0.2::DECIMAL(10, 2)),
        (9007199254740997::BIGINT, 'B', 'D?',
          TIMESTAMP_NS '2025-01-01 00:00:00.001999999',
          TIMESTAMP '2025-01-01 00:00:00.003000', 0.4::DECIMAL(10, 2))
      ) edges(edgeId, source, target, departure, arrival, cost)`);
    for (const direction of ["outgoing", "incoming"] as const) {
      for (const [start, end] of [["unknown", "D?"], ["A'?", "unknown"]]) {
        const empty = table.paths("source", "target", "edgeId", start, end, {
          direction,
          startTimeColumn: "departure",
          endTimeColumn: "arrival",
          outputTable: true,
        });
        assertEquals(await empty.getData(), []);
        assertEquals(await empty.getColumns(), [
          "pathId",
          "step",
          "edgeId",
          "source",
          "target",
          "weight",
          "total",
        ]);
      }
      for (const minGapMs of [0, 1, 2]) {
        const result = await table.paths(
          "source",
          "target",
          "edgeId",
          direction === "outgoing" ? "A'?" : "D?",
          direction === "outgoing" ? "D?" : "A'?",
          {
            direction,
            startTimeColumn: "departure",
            endTimeColumn: "arrival",
            minGapMs,
            weight: "cost",
            outputTable: true,
          },
        ).convert({ edgeId: "string", weight: "string", total: "string" })
          .getData();
        const expected = minGapMs === 2 ? [] : [
          ...(direction === "outgoing"
            ? [[0, 1, "9007199254740993", "0.10", "0.10"], [
              0,
              2,
              "9007199254740995",
              "0.20",
              "0.30",
            ]]
            : [[0, 1, "9007199254740995", "0.20", "0.20"], [
              0,
              2,
              "9007199254740993",
              "0.10",
              "0.30",
            ]]),
          ...(minGapMs !== 0
            ? []
            : direction === "outgoing"
            ? [[1, 1, "9007199254740993", "0.10", "0.10"], [
              1,
              2,
              "9007199254740997",
              "0.40",
              "0.50",
            ]]
            : [[1, 1, "9007199254740997", "0.40", "0.40"], [
              1,
              2,
              "9007199254740993",
              "0.10",
              "0.50",
            ]]),
        ];
        assertEquals(
          result.map((
            row,
          ) => [row.pathId, row.step, row.edgeId, row.weight, row.total]),
          expected,
        );
      }
    }
  } finally {
    await sdb.close();
  }
});
