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

const chronologicalBase = Date.parse("2025-01-01T00:00:00.000Z");

type WeightedChronologicalEvent =
  & ReferenceChronologicalEvent<string, number>
  & { weight: number };

function chronologicalRows(events: WeightedChronologicalEvent[]) {
  return events.map(({ weight, ...event }) => ({
    ...event,
    startTime: event.startTime === null
      ? null
      : new Date(chronologicalBase + Number(event.startTime)),
    endTime: event.endTime === null
      ? null
      : new Date(chronologicalBase + Number(event.endTime)),
    cost: weight,
  }));
}

function referenceShortestRows(
  events: WeightedChronologicalEvent[],
  start: string,
  end: string,
  direction: "incoming" | "outgoing",
  minGap: bigint,
  strictOrdering: boolean,
) {
  const weights = new Map(events.map((event) => [event.edgeId, event.weight]));
  const weight = (edgeId: number) => weights.get(edgeId)!;
  const routes = enumerateChronologicalRoutes(events, start, {
    direction,
    end,
    maxSteps: new Set(events.flatMap((event) => [event.source, event.target]))
      .size - 1,
    minGap,
    strictOrdering,
  });
  const weighted = routes.map((steps) => ({
    steps,
    total: steps.reduce((sum, step) => sum + weight(step.event.edgeId), 0),
  }));
  const minimum = Math.min(...weighted.map((route) => route.total));
  return weighted.filter((route) => route.total === minimum)
    .sort((left, right) => {
      const leftIds = left.steps.map((step) => step.event.edgeId);
      const rightIds = right.steps.map((step) => step.event.edgeId);
      for (
        let index = 0;
        index < Math.min(leftIds.length, rightIds.length);
        index++
      ) {
        if (leftIds[index] !== rightIds[index]) {
          return leftIds[index] - rightIds[index];
        }
      }
      return leftIds.length - rightIds.length;
    })
    .flatMap((route, pathId) => {
      let total = 0;
      return route.steps.map((step, index) => {
        const eventWeight = weight(step.event.edgeId);
        total += eventWeight;
        return {
          pathId,
          step: index + 1,
          edgeId: step.event.edgeId,
          source: step.event.source,
          target: step.event.target,
          startTime: step.event.startTime === null
            ? null
            : new Date(chronologicalBase + Number(step.event.startTime)),
          endTime: step.event.endTime === null
            ? null
            : new Date(chronologicalBase + Number(step.event.endTime)),
          cost: eventWeight,
          weight: eventWeight,
          total,
        };
      });
    });
}

function loadScenario(
  sdb: SimpleDB,
  name: string,
  scenario: string,
  weighted = false,
): SimpleTable {
  const columns = weighted
    ? ["edgeId", "source", "target", "weight"]
    : ["edgeId", "source", "target"];
  const table = sdb.newTable(name)
    .loadData("test/data/graphs/edges.csv")
    .filter(`scenario = '${scenario}'`)
    .selectColumns(columns);
  return weighted ? table.renameColumns({ weight: "cost" }) : table;
}

function baselineRoutes() {
  return [
    {
      pathId: 0,
      step: 1,
      edgeId: "B1",
      source: "A",
      target: "B",
      weight: 1,
      total: 1,
    },
    {
      pathId: 0,
      step: 2,
      edgeId: "B3",
      source: "B",
      target: "D",
      weight: 1,
      total: 2,
    },
    {
      pathId: 0,
      step: 3,
      edgeId: "B5",
      source: "D",
      target: "E",
      weight: 1,
      total: 3,
    },
    {
      pathId: 1,
      step: 1,
      edgeId: "B2",
      source: "A",
      target: "C",
      weight: 1,
      total: 1,
    },
    {
      pathId: 1,
      step: 2,
      edgeId: "B4",
      source: "C",
      target: "D",
      weight: 1,
      total: 2,
    },
    {
      pathId: 1,
      step: 3,
      edgeId: "B5",
      source: "D",
      target: "E",
      weight: 1,
      total: 3,
    },
  ];
}

Deno.test("shortestPath returns every tied shortest route in deterministic order", async () => {
  const sdb = new SimpleDB();
  try {
    const expected = baselineRoutes();
    assertEquals(
      await loadScenario(sdb, "defaultOutgoing", "baseline")
        .shortestPath("source", "target", "edgeId", "A", "E").getData(),
      expected,
    );
    assertEquals(
      await loadScenario(sdb, "explicitOutgoing", "baseline")
        .shortestPath("source", "target", "edgeId", "A", "E", {
          direction: "outgoing",
        }).getData(),
      expected,
    );
    assertEquals(
      await loadScenario(sdb, "incoming", "baseline")
        .shortestPath("source", "target", "edgeId", "E", "A", {
          direction: "incoming",
        }).getData(),
      [
        {
          pathId: 0,
          step: 1,
          edgeId: "B5",
          source: "D",
          target: "E",
          weight: 1,
          total: 1,
        },
        {
          pathId: 0,
          step: 2,
          edgeId: "B3",
          source: "B",
          target: "D",
          weight: 1,
          total: 2,
        },
        {
          pathId: 0,
          step: 3,
          edgeId: "B1",
          source: "A",
          target: "B",
          weight: 1,
          total: 3,
        },
        {
          pathId: 1,
          step: 1,
          edgeId: "B5",
          source: "D",
          target: "E",
          weight: 1,
          total: 1,
        },
        {
          pathId: 1,
          step: 2,
          edgeId: "B4",
          source: "C",
          target: "D",
          weight: 1,
          total: 2,
        },
        {
          pathId: 1,
          step: 3,
          edgeId: "B2",
          source: "A",
          target: "C",
          weight: 1,
          total: 3,
        },
      ],
    );
    assertEquals(
      await loadScenario(sdb, "both", "single")
        .shortestPath("source", "target", "edgeId", "B", "A", {
          direction: "both",
        }).getData(),
      [{
        pathId: 0,
        step: 1,
        edgeId: "S1",
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

Deno.test("shortestPath minimizes hops or weight and preserves parallel routes", async () => {
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await loadScenario(sdb, "unweighted", "weighted")
        .shortestPath("source", "target", "edgeId", "A", "E").getData(),
      [{
        pathId: 0,
        step: 1,
        edgeId: "W1",
        source: "A",
        target: "E",
        weight: 1,
        total: 1,
      }],
    );
    assertEquals(
      await loadScenario(sdb, "weighted", "weighted", true)
        .shortestPath("source", "target", "edgeId", "A", "E", {
          weight: "cost",
        }).getData(),
      [
        {
          pathId: 0,
          step: 1,
          edgeId: "W2",
          source: "A",
          target: "B",
          weight: 1,
          total: 1,
          cost: 1,
        },
        {
          pathId: 0,
          step: 2,
          edgeId: "W3",
          source: "B",
          target: "D",
          weight: 1,
          total: 2,
          cost: 1,
        },
        {
          pathId: 0,
          step: 3,
          edgeId: "W4",
          source: "D",
          target: "E",
          weight: 1,
          total: 3,
          cost: 1,
        },
        {
          pathId: 1,
          step: 1,
          edgeId: "W5",
          source: "A",
          target: "C",
          weight: 0,
          total: 0,
          cost: 0,
        },
        {
          pathId: 1,
          step: 2,
          edgeId: "W6",
          source: "C",
          target: "E",
          weight: 3,
          total: 3,
          cost: 3,
        },
      ],
    );

    const parallel = await loadScenario(sdb, "parallel", "parallel", true)
      .shortestPath("source", "target", "edgeId", "A", "C").getData();
    assertEquals(parallel.map((row) => [row.pathId, row.edgeId]), [
      [0, "P1"],
      [0, "P3"],
      [1, "P2"],
      [1, "P3"],
    ]);
    const weightedParallel = await loadScenario(
      sdb,
      "weightedParallel",
      "parallel",
      true,
    ).shortestPath("source", "target", "edgeId", "A", "C", {
      weight: "cost",
    }).getData();
    assertEquals(weightedParallel.map((row) => row.edgeId), ["P1", "P3"]);

    const equalParallel = await loadScenario(
      sdb,
      "equalParallel",
      "parallel-equal",
      true,
    ).shortestPath("source", "target", "edgeId", "A", "C", {
      weight: "cost",
    }).getData();
    assertEquals(equalParallel.map((row) => [row.pathId, row.edgeId]), [
      [0, "V1"],
      [0, "V3"],
      [1, "V2"],
      [1, "V3"],
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath enumerates simple routes through cycles and keeps floating full-route ties", async () => {
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await loadScenario(sdb, "selfLoop", "self-loop")
        .shortestPath("source", "target", "edgeId", "A", "B").getData(),
      [{
        pathId: 0,
        step: 1,
        edgeId: "L2",
        source: "A",
        target: "B",
        weight: 1,
        total: 1,
      }],
    );
    assertEquals(
      await loadScenario(sdb, "zeroCycle", "zero-cycle", true)
        .shortestPath("source", "target", "edgeId", "A", "C", {
          weight: "cost",
        }).getData(),
      [
        {
          pathId: 0,
          step: 1,
          edgeId: "Z1",
          source: "A",
          target: "B",
          weight: 0,
          total: 0,
          cost: 0,
        },
        {
          pathId: 0,
          step: 2,
          edgeId: "Z2",
          source: "B",
          target: "C",
          weight: 2,
          total: 2,
          cost: 2,
        },
      ],
    );

    const floating = sdb.newTable("floatingTie");
    await sdb.customQuery(`CREATE TABLE "floatingTie" AS
      SELECT * FROM (VALUES
        ('E1', 'A', 'B', 1::DOUBLE),
        ('E2', 'A', 'C', 1::DOUBLE),
        ('E3', 'C', 'B', 1::DOUBLE),
        ('E4', 'B', 'E', 1e20::DOUBLE)
      ) edges(edgeId, source, target, cost)`);
    const tied = await floating
      .shortestPath("source", "target", "edgeId", "A", "E", {
        weight: "cost",
      }).getData();
    assertEquals(tied.map((row) => [row.pathId, row.edgeId]), [
      [0, "E1"],
      [0, "E4"],
      [1, "E2"],
      [1, "E3"],
      [1, "E4"],
    ]);
    assertEquals(
      tied.filter((row) => row.target === "E").map((row) => row.total),
      [
        100000000000000000000,
        100000000000000000000,
      ],
    );

    const actualTie = sdb.newTable("actualTie");
    await sdb.customQuery(`CREATE TABLE "actualTie" AS
      SELECT * FROM (VALUES
        ('direct', 'A', 'C', 0.3::DOUBLE),
        ('first', 'A', 'B', 0.1::DOUBLE),
        ('second', 'B', 'C', 0.2::DOUBLE)
      ) edges(edgeId, source, target, cost)`);
    assertEquals(
      (await actualTie.shortestPath(
        "source",
        "target",
        "edgeId",
        "A",
        "C",
        { weight: "cost" },
      ).getData()).map((row) => row.edgeId),
      ["direct"],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath preserves numeric ordering and exact accumulators", async () => {
  const sdb = new SimpleDB();
  try {
    const numeric = sdb.newTable("numeric")
      .loadData("test/data/graphs/numeric.csv")
      .renameColumns({ weight: "cost" })
      .shortestPath("source", "target", "edgeId", 0, 10, {
        weight: "cost",
      });
    assertEquals(await numeric.getData(), [
      {
        pathId: 0,
        step: 1,
        edgeId: 0,
        source: 0,
        target: 10,
        weight: 1,
        total: 1,
        cost: 1,
      },
      {
        pathId: 1,
        step: 1,
        edgeId: 1,
        source: 0,
        target: 2,
        weight: 0,
        total: 0,
        cost: 0,
      },
      {
        pathId: 1,
        step: 2,
        edgeId: 2,
        source: 2,
        target: 10,
        weight: 1,
        total: 1,
        cost: 1,
      },
    ]);
    assertEquals(await numeric.getTypes(), {
      pathId: "BIGINT",
      step: "BIGINT",
      edgeId: "BIGINT",
      source: "BIGINT",
      target: "BIGINT",
      weight: "HUGEINT",
      total: "HUGEINT",
      cost: "BIGINT",
    });

    const decimal = sdb.newTable("decimalWeights");
    await sdb.customQuery(`CREATE TABLE "decimalWeights" AS
      SELECT * FROM (VALUES
        (0, 'A', 'B', 99999999999999999999.25::DECIMAL(22,2)),
        (1, 'B', 'C', 0.50::DECIMAL(22,2))
      ) edges(edgeId, source, target, cost)`);
    decimal.shortestPath("source", "target", "edgeId", "A", "C", {
      weight: "cost",
    });
    assertEquals(await decimal.getTypes(), {
      pathId: "BIGINT",
      step: "BIGINT",
      edgeId: "INTEGER",
      source: "VARCHAR",
      target: "VARCHAR",
      weight: "DECIMAL(38,2)",
      total: "DECIMAL(38,2)",
      cost: "DECIMAL(22,2)",
    });
    assertEquals(await decimal.getData(), [
      {
        pathId: 0,
        step: 1,
        edgeId: 0,
        source: "A",
        target: "B",
        weight: "99999999999999999999.25",
        total: "99999999999999999999.25",
        cost: "99999999999999999999.25",
      },
      {
        pathId: 0,
        step: 2,
        edgeId: 1,
        source: "B",
        target: "C",
        weight: "0.50",
        total: "99999999999999999999.75",
        cost: "0.50",
      },
    ]);

    const fraction = loadScenario(
      sdb,
      "fraction",
      "fraction-weight",
      true,
    ).shortestPath("source", "target", "edgeId", "A", "C", {
      weight: "cost",
    });
    assertEquals((await fraction.getData()).map((row) => row.total), [
      0.5,
      1.75,
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath matches IDs and sorts string edge sequences case-sensitively", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("collated");
    await sdb.customQuery(`CREATE TABLE "collated" (
      edgeId VARCHAR COLLATE NOCASE,
      source VARCHAR COLLATE NOCASE,
      target VARCHAR COLLATE NOCASE
    )`);
    await sdb.customQuery(`INSERT INTO "collated" VALUES
      ('a', 'A', 'B'), ('A', 'A', 'B'), ('x', 'a', 'C')`);
    assertEquals(
      (await table.shortestPath(
        "source",
        "target",
        "edgeId",
        "A",
        "B",
      ).getData()).map((row) => [row.pathId, row.edgeId]),
      [[0, "A"], [1, "a"]],
    );

    const caseSensitive = sdb.newTable("caseSensitive");
    await sdb.customQuery(`CREATE TABLE "caseSensitive" (
      edgeId VARCHAR, source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE
    )`);
    await sdb.customQuery(`INSERT INTO "caseSensitive" VALUES
      ('upper', 'A', 'B'), ('lower', 'a', 'C')`);
    assertEquals(
      await caseSensitive.shortestPath(
        "source",
        "target",
        "edgeId",
        "A",
        "C",
      ).getData(),
      [],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath preserves the empty schema for unknown and disconnected endpoints", async () => {
  const sdb = new SimpleDB();
  try {
    const empty = sdb.newTable("empty");
    await sdb.customQuery(`CREATE TABLE "empty" (
      edgeId VARCHAR, source VARCHAR, target VARCHAR, cost DECIMAL(8,3)
    )`);
    empty.shortestPath("source", "target", "edgeId", "A", "B", {
      weight: "cost",
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
      cost: "DECIMAL(8,3)",
    });

    assertEquals(
      await loadScenario(sdb, "unknown", "baseline")
        .shortestPath("source", "target", "edgeId", "A", "unknown")
        .getData(),
      [],
    );
    assertEquals(
      await loadScenario(sdb, "disconnected", "baseline")
        .shortestPath("source", "target", "edgeId", "A", "G").getData(),
      [],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath validates arguments and schema cheaply", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      () => table.shortestPath("source", "target", "edgeId", "A", "A"),
      TypeError,
      "start and end must be different",
    );
    assertThrows(
      () =>
        table.shortestPath(
          "source",
          "target",
          "edgeId",
          "unknown",
          "unknown",
        ),
      TypeError,
      "start and end must be different",
    );
    assertThrows(
      () =>
        table.shortestPath(
          1 as unknown as string,
          "target",
          "edgeId",
          "A",
          "B",
        ),
      TypeError,
      "shortestPath() sourceColumn must be a string.",
    );
    assertThrows(
      () =>
        table.shortestPath(
          "source",
          "target",
          1 as unknown as string,
          "A",
          "B",
        ),
      TypeError,
      "shortestPath() edgeId must be a string.",
    );
    assertThrows(
      () =>
        table.shortestPath("source", "target", "edgeId", "A", "B", {
          direction: "sideways" as "outgoing",
        }),
      TypeError,
      'options.direction must be "outgoing", "incoming", or "both"',
    );
    assertThrows(
      () =>
        table.shortestPath("source", "target", "edgeId", "A", "B", {
          weight: 1 as unknown as string,
        }),
      TypeError,
      "options.weight must be a string",
    );
    assertThrows(
      () =>
        table.shortestPath(
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
      () =>
        withoutId.shortestPath(
          "source",
          "target",
          "edgeId",
          "A",
          "C",
        ).run(),
      Error,
      'the column "edgeId" does not exist',
    );
    const unsupported = sdb.newTable("unsupported")
      .loadData("test/data/graphs/unsupported-types.csv");
    await assertRejects(
      () =>
        unsupported.shortestPath(
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
      () =>
        numeric.shortestPath(
          "source",
          "target",
          "edgeId",
          "0",
          "10",
        ).run(),
      TypeError,
      "start contains string IDs",
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath supports overwrite, separate outputs, chaining, and snapshots", async () => {
  const sdb = new SimpleDB();
  try {
    const overwritten = loadScenario(sdb, "overwritten", "baseline");
    assertStrictEquals(
      overwritten.shortestPath("source", "target", "edgeId", "A", "E", {
        outputTable: false,
      }),
      overwritten,
    );
    assertEquals(await overwritten.getColumns(), [
      "pathId",
      "step",
      "weight",
      "total",
      "edgeId",
      "source",
      "target",
    ]);

    const source = loadScenario(sdb, "preserved", "baseline");
    const named = source.shortestPath(
      "source",
      "target",
      "edgeId",
      "A",
      "E",
      { outputTable: "namedShortest" },
    ).filter("step = 3");
    assertEquals(named.name, "namedShortest");
    assertEquals((await named.getData()).length, 2);
    assertEquals(await source.getRowCount(), 6);

    const generated = source.shortestPath(
      "source",
      "target",
      "edgeId",
      "F",
      "G",
      { outputTable: true },
    );
    assertEquals(generated.name === source.name, false);
    assertEquals((await generated.getData()).map((row) => row.edgeId), ["B6"]);
    assertEquals(await source.getRowCount(), 6);

    const options: {
      direction: "incoming" | "outgoing";
      outputTable: string;
    } = { direction: "incoming", outputTable: "snapshotted" };
    const snapshotted = loadScenario(sdb, "snapshotSource", "single")
      .shortestPath("source", "target", "edgeId", "B", "A", options);
    options.direction = "outgoing";
    options.outputTable = "changed";
    assertEquals((await snapshotted.getData()).map((row) => row.source), ["A"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath accepts existing and generated edge IDs", async () => {
  const sdb = new SimpleDB();
  try {
    const existing = sdb.newTable("existing")
      .loadData("test/data/graphs/custom-columns.csv")
      .shortestPath("ORIGIN", "Destination", "flightId", "A", "C", {
        weight: "COST",
      });
    assertEquals((await existing.getData()).map((row) => row.flightId), [
      "F1",
      "F2",
    ]);

    const numeric = sdb.newTable("generatedNumeric")
      .loadData("test/data/graphs/without-edge-id.csv")
      .removeColumns("weight")
      .addId("edgeId")
      .shortestPath("source", "target", "edgeId", "A", "C");
    assertEquals((await numeric.getData()).map((row) => row.edgeId), [0, 1]);

    const prefixed = sdb.newTable("generatedPrefixed")
      .loadData("test/data/graphs/without-edge-id.csv")
      .removeColumns("weight")
      .addId("edgeId", { prefix: "edge-" })
      .shortestPath("source", "target", "edgeId", "A", "C");
    assertEquals((await prefixed.getData()).map((row) => row.edgeId), [
      "edge-0",
      "edge-1",
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath matches the shared fixture oracle", async () => {
  const sdb = new SimpleDB();
  try {
    const expected = sdb.newTable("oracle")
      .loadData("test/data/graphs/expected/shortest_path.csv")
      .filter("\"case\" = 'baseline-A-E-outgoing'")
      .removeColumns("case");
    const actual = loadScenario(sdb, "oracleActual", "baseline")
      .shortestPath("source", "target", "edgeId", "A", "E");
    assertEquals(await actual.getData(), await expected.getData());

    const numericExpected = sdb.newTable("numericOracle")
      .loadData("test/data/graphs/expected/numeric/shortest_path.csv")
      .filter("\"case\" = 'numeric-0-10-weighted'")
      .removeColumns("case");
    const numericActual = sdb.newTable("numericOracleActual")
      .loadData("test/data/graphs/numeric.csv")
      .renameColumns({ weight: "cost" })
      .shortestPath("source", "target", "edgeId", 0, 10, {
        weight: "cost",
      })
      .removeColumns("cost");
    assertEquals(
      await numericActual.getData(),
      await numericExpected.getData(),
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath IDs remain deterministic after input rows are shuffled", async () => {
  const sdb = new SimpleDB();
  const edges = [
    { edgeId: "E5", source: "D", target: "E" },
    { edgeId: "E2", source: "A", target: "C" },
    { edgeId: "E4", source: "C", target: "D" },
    { edgeId: "E1", source: "A", target: "B" },
    { edgeId: "E3", source: "B", target: "D" },
  ];
  try {
    for (const [index, rows] of [edges, edges.toReversed()].entries()) {
      const table = sdb.newTable(`shuffled${index}`).loadArray(rows);
      assertEquals(
        await table.shortestPath(
          "source",
          "target",
          "edgeId",
          "A",
          "E",
        ).getData(),
        baselineRoutes().map((row) => ({
          ...row,
          edgeId: row.edgeId.replace("B", "E"),
        })),
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath has no implicit hop cap", async () => {
  const sdb = new SimpleDB();
  const edges = Array.from({ length: 140 }, (_, edgeId) => ({
    edgeId,
    source: edgeId,
    target: edgeId + 1,
  }));
  try {
    const rows = await sdb.newTable("deepRoute").loadArray(edges)
      .shortestPath("source", "target", "edgeId", 0, 140).getData();
    assertEquals(rows.length, 140);
    assertEquals(rows.at(-1), {
      pathId: 0,
      step: 140,
      edgeId: 139,
      source: 139,
      target: 140,
      weight: 1,
      total: 140,
    });
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath output records its source as a cache dependency", async () => {
  let computationRuns = 0;
  const unique = crypto.randomUUID().replaceAll("-", "");
  const outputName = `shortestPathCacheOutput${unique}`;
  const sourceName = `shortestPathCacheSource${unique}`;
  const compute = (source: SimpleTable) => async (output: SimpleTable) => {
    computationRuns++;
    const result = source.shortestPath(
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

Deno.test("shortestPath chronological output records its source as a cache dependency", async () => {
  let computationRuns = 0;
  const unique = crypto.randomUUID().replaceAll("-", "");
  const outputName = `chronologicalShortestCacheOutput${unique}`;
  const sourceName = `chronologicalShortestCacheSource${unique}`;
  const compute = (source: SimpleTable) => async (output: SimpleTable) => {
    computationRuns++;
    const result = source.shortestPath(
      "source",
      "target",
      "edgeId",
      "A",
      "C",
      { startTimeColumn: "time", outputTable: true },
    );
    output.loadArray(await result.getData());
    await result.removeTable();
  };

  const firstSdb = new SimpleDB();
  try {
    const source = firstSdb.newTable(sourceName).loadArray([
      { edgeId: "E1", source: "A", target: "B", time: new Date(0) },
      { edgeId: "E2", source: "B", target: "C", time: new Date(1) },
    ]);
    await firstSdb.newTable(outputName).cache(compute(source));
  } finally {
    await firstSdb.close();
  }

  const secondSdb = new SimpleDB();
  try {
    const source = secondSdb.newTable(sourceName).loadArray([
      { edgeId: "E3", source: "A", target: "C", time: new Date(0) },
    ]);
    const output = secondSdb.newTable(outputName);
    await output.cache(compute(source));
    assertEquals(computationRuns, 2);
    assertEquals((await output.getData()).map((row) => row.edgeId), ["E3"]);
  } finally {
    await secondSdb.close();
  }
});

Deno.test("shortestPath uses native bounded simple-route enumeration", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const table = loadScenario(sdb, "queryShape", "weighted", true)
      .shortestPath("source", "target", "edgeId", "A", "E", {
        weight: "cost",
      });
    await table.run();
    const query = observer.queries.find((entry) =>
      entry.query.includes("graph_shortest_routes")
    )?.query ?? "";
    assertStringIncludes(query, "WITH RECURSIVE");
    assertStringIncludes(query, "USING KEY");
    assertStringIncludes(query, "graph_to_end");
    assertStringIncludes(query, "list_contains");
    assertStringIncludes(query, "UNNEST");
    assertEquals(query.includes("LIMIT"), false);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

Deno.test("shortestPath preserves wide numeric edge ordering and accumulated costs", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("graph_routes");
    await sdb.customQuery(`CREATE TABLE graph_routes AS
      SELECT edgeId::BIGNUM AS edgeId, source, target, cost::HUGEINT AS cost
      FROM (VALUES
        ('10000000000000000000000000000000000000000', 'A', 'B',
          '170141183460469231731687303715884105727'),
        ('2', 'A', 'B', '170141183460469231731687303715884105727'),
        ('3', 'B', 'C', '1')
      ) edges(edgeId, source, target, cost)`);
    const result = table.shortestPath("source", "target", "edgeId", "A", "C", {
      weight: "cost",
    }).removeColumns("cost");
    const rows = await result.getData();
    assertEquals(rows.map((row) => [row.pathId, row.step, row.edgeId]), [
      [0, 1, "2"],
      [0, 2, "3"],
      [1, 1, "10000000000000000000000000000000000000000"],
      [1, 2, "3"],
    ]);
    assertEquals(
      rows.filter((row) => row.step === 2).map((row) => row.total),
      [
        "170141183460469231731687303715884105728",
        "170141183460469231731687303715884105728",
      ],
    );
    assertEquals((await result.getTypes()).total, "BIGNUM");
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath custom-column weighted JSDoc examples match their tables", async () => {
  const sdb = new SimpleDB();
  try {
    const flights = () =>
      sdb.newTable().loadArray([
        { flightId: "F1", origin: "A", destination: "E", minutes: 10 },
        { flightId: "F2", origin: "A", destination: "B", minutes: 1 },
        { flightId: "F3", origin: "B", destination: "D", minutes: 1 },
        { flightId: "F4", origin: "D", destination: "E", minutes: 1 },
      ]);
    assertEquals(
      await flights().shortestPath(
        "origin",
        "destination",
        "flightId",
        "A",
        "E",
        {
          weight: "minutes",
        },
      ).getData(),
      [
        {
          pathId: 0,
          step: 1,
          weight: 1,
          total: 1,
          flightId: "F2",
          origin: "A",
          destination: "B",
          minutes: 1,
        },
        {
          pathId: 0,
          step: 2,
          weight: 1,
          total: 2,
          flightId: "F3",
          origin: "B",
          destination: "D",
          minutes: 1,
        },
        {
          pathId: 0,
          step: 3,
          weight: 1,
          total: 3,
          flightId: "F4",
          origin: "D",
          destination: "E",
          minutes: 1,
        },
      ],
    );
    assertEquals(
      await flights().shortestPath(
        "origin",
        "destination",
        "flightId",
        "A",
        "E",
      ).getData(),
      [{
        pathId: 0,
        step: 1,
        weight: 1,
        total: 1,
        flightId: "F1",
        origin: "A",
        destination: "E",
        minutes: 10,
      }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath chronological routing returns a costlier feasible optimum in both directions", async () => {
  const sdb = new SimpleDB();
  const events: WeightedChronologicalEvent[] = [
    {
      edgeId: 1,
      source: "A",
      target: "B",
      startTime: 0n,
      endTime: 10n,
      weight: 1,
    },
    {
      edgeId: 2,
      source: "B",
      target: "D",
      startTime: 5n,
      endTime: 11n,
      weight: 1,
    },
    {
      edgeId: 3,
      source: "A",
      target: "C",
      startTime: 0n,
      endTime: 2n,
      weight: 2,
    },
    {
      edgeId: 4,
      source: "C",
      target: "D",
      startTime: 3n,
      endTime: 4n,
      weight: 2,
    },
  ];
  try {
    for (const ordered of [events, events.toReversed()]) {
      for (const direction of ["outgoing", "incoming"] as const) {
        const start = direction === "outgoing" ? "A" : "D";
        const end = direction === "outgoing" ? "D" : "A";
        assertEquals(
          await sdb.newTable().loadArray(chronologicalRows(ordered))
            .shortestPath("source", "target", "edgeId", start, end, {
              direction,
              startTimeColumn: "startTime",
              endTimeColumn: "endTime",
              weight: "cost",
            }).getData(),
          referenceShortestRows(events, start, end, direction, 0n, true),
        );
      }
    }

    const oneEvent = await sdb.newTable().loadArray(chronologicalRows([
      {
        edgeId: 9,
        source: "A",
        target: "D",
        startTime: 10n,
        endTime: 11n,
        weight: 7,
      },
    ])).shortestPath("source", "target", "edgeId", "A", "D", {
      startTimeColumn: "startTime",
      endTimeColumn: "endTime",
      minGapMs: 1000,
      weight: "cost",
    }).getData();
    assertEquals(oneEvent.map((row) => row.edgeId), [9]);

    assertEquals(
      await sdb.newTable().loadArray(chronologicalRows(events))
        .shortestPath("source", "target", "edgeId", "D", "A", {
          startTimeColumn: "startTime",
        }).getData(),
      [],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath keeps a costly early arrival when a cheap late arrival misses the connection", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable().loadArray([
      { edgeId: 1, source: "A", target: "B", time: new Date(10), cost: 1 },
      { edgeId: 2, source: "A", target: "B", time: new Date(0), cost: 3 },
      { edgeId: 3, source: "B", target: "C", time: new Date(5), cost: 1 },
    ]);
    for (const direction of ["outgoing", "incoming"] as const) {
      const rows = await source.shortestPath(
        "source",
        "target",
        "edgeId",
        direction === "outgoing" ? "A" : "C",
        direction === "outgoing" ? "C" : "A",
        {
          direction,
          startTimeColumn: "time",
          weight: "cost",
          outputTable: true,
        },
      ).getData();
      assertEquals(
        rows.map((row) => row.edgeId),
        direction === "outgoing" ? [2, 3] : [3, 2],
      );
      assertEquals(rows.at(-1)?.total, 4);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath end-only timestamps preserve nanoseconds at an inclusive millisecond gap", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("chronologicalNanosecondShortest");
    await sdb.customQuery(`CREATE TABLE "chronologicalNanosecondShortest" AS
      SELECT * FROM (VALUES
        (1, 'A', 'B', TIMESTAMP_NS '2025-01-01 00:00:00.000000001'),
        (2, 'B', 'C', TIMESTAMP_NS '2025-01-01 00:00:00.001000000'),
        (3, 'B', 'C', TIMESTAMP_NS '2025-01-01 00:00:00.001000001'),
        (4, 'B', 'C', TIMESTAMP_NS '2025-01-01 00:00:00.001000002')
      ) edges(edgeId, source, target, time)`);
    for (const direction of ["outgoing", "incoming"] as const) {
      for (const strictOrdering of [false, true]) {
        const rows = await source.shortestPath(
          "source",
          "target",
          "edgeId",
          direction === "outgoing" ? "A" : "C",
          direction === "outgoing" ? "C" : "A",
          {
            direction,
            endTimeColumn: "time",
            minGapMs: 1,
            strictOrdering,
            outputTable: true,
          },
        ).getData();
        assertEquals(
          rows.map((row) => [row.pathId, row.edgeId]),
          direction === "outgoing"
            ? [[0, 1], [0, 3], [1, 1], [1, 4]]
            : [[0, 3], [0, 1], [1, 4], [1, 1]],
        );
        assertEquals(rows.map((row) => row.total), [1, 2, 1, 2]);
      }
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath chronological routing retains tied arrival and visited-node histories", async () => {
  const sdb = new SimpleDB();
  try {
    const tiedArrivals: WeightedChronologicalEvent[] = [
      {
        edgeId: 1,
        source: "A",
        target: "X",
        startTime: 0n,
        endTime: 0n,
        weight: 1,
      },
      {
        edgeId: 2,
        source: "X",
        target: "B",
        startTime: 1n,
        endTime: 2n,
        weight: 1,
      },
      {
        edgeId: 3,
        source: "A",
        target: "Y",
        startTime: 0n,
        endTime: 0n,
        weight: 1,
      },
      {
        edgeId: 4,
        source: "Y",
        target: "B",
        startTime: 3n,
        endTime: 4n,
        weight: 1,
      },
      {
        edgeId: 5,
        source: "B",
        target: "C",
        startTime: 5n,
        endTime: 6n,
        weight: 0,
      },
      {
        edgeId: 6,
        source: "B",
        target: "C",
        startTime: 5n,
        endTime: 6n,
        weight: 0,
      },
    ];
    const tied = await sdb.newTable().loadArray(chronologicalRows(tiedArrivals))
      .shortestPath("source", "target", "edgeId", "A", "C", {
        startTimeColumn: "startTime",
        endTimeColumn: "endTime",
        weight: "cost",
      }).getData();
    assertEquals(
      tied,
      referenceShortestRows(
        tiedArrivals,
        "A",
        "C",
        "outgoing",
        0n,
        true,
      ),
    );
    assertEquals(
      [...new Set(tied.map((row) => row.pathId))].length,
      4,
    );

    const visitedHistories: WeightedChronologicalEvent[] = [
      {
        edgeId: 10,
        source: "A",
        target: "X",
        startTime: 0n,
        endTime: 0n,
        weight: 0,
      },
      {
        edgeId: 11,
        source: "X",
        target: "Z",
        startTime: 1n,
        endTime: 1n,
        weight: 0,
      },
      {
        edgeId: 12,
        source: "A",
        target: "Y",
        startTime: 0n,
        endTime: 0n,
        weight: 0,
      },
      {
        edgeId: 13,
        source: "Y",
        target: "Z",
        startTime: 1n,
        endTime: 1n,
        weight: 0,
      },
      {
        edgeId: 14,
        source: "Z",
        target: "B",
        startTime: 2n,
        endTime: 2n,
        weight: 0,
      },
      {
        edgeId: 15,
        source: "B",
        target: "X",
        startTime: 3n,
        endTime: 3n,
        weight: 0,
      },
      {
        edgeId: 16,
        source: "X",
        target: "D",
        startTime: 4n,
        endTime: 4n,
        weight: 0,
      },
    ];
    assertEquals(
      await sdb.newTable().loadArray(chronologicalRows(visitedHistories))
        .shortestPath("source", "target", "edgeId", "A", "D", {
          startTimeColumn: "startTime",
          strictOrdering: true,
          weight: "cost",
        }).getData(),
      referenceShortestRows(
        visitedHistories,
        "A",
        "D",
        "outgoing",
        0n,
        true,
      ),
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath chronological routing preserves floating ties after later rounding", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("chronologicalFloatShortest");
    await sdb.customQuery(`CREATE TABLE "chronologicalFloatShortest" AS
      SELECT * FROM (VALUES
        (1, 'A', 'B', TIMESTAMP '2025-01-01 00:00:00', 1e16::DOUBLE),
        (2, 'A', 'X', TIMESTAMP '2025-01-01 00:00:00', 1e16::DOUBLE),
        (3, 'X', 'B', TIMESTAMP '2025-01-01 00:00:01', 2::DOUBLE),
        (4, 'B', 'C', TIMESTAMP '2025-01-01 00:00:02', 1e16::DOUBLE)
      ) edges(edgeId, source, target, time, cost)`);
    const rows = await table.shortestPath(
      "source",
      "target",
      "edgeId",
      "A",
      "C",
      { startTimeColumn: "time", weight: "cost" },
    ).getData();
    assertEquals(rows.map((row) => [row.pathId, row.edgeId]), [
      [0, 1],
      [0, 4],
      [1, 2],
      [1, 3],
      [1, 4],
    ]);
    assertEquals(
      rows.filter((row) => row.edgeId === 4).map((row) => row.total),
      [2e16, 2e16],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath chronological options enforce equal-time and validation boundaries", async () => {
  const sdb = new SimpleDB();
  try {
    const unqueued = sdb.newTable();
    assertThrows(
      () =>
        unqueued.shortestPath("source", "target", "edgeId", "A", "C", {
          minGapMs: 0,
        }),
      TypeError,
      "require options.startTimeColumn or options.endTimeColumn",
    );
    assertThrows(
      () =>
        unqueued.shortestPath("source", "target", "edgeId", "A", "C", {
          direction: "both",
          startTimeColumn: "time",
        }),
      TypeError,
      'options.direction cannot be "both"',
    );
    assertEquals(unqueued.pendingOps.length, 0);

    const source = sdb.newTable().loadArray([
      {
        edgeId: 1,
        source: "A",
        target: "B",
        time: new Date(chronologicalBase),
      },
      {
        edgeId: 2,
        source: "B",
        target: "C",
        time: new Date(chronologicalBase),
      },
    ]);
    assertEquals(
      await source.shortestPath("source", "target", "edgeId", "A", "C", {
        startTimeColumn: "time",
        outputTable: true,
      }).getData(),
      [],
    );

    const options = {
      startTimeColumn: "time",
      strictOrdering: false,
      outputTable: "chronologicalShortestSnapshot",
    };
    const result = source.shortestPath(
      "source",
      "target",
      "edgeId",
      "A",
      "C",
      options,
    );
    options.startTimeColumn = "missing";
    options.strictOrdering = true;
    options.outputTable = "changed";
    assertEquals(result.name, "chronologicalShortestSnapshot");
    assertEquals((await result.getData()).map((row) => row.edgeId), [1, 2]);
    assertEquals(await source.getRowCount(), 2);
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath chronological routing preserves wide IDs and exact decimal totals", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("chronologicalWideShortest");
    await sdb.customQuery(`CREATE TABLE "chronologicalWideShortest" AS
      SELECT edgeId::BIGNUM AS edgeId, source, target, time,
        cost::DECIMAL(22, 2) AS cost
      FROM (VALUES
        ('10000000000000000000000000000000000000000', 'A', 'B',
          TIMESTAMP '2025-01-01 00:00:00', 99999999999999999999.25),
        ('2', 'A', 'B', TIMESTAMP '2025-01-01 00:00:00',
          99999999999999999999.25),
        ('3', 'B', 'C', TIMESTAMP '2025-01-01 00:00:01', 0.50)
      ) edges(edgeId, source, target, time, cost)`);
    const result = table.shortestPath(
      "source",
      "target",
      "edgeId",
      "A",
      "C",
      { startTimeColumn: "time", weight: "cost" },
    );
    const rows = await result.getData();
    assertEquals(rows.map((row) => [row.pathId, row.step, row.edgeId]), [
      [0, 1, "2"],
      [0, 2, "3"],
      [1, 1, "10000000000000000000000000000000000000000"],
      [1, 2, "3"],
    ]);
    assertEquals(
      rows.filter((row) => row.step === 2).map((row) => row.total),
      ["99999999999999999999.75", "99999999999999999999.75"],
    );
    assertEquals((await result.getTypes()).total, "DECIMAL(38,2)");
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath chronological SQL shares numbered events and bounds route prefixes", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const result = sdb.newTable("graph_event_rows").loadArray([
      { edgeId: 1, source: "A'?", target: "B", time: new Date(0), cost: 1 },
      { edgeId: 2, source: "B", target: "C", time: new Date(1), cost: 1 },
    ]).shortestPath("source", "target", "edgeId", "A'?", "C", {
      startTimeColumn: "time",
      weight: "cost",
    });
    await result.run();
    const query = observer.queries.find((entry) =>
      entry.query.includes("graph_shortest_routes") &&
      entry.query.includes("graph_event_rows")
    )?.query ?? "";
    assertStringIncludes(query, "graph_event_rows");
    assertStringIncludes(query, "AS MATERIALIZED");
    assertStringIncludes(query, "USING KEY");
    assertStringIncludes(query, "list_contains");
    assertStringIncludes(query, '"best_total"."distance"');
    assertEquals(query.match(/row_number\(\) OVER \(\)/g)?.length, 1);
    assertEquals(query.includes("LIMIT"), false);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

Deno.test("shortestPath chronological results match exhaustive generated simple-route minima", async () => {
  const sdb = new SimpleDB();
  const nodes = ["A", "B", "C", "D"];
  try {
    for (let seed = 0; seed < 6; seed++) {
      let state = seed + 1;
      const random = (limit: number) => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return (state >>> 16) % limit;
      };
      const generated: WeightedChronologicalEvent[] = [
        {
          edgeId: 0,
          source: "A",
          target: "D",
          startTime: 0n,
          endTime: 0n,
          weight: 3,
        },
        ...Array.from({ length: 7 }, (_, offset) => {
          const edgeId = offset + 1;
          const startTime = BigInt(random(5));
          return {
            edgeId,
            source: nodes[random(nodes.length)],
            target: nodes[random(nodes.length)],
            startTime,
            endTime: startTime,
            weight: random(4),
          };
        }),
      ];
      for (const direction of ["outgoing", "incoming"] as const) {
        const start = direction === "outgoing" ? "A" : "D";
        const end = direction === "outgoing" ? "D" : "A";
        for (const strictOrdering of [false, true]) {
          const minGap = BigInt(seed % 2);
          const expected = referenceShortestRows(
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
                .shortestPath("source", "target", "edgeId", start, end, {
                  direction,
                  startTimeColumn: "startTime",
                  endTimeColumn: "endTime",
                  minGapMs: Number(minGap),
                  strictOrdering,
                  weight: "cost",
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

Deno.test("shortestPath executes every actual JSDoc example and prints its complete ordered table", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../src/class/SimpleTable.ts", import.meta.url),
  );
  const documentation = source.slice(
    source.indexOf(
      "   * Finds the shortest route between two different nodes.",
    ),
    source.indexOf("\n  shortestPath("),
  ).replace(/^ {3}\* ?/gm, "");
  const examples = [...documentation.matchAll(
    /```ts\n([\s\S]*?)```\n\n((?:\|[^\n]*\n)+)/g,
  )];
  assertEquals(examples.length, 6);
  const inputs = [
    [
      { edgeId: "E1", source: "A", target: "B" },
      { edgeId: "E2", source: "A", target: "C" },
      { edgeId: "E3", source: "B", target: "D" },
      { edgeId: "E4", source: "C", target: "D" },
      { edgeId: "E5", source: "D", target: "E" },
    ],
    [{ source: "A", target: "B" }, { source: "B", target: "E" }],
    [
      { flightId: "F1", origin: "A", destination: "E", minutes: 10 },
      { flightId: "F2", origin: "A", destination: "B", minutes: 1 },
      { flightId: "F3", origin: "B", destination: "D", minutes: 1 },
      { flightId: "F4", origin: "D", destination: "E", minutes: 1 },
    ],
    [
      { flightId: "F1", origin: "A", destination: "E", minutes: 10 },
      { flightId: "F2", origin: "A", destination: "B", minutes: 1 },
      { flightId: "F3", origin: "B", destination: "D", minutes: 1 },
      { flightId: "F4", origin: "D", destination: "E", minutes: 1 },
    ],
    [
      {
        flightId: "F1",
        origin: "A",
        destination: "B",
        departureTime: new Date("2025-01-01T08:00:00Z"),
        arrivalTime: new Date("2025-01-01T10:00:00Z"),
        cost: 1,
      },
      {
        flightId: "F2",
        origin: "B",
        destination: "E",
        departureTime: new Date("2025-01-01T09:00:00Z"),
        arrivalTime: new Date("2025-01-01T10:00:00Z"),
        cost: 1,
      },
      {
        flightId: "F3",
        origin: "A",
        destination: "C",
        departureTime: new Date("2025-01-01T08:00:00Z"),
        arrivalTime: new Date("2025-01-01T09:00:00Z"),
        cost: 2,
      },
      {
        flightId: "F4",
        origin: "C",
        destination: "E",
        departureTime: new Date("2025-01-01T10:00:00Z"),
        arrivalTime: new Date("2025-01-01T11:00:00Z"),
        cost: 2,
      },
    ],
    [{ edgeId: "F1", source: "A", target: "B" }],
  ];
  for (const [index, example] of examples.entries()) {
    const sdb = new SimpleDB();
    const originalLog = console.log;
    const printed: string[] = [];
    try {
      const table = sdb.newTable().loadArray(inputs[index]);
      const execute = new Function(
        "connections",
        "unnumberedConnections",
        "flights",
        "scheduledFlights",
        "reverseExample",
        `return (async () => { ${example[1]} })();`,
      ) as (...tables: SimpleTable[]) => Promise<void>;
      console.log = (...values: unknown[]) => {
        printed.push(values.map(String).join(" "));
      };
      await execute(table, table, table, table, table);
      const expected = example[2].trim().split("\n")
        .filter((line) => !line.startsWith("| ---"))
        .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
      const actual = printed
        // Strip the intentional ANSI colors emitted by log().
        // deno-lint-ignore no-control-regex
        .map((line) => line.replace(/\x1b\[[0-9;]*m/g, ""))
        .filter((line) => line.startsWith("│"))
        .map((line) => line.split("│").slice(1, -1).map((cell) => cell.trim()))
        .filter((cells) => cells[0] === "pathId" || /^\d+$/.test(cells[0]));
      assertEquals(actual, expected, `JSDoc example ${index + 1}`);
      assertEquals(
        (await table.getData()).map((row) =>
          Object.values(row).map((value) =>
            value instanceof Date
              ? value.toISOString().replace("T", " ").slice(0, 19)
              : String(value)
          )
        ),
        expected.slice(1),
      );
    } finally {
      console.log = originalLog;
      await sdb.close();
    }
  }
});

Deno.test("shortestPath returns all zero-cost simple routes through a cycle", async () => {
  const sdb = new SimpleDB();
  try {
    const rows = await sdb.newTable().loadArray([
      { edgeId: "AB", source: "A", target: "B", cost: 0 },
      { edgeId: "AC", source: "A", target: "C", cost: 0 },
      { edgeId: "AD", source: "A", target: "D", cost: 0 },
      { edgeId: "BC", source: "B", target: "C", cost: 0 },
      { edgeId: "BD", source: "B", target: "D", cost: 0 },
      { edgeId: "CB", source: "C", target: "B", cost: 0 },
      { edgeId: "CD", source: "C", target: "D", cost: 0 },
      { edgeId: "BB", source: "B", target: "B", cost: 0 },
    ]).shortestPath("source", "target", "edgeId", "A", "D", {
      weight: "cost",
    }).getData();
    const paths = [
      ["AB", "BC", "CD"],
      ["AB", "BD"],
      ["AC", "CB", "BD"],
      ["AC", "CD"],
      ["AD"],
    ];
    assertEquals(
      rows,
      paths.flatMap((edges, pathId) =>
        edges.map((edgeId, index) => ({
          pathId,
          step: index + 1,
          edgeId,
          source: edgeId[0],
          target: edgeId[1],
          cost: 0,
          weight: 0,
          total: 0,
        }))
      ),
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath does not truncate many parallel tied routes", async () => {
  const sdb = new SimpleDB();
  try {
    const edges = Array.from({ length: 1025 }, (_, edgeId) => ({
      edgeId,
      source: "A",
      target: "B",
    }));
    const rows = await sdb.newTable().loadArray(edges.toReversed())
      .shortestPath("source", "target", "edgeId", "A", "B").getData();
    assertEquals(
      rows,
      edges.map((edge) => ({
        pathId: edge.edgeId,
        step: 1,
        ...edge,
        weight: 1,
        total: 1,
      })),
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath selects exact decimal ties beyond JavaScript number precision", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("decimalSelection");
    await sdb.customQuery(`CREATE TABLE decimalSelection AS
      SELECT * FROM (VALUES
        ('E0', 'A', 'C', 99999999999999999999.75::DECIMAL(22,2)),
        ('E1', 'A', 'B', 99999999999999999999.25::DECIMAL(22,2)),
        ('E2', 'B', 'C', 0.25::DECIMAL(22,2)),
        ('E3', 'A', 'C', 99999999999999999999.50::DECIMAL(22,2))
      ) edges(edgeId, source, target, cost)`);
    assertEquals(
      await table.shortestPath("source", "target", "edgeId", "A", "C", {
        weight: "cost",
      }).getData(),
      [
        {
          pathId: 0,
          step: 1,
          edgeId: "E1",
          source: "A",
          target: "B",
          cost: "99999999999999999999.25",
          weight: "99999999999999999999.25",
          total: "99999999999999999999.25",
        },
        {
          pathId: 0,
          step: 2,
          edgeId: "E2",
          source: "B",
          target: "C",
          cost: "0.25",
          weight: "0.25",
          total: "99999999999999999999.50",
        },
        {
          pathId: 1,
          step: 1,
          edgeId: "E3",
          source: "A",
          target: "C",
          cost: "99999999999999999999.50",
          weight: "99999999999999999999.50",
          total: "99999999999999999999.50",
        },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath retains FLOAT ties when later addition rounds different prefixes equally", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("floatSelection");
    await sdb.customQuery(`CREATE TABLE floatSelection AS
      SELECT * FROM (VALUES
        ('E1', 'A', 'B', 1::FLOAT),
        ('E2', 'A', 'C', 1::FLOAT),
        ('E3', 'C', 'B', 1::FLOAT),
        ('E4', 'B', 'E', 33554432::FLOAT)
      ) edges(edgeId, source, target, cost)`);
    const result = table.shortestPath("source", "target", "edgeId", "A", "E", {
      weight: "cost",
    });
    assertEquals(
      await result.getData(),
      [
        {
          pathId: 0,
          step: 1,
          edgeId: "E1",
          source: "A",
          target: "B",
          cost: 1,
          weight: 1,
          total: 1,
        },
        {
          pathId: 0,
          step: 2,
          edgeId: "E4",
          source: "B",
          target: "E",
          cost: 33554432,
          weight: 33554432,
          total: 33554432,
        },
        {
          pathId: 1,
          step: 1,
          edgeId: "E2",
          source: "A",
          target: "C",
          cost: 1,
          weight: 1,
          total: 1,
        },
        {
          pathId: 1,
          step: 2,
          edgeId: "E3",
          source: "C",
          target: "B",
          cost: 1,
          weight: 1,
          total: 2,
        },
        {
          pathId: 1,
          step: 3,
          edgeId: "E4",
          source: "B",
          target: "E",
          cost: 33554432,
          weight: 33554432,
          total: 33554432,
        },
      ],
    );
    assertEquals((await result.getTypes()).total, "FLOAT");
  } finally {
    await sdb.close();
  }
});

Deno.test("route methods reject every generated-column conflict and accept renameColumns remedies", async () => {
  const sdb = new SimpleDB();
  const methods = ["shortestPath", "paths", "findCycles"] as const;
  const conflicts = ["pathId", "STEP", "Weight", "TOTAL"] as const;
  const renamed = {
    pathId: "originalPathId",
    STEP: "originalStep",
    Weight: "cost",
    TOTAL: "originalTotal",
  } as const;
  const calculate = (
    table: SimpleTable,
    method: (typeof methods)[number],
    weight?: string,
  ) => {
    const options = weight === undefined ? {} : { weight };
    if (method === "shortestPath") {
      return table.shortestPath(
        "source",
        "target",
        "edgeId",
        "A",
        "B",
        options,
      );
    }
    if (method === "paths") {
      return table.paths(
        "source",
        "target",
        "edgeId",
        "A",
        "B",
        options,
      );
    }
    return table.findCycles("source", "target", "edgeId", "A", options);
  };
  try {
    for (const method of methods) {
      for (const conflict of conflicts) {
        const rows = [
          { edgeId: "E1", source: "A", target: "B", [conflict]: 2 },
          { edgeId: "E2", source: "B", target: "A", [conflict]: 3 },
        ];
        const invalid = calculate(
          sdb.newTable().loadArray(rows),
          method,
          conflict === "Weight" ? conflict : undefined,
        );
        const error = await assertRejects(() => invalid.run(), Error);
        assertStringIncludes(error.message, `${method}()`);
        assertStringIncludes(error.message, `"${conflict}"`);
        assertStringIncludes(error.message, "renameColumns()");

        const replacement = renamed[conflict];
        const valid = calculate(
          sdb.newTable().loadArray(rows).renameColumns({
            [conflict]: replacement,
          }),
          method,
          conflict === "Weight" ? replacement : undefined,
        );
        assertEquals((await valid.getData()).length > 0, true);
      }
    }

    for (const conflict of ["start", "START"] as const) {
      const rows = [
        { edgeId: "E1", source: "A", target: "B", [conflict]: "kept" },
        { edgeId: "E2", source: "B", target: "A", [conflict]: "kept" },
      ];
      for (const method of ["shortestPath", "paths"] as const) {
        const result = calculate(sdb.newTable().loadArray(rows), method);
        assertEquals(await result.getColumns(), [
          "pathId",
          "step",
          "weight",
          "total",
          "edgeId",
          "source",
          "target",
          conflict,
        ]);
        assertEquals((await result.getData())[0]?.[conflict], "kept");
      }

      const invalid = calculate(
        sdb.newTable().loadArray(rows),
        "findCycles",
      );
      const error = await assertRejects(() => invalid.run(), Error);
      assertStringIncludes(error.message, "findCycles()");
      assertStringIncludes(error.message, `"${conflict}"`);
      assertStringIncludes(error.message, "renameColumns()");

      const empty = calculate(
        sdb.newTable().loadArray(rows).filter("FALSE"),
        "findCycles",
      );
      const emptyError = await assertRejects(() => empty.run(), Error);
      assertStringIncludes(emptyError.message, `"${conflict}"`);
      assertStringIncludes(emptyError.message, "renameColumns()");

      const valid = calculate(
        sdb.newTable().loadArray(rows).renameColumns({
          [conflict]: "originalStart",
        }),
        "findCycles",
      );
      assertEquals((await valid.getData())[0]?.originalStart, "kept");
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("route methods preserve queued typed metadata after generated columns", async () => {
  const sdb = new SimpleDB();
  const methods = ["shortestPath", "paths", "findCycles"] as const;
  try {
    for (const method of methods) {
      const input = sdb.newTable(`typed_route_metadata_${method}`);
      await sdb.customQuery(`CREATE TABLE "${input.name}" AS
        SELECT * FROM (VALUES
          ('a' COLLATE NOCASE, 1::SMALLINT, 2::INTEGER,
            1.25::DECIMAL(5, 2),
            TIMESTAMP_NS '2025-01-01 00:00:00.000000001',
            {'code': 1}, [1, 2], 'zero-a',
            'edge-meta-a', 'source-meta-a', 'target-meta-a'),
          ('A' COLLATE NOCASE, 2::SMALLINT, 1::INTEGER,
            2.50::DECIMAL(5, 2),
            TIMESTAMP_NS '2025-01-01 00:00:00.000000002',
            {'code': 2}, [3], 'zero-b',
            'edge-meta-b', 'source-meta-b', 'target-meta-b')
        ) edges(
          flightId, origin, destination, cost, happened,
          route_step, steps, "0", edgeId, source, target
        )`);
      const originalColumns = await input.getColumns();
      const originalTypes = await input.getTypes();
      const originalRows = new Map(
        (await input.getData()).map((row) => [row.flightId, row]),
      );
      input.addColumn("queued", "string", "'kept'");
      const options = { weight: "cost", outputTable: true };
      const output = method === "shortestPath"
        ? input.shortestPath(
          "origin",
          "destination",
          "flightId",
          1,
          2,
          options,
        )
        : method === "paths"
        ? input.paths(
          "origin",
          "destination",
          "flightId",
          1,
          2,
          options,
        )
        : input.findCycles(
          "origin",
          "destination",
          "flightId",
          1,
          options,
        );
      assertEquals(await output.getColumns(), [
        ...(method === "findCycles" ? ["start"] : []),
        "pathId",
        "step",
        "weight",
        "total",
        "flightId",
        "origin",
        "destination",
        "cost",
        "happened",
        "route_step",
        "steps",
        "0",
        "edgeId",
        "source",
        "target",
        "queued",
      ]);
      const types = await output.getTypes();
      if (method === "findCycles") {
        assertEquals(types.start, "INTEGER");
      }
      for (const column of originalColumns) {
        assertEquals(
          types[column],
          originalTypes[column],
          `${method}: ${column}`,
        );
      }
      const rows = await output.getData();
      assertEquals(
        rows.map((row) => row.flightId),
        method === "findCycles" ? ["a", "A"] : ["a"],
      );
      for (const row of rows) {
        assertEquals(row.queued, "kept");
        assertEquals(
          Object.fromEntries(
            originalColumns.map((column) => [column, row[column]]),
          ),
          originalRows.get(row.flightId),
          `${method}: original values for ${row.flightId}`,
        );
      }
    }
  } finally {
    await sdb.close();
  }
});
