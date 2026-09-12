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
    ? ["source", "target", "weight"]
    : ["source", "target"];
  return sdb.newTable(name)
    .loadData("test/data/graphs/edges.csv")
    .filter(`scenario = '${scenario}'`)
    .selectColumns(columns);
}

Deno.test("distances defaults to outgoing and supports every direction", async () => {
  const sdb = new SimpleDB();
  try {
    const expectedOutgoing = [
      { start: "A", node: "A", distance: 0 },
      { start: "A", node: "B", distance: 1 },
      { start: "A", node: "C", distance: 1 },
      { start: "A", node: "D", distance: 2 },
      { start: "A", node: "E", distance: 3 },
    ];
    assertEquals(
      await loadScenario(sdb, "outgoing", "baseline")
        .distances("source", "target", "A").getData(),
      expectedOutgoing,
    );
    assertEquals(
      await loadScenario(sdb, "explicitOutgoing", "baseline")
        .distances("source", "target", "A", { direction: "outgoing" })
        .getData(),
      expectedOutgoing,
    );
    assertEquals(
      await loadScenario(sdb, "incoming", "baseline")
        .distances("source", "target", "E", { direction: "incoming" })
        .getData(),
      [
        { start: "E", node: "A", distance: 3 },
        { start: "E", node: "B", distance: 2 },
        { start: "E", node: "C", distance: 2 },
        { start: "E", node: "D", distance: 1 },
        { start: "E", node: "E", distance: 0 },
      ],
    );
    assertEquals(
      await loadScenario(sdb, "both", "baseline")
        .distances("source", "target", "B", { direction: "both" })
        .getData(),
      [
        { start: "B", node: "A", distance: 1 },
        { start: "B", node: "B", distance: 0 },
        { start: "B", node: "C", distance: 2 },
        { start: "B", node: "D", distance: 1 },
        { start: "B", node: "E", distance: 2 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("distances minimizes hops and weighted costs independently", async () => {
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await loadScenario(sdb, "unweighted", "weighted", true)
        .distances("source", "target", "A").getData(),
      [
        { start: "A", node: "A", distance: 0 },
        { start: "A", node: "B", distance: 1 },
        { start: "A", node: "C", distance: 1 },
        { start: "A", node: "D", distance: 2 },
        { start: "A", node: "E", distance: 1 },
      ],
    );
    const weighted = loadScenario(sdb, "weighted", "weighted", true)
      .distances("source", "target", "A", { weight: "weight" });
    assertEquals(await weighted.getData(), [
      { start: "A", node: "A", distance: 0 },
      { start: "A", node: "B", distance: 1 },
      { start: "A", node: "C", distance: 0 },
      { start: "A", node: "D", distance: 2 },
      { start: "A", node: "E", distance: 3 },
    ]);
    assertEquals((await weighted.getTypes()).distance, "DOUBLE");
  } finally {
    await sdb.close();
  }
});

Deno.test("distances handles cycles, zero cycles, and competing parallel edges", async () => {
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await loadScenario(sdb, "cycle", "cycle")
        .distances("source", "target", "A").getData(),
      [
        { start: "A", node: "A", distance: 0 },
        { start: "A", node: "B", distance: 1 },
        { start: "A", node: "C", distance: 1 },
        { start: "A", node: "D", distance: 2 },
        { start: "A", node: "E", distance: 3 },
      ],
    );
    assertEquals(
      await loadScenario(sdb, "zeroCycle", "zero-cycle", true)
        .distances("source", "target", "A", { weight: "weight" })
        .getData(),
      [
        { start: "A", node: "A", distance: 0 },
        { start: "A", node: "B", distance: 0 },
        { start: "A", node: "C", distance: 2 },
      ],
    );
    assertEquals(
      await loadScenario(sdb, "parallel", "parallel", true)
        .distances("source", "target", "A", { weight: "weight" })
        .getData(),
      [
        { start: "A", node: "A", distance: 0 },
        { start: "A", node: "B", distance: 1 },
        { start: "A", node: "C", distance: 6 },
      ],
    );
    assertEquals(
      await loadScenario(sdb, "singleLoop", "single-loop", true)
        .distances("source", "target", "A", { weight: "weight" })
        .getData(),
      [{ start: "A", node: "A", distance: 0 }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("distances keeps fractional decimal and close floating costs exact", async () => {
  const sdb = new SimpleDB();
  try {
    const fractional = loadScenario(
      sdb,
      "fractional",
      "fraction-weight",
      true,
    ).distances("source", "target", "A", { weight: "weight" });
    assertEquals(await fractional.getData(), [
      { start: "A", node: "A", distance: 0 },
      { start: "A", node: "B", distance: 0.5 },
      { start: "A", node: "C", distance: 1.75 },
    ]);

    const decimal = sdb.newTable("decimalWeights");
    await sdb.customQuery(`CREATE TABLE "decimalWeights" AS
      SELECT * FROM (VALUES
        ('A', 'C', 0.31::DECIMAL(6,2)),
        ('A', 'B', 0.10::DECIMAL(6,2)),
        ('B', 'C', 0.20::DECIMAL(6,2))
      ) edges(source, target, weight)`);
    decimal.distances("source", "target", "A", { weight: "weight" });
    assertEquals(await decimal.getTypes(), {
      start: "VARCHAR",
      node: "VARCHAR",
      distance: "DECIMAL(38,2)",
    });
    assertEquals(await decimal.getData(), [
      { start: "A", node: "A", distance: "0.00" },
      { start: "A", node: "B", distance: "0.10" },
      { start: "A", node: "C", distance: "0.30" },
    ]);

    const floating = sdb.newTable("floatingWeights");
    await sdb.customQuery(`CREATE TABLE "floatingWeights" AS
      SELECT * FROM (VALUES
        ('A', 'C', 1.0000000000001::DOUBLE),
        ('A', 'B', 0.5::DOUBLE),
        ('B', 'C', 0.5::DOUBLE)
      ) edges(source, target, weight)`);
    floating.distances("source", "target", "A", { weight: "weight" });
    assertEquals(await floating.getData(), [
      { start: "A", node: "A", distance: 0 },
      { start: "A", node: "B", distance: 0.5 },
      { start: "A", node: "C", distance: 1 },
    ]);
    assertEquals((await floating.getTypes()).distance, "DOUBLE");
  } finally {
    await sdb.close();
  }
});

Deno.test("distances widens large integer accumulators without losing precision", async () => {
  const sdb = new SimpleDB();
  try {
    const bigint = sdb.newTable("bigintWeights");
    await sdb.customQuery(`CREATE TABLE "bigintWeights" AS
      SELECT * FROM (VALUES
        ('A', 'B', 9007199254740993::BIGINT),
        ('B', 'C', 2::BIGINT)
      ) edges(source, target, weight)`);
    bigint.distances("source", "target", "A", { weight: "weight" })
      .convert({ distance: "string" });
    assertEquals(await bigint.getData(), [
      { start: "A", node: "A", distance: "0" },
      { start: "A", node: "B", distance: "9007199254740993" },
      { start: "A", node: "C", distance: "9007199254740995" },
    ]);

    const maximum = "170141183460469231731687303715884105727";
    const hugeint = sdb.newTable("hugeintWeights");
    await sdb.customQuery(`CREATE TABLE "hugeintWeights" AS
      SELECT * FROM (VALUES
        ('A', 'B', '${maximum}'::HUGEINT),
        ('B', 'C', '${maximum}'::HUGEINT)
      ) edges(source, target, weight)`);
    hugeint.distances("source", "target", "A", { weight: "weight" });
    assertEquals((await hugeint.getTypes()).distance, "BIGNUM");
    assertEquals(await hugeint.getData(), [
      { start: "A", node: "A", distance: "0" },
      { start: "A", node: "B", distance: maximum },
      {
        start: "A",
        node: "C",
        distance: "340282366920938463463374607431768211454",
      },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("distances evaluates multi-starts independently and omits unknowns", async () => {
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await loadScenario(sdb, "multi", "baseline")
        .distances("source", "target", ["F", "unknown", "A"]).getData(),
      [
        { start: "A", node: "A", distance: 0 },
        { start: "A", node: "B", distance: 1 },
        { start: "A", node: "C", distance: 1 },
        { start: "A", node: "D", distance: 2 },
        { start: "A", node: "E", distance: 3 },
        { start: "F", node: "F", distance: 0 },
        { start: "F", node: "G", distance: 1 },
      ],
    );
    assertEquals(
      await loadScenario(sdb, "sink", "single")
        .distances("source", "target", "B").getData(),
      [{ start: "B", node: "B", distance: 0 }],
    );
    assertEquals(
      await loadScenario(sdb, "unknown", "baseline")
        .distances("source", "target", "unknown").getData(),
      [],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("distances preserves unsigned, arbitrary integer, and FLOAT sum types", async () => {
  const sdb = new SimpleDB();
  try {
    for (
      const [type, maximum, distanceType] of [
        ["UBIGINT", "18446744073709551615", "HUGEINT"],
        ["UHUGEINT", "340282366920938463463374607431768211455", "BIGNUM"],
        ["BIGNUM", "9".repeat(80), "BIGNUM"],
      ]
    ) {
      const table = sdb.newTable(`weights${type}`);
      await sdb.customQuery(`CREATE TABLE "${table.name}" AS
        SELECT * FROM (VALUES
          ('A', 'B', '${maximum}'::${type}),
          ('B', 'C', '${maximum}'::${type})
        ) edges(source, target, weight)`);
      table.distances("source", "target", "A", { weight: "weight" });
      assertEquals((await table.getTypes()).distance, distanceType);
      assertEquals(await table.convert({ distance: "string" }).getData(), [
        { start: "A", node: "A", distance: "0" },
        { start: "A", node: "B", distance: maximum },
        { start: "A", node: "C", distance: String(BigInt(maximum) * 2n) },
      ]);
    }

    const floating = sdb.newTable("singlePrecisionWeights");
    await sdb.customQuery(`CREATE TABLE "singlePrecisionWeights" AS
      SELECT * FROM (VALUES
        ('A', 'B', 16777216::FLOAT),
        ('B', 'C', 1::FLOAT)
      ) edges(source, target, weight)`);
    floating.distances("source", "target", "A", { weight: "weight" });
    assertEquals((await floating.getTypes()).distance, "FLOAT");
    assertEquals(await floating.getData(), [
      { start: "A", node: "A", distance: 0 },
      { start: "A", node: "B", distance: 16777216 },
      { start: "A", node: "C", distance: 16777216 },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("distances weighted relaxation agrees with all-pairs costs in every direction", async () => {
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
      const costs = Array.from(
        { length: 6 },
        (_, from) =>
          Array.from({ length: 6 }, (_, to) => from === to ? 0 : Infinity),
      );
      for (const { source, target, weight } of edges) {
        if (direction !== "incoming") {
          costs[source][target] = Math.min(costs[source][target], weight);
        }
        if (direction !== "outgoing") {
          costs[target][source] = Math.min(costs[target][source], weight);
        }
      }
      for (let via = 0; via < 6; via++) {
        for (let from = 0; from < 6; from++) {
          for (let to = 0; to < 6; to++) {
            costs[from][to] = Math.min(
              costs[from][to],
              costs[from][via] + costs[via][to],
            );
          }
        }
      }
      const expected = costs.flatMap((row, start) =>
        row.flatMap((distance, node) =>
          Number.isFinite(distance) ? [{ start, node, distance }] : []
        )
      );
      for (const rows of [edges, edges.toReversed()]) {
        assertEquals(
          await sdb.newTable().loadArray(rows)
            .distances("source", "target", [5, 4, 99, 3, 2, 1, 0], {
              direction,
              weight: "weight",
            }).getData(),
          expected,
        );
      }
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("distances sorts multi-start results in every direction", async () => {
  const sdb = new SimpleDB();
  const edges = [
    { source: "A", target: "B" },
    { source: "B", target: "C" },
    { source: "X", target: "Y" },
  ];
  const expected = {
    outgoing: [
      { start: "A", node: "A", distance: 0 },
      { start: "A", node: "B", distance: 1 },
      { start: "A", node: "C", distance: 2 },
      { start: "C", node: "C", distance: 0 },
    ],
    incoming: [
      { start: "A", node: "A", distance: 0 },
      { start: "C", node: "A", distance: 2 },
      { start: "C", node: "B", distance: 1 },
      { start: "C", node: "C", distance: 0 },
    ],
    both: [
      { start: "A", node: "A", distance: 0 },
      { start: "A", node: "B", distance: 1 },
      { start: "A", node: "C", distance: 2 },
      { start: "C", node: "A", distance: 2 },
      { start: "C", node: "B", distance: 1 },
      { start: "C", node: "C", distance: 0 },
    ],
  };
  try {
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      for (const rows of [edges, edges.toReversed()]) {
        assertEquals(
          await sdb.newTable().loadArray(rows)
            .distances("source", "target", ["C", "unknown", "A"], {
              direction,
            }).getData(),
          expected[direction],
        );
      }
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("distances scalar and singleton-array starts are equivalent", async () => {
  const sdb = new SimpleDB();
  try {
    const scalar = loadScenario(sdb, "scalar", "baseline")
      .distances("source", "target", "A");
    const singleton = loadScenario(sdb, "singleton", "baseline")
      .distances("source", "target", ["A"]);
    assertEquals(await scalar.getData(), await singleton.getData());
    assertEquals(await scalar.getTypes(), await singleton.getTypes());
  } finally {
    await sdb.close();
  }
});

Deno.test("distances supports numeric zero, numeric ordering, and custom columns", async () => {
  const sdb = new SimpleDB();
  try {
    const numeric = sdb.newTable("numeric")
      .loadData("test/data/graphs/numeric.csv")
      .distances("source", "target", 0, { weight: "weight" });
    assertEquals(await numeric.getData(), [
      { start: 0, node: 0, distance: 0 },
      { start: 0, node: 2, distance: 0 },
      { start: 0, node: 10, distance: 1 },
    ]);
    assertEquals(await numeric.getTypes(), {
      start: "BIGINT",
      node: "BIGINT",
      distance: "HUGEINT",
    });

    const custom = sdb.newTable("custom")
      .loadData("test/data/graphs/custom-columns.csv")
      .distances("ORIGIN", "Destination", "A", { weight: "COST" });
    assertEquals(await custom.getData(), [
      { start: "A", node: "A", distance: 0 },
      { start: "A", node: "B", distance: 1 },
      { start: "A", node: "C", distance: 3 },
    ]);
    assertEquals(await custom.getColumns(), ["start", "node", "distance"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("distances preserves exact decimal endpoint IDs through recursion", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("decimalIds");
    await sdb.customQuery(`CREATE TABLE "decimalIds" AS
      SELECT * FROM (VALUES
        (1::DECIMAL(20,0), 9007199254740993::DECIMAL(20,0)),
        (9007199254740993::DECIMAL(20,0), 9007199254740995::DECIMAL(20,0))
      ) edges(source, target)`);
    table.distances("source", "target", 9007199254740993n);
    assertEquals(await table.getTypes(), {
      start: "DECIMAL(20,0)",
      node: "DECIMAL(20,0)",
      distance: "BIGINT",
    });
    assertEquals(await table.getData(), [
      {
        start: "9007199254740993",
        node: "9007199254740993",
        distance: 0,
      },
      {
        start: "9007199254740993",
        node: "9007199254740995",
        distance: 1,
      },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("distances preserves typed schemas for empty inputs", async () => {
  const sdb = new SimpleDB();
  try {
    const unweighted = sdb.newTable("emptyUnweighted");
    await sdb.customQuery(
      'CREATE TABLE "emptyUnweighted" (source VARCHAR, target VARCHAR)',
    );
    unweighted.distances("source", "target", "A");
    assertEquals(await unweighted.getData(), []);
    assertEquals(await unweighted.getTypes(), {
      start: "VARCHAR",
      node: "VARCHAR",
      distance: "BIGINT",
    });

    const weighted = sdb.newTable("emptyWeighted");
    await sdb.customQuery(
      'CREATE TABLE "emptyWeighted" (source VARCHAR, target VARCHAR, weight DECIMAL(8,3))',
    );
    weighted.distances("source", "target", "A", { weight: "weight" });
    assertEquals(await weighted.getData(), []);
    assertEquals(await weighted.getTypes(), {
      start: "VARCHAR",
      node: "VARCHAR",
      distance: "DECIMAL(38,3)",
    });
  } finally {
    await sdb.close();
  }
});

Deno.test("distances supports overwrite and source-preserving output tables", async () => {
  const sdb = new SimpleDB();
  try {
    const overwritten = loadScenario(sdb, "overwritten", "baseline");
    assertStrictEquals(
      overwritten.distances("source", "target", "A", { outputTable: false }),
      overwritten,
    );
    assertEquals(await overwritten.getColumns(), ["start", "node", "distance"]);

    const source = loadScenario(sdb, "preserved", "baseline");
    const named = source.distances("source", "target", "A", {
      outputTable: "namedDistances",
    }).filter("node = 'E'");
    assertEquals(named.name, "namedDistances");
    assertEquals(await named.getData(), [
      { start: "A", node: "E", distance: 3 },
    ]);
    assertEquals(await source.getRowCount(), 6);
    assertEquals(await source.getColumns(), ["source", "target"]);

    const generated = source.distances("source", "target", "F", {
      outputTable: true,
    });
    assertEquals(generated.name.startsWith("table"), true);
    assertEquals(generated.name === source.name, false);
    assertEquals(await generated.getData(), [
      { start: "F", node: "F", distance: 0 },
      { start: "F", node: "G", distance: 1 },
    ]);
    assertEquals(await source.getRowCount(), 6);
  } finally {
    await sdb.close();
  }
});

Deno.test("distances snapshots starts and options before queued execution", async () => {
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
    const result = loadScenario(sdb, "snapshots", "baseline", true)
      .distances("source", "target", starts, options);
    starts[0] = "A";
    options.direction = "outgoing";
    options.weight = "changed";
    options.outputTable = "changed";

    assertEquals(result.name, "distanceSnapshot");
    assertEquals(await result.getData(), [
      { start: "E", node: "A", distance: 3 },
      { start: "E", node: "B", distance: 2 },
      { start: "E", node: "C", distance: 2 },
      { start: "E", node: "D", distance: 1 },
      { start: "E", node: "E", distance: 0 },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("distances validates arguments and schema cheaply", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      () => table.distances("source", "target", []),
      TypeError,
      "distances() start must not be an empty array.",
    );
    assertThrows(
      () => table.distances("source", "target", ["A", "A"]),
      TypeError,
      'distances() start contains duplicate IDs: "A".',
    );
    assertThrows(
      () => table.distances("source", "target", [0, 0n]),
      TypeError,
      "distances() start contains duplicate IDs: 0n.",
    );
    assertThrows(
      () => table.distances(1 as unknown as string, "target", "A"),
      TypeError,
      "distances() source must be a string.",
    );
    assertThrows(
      () => table.distances("source", 1 as unknown as string, "A"),
      TypeError,
      "distances() target must be a string.",
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
      () =>
        table.distances(
          "source",
          "target",
          "A",
          null as unknown as Record<string, never>,
        ),
      TypeError,
      "distances() options must be an object.",
    );
    assertEquals(table.pendingOps.length, 0);

    const missing = sdb.newTable("missing").loadArray([{ source: "A" }]);
    await assertRejects(
      () => missing.distances("source", "target", "A").run(),
      Error,
      'distances() the column "target" does not exist',
    );
    const missingWeight = sdb.newTable("missingWeight")
      .loadArray([{ source: "A", target: "B" }]);
    await assertRejects(
      () =>
        missingWeight.distances("source", "target", "A", {
          weight: "cost",
        }).run(),
      Error,
      'distances() the column "cost" does not exist',
    );
    const unsupported = sdb.newTable("unsupported")
      .loadData("test/data/graphs/unsupported-types.csv");
    await assertRejects(
      () =>
        unsupported.distances("stringTarget", "stringTarget", "A", {
          weight: "stringWeight",
        }).run(),
      TypeError,
      'column "stringWeight" has type VARCHAR',
    );
    const numeric = sdb.newTable("numericMismatch")
      .loadData("test/data/graphs/numeric.csv");
    await assertRejects(
      () => numeric.distances("source", "target", "0").run(),
      TypeError,
      "start contains string IDs",
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("distances rejects output collisions before queuing graph work", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("source")
      .loadArray([{ source: "A", target: "B" }]);
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
    assertEquals(source.pendingOps.length, 0);
  } finally {
    await sdb.close();
  }
});

Deno.test("distances preserves queued source and output operation order", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("changingSource")
      .loadArray([{ source: "A", target: "B" }]);
    const result = source.distances("source", "target", "A", {
      outputTable: true,
    });
    source.loadArray([{ source: "A", target: "C" }]);
    assertEquals(await result.getData(), [
      { start: "A", node: "A", distance: 0 },
      { start: "A", node: "B", distance: 1 },
    ]);
    assertEquals(await source.getData(), [{ source: "A", target: "C" }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("distances output records its source as a cache dependency", async () => {
  let computationRuns = 0;
  const unique = crypto.randomUUID().replaceAll("-", "");
  const outputName = `distancesCacheOutput${unique}`;
  const sourceName = `distancesCacheSource${unique}`;
  const compute = (source: SimpleTable) => async (output: SimpleTable) => {
    computationRuns++;
    const result = source.distances("source", "target", "A", {
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
    const source = secondSdb.newTable(sourceName)
      .loadArray([{ source: "A", target: "C" }]);
    const output = secondSdb.newTable(outputName);
    await output.cache(compute(source));
    assertEquals(computationRuns, 2);
    assertEquals(await output.getData(), [
      { start: "A", node: "A", distance: 0 },
      { start: "A", node: "C", distance: 1 },
    ]);
  } finally {
    await secondSdb.close();
  }
});

Deno.test("distances uses keyed best-distance recursion without path enumeration", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const table = loadScenario(sdb, "recursiveShape", "weighted", true)
      .distances("source", "target", "A", { weight: "weight" });
    await table.run();
    const queries = observer.queries.filter((entry) =>
      entry.query.includes("CREATE OR REPLACE TABLE")
    );
    const query = queries.find((entry) =>
      entry.query.includes("graph_distances")
    )?.query ?? "";
    assertEquals(
      queries.filter((entry) => entry.query.includes("weight")).length,
      1,
    );
    assertStringIncludes(query, "WITH RECURSIVE");
    assertStringIncludes(query, "USING KEY");
    assertStringIncludes(query, "recurring.");
    assertStringIncludes(query, "MIN(");
    assertEquals(query.includes("path"), false);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

Deno.test("distances internal relations do not shadow input table names", async () => {
  const sdb = new SimpleDB();
  try {
    for (
      const name of [
        "graph_start_values",
        "GRAPH_STARTS",
        "graph_edges",
        "GRAPH_NODES",
        "graph_distances",
      ]
    ) {
      const table = sdb.newTable(name)
        .loadArray([{ source: "A", target: "B", weight: 2 }]);
      await table.run();
      assertEquals(
        await table.distances("source", "target", "A", {
          weight: "weight",
        }).getData(),
        [
          { start: "A", node: "A", distance: 0 },
          { start: "A", node: "B", distance: 2 },
        ],
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("distances JSDoc examples return their complete displayed outputs", async () => {
  const sdb = new SimpleDB();
  const edges = [
    { origin: "A", destination: "B", minutes: 4 },
    { origin: "B", destination: "C", minutes: 1 },
    { origin: "D", destination: "B", minutes: 2 },
  ];
  try {
    assertEquals(
      await sdb.newTable().loadArray(edges)
        .distances("origin", "destination", "A").getData(),
      [
        { start: "A", node: "A", distance: 0 },
        { start: "A", node: "B", distance: 1 },
        { start: "A", node: "C", distance: 2 },
      ],
    );
    assertEquals(
      await sdb.newTable().loadArray(edges)
        .distances("origin", "destination", "A", { weight: "minutes" })
        .getData(),
      [
        { start: "A", node: "A", distance: 0 },
        { start: "A", node: "B", distance: 4 },
        { start: "A", node: "C", distance: 5 },
      ],
    );
    assertEquals(
      await sdb.newTable().loadArray(edges)
        .distances("origin", "destination", "C", {
          direction: "incoming",
        }).getData(),
      [
        { start: "C", node: "A", distance: 2 },
        { start: "C", node: "B", distance: 1 },
        { start: "C", node: "C", distance: 0 },
        { start: "C", node: "D", distance: 2 },
      ],
    );
    assertEquals(
      await sdb.newTable().loadArray(edges)
        .distances("origin", "destination", "A", { direction: "both" })
        .getData(),
      [
        { start: "A", node: "A", distance: 0 },
        { start: "A", node: "B", distance: 1 },
        { start: "A", node: "C", distance: 2 },
        { start: "A", node: "D", distance: 2 },
      ],
    );
    assertEquals(
      await sdb.newTable().loadArray(edges)
        .distances("origin", "destination", ["D", "A"], {
          weight: "minutes",
          outputTable: "travelTimes",
        }).getData(),
      [
        { start: "A", node: "A", distance: 0 },
        { start: "A", node: "B", distance: 4 },
        { start: "A", node: "C", distance: 5 },
        { start: "D", node: "B", distance: 2 },
        { start: "D", node: "C", distance: 3 },
        { start: "D", node: "D", distance: 0 },
      ],
    );
  } finally {
    await sdb.close();
  }
});
