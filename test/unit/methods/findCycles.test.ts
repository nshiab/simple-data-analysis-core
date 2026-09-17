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

function expectedCase(sdb: SimpleDB, name: string, caseName: string) {
  return sdb.newTable(name)
    .loadData("test/data/graphs/expected/find_cycles.csv")
    .filter(`"case" = '${caseName}'`)
    .removeColumns("case");
}

const chronologicalBase = Date.parse("2025-01-01T00:00:00.000Z");

function chronologicalRows(
  events: ReferenceChronologicalEvent<string, number>[],
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

function compareNumberLists(left: number[], right: number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

function smallestRotation(values: number[]): number[] {
  let smallest = values;
  for (let offset = 1; offset < values.length; offset++) {
    const rotated = [...values.slice(offset), ...values.slice(0, offset)];
    if (compareNumberLists(rotated, smallest) < 0) smallest = rotated;
  }
  return smallest;
}

function referenceChronologicalCycleRows(
  events: ReferenceChronologicalEvent<string, number>[],
  direction: "incoming" | "outgoing",
  minGap: bigint,
  strictOrdering: boolean,
) {
  type Route = ReturnType<typeof enumerateChronologicalRoutes<string, number>>[
    number
  ];
  const selected = new Map<string, { identity: number[]; route: Route }>();
  const nodes = new Set(
    events.flatMap((event) => [event.source, event.target]),
  );
  for (const start of nodes) {
    const routes = enumerateChronologicalRoutes(events, start, {
      direction,
      maxSteps: Math.max(events.length, 1),
      minGap,
      returnToStart: true,
      strictOrdering,
    });
    for (const route of routes) {
      const sequence = route.map((step) => step.event.edgeId);
      const identity = smallestRotation(sequence);
      const key = JSON.stringify(identity);
      const current = selected.get(key);
      if (
        current === undefined ||
        compareNumberLists(
            sequence,
            current.route.map((step) => step.event.edgeId),
          ) < 0
      ) {
        selected.set(key, { identity, route });
      }
    }
  }
  return [...selected.values()]
    .toSorted((left, right) =>
      compareNumberLists(left.identity, right.identity)
    )
    .flatMap(({ route }, pathId) =>
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

Deno.test("findCycles starts chronological cycles at a feasible event in both directions", async () => {
  const rows = [
    {
      edgeId: "F1",
      source: "B",
      target: "C",
      time: new Date("2025-01-01T09:00:00Z"),
      weight: 2,
    },
    {
      edgeId: "F2",
      source: "C",
      target: "A",
      time: new Date("2025-01-01T10:00:00Z"),
      weight: 3,
    },
    {
      edgeId: "F3",
      source: "A",
      target: "B",
      time: new Date("2025-01-01T11:00:00Z"),
      weight: 4,
    },
  ];
  const sdb = new SimpleDB();
  try {
    for (
      const [direction, expected] of [
        ["outgoing", [
          [0, 1, "F1", "B", "C", 2, 2],
          [0, 2, "F2", "C", "A", 3, 5],
          [0, 3, "F3", "A", "B", 4, 9],
        ]],
        ["incoming", [
          [0, 1, "F3", "B", "A", 4, 4],
          [0, 2, "F2", "A", "C", 3, 7],
          [0, 3, "F1", "C", "B", 2, 9],
        ]],
      ] as const
    ) {
      const result = sdb.newTable(`non_smallest_${direction}`).loadArray(rows)
        .findCycles("source", "target", "edgeId", {
          direction,
          startTimeColumn: "time",
          weight: "weight",
        });
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

Deno.test("findCycles applies strict, non-strict, gap, and self-loop chronology", async () => {
  const equalEvents: ReferenceChronologicalEvent<string, number>[] = [
    { edgeId: 3, source: "C", target: "A", startTime: 0n, endTime: 0n },
    { edgeId: 1, source: "A", target: "B", startTime: 0n, endTime: 0n },
    { edgeId: 2, source: "B", target: "C", startTime: 0n, endTime: 0n },
    { edgeId: 4, source: "D", target: "D", startTime: 0n, endTime: 0n },
  ];
  const gapEvents: ReferenceChronologicalEvent<string, number>[] = [
    {
      edgeId: 12,
      source: "C",
      target: "A",
      startTime: 4_000n,
      endTime: 5_000n,
    },
    { edgeId: 10, source: "A", target: "B", startTime: 0n, endTime: 1_000n },
    {
      edgeId: 11,
      source: "B",
      target: "C",
      startTime: 2_000n,
      endTime: 3_000n,
    },
  ];
  const sdb = new SimpleDB();
  try {
    const strict = sdb.newTable("strict_equal_cycles")
      .loadArray(chronologicalRows(equalEvents))
      .findCycles("source", "target", "edgeId", {
        startTimeColumn: "startTime",
        endTimeColumn: "endTime",
      });
    assertEquals((await strict.getData()).map((row) => row.edgeId), [4]);

    for (const direction of ["outgoing", "incoming"] as const) {
      const expected = referenceChronologicalCycleRows(
        equalEvents,
        direction,
        0n,
        false,
      );
      for (
        const [order, events] of [equalEvents, equalEvents.toReversed()]
          .entries()
      ) {
        const actual = sdb.newTable(`equal_${direction}_${order}`)
          .loadArray(chronologicalRows(events))
          .findCycles("source", "target", "edgeId", {
            direction,
            startTimeColumn: "startTime",
            endTimeColumn: "endTime",
            strictOrdering: false,
          });
        assertEquals(await actual.getData(), expected);
      }
    }

    const inclusive = sdb.newTable("inclusive_gap_cycles")
      .loadArray(chronologicalRows(gapEvents))
      .findCycles("source", "target", "edgeId", {
        startTimeColumn: "startTime",
        endTimeColumn: "endTime",
        minGapMs: 1_000,
      });
    assertEquals((await inclusive.getData()).map((row) => row.edgeId), [
      10,
      11,
      12,
    ]);
    const above = sdb.newTable("above_gap_cycles")
      .loadArray(chronologicalRows(gapEvents))
      .findCycles("source", "target", "edgeId", {
        startTimeColumn: "startTime",
        endTimeColumn: "endTime",
        minGapMs: 1_001,
      });
    assertEquals(await above.getData(), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles preserves nanoseconds with an end-only inclusive gap", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("nanosecond_cycles");
    await sdb.customQuery(`CREATE TABLE "nanosecond_cycles" AS
      SELECT * FROM (VALUES
        (1, 'B', 'C', TIMESTAMP_NS '2025-01-01 00:00:00.000000001'),
        (2, 'C', 'A', TIMESTAMP_NS '2025-01-01 00:00:00.001000001'),
        (3, 'A', 'B', TIMESTAMP_NS '2025-01-01 00:00:00.002000001')
      ) AS events(edgeId, source, target, eventTime)`);
    for (const direction of ["outgoing", "incoming"] as const) {
      const exact = table.findCycles("source", "target", "edgeId", {
        direction,
        endTimeColumn: "eventTime",
        minGapMs: 1,
        outputTable: true,
      });
      assertEquals(
        (await exact.getData()).map((row) => row.edgeId),
        direction === "outgoing" ? [1, 2, 3] : [3, 2, 1],
      );
      const above = table.findCycles("source", "target", "edgeId", {
        direction,
        endTimeColumn: "eventTime",
        minGapMs: 2,
        outputTable: true,
      });
      assertEquals(await above.getData(), []);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles keeps mixed-precision gap boundaries and isolated self-loops", async () => {
  const sdb = new SimpleDB();
  try {
    for (
      const [nanoseconds, end] of [
        [999_999, "2025-01-01 00:00:00.000000001"],
        [1_000_000, "2025-01-01 00:00:00"],
        [1_000_001, "2024-12-31 23:59:59.999999999"],
      ] as const
    ) {
      const table = sdb.newTable(`mixed_precision_cycles_${nanoseconds}`);
      await sdb.customQuery(`CREATE TABLE "${table.name}" AS
        SELECT * FROM (VALUES
          (2, 'B', 'A', TIMESTAMP '2024-12-31 23:59:59.999999',
            TIMESTAMP_NS '${end}'),
          (1, 'A', 'B', TIMESTAMP '2025-01-01 00:00:00.001000',
            TIMESTAMP_NS '2025-01-01 00:00:00.001000001'),
          (3, 'Q', 'Q', TIMESTAMP '2025-01-01', TIMESTAMP_NS '2025-01-01')
        ) AS events(edgeId, source, target, departure, arrival)`);
      for (const direction of ["outgoing", "incoming"] as const) {
        for (const strictOrdering of [true, false]) {
          const actual = table.findCycles("source", "target", "edgeId", {
            direction,
            startTimeColumn: "departure",
            endTimeColumn: "arrival",
            minGapMs: 1,
            strictOrdering,
            outputTable: true,
          });
          assertEquals(
            (await actual.getData()).map((row) => row.edgeId),
            nanoseconds < 1_000_000
              ? [3]
              : direction === "outgoing"
              ? [2, 1, 3]
              : [1, 2, 3],
          );
        }
        const isolated = table.findCycles("source", "target", "edgeId", {
          direction,
          startTimeColumn: "departure",
          endTimeColumn: "arrival",
          minGapMs: Number.MAX_SAFE_INTEGER,
          outputTable: true,
        });
        assertEquals((await isolated.getData()).map((row) => row.edgeId), [3]);
      }
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles normalizes temporal binary IDs while preserving decimal totals", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("temporal_collated_cycles");
    await sdb.customQuery(`CREATE TABLE "temporal_collated_cycles" (
      edgeId VARCHAR COLLATE NOCASE, source VARCHAR COLLATE NOCASE,
      target VARCHAR COLLATE NOCASE, time TIMESTAMP, weight DECIMAL(22,2)
    ); INSERT INTO "temporal_collated_cycles" VALUES
      ('a', 'A', 'B', TIMESTAMP '2025-01-01', 99999999999999999999.25),
      ('Z', 'B', 'A', TIMESTAMP '2025-01-01', 0.50),
      ('A', 'a', 'b', TIMESTAMP '2025-01-01', 1.25),
      ('z', 'b', 'a', TIMESTAMP '2025-01-01', 2.50)`);
    for (const direction of ["outgoing", "incoming"] as const) {
      const result = table.findCycles("source", "target", "edgeId", {
        direction,
        startTimeColumn: "time",
        strictOrdering: false,
        weight: "weight",
        outputTable: true,
      }).convert({ weight: "string", total: "string" });
      assertEquals(
        (await result.getData()).map((
          row,
        ) => [row.pathId, row.edgeId, row.total]),
        [
          [0, "A", "1.25"],
          [0, "z", "3.75"],
          [1, "Z", "0.50"],
          [1, "a", "99999999999999999999.75"],
        ],
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles keeps exact IDs when canonical identity differs from the feasible rotation", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("wide_temporal_cycles");
    await sdb.customQuery(`CREATE TABLE "wide_temporal_cycles" AS
      SELECT * FROM (VALUES
        (9007199254740995::BIGINT, 9007199254741001::BIGINT,
          9007199254741003::BIGINT,
          TIMESTAMP_NS '2025-01-01 00:00:00.000000001'),
        (9007199254740997::BIGINT, 9007199254741003::BIGINT,
          9007199254741005::BIGINT,
          TIMESTAMP_NS '2025-01-01 00:00:00.000000002'),
        (9007199254740993::BIGINT, 9007199254741005::BIGINT,
          9007199254741001::BIGINT,
          TIMESTAMP_NS '2025-01-01 00:00:00.000000003')
      ) AS events(edgeId, source, target, eventTime)`);
    const result = table.findCycles("source", "target", "edgeId", {
      startTimeColumn: "eventTime",
      outputTable: true,
    }).convert({ edgeId: "string", source: "string", target: "string" });
    assertEquals(
      (await result.getData()).map((row) => [
        row.pathId,
        row.edgeId,
        row.source,
        row.target,
      ]),
      [
        [0, "9007199254740995", "9007199254741001", "9007199254741003"],
        [0, "9007199254740997", "9007199254741003", "9007199254741005"],
        [0, "9007199254740993", "9007199254741005", "9007199254741001"],
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("findCycles preserves temporal parallel identities and deterministic cycle IDs", async () => {
  const events: ReferenceChronologicalEvent<string, number>[] = [
    { edgeId: 20, source: "B", target: "C", startTime: 0n, endTime: 0n },
    { edgeId: 10, source: "B", target: "C", startTime: 0n, endTime: 0n },
    {
      edgeId: 30,
      source: "C",
      target: "A",
      startTime: 1_000n,
      endTime: 1_000n,
    },
    {
      edgeId: 40,
      source: "A",
      target: "B",
      startTime: 2_000n,
      endTime: 2_000n,
    },
  ];
  const expected = referenceChronologicalCycleRows(
    events,
    "outgoing",
    0n,
    true,
  );
  const sdb = new SimpleDB();
  try {
    for (const [order, rows] of [events, events.toReversed()].entries()) {
      const actual = sdb.newTable(`parallel_temporal_${order}`)
        .loadArray(chronologicalRows(rows))
        .findCycles("source", "target", "edgeId", {
          startTimeColumn: "startTime",
          endTimeColumn: "endTime",
          outputTable: true,
        });
      assertEquals(await actual.getData(), expected);
    }
    assertEquals(expected.map((row) => [row.pathId, row.edgeId]), [
      [0, 10],
      [0, 30],
      [0, 40],
      [1, 20],
      [1, 30],
      [1, 40],
    ]);
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
    for (
      const options of [
        { minGapMs: 0 },
        { strictOrdering: false },
      ]
    ) {
      assertThrows(
        () => table.findCycles("source", "target", "edgeId", options),
        TypeError,
        "require options.startTimeColumn or options.endTimeColumn",
      );
    }
    assertThrows(
      () =>
        table.findCycles("source", "target", "edgeId", {
          direction: "both",
          startTimeColumn: "time",
        }),
      TypeError,
      'cannot be "both"',
    );
    assertThrows(
      () =>
        table.findCycles("source", "target", "edgeId", {
          startTimeColumn: 1 as unknown as string,
        }),
      TypeError,
      "options.startTimeColumn must be a string",
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
    await assertRejects(
      () =>
        table.findCycles("source", "target", "edgeId", {
          startTimeColumn: "source",
        }).run(),
      TypeError,
      "requires DATE or TIMESTAMP chronological columns",
    );
    const mixedTimes = sdb.newTable("mixed_cycle_times");
    await sdb.customQuery(`CREATE TABLE "mixed_cycle_times" (
      edgeId INTEGER, source VARCHAR, target VARCHAR,
      departure TIMESTAMPTZ, arrival TIMESTAMP
    )`);
    await assertRejects(
      () =>
        mixedTimes.findCycles("source", "target", "edgeId", {
          startTimeColumn: "departure",
          endTimeColumn: "arrival",
        }).run(),
      TypeError,
      "cannot mix time-zone-aware and time-zone-naive",
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

Deno.test("findCycles snapshots chronological options across queued conversion", async () => {
  const sdb = new SimpleDB();
  try {
    const options = {
      startTimeColumn: "time",
      strictOrdering: true,
      outputTable: "chronologicalCycleSnapshot",
    };
    const source = sdb.newTable().loadArray([
      { edgeId: "E1", source: "B", target: "C", time: "2025-01-01 09:00:00" },
      { edgeId: "E2", source: "C", target: "A", time: "2025-01-01 10:00:00" },
      { edgeId: "E3", source: "A", target: "B", time: "2025-01-01 11:00:00" },
    ]).convert({ time: "datetime" });
    const result = source.findCycles("source", "target", "edgeId", options);
    options.startTimeColumn = "missing";
    options.strictOrdering = false;
    options.outputTable = "changed";
    assertEquals(result.name, "chronologicalCycleSnapshot");
    assertEquals((await result.getData()).map((row) => row.edgeId), [
      "E1",
      "E2",
      "E3",
    ]);
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

for (const chronological of [false, true]) {
  Deno.test(`findCycles ${chronological ? "chronological" : "static"} output records its source as a cache dependency`, async () => {
    let computationRuns = 0;
    const unique = crypto.randomUUID().replaceAll("-", "");
    const outputName = `cyclesCacheOutput${unique}`;
    const sourceName = `cyclesCacheSource${unique}`;
    const compute = (source: SimpleTable) => async (output: SimpleTable) => {
      computationRuns++;
      const result = source.findCycles("source", "target", "edgeId", {
        outputTable: true,
        ...(chronological ? { startTimeColumn: "time" } : {}),
      });
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
          target: "A",
          time: new Date(chronologicalBase + 1_000),
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
          target: "A",
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

Deno.test("findCycles matches independently normalized generated chronological cycles", async () => {
  const generate = (seed: number) => {
    let state = seed;
    const random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    };
    const nodes = ["A", "B", "C", "D"];
    const events: ReferenceChronologicalEvent<string, number>[] = [
      {
        edgeId: seed * 100 + 1,
        source: "B",
        target: "C",
        startTime: 0n,
        endTime: 0n,
      },
      {
        edgeId: seed * 100 + 2,
        source: "C",
        target: "A",
        startTime: 2_000n,
        endTime: 2_000n,
      },
      {
        edgeId: seed * 100 + 3,
        source: "A",
        target: "B",
        startTime: 4_000n,
        endTime: 4_000n,
      },
    ];
    for (let index = 0; index < 5; index++) {
      const sourceIndex = random() % nodes.length;
      const targetIndex = random() % nodes.length;
      const startTime = BigInt(random() % 5) * 1_000n;
      const duration = BigInt(random() % 2) * 1_000n;
      events.push({
        edgeId: seed * 100 + index + 10,
        source: nodes[sourceIndex],
        target: nodes[targetIndex],
        startTime,
        endTime: startTime + duration,
      });
    }
    return events;
  };

  const generated = Array.from(
    { length: 6 },
    (_, index) => generate(index + 1),
  );
  const extras = generated.flatMap((events) => events.slice(3));
  assertEquals(new Set(extras.map((event) => event.source)).size, 4);
  assertEquals(new Set(extras.map((event) => event.target)).size, 4);
  assertEquals(
    extras.some((event) => event.endTime! > event.startTime!),
    true,
  );

  const sdb = new SimpleDB();
  try {
    for (let seed = 1; seed <= 6; seed++) {
      const events = generated[seed - 1];
      for (const direction of ["outgoing", "incoming"] as const) {
        for (const strictOrdering of [true, false]) {
          const minGap = seed % 2 === 0 ? 1_000n : 0n;
          const expected = referenceChronologicalCycleRows(
            events,
            direction,
            minGap,
            strictOrdering,
          );
          assertEquals(expected.length > 0, true, `seed ${seed}`);
          for (
            const [order, rows] of [events, events.toReversed()].entries()
          ) {
            const actual = sdb.newTable(
              `generated_cycles_${seed}_${direction}_${strictOrdering}_${order}`,
            ).loadArray(chronologicalRows(rows)).findCycles(
              "source",
              "target",
              "edgeId",
              {
                direction,
                startTimeColumn: "startTime",
                endTimeColumn: "endTime",
                minGapMs: Number(minGap),
                strictOrdering,
              },
            );
            assertEquals(
              await actual.getData(),
              expected,
              `seed ${seed}, ${direction}, strict=${strictOrdering}, order ${order}`,
            );
          }
        }
      }
    }
  } finally {
    await sdb.close();
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

Deno.test("findCycles executes all eight JSDoc examples with their displayed rows", async () => {
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
    for (
      const [direction, rows] of [
        ["outgoing", [
          [0, 1, "F1", "B", "C", 1, 1],
          [0, 2, "F2", "C", "A", 1, 2],
          [0, 3, "F3", "A", "B", 1, 3],
        ]],
        ["incoming", [
          [0, 1, "F3", "B", "A", 1, 1],
          [0, 2, "F2", "A", "C", 1, 2],
          [0, 3, "F1", "C", "B", 1, 3],
        ]],
      ] as const
    ) {
      const timedFlights = sdb.newTable(`doc_cycles_timed_${direction}`)
        .loadArray([
          {
            flightId: "F1",
            origin: "B",
            destination: "C",
            departureTime: new Date("2025-01-01T09:00:00Z"),
          },
          {
            flightId: "F2",
            origin: "C",
            destination: "A",
            departureTime: new Date("2025-01-01T10:00:00Z"),
          },
          {
            flightId: "F3",
            origin: "A",
            destination: "B",
            departureTime: new Date("2025-01-01T11:00:00Z"),
          },
        ]);
      await timedFlights
        .findCycles("origin", "destination", "flightId", {
          ...(direction === "incoming" ? { direction } : {}),
          startTimeColumn: "departureTime",
        })
        .log();
      assertEquals(
        await timedFlights.getData(),
        expectedRows(rows.map((row) => [...row])),
      );
    }
  } finally {
    await sdb.close();
  }
});
