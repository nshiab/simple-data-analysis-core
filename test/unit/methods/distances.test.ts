import { test, expect } from "vite-plus/test";
import { assertThrows, assertRejects } from "../../helpers/assertions.ts";

import { observeSdaQueries } from "../../../benchmarks/queryProfile.ts";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import type SimpleTable from "../../../src/class/SimpleTable.ts";
import {
  enumerateChronologicalRoutes,
  type ReferenceChronologicalEvent,
} from "../../helpers/enumerateChronologicalRoutes.ts";

const chronologicalBase = Date.parse("2025-01-01T00:00:00.000Z");

type WeightedChronologicalEvent = ReferenceChronologicalEvent<string, number> & { weight: number };

function chronologicalRows(events: WeightedChronologicalEvent[]) {
  return events.map((event) => ({
    ...event,
    startTime:
      event.startTime === null ? null : new Date(chronologicalBase + Number(event.startTime)),
    endTime: event.endTime === null ? null : new Date(chronologicalBase + Number(event.endTime)),
  }));
}

function referenceChronologicalDistances(
  events: WeightedChronologicalEvent[],
  starts: string[],
  direction: "outgoing" | "incoming",
  minGap: bigint,
  strictOrdering: boolean,
) {
  const weights = new Map(events.map((event) => [event.edgeId, event.weight]));
  const candidates = starts.flatMap((start) =>
    referenceSimpleJourneys(events, start, {
      direction,
      minGap,
      strictOrdering,
    }).map((route) => ({
      start,
      node: route.at(-1)!.target,
      steps: route.length,
      total: route.reduce((sum, step) => sum + weights.get(step.event.edgeId)!, 0),
    })),
  );
  return distinctOptimalSummaries(candidates, "total").sort(
    (left, right) =>
      left.start.localeCompare(right.start) ||
      left.total - right.total ||
      left.node.localeCompare(right.node) ||
      left.steps - right.steps,
  );
}

function referenceSimpleJourneys(
  events: WeightedChronologicalEvent[],
  start: string,
  options: {
    direction: "outgoing" | "incoming";
    minGap: bigint;
    strictOrdering: boolean;
  },
) {
  return [false, true].flatMap((returnToStart) =>
    enumerateChronologicalRoutes(events, start, {
      ...options,
      maxSteps: events.length,
      returnToStart,
    }),
  );
}

function distinctOptimalSummaries<
  T extends { start: string; node: string; steps: number; total: number },
>(candidates: T[], metric: keyof T): T[] {
  const optimal = candidates.filter(
    (row) =>
      !candidates.some(
        (other) =>
          other.start === row.start && other.node === row.node && other[metric] < row[metric],
      ),
  );
  return [...new Map(optimal.map((row) => [JSON.stringify(row), row])).values()];
}

function loadScenario(
  sdb: SimpleDB,
  name: string,
  scenario: string,
  weighted = false,
): SimpleTable {
  const columns = weighted ? ["source", "target", "weight"] : ["source", "target"];
  return sdb
    .newTable(name)
    .loadData("test/data/graphs/edges.csv")
    .filter(`scenario = '${scenario}'`)
    .selectColumns(columns);
}

test("distances defaults to outgoing and supports every direction", async () => {
  const sdb = new SimpleDB();
  try {
    const expectedOutgoing = [
      { start: "A", node: "B", steps: 1 },
      { start: "A", node: "C", steps: 1 },
      { start: "A", node: "D", steps: 2 },
      { start: "A", node: "E", steps: 3 },
    ];
    expect(
      await loadScenario(sdb, "outgoing", "baseline").distances("source", "target", "A").getData(),
    ).toStrictEqual(expectedOutgoing);
    expect(
      await loadScenario(sdb, "explicitOutgoing", "baseline")
        .distances("source", "target", "A", { direction: "outgoing" })
        .getData(),
    ).toStrictEqual(expectedOutgoing);
    expect(
      await loadScenario(sdb, "incoming", "baseline")
        .distances("source", "target", "E", { direction: "incoming" })
        .getData(),
    ).toStrictEqual([
      { start: "E", node: "D", steps: 1 },
      { start: "E", node: "B", steps: 2 },
      { start: "E", node: "C", steps: 2 },
      { start: "E", node: "A", steps: 3 },
    ]);
    expect(
      await loadScenario(sdb, "both", "baseline")
        .distances("source", "target", "B", { direction: "both" })
        .getData(),
    ).toStrictEqual([
      { start: "B", node: "A", steps: 1 },
      { start: "B", node: "D", steps: 1 },
      { start: "B", node: "B", steps: 2 },
      { start: "B", node: "C", steps: 2 },
      { start: "B", node: "E", steps: 2 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances minimizes hops and weighted costs independently", async () => {
  const sdb = new SimpleDB();
  try {
    expect(
      await loadScenario(sdb, "unweighted", "weighted", true)
        .distances("source", "target", "A")
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1 },
      { start: "A", node: "C", steps: 1 },
      { start: "A", node: "E", steps: 1 },
      { start: "A", node: "D", steps: 2 },
    ]);
    const weighted = loadScenario(sdb, "weighted", "weighted", true).distances(
      "source",
      "target",
      "A",
      { weight: "weight" },
    );
    expect(await weighted.getData()).toStrictEqual([
      { start: "A", node: "C", steps: 1, total: 0 },
      { start: "A", node: "B", steps: 1, total: 1 },
      { start: "A", node: "D", steps: 2, total: 2 },
      { start: "A", node: "E", steps: 2, total: 3 },
      { start: "A", node: "E", steps: 3, total: 3 },
    ]);
    expect((await weighted.getTypes()).total).toStrictEqual("DOUBLE");
  } finally {
    await sdb.close();
  }
});

test("distances handles cycles, zero cycles, and competing parallel edges", async () => {
  const sdb = new SimpleDB();
  try {
    expect(
      await loadScenario(sdb, "cycle", "cycle").distances("source", "target", "A").getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1 },
      { start: "A", node: "C", steps: 1 },
      { start: "A", node: "D", steps: 2 },
      { start: "A", node: "E", steps: 3 },
      { start: "A", node: "A", steps: 4 },
    ]);
    expect(
      await loadScenario(sdb, "zeroCycle", "zero-cycle", true)
        .distances("source", "target", "A", { weight: "weight" })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 0 },
      { start: "A", node: "A", steps: 3, total: 2 },
      { start: "A", node: "C", steps: 2, total: 2 },
    ]);
    expect(
      await loadScenario(sdb, "parallel", "parallel", true)
        .distances("source", "target", "A", { weight: "weight" })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 1 },
      { start: "A", node: "C", steps: 2, total: 6 },
    ]);
    expect(
      await loadScenario(sdb, "singleLoop", "single-loop", true)
        .distances("source", "target", "A", { weight: "weight" })
        .getData(),
    ).toStrictEqual([{ start: "A", node: "A", steps: 1, total: 0 }]);
  } finally {
    await sdb.close();
  }
});

test("distances includes actual self-connections at their shortest cost", async () => {
  const sdb = new SimpleDB();
  try {
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      for (const weight of [undefined, "cost"]) {
        expect(
          await sdb
            .newTable()
            .loadArray([
              { source: "A", target: "A", cost: 5 },
              { source: "A", target: "A", cost: 2 },
            ])
            .distances("source", "target", "A", { direction, weight })
            .getData(),
        ).toStrictEqual([
          {
            start: "A",
            node: "A",
            steps: 1,
            ...(weight ? { total: 2 } : {}),
          },
        ]);
      }
      expect(
        await sdb
          .newTable()
          .loadArray([{ source: "A", target: "A", cost: 0 }])
          .distances("source", "target", "A", { direction, weight: "cost" })
          .getData(),
      ).toStrictEqual([{ start: "A", node: "A", steps: 1, total: 0 }]);
    }
  } finally {
    await sdb.close();
  }
});

test("distances chooses the shortest actual return in every direction", async () => {
  const sdb = new SimpleDB();
  try {
    for (const selfConnection of [false, true]) {
      const rows = [
        { source: "A", target: "B", cost: 2 },
        { source: "B", target: "A", cost: 3 },
        ...(selfConnection ? [{ source: "A", target: "A", cost: 10 }] : []),
      ];
      for (const direction of ["outgoing", "incoming", "both"] as const) {
        expect(
          await sdb
            .newTable()
            .loadArray(rows)
            .distances("source", "target", "A", { direction, weight: "cost" })
            .getData(),
        ).toStrictEqual([
          {
            start: "A",
            node: "B",
            steps: 1,
            total: direction === "incoming" ? 3 : 2,
          },
          {
            start: "A",
            node: "A",
            steps: 2,
            total: direction === "both" ? 4 : 5,
          },
        ]);
        expect(
          await sdb
            .newTable()
            .loadArray(rows)
            .distances("source", "target", "A", { direction })
            .getData(),
        ).toStrictEqual(
          selfConnection
            ? [
                { start: "A", node: "A", steps: 1 },
                {
                  start: "A",
                  node: "B",
                  steps: 1,
                },
              ]
            : [
                { start: "A", node: "B", steps: 1 },
                {
                  start: "A",
                  node: "A",
                  steps: 2,
                },
              ],
        );
      }
    }
  } finally {
    await sdb.close();
  }
});

test("distances keeps fractional decimal and close floating costs exact", async () => {
  const sdb = new SimpleDB();
  try {
    const fractional = loadScenario(sdb, "fractional", "fraction-weight", true).distances(
      "source",
      "target",
      "A",
      { weight: "weight" },
    );
    expect(await fractional.getData()).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 0.5 },
      { start: "A", node: "C", steps: 2, total: 1.75 },
    ]);

    const decimal = sdb.newTable("decimalWeights");
    await sdb.customQuery(`CREATE TABLE "decimalWeights" AS
      SELECT * FROM (VALUES
        ('A', 'C', 0.31::DECIMAL(6,2)),
        ('A', 'B', 0.10::DECIMAL(6,2)),
        ('B', 'C', 0.20::DECIMAL(6,2))
      ) edges(source, target, weight)`);
    decimal.distances("source", "target", "A", { weight: "weight" });
    expect(await decimal.getTypes()).toStrictEqual({
      start: "VARCHAR",
      node: "VARCHAR",
      steps: "BIGINT",
      total: "DECIMAL(38,2)",
    });
    expect(await decimal.getData()).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: "0.10" },
      { start: "A", node: "C", steps: 2, total: "0.30" },
    ]);

    const floating = sdb.newTable("floatingWeights");
    await sdb.customQuery(`CREATE TABLE "floatingWeights" AS
      SELECT * FROM (VALUES
        ('A', 'C', 1.0000000000001::DOUBLE),
        ('A', 'B', 0.5::DOUBLE),
        ('B', 'C', 0.5::DOUBLE)
      ) edges(source, target, weight)`);
    floating.distances("source", "target", "A", { weight: "weight" });
    expect(await floating.getData()).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 0.5 },
      { start: "A", node: "C", steps: 2, total: 1 },
    ]);
    expect((await floating.getTypes()).total).toStrictEqual("DOUBLE");
  } finally {
    await sdb.close();
  }
});

test("distances widens large integer accumulators without losing precision", async () => {
  const sdb = new SimpleDB();
  try {
    const bigint = sdb.newTable("bigintWeights");
    await sdb.customQuery(`CREATE TABLE "bigintWeights" AS
      SELECT * FROM (VALUES
        ('A', 'B', 9007199254740993::BIGINT),
        ('B', 'C', 2::BIGINT)
      ) edges(source, target, weight)`);
    bigint.distances("source", "target", "A", { weight: "weight" }).convert({ total: "string" });
    expect(await bigint.getData()).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: "9007199254740993" },
      { start: "A", node: "C", steps: 2, total: "9007199254740995" },
    ]);

    const maximum = "170141183460469231731687303715884105727";
    const hugeint = sdb.newTable("hugeintWeights");
    await sdb.customQuery(`CREATE TABLE "hugeintWeights" AS
      SELECT * FROM (VALUES
        ('A', 'B', '${maximum}'::HUGEINT),
        ('B', 'C', '${maximum}'::HUGEINT)
      ) edges(source, target, weight)`);
    hugeint.distances("source", "target", "A", { weight: "weight" });
    expect((await hugeint.getTypes()).total).toStrictEqual("BIGNUM");
    expect(await hugeint.getData()).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: maximum },
      {
        start: "A",
        node: "C",
        steps: 2,
        total: "340282366920938463463374607431768211454",
      },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances evaluates multi-starts independently and omits unknowns", async () => {
  const sdb = new SimpleDB();
  try {
    expect(
      await loadScenario(sdb, "multi", "baseline")
        .distances("source", "target", ["F", "unknown", "A"])
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1 },
      { start: "A", node: "C", steps: 1 },
      { start: "A", node: "D", steps: 2 },
      { start: "A", node: "E", steps: 3 },
      { start: "F", node: "G", steps: 1 },
    ]);
    expect(
      await loadScenario(sdb, "sink", "single").distances("source", "target", "B").getData(),
    ).toStrictEqual([]);
    expect(
      await loadScenario(sdb, "unknown", "baseline")
        .distances("source", "target", "unknown")
        .getData(),
    ).toStrictEqual([]);
  } finally {
    await sdb.close();
  }
});

for (const chronological of [false, true]) {
  test(`distances ${chronological ? "chronological" : "static"} preserves unsigned, arbitrary integer, and FLOAT sum types`, async () => {
    const temporalOptions = chronological ? { startTimeColumn: "time", strictOrdering: false } : {};
    const sdb = new SimpleDB();
    try {
      for (const [type, maximum, distanceType] of [
        ["UBIGINT", "18446744073709551615", "HUGEINT"],
        ["UHUGEINT", "340282366920938463463374607431768211455", "BIGNUM"],
        ["BIGNUM", "9".repeat(80), "BIGNUM"],
      ]) {
        const table = sdb.newTable(`weights${type}`);
        await sdb.customQuery(`CREATE TABLE "${table.name}" AS
        SELECT *, TIMESTAMP '2025-01-01' AS time FROM (VALUES
          ('A', 'B', '${maximum}'::${type}),
          ('B', 'C', '${maximum}'::${type})
        ) edges(source, target, weight)`);
        table.distances("source", "target", "A", {
          weight: "weight",
          ...temporalOptions,
        });
        expect((await table.getTypes()).total).toStrictEqual(distanceType);
        expect(await table.convert({ total: "string" }).getData()).toStrictEqual([
          { start: "A", node: "B", steps: 1, total: maximum },
          {
            start: "A",
            node: "C",
            steps: 2,
            total: String(BigInt(maximum) * 2n),
          },
        ]);
      }

      const floating = sdb.newTable("singlePrecisionWeights");
      await sdb.customQuery(`CREATE TABLE "singlePrecisionWeights" AS
      SELECT *, TIMESTAMP '2025-01-01' AS time FROM (VALUES
        ('A', 'B', 16777216::FLOAT),
        ('B', 'C', 1::FLOAT),
        ('C', 'B', 0::FLOAT)
      ) edges(source, target, weight)`);
      floating.distances("source", "target", "A", {
        weight: "weight",
        ...temporalOptions,
      });
      expect((await floating.getTypes()).total).toStrictEqual("FLOAT");
      expect(await floating.getData()).toStrictEqual([
        { start: "A", node: "B", steps: 1, total: 16777216 },
        { start: "A", node: "C", steps: 2, total: 16777216 },
      ]);
    } finally {
      await sdb.close();
    }
  });
}

test("distances weighted relaxation agrees with all-pairs costs in every direction", async () => {
  const sdb = new SimpleDB();
  const edges = [
    { source: 0, target: 1, weight: 9 },
    { source: 0, target: 2, weight: 1 },
    { source: 2, target: 1, weight: 1 },
    { source: 1, target: 3, weight: 1 },
    { source: 1, target: 3, weight: 8 },
    { source: 3, target: 4, weight: 0 },
    { source: 4, target: 3, weight: 0 },
    { source: 5, target: 5, weight: 0 },
  ];
  try {
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      const costs = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => Infinity));
      const steps = costs.map((row) => row.map(() => Infinity));
      for (const { source, target, weight } of edges) {
        if (direction !== "incoming") {
          costs[source][target] = Math.min(costs[source][target], weight);
          steps[source][target] = 1;
        }
        if (direction !== "outgoing") {
          costs[target][source] = Math.min(costs[target][source], weight);
          steps[target][source] = 1;
        }
      }
      for (let via = 0; via < 6; via++) {
        for (let from = 0; from < 6; from++) {
          for (let to = 0; to < 6; to++) {
            const cost = costs[from][via] + costs[via][to];
            const count = steps[from][via] + steps[via][to];
            if (cost < costs[from][to] || (cost === costs[from][to] && count < steps[from][to])) {
              costs[from][to] = cost;
              steps[from][to] = count;
            }
          }
        }
      }
      const expected = costs
        .flatMap((row, start) =>
          row.flatMap((total, node) =>
            Number.isFinite(total) ? [{ start, node, steps: steps[start][node], total }] : [],
          ),
        )
        .toSorted((a, b) => a.start - b.start || a.total - b.total || a.node - b.node);
      for (const rows of [edges, edges.toReversed()]) {
        expect(
          await sdb
            .newTable()
            .loadArray(rows)
            .distances("source", "target", [5, 4, 99, 3, 2, 1, 0], {
              direction,
              weight: "weight",
            })
            .getData(),
        ).toStrictEqual(expected);
      }
    }
  } finally {
    await sdb.close();
  }
});

test("distances sorts multi-start results in every direction", async () => {
  const sdb = new SimpleDB();
  const edges = [
    { source: "A", target: "B" },
    { source: "B", target: "C" },
    { source: "X", target: "Y" },
  ];
  const expected = {
    outgoing: [
      { start: "A", node: "B", steps: 1 },
      { start: "A", node: "C", steps: 2 },
    ],
    incoming: [
      { start: "C", node: "B", steps: 1 },
      { start: "C", node: "A", steps: 2 },
    ],
    both: [
      { start: "A", node: "B", steps: 1 },
      { start: "A", node: "A", steps: 2 },
      { start: "A", node: "C", steps: 2 },
      { start: "C", node: "B", steps: 1 },
      { start: "C", node: "A", steps: 2 },
      { start: "C", node: "C", steps: 2 },
    ],
  };
  try {
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      for (const rows of [edges, edges.toReversed()]) {
        expect(
          await sdb
            .newTable()
            .loadArray(rows)
            .distances("source", "target", ["C", "unknown", "A"], {
              direction,
            })
            .getData(),
        ).toStrictEqual(expected[direction]);
      }
    }
  } finally {
    await sdb.close();
  }
});

test("distances scalar and singleton-array starts are equivalent", async () => {
  const sdb = new SimpleDB();
  try {
    const scalar = loadScenario(sdb, "scalar", "baseline").distances("source", "target", "A");
    const singleton = loadScenario(sdb, "singleton", "baseline").distances("source", "target", [
      "A",
    ]);
    expect(await scalar.getData()).toStrictEqual(await singleton.getData());
    expect(await scalar.getTypes()).toStrictEqual(await singleton.getTypes());
  } finally {
    await sdb.close();
  }
});

test("distances supports numeric zero, numeric ordering, and custom columns", async () => {
  const sdb = new SimpleDB();
  try {
    const numeric = sdb
      .newTable("numeric")
      .loadData("test/data/graphs/numeric.csv")
      .distances("source", "target", 0, { weight: "weight" });
    expect(await numeric.getData()).toStrictEqual([
      { start: 0, node: 2, steps: 1, total: 0 },
      { start: 0, node: 10, steps: 1, total: 1 },
      { start: 0, node: 10, steps: 2, total: 1 },
    ]);
    expect(await numeric.getTypes()).toStrictEqual({
      start: "BIGINT",
      node: "BIGINT",
      steps: "BIGINT",
      total: "HUGEINT",
    });

    const custom = sdb
      .newTable("custom")
      .loadData("test/data/graphs/custom-columns.csv")
      .distances("ORIGIN", "Destination", "A", { weight: "COST" });
    expect(await custom.getData()).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 1 },
      { start: "A", node: "C", steps: 2, total: 3 },
    ]);
    expect(await custom.getColumns()).toStrictEqual(["start", "node", "steps", "total"]);
  } finally {
    await sdb.close();
  }
});

test("distances preserves exact decimal endpoint IDs through recursion", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("decimalIds");
    await sdb.customQuery(`CREATE TABLE "decimalIds" AS
      SELECT * FROM (VALUES
        (1::DECIMAL(20,0), 9007199254740993::DECIMAL(20,0)),
        (9007199254740993::DECIMAL(20,0), 9007199254740995::DECIMAL(20,0))
      ) edges(source, target)`);
    table.distances("source", "target", 9007199254740993n);
    expect(await table.getTypes()).toStrictEqual({
      start: "DECIMAL(20,0)",
      node: "DECIMAL(20,0)",
      steps: "BIGINT",
    });
    expect(await table.getData()).toStrictEqual([
      {
        start: "9007199254740993",
        node: "9007199254740995",
        steps: 1,
      },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances orders numeric starts and tied nodes by their numeric values", async () => {
  const sdb = new SimpleDB();
  try {
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      const rows = [10, 2].flatMap((source) =>
        [100, 20, -1].map((target) =>
          direction === "incoming"
            ? { source: target, target: source, cost: 0 }
            : { source, target, cost: 0 },
        ),
      );
      const expected = [2, 10].flatMap((start) =>
        (direction === "both" ? [-1, 2, 10, 20, 100] : [-1, 20, 100]).flatMap((node) => {
          // In this complete bipartite graph, a simple route can cross
          // through the other start once, then optionally close its cycle.
          const steps =
            direction !== "both"
              ? [1]
              : [100, 20, -1].includes(node)
                ? [1, 3]
                : node === start
                  ? [2, 4]
                  : [2];
          return steps.map((steps) => ({ start, node, steps, total: 0 }));
        }),
      );
      for (const edges of [rows, rows.toReversed()]) {
        expect(
          await sdb
            .newTable()
            .loadArray(edges)
            .distances("source", "target", [10, 2], {
              direction,
              weight: "cost",
            })
            .getData(),
        ).toStrictEqual(expected);
      }
    }
  } finally {
    await sdb.close();
  }
});

test("distances distinguishes a zero-cost return from an empty route", async () => {
  const sdb = new SimpleDB();
  try {
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      expect(
        await sdb
          .newTable()
          .loadArray([{ source: "A", target: "B", cost: 0 }])
          .distances("source", "target", ["unknown", "B", "A"], {
            direction,
            weight: "cost",
          })
          .getData(),
      ).toStrictEqual(
        direction === "both"
          ? [
              { start: "A", node: "A", steps: 2, total: 0 },
              { start: "A", node: "B", steps: 1, total: 0 },
              { start: "B", node: "A", steps: 1, total: 0 },
              { start: "B", node: "B", steps: 2, total: 0 },
            ]
          : direction === "outgoing"
            ? [{ start: "A", node: "B", steps: 1, total: 0 }]
            : [{ start: "B", node: "A", steps: 1, total: 0 }],
      );
    }
  } finally {
    await sdb.close();
  }
});

test("distances preserves exact return routes and zero-cost destinations", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("collatedDistances");
    await sdb.customQuery(`CREATE TABLE "collatedDistances" (
      source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE, cost INTEGER
    ); INSERT INTO "collatedDistances" VALUES
      ('A', 'a', 0), ('a', 'B', 2), ('B', 'A', 3),
      ('A', 'A', 0), ('X', 'X', 0)`);
    expect(
      await table
        .distances("source", "target", ["X", "a", "A"], {
          weight: "cost",
        })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "A", steps: 1, total: 0 },
      { start: "A", node: "a", steps: 1, total: 0 },
      { start: "A", node: "B", steps: 2, total: 2 },
      { start: "X", node: "X", steps: 1, total: 0 },
      { start: "a", node: "B", steps: 1, total: 2 },
      { start: "a", node: "A", steps: 2, total: 5 },
      { start: "a", node: "a", steps: 3, total: 5 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances preserves typed schemas for empty inputs", async () => {
  const sdb = new SimpleDB();
  try {
    const unweighted = sdb.newTable("emptyUnweighted");
    await sdb.customQuery('CREATE TABLE "emptyUnweighted" (source VARCHAR, target VARCHAR)');
    unweighted.distances("source", "target", "A");
    expect(await unweighted.getData()).toStrictEqual([]);
    expect(await unweighted.getTypes()).toStrictEqual({
      start: "VARCHAR",
      node: "VARCHAR",
      steps: "BIGINT",
    });

    const weighted = sdb.newTable("emptyWeighted");
    await sdb.customQuery(
      'CREATE TABLE "emptyWeighted" (source VARCHAR, target VARCHAR, weight DECIMAL(8,3))',
    );
    weighted.distances("source", "target", "A", { weight: "weight" });
    expect(await weighted.getData()).toStrictEqual([]);
    expect(await weighted.getTypes()).toStrictEqual({
      start: "VARCHAR",
      node: "VARCHAR",
      steps: "BIGINT",
      total: "DECIMAL(38,3)",
    });
  } finally {
    await sdb.close();
  }
});

test("distances supports overwrite and source-preserving output tables", async () => {
  const sdb = new SimpleDB();
  try {
    const overwritten = loadScenario(sdb, "overwritten", "baseline");
    expect(overwritten.distances("source", "target", "A", { outputTable: false })).toBe(
      overwritten,
    );
    expect(await overwritten.getColumns()).toStrictEqual(["start", "node", "steps"]);

    const source = loadScenario(sdb, "preserved", "baseline");
    const named = source
      .distances("source", "target", "A", {
        outputTable: "namedDistances",
      })
      .filter("node = 'E'");
    expect(named.name).toStrictEqual("namedDistances");
    expect(await named.getData()).toStrictEqual([{ start: "A", node: "E", steps: 3 }]);
    expect(await source.getRowCount()).toStrictEqual(6);
    expect(await source.getColumns()).toStrictEqual(["source", "target"]);

    const generated = source.distances("source", "target", "F", {
      outputTable: true,
    });
    expect(generated.name.startsWith("table")).toStrictEqual(true);
    expect(generated.name === source.name).toStrictEqual(false);
    expect(await generated.getData()).toStrictEqual([{ start: "F", node: "G", steps: 1 }]);
    expect(await source.getRowCount()).toStrictEqual(6);
  } finally {
    await sdb.close();
  }
});

test("distances snapshots starts and options before queued execution", async () => {
  const sdb = new SimpleDB();
  try {
    const starts = ["E"];
    const options: {
      direction: "incoming" | "outgoing";
      weight: string;
      outputTable: string;
    } = {
      direction: "incoming",
      weight: "weight",
      outputTable: "distanceSnapshot",
    };
    const result = loadScenario(sdb, "snapshots", "baseline", true).distances(
      "source",
      "target",
      starts,
      options,
    );
    starts[0] = "A";
    options.direction = "outgoing";
    options.weight = "changed";
    options.outputTable = "changed";

    expect(result.name).toStrictEqual("distanceSnapshot");
    expect(await result.getData()).toStrictEqual([
      { start: "E", node: "D", steps: 1, total: 1 },
      { start: "E", node: "B", steps: 2, total: 2 },
      { start: "E", node: "C", steps: 2, total: 2 },
      { start: "E", node: "A", steps: 3, total: 3 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances validates arguments and schema cheaply", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      () => table.distances("source", "target", []),
      TypeError,
      "distances() startNodes must not be an empty array.",
    );
    assertThrows(
      () => table.distances("source", "target", ["A", "A"]),
      TypeError,
      'distances() startNodes contains duplicate IDs: "A".',
    );
    assertThrows(
      () => table.distances("source", "target", [0, 0n]),
      TypeError,
      "distances() startNodes contains duplicate IDs: 0n.",
    );
    assertThrows(
      () => table.distances(1 as unknown as string, "target", "A"),
      TypeError,
      "distances() sourceColumn must be a string.",
    );
    assertThrows(
      () => table.distances("source", 1 as unknown as string, "A"),
      TypeError,
      "distances() targetColumn must be a string.",
    );
    assertThrows(
      () =>
        table.distances("source", "target", "A", {
          direction: "sideways" as "outgoing",
        }),
      TypeError,
      'distances() options.direction must be "outgoing", "incoming", or "both".',
    );
    assertThrows(
      () =>
        table.distances("source", "target", "A", {
          weight: 1 as unknown as string,
        }),
      TypeError,
      "distances() options.weight must be a string.",
    );
    assertThrows(
      () =>
        table.distances("source", "target", "A", {
          outputTable: 1 as unknown as boolean,
        }),
      TypeError,
      "distances() options.outputTable must be a string or boolean.",
    );
    assertThrows(
      () => table.distances("source", "target", "A", null as unknown as Record<string, never>),
      TypeError,
      "distances() options must be an object.",
    );
    expect(table.pendingOps.length).toStrictEqual(0);

    const missing = sdb.newTable("missing").loadArray([{ source: "A" }]);
    await assertRejects(
      () => missing.distances("source", "target", "A").run(),
      Error,
      'distances() the column "target" does not exist',
    );
    const missingWeight = sdb.newTable("missingWeight").loadArray([{ source: "A", target: "B" }]);
    await assertRejects(
      () =>
        missingWeight
          .distances("source", "target", "A", {
            weight: "cost",
          })
          .run(),
      Error,
      'distances() the column "cost" does not exist',
    );
    const unsupported = sdb
      .newTable("unsupported")
      .loadData("test/data/graphs/unsupported-types.csv");
    await assertRejects(
      () =>
        unsupported
          .distances("stringTarget", "stringTarget", "A", {
            weight: "stringWeight",
          })
          .run(),
      TypeError,
      'column "stringWeight" has type VARCHAR',
    );
    const numeric = sdb.newTable("numericMismatch").loadData("test/data/graphs/numeric.csv");
    await assertRejects(
      () => numeric.distances("source", "target", "0").run(),
      TypeError,
      "startNodes contain string IDs",
    );
  } finally {
    await sdb.close();
  }
});

test("distances rejects output collisions before queuing graph work", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("source").loadArray([{ source: "A", target: "B" }]);
    await source.run();
    sdb.newTable("namedDistances");
    assertThrows(
      () =>
        source.distances("source", "target", "A", {
          outputTable: "NAMEDDISTANCES",
        }),
      Error,
      "Table NAMEDDISTANCES already exists.",
    );
    expect(source.pendingOps.length).toStrictEqual(0);
  } finally {
    await sdb.close();
  }
});

test("distances preserves queued source and output operation order", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("changingSource").loadArray([{ source: "A", target: "B" }]);
    const result = source.distances("source", "target", "A", {
      outputTable: true,
    });
    source.loadArray([{ source: "A", target: "C" }]);
    expect(await result.getData()).toStrictEqual([{ start: "A", node: "B", steps: 1 }]);
    expect(await source.getData()).toStrictEqual([{ source: "A", target: "C" }]);
  } finally {
    await sdb.close();
  }
});

for (const chronological of [false, true]) {
  test(`distances ${chronological ? "chronological" : "static"} output records its source as a cache dependency`, async () => {
    let computationRuns = 0;
    const unique = crypto.randomUUID().replaceAll("-", "");
    const outputName = `distancesCacheOutput${unique}`;
    const sourceName = `distancesCacheSource${unique}`;
    const compute = (source: SimpleTable) => async (output: SimpleTable) => {
      computationRuns++;
      const result = source.distances("source", "target", "A", {
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
          source: "A",
          target: "B",
          time: new Date(chronologicalBase),
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
          source: "A",
          target: "C",
          time: new Date(chronologicalBase),
        },
      ]);
      const output = secondSdb.newTable(outputName);
      await output.cache(compute(source));
      expect(computationRuns).toStrictEqual(2);
      expect(await output.getData()).toStrictEqual([{ start: "A", node: "C", steps: 1 }]);
    } finally {
      await secondSdb.close();
    }
  });
}

test("distances steps-only uses keyed recursion without route enumeration", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const table = loadScenario(sdb, "recursiveShape", "baseline").distances(
      "source",
      "target",
      "A",
    );
    await table.run();
    const queries = observer.queries.filter((entry) =>
      entry.query.includes("CREATE OR REPLACE TABLE"),
    );
    const query = queries.find((entry) => entry.query.includes("graph_distances"))?.query ?? "";
    expect(query).toContain("WITH RECURSIVE");
    expect(query).toContain("USING KEY");
    expect(query).toContain("recurring.");
    expect(query).toContain("MIN(");
    expect(query.includes("path")).toStrictEqual(false);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

test("distances internal relations do not shadow input table names", async () => {
  const sdb = new SimpleDB();
  try {
    for (const name of [
      "graph_start_values",
      "GRAPH_STARTS",
      "graph_edges",
      "GRAPH_NODES",
      "graph_distances",
    ]) {
      const table = sdb.newTable(name).loadArray([{ source: "A", target: "B", weight: 2 }]);
      await table.run();
      expect(
        await table
          .distances("source", "target", "A", {
            weight: "weight",
          })
          .getData(),
      ).toStrictEqual([{ start: "A", node: "B", steps: 1, total: 2 }]);
    }
  } finally {
    await sdb.close();
  }
});

test("distances JSDoc examples return their complete displayed outputs", async () => {
  const sdb = new SimpleDB();
  const edges = [
    { origin: "A", destination: "B", minutes: 4 },
    { origin: "B", destination: "C", minutes: 1 },
    { origin: "D", destination: "B", minutes: 2 },
  ];
  try {
    expect(
      await sdb.newTable().loadArray(edges).distances("origin", "destination", "A").getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1 },
      { start: "A", node: "C", steps: 2 },
    ]);
    expect(
      await sdb
        .newTable()
        .loadArray(edges)
        .distances("origin", "destination", "A", { weight: "minutes" })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 4 },
      { start: "A", node: "C", steps: 2, total: 5 },
    ]);
    expect(
      await sdb
        .newTable()
        .loadArray(edges)
        .distances("origin", "destination", "C", {
          direction: "incoming",
        })
        .getData(),
    ).toStrictEqual([
      { start: "C", node: "B", steps: 1 },
      { start: "C", node: "A", steps: 2 },
      { start: "C", node: "D", steps: 2 },
    ]);
    expect(
      await sdb
        .newTable()
        .loadArray(edges)
        .distances("origin", "destination", "A", { direction: "both" })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1 },
      { start: "A", node: "A", steps: 2 },
      { start: "A", node: "C", steps: 2 },
      { start: "A", node: "D", steps: 2 },
    ]);
    expect(
      await sdb
        .newTable()
        .loadArray(edges)
        .distances("origin", "destination", ["D", "A"], {
          weight: "minutes",
        })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 4 },
      { start: "A", node: "C", steps: 2, total: 5 },
      { start: "D", node: "B", steps: 1, total: 2 },
      { start: "D", node: "C", steps: 2, total: 3 },
    ]);
    expect(
      await sdb
        .newTable()
        .loadArray([
          { origin: "A", destination: "A", minutes: 10 },
          { origin: "A", destination: "B", minutes: 2 },
          { origin: "B", destination: "A", minutes: 3 },
        ])
        .distances("origin", "destination", "A", { weight: "minutes" })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 2 },
      {
        start: "A",
        node: "A",
        steps: 2,
        total: 5,
      },
    ]);
    expect(
      await sdb
        .newTable()
        .loadArray([
          {
            origin: "A",
            destination: "B",
            departureTime: new Date("2025-01-01T08:00:00Z"),
            arrivalTime: new Date("2025-01-01T10:00:00Z"),
            minutes: 2,
          },
          {
            origin: "B",
            destination: "C",
            departureTime: new Date("2025-01-01T09:00:00Z"),
            arrivalTime: new Date("2025-01-01T10:00:00Z"),
            minutes: 1,
          },
          {
            origin: "B",
            destination: "D",
            departureTime: new Date("2025-01-01T11:00:00Z"),
            arrivalTime: new Date("2025-01-01T12:00:00Z"),
            minutes: 3,
          },
        ])
        .distances("origin", "destination", "A", {
          startTimeColumn: "departureTime",
          endTimeColumn: "arrivalTime",
          minGapMs: 60 * 60 * 1000,
          weight: "minutes",
        })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 2 },
      { start: "A", node: "D", steps: 2, total: 5 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances chronological state keeps cheap late and costlier early arrivals", async () => {
  const sdb = new SimpleDB();
  const rows: WeightedChronologicalEvent[] = [
    {
      edgeId: 0,
      source: "A",
      target: "B",
      startTime: 0n,
      endTime: 1n,
      weight: 5,
    },
    {
      edgeId: 1,
      source: "A",
      target: "B",
      startTime: 5n,
      endTime: 6n,
      weight: 1,
    },
    {
      edgeId: 2,
      source: "B",
      target: "C",
      startTime: 2n,
      endTime: 3n,
      weight: 1,
    },
  ];
  try {
    for (const ordered of [rows, rows.toReversed()]) {
      expect(
        await sdb
          .newTable()
          .loadArray(chronologicalRows(ordered))
          .distances("source", "target", "A", {
            startTimeColumn: "startTime",
            endTimeColumn: "endTime",
            weight: "weight",
          })
          .getData(),
      ).toStrictEqual([
        { start: "A", node: "B", steps: 1, total: 1 },
        { start: "A", node: "C", steps: 2, total: 6 },
      ]);
      expect(
        await sdb
          .newTable()
          .loadArray(chronologicalRows(ordered))
          .distances("source", "target", "C", {
            direction: "incoming",
            startTimeColumn: "startTime",
            endTimeColumn: "endTime",
            weight: "weight",
          })
          .getData(),
      ).toStrictEqual([
        { start: "C", node: "B", steps: 1, total: 1 },
        { start: "C", node: "A", steps: 2, total: 6 },
      ]);
    }
  } finally {
    await sdb.close();
  }
});

test("distances chronological improvements propagate through previously reached events", async () => {
  const sdb = new SimpleDB();
  try {
    const events = [
      { source: "A", target: "B", time: 0, weight: 9 },
      { source: "A", target: "C", time: 0, weight: 1 },
      { source: "C", target: "B", time: 1, weight: 1 },
      { source: "B", target: "D", time: 2, weight: 1 },
      { source: "D", target: "E", time: 3, weight: 1 },
    ];
    for (const direction of ["outgoing", "incoming"] as const) {
      const rows = events.map((event) => ({
        source: direction === "outgoing" ? event.source : event.target,
        target: direction === "outgoing" ? event.target : event.source,
        time: new Date(chronologicalBase + (direction === "outgoing" ? event.time : -event.time)),
        weight: event.weight,
      }));
      expect(
        await sdb
          .newTable()
          .loadArray(rows)
          .distances("source", "target", "A", {
            direction,
            startTimeColumn: "time",
            weight: "weight",
          })
          .getData(),
      ).toStrictEqual([
        { start: "A", node: "C", steps: 1, total: 1 },
        { start: "A", node: "B", steps: 2, total: 2 },
        { start: "A", node: "D", steps: 3, total: 3 },
        { start: "A", node: "E", steps: 4, total: 4 },
      ]);
    }
  } finally {
    await sdb.close();
  }
});

test("distances chronological traversal handles first events, returns, and equal-time zero costs", async () => {
  const sdb = new SimpleDB();
  try {
    const rows: WeightedChronologicalEvent[] = [
      {
        edgeId: 0,
        source: "A",
        target: "B",
        startTime: 1n,
        endTime: 1n,
        weight: 0,
      },
      {
        edgeId: 1,
        source: "A",
        target: "B",
        startTime: 1n,
        endTime: 1n,
        weight: 3,
      },
      {
        edgeId: 2,
        source: "B",
        target: "A",
        startTime: 1n,
        endTime: 1n,
        weight: 0,
      },
      {
        edgeId: 3,
        source: "A",
        target: "A",
        startTime: 1n,
        endTime: 1n,
        weight: 2,
      },
      {
        edgeId: 4,
        source: "I",
        target: "J",
        startTime: 10n,
        endTime: 11n,
        weight: 4,
      },
    ];
    expect(
      await sdb
        .newTable()
        .loadArray(chronologicalRows(rows))
        .distances("source", "target", ["unknown", "I", "A"], {
          startTimeColumn: "startTime",
          endTimeColumn: "endTime",
          strictOrdering: false,
          weight: "weight",
        })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "A", steps: 2, total: 0 },
      { start: "A", node: "B", steps: 1, total: 0 },
      { start: "I", node: "J", steps: 1, total: 4 },
    ]);
    expect(
      await sdb
        .newTable()
        .loadArray(chronologicalRows(rows))
        .distances("source", "target", "I", {
          startTimeColumn: "startTime",
          endTimeColumn: "endTime",
          minGapMs: Number.MAX_SAFE_INTEGER,
          weight: "weight",
        })
        .getData(),
    ).toStrictEqual([{ start: "I", node: "J", steps: 1, total: 4 }]);
  } finally {
    await sdb.close();
  }
});

test("distances chronological traversal supports timestamp fallbacks and gap boundaries", async () => {
  const sdb = new SimpleDB();
  const equal: WeightedChronologicalEvent[] = [
    {
      edgeId: 0,
      source: "A",
      target: "B",
      startTime: 0n,
      endTime: 0n,
      weight: 2,
    },
    {
      edgeId: 1,
      source: "B",
      target: "C",
      startTime: 0n,
      endTime: 0n,
      weight: 3,
    },
  ];
  try {
    for (const column of ["startTimeColumn", "endTimeColumn"] as const) {
      const name = column === "startTimeColumn" ? "startTime" : "endTime";
      expect(
        await sdb
          .newTable()
          .loadArray(chronologicalRows(equal))
          .distances("source", "target", "A", {
            [column]: name,
            weight: "weight",
          })
          .getData(),
      ).toStrictEqual([{ start: "A", node: "B", steps: 1, total: 2 }]);
      expect(
        await sdb
          .newTable()
          .loadArray(chronologicalRows(equal))
          .distances("source", "target", "A", {
            [column]: name,
            strictOrdering: false,
            weight: "weight",
          })
          .getData(),
      ).toStrictEqual([
        { start: "A", node: "B", steps: 1, total: 2 },
        { start: "A", node: "C", steps: 2, total: 5 },
      ]);
    }
    const boundary = structuredClone(equal);
    boundary[0].endTime = 1n;
    boundary[1].startTime = 2n;
    boundary[1].endTime = 3n;
    expect(
      await sdb
        .newTable()
        .loadArray(chronologicalRows(boundary))
        .distances("source", "target", "A", {
          startTimeColumn: "startTime",
          endTimeColumn: "endTime",
          minGapMs: 1,
          weight: "weight",
        })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 2 },
      { start: "A", node: "C", steps: 2, total: 5 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances chronological results match the independent evaluator on generated tiny graphs", async () => {
  const sdb = new SimpleDB();
  const nodes = ["A", "B", "C", "D"];
  try {
    for (let seed = 0; seed < 10; seed++) {
      let state = seed + 1;
      const random = (limit: number) => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return (state >>> 16) % limit;
      };
      const events: WeightedChronologicalEvent[] = Array.from({ length: 7 }, (_, edgeId) => {
        const startTime = BigInt(random(6));
        return {
          edgeId,
          source: nodes[random(nodes.length)],
          target: nodes[random(nodes.length)],
          startTime,
          endTime: startTime,
          weight: random(5),
        };
      });
      const minGap = BigInt(seed % 2);
      const strictOrdering = seed % 3 !== 0;
      for (const direction of ["outgoing", "incoming"] as const) {
        const starts = direction === "outgoing" ? ["A", "C", "unknown"] : ["D", "B", "unknown"];
        const expected = referenceChronologicalDistances(
          events,
          starts,
          direction,
          minGap,
          strictOrdering,
        );
        for (const ordered of [events, events.toReversed()]) {
          expect(
            await sdb
              .newTable()
              .loadArray(chronologicalRows(ordered))
              .distances("source", "target", starts, {
                direction,
                startTimeColumn: "startTime",
                endTimeColumn: "endTime",
                minGapMs: Number(minGap),
                strictOrdering,
                weight: "weight",
              })
              .getData(),
            `seed ${seed}, ${direction}, strict ${strictOrdering}`,
          ).toStrictEqual(expected);
        }
      }
    }
  } finally {
    await sdb.close();
  }
});

test("distances chronological traversal preserves decimal, wide integer, and floating cost behavior", async () => {
  const sdb = new SimpleDB();
  try {
    const decimal = sdb.newTable("chronologicalDecimalDistances");
    await sdb.customQuery(`CREATE TABLE "chronologicalDecimalDistances" AS
      SELECT * FROM (VALUES
        ('A', 'C', TIMESTAMP '2025-01-01 00:00:02', 0.31::DECIMAL(6,2)),
        ('A', 'B', TIMESTAMP '2025-01-01 00:00:00', 0.10::DECIMAL(6,2)),
        ('B', 'C', TIMESTAMP '2025-01-01 00:00:01', 0.20::DECIMAL(6,2))
      ) edges(source, target, time, weight)`);
    decimal.distances("source", "target", "A", {
      startTimeColumn: "time",
      weight: "weight",
    });
    expect(await decimal.getTypes()).toStrictEqual({
      start: "VARCHAR",
      node: "VARCHAR",
      steps: "BIGINT",
      total: "DECIMAL(38,2)",
    });
    expect(await decimal.getData()).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: "0.10" },
      { start: "A", node: "C", steps: 2, total: "0.30" },
    ]);

    const wide = sdb.newTable("graph_cost_states");
    await sdb.customQuery(`CREATE TABLE "graph_cost_states" AS
      SELECT * FROM (VALUES
        (9007199254740993::BIGINT, 9007199254740995::BIGINT,
          TIMESTAMP_NS '2025-01-01 00:00:00.000000001',
          9007199254740993::BIGINT),
        (9007199254740995::BIGINT, 9007199254740997::BIGINT,
          TIMESTAMP_NS '2025-01-01 00:00:00.000000002', 2::BIGINT)
      ) edges(source, target, time, weight)`);
    wide
      .distances("source", "target", 9007199254740993n, {
        startTimeColumn: "time",
        weight: "weight",
      })
      .convert({ start: "string", node: "string", total: "string" });
    expect(await wide.getData()).toStrictEqual([
      {
        start: "9007199254740993",
        node: "9007199254740995",
        steps: 1,
        total: "9007199254740993",
      },
      {
        start: "9007199254740993",
        node: "9007199254740997",
        steps: 2,
        total: "9007199254740995",
      },
    ]);

    const floating = sdb.newTable("chronologicalFloatingDistances");
    await sdb.customQuery(`CREATE TABLE "chronologicalFloatingDistances" AS
      SELECT * FROM (VALUES
        ('A', 'C', TIMESTAMP '2025-01-01 00:00:02', 1.0000000000001::DOUBLE),
        ('A', 'B', TIMESTAMP '2025-01-01 00:00:00', 0.5::DOUBLE),
        ('B', 'C', TIMESTAMP '2025-01-01 00:00:01', 0.5::DOUBLE)
      ) edges(source, target, time, weight)`);
    expect(
      await floating
        .distances("source", "target", "A", {
          startTimeColumn: "time",
          weight: "weight",
        })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 0.5 },
      { start: "A", node: "C", steps: 2, total: 1 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances validates and snapshots chronological options before queued execution", async () => {
  const sdb = new SimpleDB();
  try {
    const unqueued = sdb.newTable();
    assertThrows(
      () => unqueued.distances("source", "target", "A", { minGapMs: 0 }),
      TypeError,
      "require options.startTimeColumn or options.endTimeColumn",
    );
    assertThrows(
      () =>
        unqueued.distances("source", "target", "A", {
          direction: "both",
          startTimeColumn: "time",
        }),
      TypeError,
      'options.direction cannot be "both"',
    );
    assertThrows(
      () =>
        unqueued.distances("source", "target", "A", {
          startTimeColumn: 1 as unknown as string,
        }),
      TypeError,
      "options.startTimeColumn must be a string",
    );
    expect(unqueued.pendingOps.length).toStrictEqual(0);

    const options: {
      outputTable: string;
      startTimeColumn: string;
      strictOrdering: boolean;
    } = {
      outputTable: "chronologicalDistanceSnapshot",
      startTimeColumn: "time",
      strictOrdering: true,
    };
    const queued = sdb
      .newTable()
      .loadArray([
        { source: "A'?", target: "B", time: "2025-01-01 00:00:00" },
        { source: "B", target: "C", time: "2025-01-01 00:00:01" },
      ])
      .convert({ time: "datetime" })
      .distances("source", "target", "A'?", options);
    options.outputTable = "changed";
    options.startTimeColumn = "missing";
    options.strictOrdering = false;
    expect(queued.name).toStrictEqual("chronologicalDistanceSnapshot");
    expect(await queued.getData()).toStrictEqual([
      { start: "A'?", node: "B", steps: 1 },
      { start: "A'?", node: "C", steps: 2 },
    ]);

    const missing = sdb
      .newTable()
      .loadArray([{ source: "A", target: "B", time: new Date(chronologicalBase) }]);
    await assertRejects(
      () =>
        missing
          .distances("source", "target", "A", {
            startTimeColumn: "missing",
          })
          .run(),
      Error,
      'column "missing" does not exist',
    );
    const unsupported = sdb.newTable().loadArray([{ source: "A", target: "B", time: 1 }]);
    await assertRejects(
      () =>
        unsupported
          .distances("source", "target", "A", {
            startTimeColumn: "time",
          })
          .run(),
      TypeError,
      "requires DATE or TIMESTAMP chronological columns",
    );
  } finally {
    await sdb.close();
  }
});

test("distances chronological steps-only uses finite keyed event costs", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const width = 4;
    const layers = 5;
    const rows = Array.from({ length: layers }, (_, layer) =>
      Array.from({ length: width }, (_, from) =>
        Array.from({ length: width }, (_, to) => ({
          source: layer === 0 ? "start" : `L${layer}-${from}`,
          target: `L${layer + 1}-${to}`,
          time: new Date(chronologicalBase + layer * 1000),
          weight: (from + to) % 3,
        })),
      ).flat(),
    ).flat();
    const result = sdb
      .newTable("chronologicalDistanceGrowth")
      .loadArray(rows)
      .distances("source", "target", ["start", "L1-0"], {
        startTimeColumn: "time",
        strictOrdering: false,
        outputTable: true,
      });
    expect((await result.getData()).length).toStrictEqual(36);
    const query =
      observer.queries.find(
        (entry) =>
          entry.query.includes("graph_cost_states") &&
          entry.query.includes("CREATE OR REPLACE TABLE"),
      )?.query ?? "";
    expect(query).toContain("USING KEY");
    expect(query).toContain('"__start_key", "__event_id"');
    expect(query).toContain("recurring.");
    expect(query).toContain("AS MATERIALIZED");
    expect(query.includes("list_append")).toStrictEqual(false);
    expect(query.includes("path")).toStrictEqual(false);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

const elapsedOptions = {
  startTimeColumn: "departure",
  endTimeColumn: "arrival",
  elapsedTime: true,
};

function elapsedRows(
  events: {
    source: string;
    target: string;
    departure: number;
    arrival: number;
    cost: number;
  }[],
) {
  return events.map((event) => ({
    ...event,
    departure: new Date(chronologicalBase + event.departure),
    arrival: new Date(chronologicalBase + event.arrival),
  }));
}

test("distances elapsed chooses paired cheapest or fastest journeys including waiting", async () => {
  const sdb = new SimpleDB();
  const rows = elapsedRows([
    { source: "A", target: "B", departure: 0, arrival: 1, cost: 1 },
    { source: "B", target: "D", departure: 9, arrival: 10, cost: 1 },
    { source: "A", target: "C", departure: 3, arrival: 4, cost: 4 },
    { source: "C", target: "D", departure: 5, arrival: 6, cost: 4 },
  ]);
  try {
    for (const direction of ["outgoing", "incoming"] as const) {
      const start = direction === "outgoing" ? "A" : "D";
      const destination = direction === "outgoing" ? "D" : "A";
      for (const minimize of ["weight", "elapsedTime"] as const) {
        const result = sdb
          .newTable()
          .loadArray(rows)
          .distances("source", "target", start, {
            ...elapsedOptions,
            direction,
            weight: "cost",
            minimize,
          });
        expect((await result.getData()).find((row) => row.node === destination)).toStrictEqual({
          start,
          node: destination,
          steps: 2,
          total: minimize === "weight" ? 2 : 8,
          elapsedTimeMs: minimize === "weight" ? 10 : 3,
        });
      }
    }
    expect(
      await sdb
        .newTable()
        .loadArray(rows)
        .distances("source", "target", "A", elapsedOptions)
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1, elapsedTimeMs: 1 },
      { start: "A", node: "C", steps: 1, elapsedTimeMs: 1 },
      { start: "A", node: "D", steps: 2, elapsedTimeMs: 3 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances elapsed preserves departure anchors through a shared physical event", async () => {
  const sdb = new SimpleDB();
  try {
    const rows = elapsedRows([
      { source: "A", target: "B", departure: 0, arrival: 1, cost: 1 },
      { source: "A", target: "B", departure: 6, arrival: 7, cost: 5 },
      { source: "B", target: "C", departure: 8, arrival: 9, cost: 1 },
      { source: "C", target: "D", departure: 10, arrival: 11, cost: 1 },
    ]);
    for (const ordered of [rows, rows.toReversed()]) {
      const result = await sdb
        .newTable()
        .loadArray(ordered)
        .distances("source", "target", "A", {
          ...elapsedOptions,
          weight: "cost",
          minimize: "elapsedTime",
        })
        .getData();
      expect(result).toStrictEqual([
        { start: "A", node: "B", steps: 1, total: 1, elapsedTimeMs: 1 },
        { start: "A", node: "B", steps: 1, total: 5, elapsedTimeMs: 1 },
        { start: "A", node: "C", steps: 2, total: 6, elapsedTimeMs: 3 },
        { start: "A", node: "D", steps: 3, total: 7, elapsedTimeMs: 5 },
      ]);
    }
  } finally {
    await sdb.close();
  }
});

test("distances elapsed retains primary ties and orders distinct summaries", async () => {
  const sdb = new SimpleDB();
  try {
    const rows = elapsedRows([
      { source: "A", target: "B", departure: 0, arrival: 5, cost: 1 },
      { source: "A", target: "B", departure: 1, arrival: 4, cost: 1 },
      { source: "A", target: "B", departure: 2, arrival: 3, cost: 9 },
      { source: "A", target: "C", departure: 0, arrival: 1, cost: 2 },
      { source: "A", target: "C", departure: 0, arrival: 1, cost: 3 },
      { source: "A", target: "D", departure: 0, arrival: 1, cost: 1 },
    ]);
    expect(
      await sdb
        .newTable()
        .loadArray(rows)
        .distances("source", "target", "A", {
          ...elapsedOptions,
          weight: "cost",
          minimize: "weight",
        })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 1, elapsedTimeMs: 3 },
      { start: "A", node: "B", steps: 1, total: 1, elapsedTimeMs: 5 },
      { start: "A", node: "D", steps: 1, total: 1, elapsedTimeMs: 1 },
      { start: "A", node: "C", steps: 1, total: 2, elapsedTimeMs: 1 },
    ]);
    expect(
      await sdb
        .newTable()
        .loadArray(rows)
        .distances("source", "target", "A", {
          ...elapsedOptions,
          weight: "cost",
          minimize: "elapsedTime",
        })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 9, elapsedTimeMs: 1 },
      { start: "A", node: "C", steps: 1, total: 2, elapsedTimeMs: 1 },
      { start: "A", node: "C", steps: 1, total: 3, elapsedTimeMs: 1 },
      { start: "A", node: "D", steps: 1, total: 1, elapsedTimeMs: 1 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances elapsed preserves native precision before converting nanoseconds to milliseconds", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("elapsedNanoseconds");
    await sdb.customQuery(`CREATE TABLE "elapsedNanoseconds" AS
      SELECT * FROM (VALUES
        ('A', 'B', TIMESTAMP_NS '2025-01-01 00:00:00.000000001', TIMESTAMP_NS '2025-01-01 00:00:00.000000004', 1),
        ('A', 'B', TIMESTAMP_NS '2025-01-01 00:00:00.000000002', TIMESTAMP_NS '2025-01-01 00:00:00.000000004', 2),
        ('B', 'C', TIMESTAMP_NS '2025-01-01 00:00:00.000000005', TIMESTAMP_NS '2025-01-01 00:00:00.000000007', 1)
      ) edges(source, target, departure, arrival, cost)`);
    expect(
      await table
        .distances("source", "target", "A", {
          ...elapsedOptions,
          weight: "cost",
          minimize: "elapsedTime",
        })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: 2, elapsedTimeMs: 0.000002 },
      { start: "A", node: "C", steps: 2, total: 3, elapsedTimeMs: 0.000005 },
    ]);
    const wide = sdb.newTable("elapsedWideNanoseconds");
    await sdb.customQuery(`CREATE TABLE "elapsedWideNanoseconds" AS
      SELECT * FROM (VALUES
        ('A', 'B', TIMESTAMP_NS '1970-01-01', make_timestamp_ns(9007199254740993), 1),
        ('A', 'B', TIMESTAMP_NS '1970-01-01', make_timestamp_ns(9007199254740992), 2)
      ) edges(source, target, departure, arrival, cost)`);
    expect(
      (
        await wide
          .distances("source", "target", "A", {
            ...elapsedOptions,
            weight: "cost",
            minimize: "elapsedTime",
          })
          .getData()
      )[0].total,
    ).toStrictEqual(2);
  } finally {
    await sdb.close();
  }
});

test("distances elapsed terminates zero cycles and includes actual returns", async () => {
  const sdb = new SimpleDB();
  try {
    const rows = elapsedRows([
      { source: "A", target: "B", departure: 1, arrival: 1, cost: 0 },
      { source: "B", target: "A", departure: 1, arrival: 1, cost: 0 },
      { source: "A", target: "A", departure: 1, arrival: 1, cost: 3 },
    ]);
    for (const minimize of ["weight", "elapsedTime"] as const) {
      for (const direction of ["incoming", "outgoing"] as const) {
        expect(
          await sdb
            .newTable()
            .loadArray(rows)
            .distances("source", "target", ["A", "missing"], {
              ...elapsedOptions,
              direction,
              weight: "cost",
              minimize,
              strictOrdering: false,
            })
            .getData(),
        ).toStrictEqual([
          ...(minimize === "elapsedTime"
            ? [
                {
                  start: "A",
                  node: "A",
                  steps: 1,
                  total: 3,
                  elapsedTimeMs: 0,
                },
              ]
            : []),
          { start: "A", node: "A", steps: 2, total: 0, elapsedTimeMs: 0 },
          { start: "A", node: "B", steps: 1, total: 0, elapsedTimeMs: 0 },
        ]);
      }
    }
    expect(
      await sdb
        .newTable()
        .loadArray(rows)
        .distances("source", "target", "A", {
          ...elapsedOptions,
          strictOrdering: false,
        })
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "A", steps: 1, elapsedTimeMs: 0 },
      { start: "A", node: "A", steps: 2, elapsedTimeMs: 0 },
      { start: "A", node: "B", steps: 1, elapsedTimeMs: 0 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances elapsed result schema supports pending chains and output tables", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb
      .newTable()
      .loadArray(elapsedRows([{ source: "A", target: "B", departure: 0, arrival: 2, cost: 3 }]));
    const result = source.distances("source", "target", "A", {
      ...elapsedOptions,
      outputTable: "elapsedDistanceOutput",
    });
    expect(result.name).toStrictEqual("elapsedDistanceOutput");
    expect(await result.getTypes()).toStrictEqual({
      start: "VARCHAR",
      node: "VARCHAR",
      steps: "BIGINT",
      elapsedTimeMs: "DOUBLE",
    });
    expect(
      await result.filter("elapsedTimeMs > 1").selectColumns(["node", "elapsedTimeMs"]).getData(),
    ).toStrictEqual([{ node: "B", elapsedTimeMs: 2 }]);
    expect((await source.getData()).length).toStrictEqual(1);
    expect(
      await source
        .distances("source", "target", "missing", {
          ...elapsedOptions,
          outputTable: true,
        })
        .getData(),
    ).toStrictEqual([]);
    expect(
      await source
        .distances("source", "target", "A", {
          ...elapsedOptions,
          outputTable: true,
        })
        .filter("elapsedTimeMs > 1")
        .selectColumns(["elapsedTimeMs"])
        .getData(),
    ).toStrictEqual([{ elapsedTimeMs: 2 }]);
    expect(
      await source
        .distances("source", "target", "A", {
          ...elapsedOptions,
          elapsedTime: false,
          outputTable: true,
        })
        .getData(),
    ).toStrictEqual([{ start: "A", node: "B", steps: 1 }]);
  } finally {
    await sdb.close();
  }
});

test("distances validates elapsed optimization options before queueing", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    const cases: [Parameters<SimpleTable["distances"]>[3], string][] = [
      [{ elapsedTime: "yes" as unknown as boolean }, "options.elapsedTime must be a boolean"],
      [{ elapsedTime: true }, "requires both"],
      [{ elapsedTime: true, startTimeColumn: "departure" }, "requires both"],
      [{ elapsedTime: true, endTimeColumn: "arrival" }, "requires both"],
      [{ ...elapsedOptions, weight: "cost" }, "specify options.minimize"],
      [{ minimize: "weight" }, "requires options.weight"],
      [{ minimize: "elapsedTime" }, "requires options.elapsedTime"],
      [{ minimize: "elapsedTime", elapsedTime: false }, "requires options.elapsedTime"],
      [{ minimize: "count" as unknown as "weight" }, "options.minimize must be"],
    ];
    for (const [options, message] of cases) {
      assertThrows(() => table.distances("source", "target", "A", options), TypeError, message);
      expect(table.pendingOps.length).toStrictEqual(0);
    }
  } finally {
    await sdb.close();
  }
});

test("distances elapsed matches independently enumerated journeys on tiny graphs", async () => {
  const sdb = new SimpleDB();
  try {
    for (let seed = 0; seed < 8; seed++) {
      let randomState = seed + 17;
      const random = (limit: number) => {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return (randomState >>> 16) % limit;
      };
      const nodes = ["A", "B", "C"];
      const events: WeightedChronologicalEvent[] = Array.from({ length: 8 }, (_, edgeId) => {
        const startTime = BigInt(random(6));
        return {
          edgeId,
          source: nodes[random(nodes.length)],
          target: nodes[random(nodes.length)],
          startTime,
          endTime: startTime + BigInt(random(2)),
          weight: random(4),
        };
      });
      const weights = new Map(events.map((event) => [event.edgeId, event.weight]));
      const minGap = BigInt(seed % 2);
      const strictOrdering = seed % 3 !== 0;
      for (const direction of ["outgoing", "incoming"] as const) {
        for (const minimize of ["steps", "weight", "elapsedTime"] as const) {
          const metric =
            minimize === "steps" ? "steps" : minimize === "weight" ? "total" : "elapsedTimeMs";
          const candidates = nodes.flatMap((start) =>
            referenceSimpleJourneys(events, start, {
              direction,
              minGap,
              strictOrdering,
            }).map((route) => {
              const first = route[0].event;
              const last = route.at(-1)!;
              return {
                start,
                node: last.target,
                steps: route.length,
                total: route.reduce((sum, step) => sum + weights.get(step.event.edgeId)!, 0),
                elapsedTimeMs: Number(
                  direction === "outgoing"
                    ? last.event.endTime! - first.startTime!
                    : first.endTime! - last.event.startTime!,
                ),
              };
            }),
          );
          const expected = distinctOptimalSummaries(candidates, metric).sort(
            (left, right) =>
              left.start.localeCompare(right.start) ||
              left[metric] - right[metric] ||
              left.node.localeCompare(right.node) ||
              left.steps - right.steps ||
              left.total - right.total ||
              left.elapsedTimeMs - right.elapsedTimeMs,
          );
          expect(
            await sdb
              .newTable()
              .loadArray(chronologicalRows(events))
              .distances("source", "target", nodes, {
                elapsedTime: true,
                startTimeColumn: "startTime",
                endTimeColumn: "endTime",
                weight: "weight",
                minimize,
                direction,
                minGapMs: Number(minGap),
                strictOrdering,
              })
              .getData(),
            `seed ${seed}, ${direction}, ${minimize}`,
          ).toStrictEqual(expected);
        }
      }
    }
  } finally {
    await sdb.close();
  }
});

test("distances reports each tied step count in every traversal mode", async () => {
  const sdb = new SimpleDB();
  const edges = [
    { source: "A", target: "D", cost: 6 },
    { source: "A", target: "B", cost: 1 },
    { source: "B", target: "D", cost: 1 },
    { source: "A", target: "C", cost: 0 },
    { source: "C", target: "X", cost: 0 },
    { source: "X", target: "D", cost: 2 },
    { source: "D", target: "E", cost: 0 },
  ];
  try {
    for (const mode of ["static", "chronological", "elapsed"] as const) {
      for (const direction of ["outgoing", "incoming", "both"] as const) {
        if (mode !== "static" && direction === "both") continue;
        const rows = elapsedRows(
          edges.map((edge) => ({
            ...edge,
            ...(direction === "incoming" ? { source: edge.target, target: edge.source } : {}),
            departure: 0,
            arrival: 0,
          })),
        );
        for (const ordered of [rows, rows.toReversed()]) {
          const result = sdb
            .newTable()
            .loadArray(ordered)
            .distances("source", "target", ["A", "missing"], {
              direction,
              weight: "cost",
              outputTable: true,
              ...(mode === "static"
                ? {}
                : {
                    startTimeColumn: "departure",
                    endTimeColumn: "arrival",
                    strictOrdering: false,
                  }),
              ...(mode === "elapsed" ? { elapsedTime: true, minimize: "weight" as const } : {}),
            })
            .filter("node IN ('D', 'E') AND steps >= 2");
          expect(await result.getData()).toStrictEqual(
            ["D", "E"].flatMap((node) =>
              (node === "D" ? [2, 3] : [3, 4]).map((steps) => ({
                start: "A",
                node,
                steps,
                total: 2,
                ...(mode === "elapsed" ? { elapsedTimeMs: 0 } : {}),
              })),
            ),
          );
          expect((await result.getTypes()).steps).toStrictEqual("BIGINT");
        }
      }
    }
  } finally {
    await sdb.close();
  }
});

test("distances does not break primary ties using secondary metrics", async () => {
  const sdb = new SimpleDB();
  try {
    for (const minimize of ["weight", "elapsedTime"] as const) {
      for (const direction of ["outgoing", "incoming"] as const) {
        const rows = elapsedRows([
          { source: "A", target: "B", departure: 0, arrival: 1, cost: 1 },
          { source: "B", target: "D", departure: 9, arrival: 10, cost: 1 },
          // One step, but worse on the secondary metric.
          {
            source: "A",
            target: "D",
            departure: 0,
            arrival: minimize === "weight" ? 12 : 10,
            cost: minimize === "weight" ? 2 : 3,
          },
        ]);
        const start = direction === "outgoing" ? "A" : "D";
        const node = direction === "outgoing" ? "D" : "A";
        const result = await sdb
          .newTable()
          .loadArray(rows)
          .distances("source", "target", start, {
            ...elapsedOptions,
            direction,
            weight: "cost",
            minimize,
          })
          .getData();
        expect(result.filter((row) => row.node === node)).toStrictEqual([
          {
            start,
            node,
            steps: 1,
            total: minimize === "weight" ? 2 : 3,
            elapsedTimeMs: minimize === "weight" ? 12 : 10,
          },
          { start, node, steps: 2, total: 2, elapsedTimeMs: 10 },
        ]);
      }
    }
  } finally {
    await sdb.close();
  }
});

test("distances elapsed JSDoc examples report matching steps, costs, and times", async () => {
  const sdb = new SimpleDB();
  try {
    const flights = sdb.newTable().loadArray(
      [
        {
          flightId: "F1",
          origin: "A",
          destination: "B",
          departure: "2025-01-01T09:00:00Z",
          arrival: "2025-01-01T10:00:00Z",
          price: 40,
        },
        {
          flightId: "F2",
          origin: "B",
          destination: "C",
          departure: "2025-01-01T12:00:00Z",
          arrival: "2025-01-01T13:00:00Z",
          price: 40,
        },
        {
          flightId: "F3",
          origin: "A",
          destination: "C",
          departure: "2025-01-01T09:00:00Z",
          arrival: "2025-01-01T12:00:00Z",
          price: 120,
        },
      ].map((row) => ({
        ...row,
        departure: new Date(row.departure),
        arrival: new Date(row.arrival),
      })),
    );
    for (const minimize of [undefined, "elapsedTime", "weight", "steps"] as const) {
      expect(
        await flights
          .distances("origin", "destination", "A", {
            ...elapsedOptions,
            minGapMs: 60 * 60 * 1000,
            ...(minimize === undefined ? {} : { weight: "price", minimize }),
            outputTable: true,
          })
          .getData(),
      ).toStrictEqual([
        {
          start: "A",
          node: "B",
          steps: 1,
          ...(minimize ? { total: 40 } : {}),
          elapsedTimeMs: 3600000,
        },
        {
          start: "A",
          node: "C",
          steps: minimize === "weight" ? 2 : 1,
          ...(minimize ? { total: minimize === "weight" ? 80 : 120 } : {}),
          elapsedTimeMs: minimize === "weight" ? 14400000 : 10800000,
        },
      ]);
    }
  } finally {
    await sdb.close();
  }
});

test("distances minimizes steps independently of optional reported metrics", async () => {
  const sdb = new SimpleDB();
  const edges = [
    { source: "A", target: "D", cost: 9, departure: 0, arrival: 12 },
    { source: "A", target: "D", cost: 9, departure: 4, arrival: 14 },
    { source: "A", target: "D", cost: 10, departure: 10, arrival: 11 },
    { source: "A", target: "B", cost: 1, departure: 0, arrival: 1 },
    { source: "B", target: "D", cost: 1, departure: 2, arrival: 3 },
    { source: "D", target: "E", cost: 0, departure: 20, arrival: 21 },
    { source: "D", target: "D", cost: 0, departure: 20, arrival: 20 },
  ];
  try {
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      for (const chronological of [false, true]) {
        if (chronological && direction === "both") continue;
        for (const weighted of [false, true]) {
          for (const elapsedTime of chronological ? [false, true] : [false]) {
            const options = {
              direction,
              minimize: "steps" as const,
              ...(weighted ? { weight: "cost" } : {}),
              ...(chronological ? { ...elapsedOptions, elapsedTime, strictOrdering: false } : {}),
              outputTable: true,
            };
            const input = sdb.newTable().loadArray(
              elapsedRows(
                edges.map((edge) =>
                  direction === "incoming"
                    ? {
                        ...edge,
                        source: edge.target,
                        target: edge.source,
                        departure: -edge.arrival,
                        arrival: -edge.departure,
                      }
                    : edge,
                ),
              ),
            );
            const result = input
              .distances("source", "target", "A", options)
              .filter("node IN ('D', 'E')");
            const columns = [
              "start",
              "node",
              "steps",
              ...(weighted ? ["total"] : []),
              ...(elapsedTime ? ["elapsedTimeMs"] : []),
            ];
            expect(await result.getColumns()).toStrictEqual(columns);
            const expected = ["D", "E"].flatMap((node) => {
              const candidates = edges.slice(0, 3).map((edge) => ({
                start: "A",
                node,
                steps: node === "D" ? 1 : 2,
                ...(weighted ? { total: edge.cost } : {}),
                ...(elapsedTime
                  ? {
                      elapsedTimeMs: (node === "D" ? edge.arrival : 21) - edge.departure,
                    }
                  : {}),
              }));
              return [
                ...new Map(candidates.map((row) => [JSON.stringify(row), row])).values(),
              ].sort(
                (a, b) =>
                  (a.total ?? 0) - (b.total ?? 0) ||
                  (a.elapsedTimeMs ?? 0) - (b.elapsedTimeMs ?? 0),
              );
            });
            expect(await result.getData()).toStrictEqual(expected);
            const empty = input.distances("source", "target", "missing", options);
            expect(await empty.getColumns()).toStrictEqual(columns);
            expect(await empty.getData()).toStrictEqual([]);
          }
        }
      }
    }
  } finally {
    await sdb.close();
  }
});

test("distances retains distinct tied summaries and collapses equivalent routes", async () => {
  const sdb = new SimpleDB();
  try {
    const input = sdb.newTable().loadArray(
      elapsedRows([
        { source: "A", target: "B", cost: 2, departure: 0, arrival: 1 },
        { source: "B", target: "D", cost: 3, departure: 4, arrival: 5 },
        { source: "A", target: "C", cost: 4, departure: 0, arrival: 1 },
        { source: "C", target: "D", cost: 3, departure: 6, arrival: 7 },
        { source: "A", target: "X", cost: 2, departure: 0, arrival: 1 },
        { source: "X", target: "D", cost: 3, departure: 4, arrival: 5 },
        { source: "D", target: "E", cost: 1, departure: 8, arrival: 9 },
      ]),
    );
    for (const elapsedTime of [false, true]) {
      const rows = await input
        .distances("source", "target", "A", {
          weight: "cost",
          minimize: "steps",
          outputTable: true,
          ...(elapsedTime ? elapsedOptions : {}),
        })
        .filter("node IN ('D', 'E')")
        .getData();
      expect(rows).toStrictEqual([
        {
          start: "A",
          node: "D",
          steps: 2,
          total: 5,
          ...(elapsedTime ? { elapsedTimeMs: 5 } : {}),
        },
        {
          start: "A",
          node: "D",
          steps: 2,
          total: 7,
          ...(elapsedTime ? { elapsedTimeMs: 7 } : {}),
        },
        {
          start: "A",
          node: "E",
          steps: 3,
          total: 6,
          ...(elapsedTime ? { elapsedTimeMs: 9 } : {}),
        },
        {
          start: "A",
          node: "E",
          steps: 3,
          total: 8,
          ...(elapsedTime ? { elapsedTimeMs: 9 } : {}),
        },
      ]);
    }
    expect(
      await input
        .distances("source", "target", "A", { outputTable: true })
        .filter("node = 'D'")
        .getData(),
    ).toStrictEqual([{ start: "A", node: "D", steps: 2 }]);
  } finally {
    await sdb.close();
  }
});

test("distances retains visited-node alternatives and stops at a return to start", async () => {
  const sdb = new SimpleDB();
  try {
    const rows = [
      { source: "A", target: "B", cost: 0 },
      { source: "A", target: "C", cost: 0 },
      { source: "B", target: "D", cost: 0 },
      { source: "C", target: "D", cost: 0 },
      { source: "D", target: "B", cost: 0 },
      { source: "B", target: "E", cost: 0 },
      { source: "D", target: "A", cost: 0 },
      { source: "B", target: "B", cost: 0 },
    ];
    for (const ordered of [rows, rows.toReversed()]) {
      expect(
        await sdb
          .newTable()
          .loadArray(ordered)
          .distances("source", "target", "A", { weight: "cost" })
          .getData(),
      ).toStrictEqual([
        { start: "A", node: "A", steps: 3, total: 0 },
        { start: "A", node: "B", steps: 1, total: 0 },
        { start: "A", node: "B", steps: 3, total: 0 },
        { start: "A", node: "C", steps: 1, total: 0 },
        { start: "A", node: "D", steps: 2, total: 0 },
        { start: "A", node: "E", steps: 2, total: 0 },
        { start: "A", node: "E", steps: 4, total: 0 },
      ]);
    }
  } finally {
    await sdb.close();
  }
});

test("distances preserves floating cost ties formed after unequal prefixes", async () => {
  const sdb = new SimpleDB();
  try {
    expect(
      await sdb
        .newTable()
        .loadArray([
          { source: "A", target: "B", cost: 2 },
          { source: "A", target: "X", cost: 0 },
          { source: "X", target: "B", cost: 1 },
          { source: "B", target: "C", cost: 1e20 },
        ])
        .distances("source", "target", "A", { weight: "cost" })
        .filter("node = 'C'")
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "C", steps: 2, total: 1e20 },
      { start: "A", node: "C", steps: 3, total: 1e20 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances tied summaries JSDoc example returns both prices", async () => {
  const sdb = new SimpleDB();
  try {
    expect(
      await sdb
        .newTable()
        .loadArray([
          { origin: "A", destination: "B", price: 20 },
          { origin: "B", destination: "C", price: 30 },
          { origin: "A", destination: "D", price: 40 },
          { origin: "D", destination: "C", price: 40 },
        ])
        .distances("origin", "destination", "A", {
          weight: "price",
          minimize: "steps",
        })
        .filter("node = 'C'")
        .getData(),
    ).toStrictEqual([
      { start: "A", node: "C", steps: 2, total: 50 },
      { start: "A", node: "C", steps: 2, total: 80 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances prunes dominated decimal prefixes before they overflow", async () => {
  const sdb = new SimpleDB();
  try {
    const huge = "90000000000000000000000000000000000000";
    const table = sdb.newTable("dominatedDecimalDistances");
    await sdb.customQuery(`CREATE TABLE "dominatedDecimalDistances" AS
      SELECT source, target, cost::DECIMAL(38,0) AS cost
      FROM (VALUES ('A', 'B', '1'), ('A', 'C', '${huge}'),
        ('C', 'B', '0'), ('B', 'D', '${huge}')) edges(source, target, cost)`);
    expect(
      await table.distances("source", "target", "A", { weight: "cost" }).getData(),
    ).toStrictEqual([
      { start: "A", node: "B", steps: 1, total: "1" },
      { start: "A", node: "C", steps: 1, total: huge },
      {
        start: "A",
        node: "D",
        steps: 2,
        total: "90000000000000000000000000000000000001",
      },
    ]);
  } finally {
    await sdb.close();
  }
});

test("distances prunes longer routes in dense acyclic graphs for each objective", async () => {
  const sdb = new SimpleDB();
  try {
    const size = 24;
    const rows = Array.from({ length: size }, (_, source) =>
      Array.from({ length: size - source - 1 }, (_, offset) => ({
        source,
        target: source + offset + 1,
        cost: 1,
        departure: new Date(chronologicalBase + source * 2),
        arrival: new Date(chronologicalBase + source * 2 + 1),
      })),
    ).flat();
    for (const minimize of ["steps", "weight", "elapsedTime"] as const) {
      for (const chronological of [false, true]) {
        if (minimize === "elapsedTime" && !chronological) continue;
        const result = await sdb
          .newTable()
          .loadArray(rows)
          .distances("source", "target", 0, {
            weight: "cost",
            minimize,
            ...(chronological ? elapsedOptions : {}),
          })
          .getData();
        const expected = Array.from({ length: size - 1 }, (_, i) => ({
          start: 0,
          node: i + 1,
          steps: 1,
          total: 1,
          ...(chronological ? { elapsedTimeMs: 1 } : {}),
        }));
        expect(result).toStrictEqual(expected);
      }
    }
  } finally {
    await sdb.close();
  }
});

test("distances reports cost overflow only for primary-optimal summaries", async () => {
  const sdb = new SimpleDB();
  try {
    const huge = "90000000000000000000000000000000000000";
    for (const minimize of ["steps", "elapsedTime"] as const) {
      for (const direct of [false, true]) {
        const table = sdb.newTable();
        await sdb.customQuery(`CREATE TABLE "${table.name}" AS
          SELECT source, target, cost::DECIMAL(38,0) AS cost,
            TIMESTAMP '2025-01-01' + t * INTERVAL '1 SECOND' AS departure,
            TIMESTAMP '2025-01-01' + (t + 1) * INTERVAL '1 SECOND' AS arrival
          FROM (VALUES ('A', 'B', '${huge}', 0), ('B', 'C', '${huge}', 2)
            ${direct ? ", ('A', 'C', '1', 4)" : ""}
          ) edges(source, target, cost, t)`);
        const result = table.distances("source", "target", "A", {
          weight: "cost",
          minimize,
          ...elapsedOptions,
        });
        if (direct) {
          expect(await result.getData()).toStrictEqual([
            {
              start: "A",
              node: "B",
              steps: 1,
              total: huge,
              elapsedTimeMs: 1000,
            },
            {
              start: "A",
              node: "C",
              steps: 1,
              total: "1",
              elapsedTimeMs: 1000,
            },
          ]);
        } else {
          await assertRejects(
            () => result.getData(),
            Error,
            "total exceeds the supported DECIMAL(38,0) range for an optimal route",
          );
        }
      }
    }
  } finally {
    await sdb.close();
  }
});
