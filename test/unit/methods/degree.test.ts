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
  includeWeight = false,
): SimpleTable {
  return sdb.newTable(name)
    .loadData("test/data/graphs/edges.csv")
    .filter(`scenario = '${scenario}'`)
    .selectColumns(
      includeWeight ? ["source", "target", "weight"] : ["source", "target"],
    );
}

async function expectedCase(
  oracle: SimpleTable,
  caseName: string,
): Promise<Record<string, unknown>[]> {
  return await oracle.clone()
    .filter(`"case" = '${caseName}'`)
    .removeColumns("case")
    .getData();
}

Deno.test("degree matches every shared fixture oracle case", async () => {
  const cases = [
    ["baseline-edges", "baseline", "edges", false],
    ["parallel-edges", "parallel", "edges", false],
    ["parallel-neighbors", "parallel", "neighbors", false],
    ["self-loop-edges", "self-loop", "edges", false],
    ["self-loop-neighbors", "self-loop", "neighbors", false],
    ["degree-weight-weighted", "degree-weight", "edges", true],
    ["single-loop-edges", "single-loop", "edges", false],
    ["single-loop-neighbors", "single-loop", "neighbors", false],
    ["single-loop-weighted", "single-loop", "edges", true],
  ] as const;
  const sdb = new SimpleDB();
  try {
    const oracle = sdb.newTable("degreeOracle")
      .loadData("test/data/graphs/expected/degree.csv");
    for (
      const [index, [caseName, scenario, count, weighted]] of cases.entries()
    ) {
      const input = loadScenario(
        sdb,
        `degreeOracleInput${index}`,
        scenario,
        weighted,
      );
      const actual = weighted
        ? input.degree("source", "target", { weight: "weight" })
        : count === "neighbors"
        ? input.degree("source", "target", { count })
        : input.degree("source", "target");
      assertEquals(
        await actual.getData(),
        await expectedCase(oracle, caseName),
        caseName,
      );
      assertEquals(await actual.getColumns(), ["node", "incoming", "outgoing"]);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("degree distinguishes edge, neighbor, and weighted counts", async () => {
  const rows = [
    { source: "Montreal", target: "Toronto", passengers: 100 },
    { source: "Montreal", target: "Toronto", passengers: 200 },
    { source: "Montreal", target: "Vancouver", passengers: 50 },
    { source: "Ottawa", target: "Montreal", passengers: 25 },
  ];
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await sdb.newTable().loadArray(rows)
        .degree("source", "target").getData(),
      [
        { node: "Montreal", incoming: 1, outgoing: 3 },
        { node: "Ottawa", incoming: 0, outgoing: 1 },
        { node: "Toronto", incoming: 2, outgoing: 0 },
        { node: "Vancouver", incoming: 1, outgoing: 0 },
      ],
    );
    assertEquals(
      await sdb.newTable().loadArray(rows)
        .degree("source", "target", { count: "edges" }).getData(),
      [
        { node: "Montreal", incoming: 1, outgoing: 3 },
        { node: "Ottawa", incoming: 0, outgoing: 1 },
        { node: "Toronto", incoming: 2, outgoing: 0 },
        { node: "Vancouver", incoming: 1, outgoing: 0 },
      ],
    );
    assertEquals(
      await sdb.newTable().loadArray(rows)
        .degree("source", "target", { count: "neighbors" }).getData(),
      [
        { node: "Montreal", incoming: 1, outgoing: 2 },
        { node: "Ottawa", incoming: 0, outgoing: 1 },
        { node: "Toronto", incoming: 1, outgoing: 0 },
        { node: "Vancouver", incoming: 1, outgoing: 0 },
      ],
    );
    assertEquals(
      await sdb.newTable().loadArray(rows)
        .degree("source", "target", { weight: "passengers" }).getData(),
      [
        { node: "Montreal", incoming: 25, outgoing: 350 },
        { node: "Ottawa", incoming: 0, outgoing: 25 },
        { node: "Toronto", incoming: 300, outgoing: 0 },
        { node: "Vancouver", incoming: 50, outgoing: 0 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("degree handles sources, sinks, convergence, disconnection, and self-loops", async () => {
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await loadScenario(sdb, "baselineDegree", "baseline")
        .degree("source", "target").getData(),
      [
        { node: "A", incoming: 0, outgoing: 2 },
        { node: "B", incoming: 1, outgoing: 1 },
        { node: "C", incoming: 1, outgoing: 1 },
        { node: "D", incoming: 2, outgoing: 1 },
        { node: "E", incoming: 1, outgoing: 0 },
        { node: "F", incoming: 0, outgoing: 1 },
        { node: "G", incoming: 1, outgoing: 0 },
      ],
    );
    assertEquals(
      await sdb.newTable().loadArray([
        { source: "A", target: "A", weight: 2.5 },
        { source: "A", target: "B", weight: 0 },
      ]).degree("source", "target", { weight: "weight" }).getData(),
      [
        { node: "A", incoming: 2.5, outgoing: 2.5 },
        { node: "B", incoming: 0, outgoing: 0 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("degree preserves exact numeric IDs, weight precision, and typed ordering", async () => {
  const sdb = new SimpleDB();
  try {
    const ids = sdb.newTable("preciseDegreeIds");
    await sdb.customQuery(`CREATE TABLE "preciseDegreeIds" AS
      SELECT * FROM (VALUES
        (9007199254740995::BIGINT, 9007199254740993::BIGINT),
        (0::BIGINT, 2::BIGINT),
        (0::BIGINT, 10::BIGINT)
      ) edges(source, target)`);
    ids.degree("source", "target").convert({ node: "string" });
    assertEquals(await ids.getData(), [
      { node: "0", incoming: 0, outgoing: 2 },
      { node: "2", incoming: 1, outgoing: 0 },
      { node: "10", incoming: 1, outgoing: 0 },
      { node: "9007199254740993", incoming: 1, outgoing: 0 },
      { node: "9007199254740995", incoming: 0, outgoing: 1 },
    ]);

    const decimal = sdb.newTable("decimalDegreeWeights");
    await sdb.customQuery(`CREATE TABLE "decimalDegreeWeights" AS
      SELECT source, target, weight::DECIMAL(12, 3) AS weight
      FROM (VALUES
        ('A', 'B', 0.125), ('A', 'B', 0.200), ('B', 'A', 0.000)
      ) edges(source, target, weight)`);
    decimal.degree("source", "target", { weight: "weight" });
    assertEquals(await decimal.getTypes(), {
      node: "VARCHAR",
      incoming: "DECIMAL(38,3)",
      outgoing: "DECIMAL(38,3)",
    });
    assertEquals(await decimal.getData(), [
      { node: "A", incoming: "0.000", outgoing: "0.325" },
      { node: "B", incoming: "0.325", outgoing: "0.000" },
    ]);

    const integers = sdb.newTable("largeDegreeWeights");
    await sdb.customQuery(`CREATE TABLE "largeDegreeWeights" AS
      SELECT * FROM (VALUES
        ('A', 'B', 9007199254740993::BIGINT),
        ('A', 'B', 2::BIGINT)
      ) edges(source, target, weight)`);
    integers.degree("source", "target", { weight: "weight" })
      .convert({ incoming: "string", outgoing: "string" });
    assertEquals(await integers.getData(), [
      { node: "A", incoming: "0", outgoing: "9007199254740995" },
      { node: "B", incoming: "9007199254740995", outgoing: "0" },
    ]);

    const maximumHugeint = "170141183460469231731687303715884105727";
    const doubledHugeint = "340282366920938463463374607431768211454";
    const hugeints = sdb.newTable("hugeintDegreeWeights");
    await sdb.customQuery(`CREATE TABLE "hugeintDegreeWeights" AS
      SELECT * FROM (VALUES
        ('A', 'B', '${maximumHugeint}'::HUGEINT),
        ('A', 'B', '${maximumHugeint}'::HUGEINT)
      ) edges(source, target, weight)`);
    hugeints.degree("source", "target", { weight: "weight" });
    assertEquals(await hugeints.getTypes(), {
      node: "VARCHAR",
      incoming: "BIGNUM",
      outgoing: "BIGNUM",
    });
    assertEquals(await hugeints.getData(), [
      { node: "A", incoming: "0", outgoing: doubledHugeint },
      { node: "B", incoming: doubledHugeint, outgoing: "0" },
    ]);

    const largeBignum = "100000000000000000000000000000000000000000000000001";
    const doubledBignum = "200000000000000000000000000000000000000000000000002";
    const bignums = sdb.newTable("bignumDegreeWeights");
    await sdb.customQuery(`CREATE TABLE "bignumDegreeWeights" AS
      SELECT * FROM (VALUES
        ('A', 'B', '${largeBignum}'::BIGNUM),
        ('A', 'B', '${largeBignum}'::BIGNUM)
      ) edges(source, target, weight)`);
    bignums.degree("source", "target", { weight: "weight" });
    assertEquals(await bignums.getTypes(), {
      node: "VARCHAR",
      incoming: "BIGNUM",
      outgoing: "BIGNUM",
    });
    assertEquals(await bignums.getData(), [
      { node: "A", incoming: "0", outgoing: doubledBignum },
      { node: "B", incoming: doubledBignum, outgoing: "0" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("degree retains FLOAT and DOUBLE weighted sum semantics", async () => {
  const sdb = new SimpleDB();
  try {
    for (const type of ["FLOAT", "DOUBLE"] as const) {
      const table = sdb.newTable(`degree${type}Weights`);
      await sdb.customQuery(`CREATE TABLE "${table.name}" AS
        SELECT source, target, weight::${type} AS weight FROM (VALUES
          ('A', 'B', 0.1), ('A', 'B', 0.2), ('B', 'B', 0.0),
          ('C', 'D', 16777216), ('C', 'D', 1)
        ) edges(source, target, weight)`);
      assertEquals(
        await sdb.customQuery(
          `SELECT SUM(weight) AS total, TYPEOF(SUM(weight)) AS type
           FROM "${table.name}" WHERE source = 'C'`,
          { returnData: true },
        ),
        [{ total: 16777217, type: "DOUBLE" }],
      );
      const result = table.degree("source", "target", {
        weight: "weight",
        outputTable: true,
      });
      const sum = type === "FLOAT"
        ? Math.fround(0.1) + Math.fround(0.2)
        : 0.1 + 0.2;
      assertEquals(await result.getTypes(), {
        node: "VARCHAR",
        incoming: "DOUBLE",
        outgoing: "DOUBLE",
      });
      assertEquals(await result.getData(), [
        { node: "A", incoming: 0, outgoing: sum },
        { node: "B", incoming: sum, outgoing: 0 },
        { node: "C", incoming: 0, outgoing: 16777217 },
        { node: "D", incoming: 16777217, outgoing: 0 },
      ]);
      const empty = table.filter("false")
        .degree("source", "target", { weight: "weight" });
      assertEquals(await empty.getData(), []);
      assertEquals(await empty.getTypes(), {
        node: "VARCHAR",
        incoming: "DOUBLE",
        outgoing: "DOUBLE",
      });
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("degree uses byte-sensitive string identity despite collations", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("collatedDegree");
    await sdb.customQuery(`CREATE TABLE "collatedDegree" (
      source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE
    ); INSERT INTO "collatedDegree" VALUES
      ('a', 'b'), ('A', 'B'), ('001', '1'), (' A', 'A'), ('é', 'é')`);
    assertEquals(await table.degree("source", "target").getData(), [
      { node: " A", incoming: 0, outgoing: 1 },
      { node: "001", incoming: 0, outgoing: 1 },
      { node: "1", incoming: 1, outgoing: 0 },
      { node: "A", incoming: 1, outgoing: 1 },
      { node: "B", incoming: 1, outgoing: 0 },
      { node: "a", incoming: 0, outgoing: 1 },
      { node: "b", incoming: 1, outgoing: 0 },
      { node: "é", incoming: 1, outgoing: 1 },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("degree distinct neighbors preserve collated IDs and parallel self-loops", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("collatedDegreeNeighbors");
    await sdb.customQuery(`CREATE TABLE "collatedDegreeNeighbors" (
      source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE
    ); INSERT INTO "collatedDegreeNeighbors" VALUES
      ('A', 'b'), ('A', 'B'), ('A', 'b'), ('A', 'A'), ('A', 'A'),
      ('a', 'B'), ('a', 'B')`);
    assertEquals(
      await table.degree("source", "target", { count: "neighbors" }).getData(),
      [
        { node: "A", incoming: 1, outgoing: 3 },
        { node: "B", incoming: 2, outgoing: 0 },
        { node: "a", incoming: 0, outgoing: 1 },
        { node: "b", incoming: 1, outgoing: 0 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("degree output is deterministic across shuffled edge rows", async () => {
  const rows = [
    { source: "D", target: "D" },
    { source: "A", target: "B" },
    { source: "A", target: "B" },
    { source: "C", target: "D" },
    { source: "B", target: "D" },
  ];
  const sdb = new SimpleDB();
  try {
    for (const count of ["edges", "neighbors"] as const) {
      const outputs = [];
      for (const [index, input] of [rows, rows.toReversed()].entries()) {
        outputs.push(
          await sdb.newTable(`${count}DegreeOrder${index}`).loadArray(input)
            .degree("source", "target", { count }).getData(),
        );
      }
      assertEquals(outputs[0], outputs[1]);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("degree keeps fixed custom output names and typed empty schemas", async () => {
  const sdb = new SimpleDB();
  try {
    const custom = sdb.newTable("customDegree")
      .loadData("test/data/graphs/custom-columns.csv")
      .degree("ORIGIN", "Destination", { weight: "COST" });
    assertEquals(await custom.getColumns(), ["node", "incoming", "outgoing"]);
    assertEquals(await custom.getData(), [
      { node: "A", incoming: 0, outgoing: 1 },
      { node: "B", incoming: 1, outgoing: 2 },
      { node: "C", incoming: 2, outgoing: 0 },
    ]);

    const empty = sdb.newTable("emptyDegree");
    await sdb.customQuery(
      'CREATE TABLE "emptyDegree" (source BIGINT, target BIGINT, weight DECIMAL(6,2))',
    );
    const counts = empty.degree("source", "target", { outputTable: true });
    assertEquals(await counts.getData(), []);
    assertEquals(await counts.getTypes(), {
      node: "BIGINT",
      incoming: "BIGINT",
      outgoing: "BIGINT",
    });
    const weighted = empty.degree("source", "target", {
      weight: "weight",
      outputTable: true,
    });
    assertEquals(await weighted.getData(), []);
    assertEquals(await weighted.getTypes(), {
      node: "BIGINT",
      incoming: "DECIMAL(38,2)",
      outgoing: "DECIMAL(38,2)",
    });
  } finally {
    await sdb.close();
  }
});

Deno.test("degree supports every output destination and chaining", async () => {
  const sdb = new SimpleDB();
  try {
    const defaultOverwrite = sdb.newTable("defaultDegree")
      .loadArray([{ source: "A", target: "B" }]);
    assertStrictEquals(
      defaultOverwrite.degree("source", "target"),
      defaultOverwrite,
    );
    assertEquals(await defaultOverwrite.getColumns(), [
      "node",
      "incoming",
      "outgoing",
    ]);

    const explicitOverwrite = sdb.newTable("explicitDegree")
      .loadArray([{ source: "A", target: "B" }]);
    assertStrictEquals(
      explicitOverwrite.degree("source", "target", { outputTable: false }),
      explicitOverwrite,
    );
    assertEquals(await explicitOverwrite.getRowCount(), 2);

    const source = sdb.newTable("preservedDegree")
      .loadArray([{ source: "A", target: "B" }]);
    const named = source.degree("source", "target", {
      outputTable: "namedDegree",
    }).filter("node = 'B'");
    assertEquals(named.name, "namedDegree");
    assertEquals(await named.getData(), [{
      node: "B",
      incoming: 1,
      outgoing: 0,
    }]);
    assertEquals(await source.getData(), [{ source: "A", target: "B" }]);

    const generated = source.degree("source", "target", { outputTable: true });
    assertEquals(generated.name.startsWith("table"), true);
    assertEquals(generated.name === source.name, false);
    assertEquals(await generated.getRowCount(), 2);
    assertEquals(await source.getColumns(), ["source", "target"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("degree snapshots options and preserves queued source order", async () => {
  const sdb = new SimpleDB();
  try {
    const options: {
      count: "edges" | "neighbors";
      weight?: string;
      outputTable: string;
    } = { count: "neighbors", outputTable: "degreeSnapshot" };
    const snapshot = sdb.newTable("snapshotDegreeSource").loadArray([
      { source: "A", target: "B" },
      { source: "A", target: "B" },
    ]).degree("source", "target", options);
    options.count = "edges";
    options.weight = "changed";
    options.outputTable = "changed";
    assertEquals(snapshot.name, "degreeSnapshot");
    assertEquals(await snapshot.getData(), [
      { node: "A", incoming: 0, outgoing: 1 },
      { node: "B", incoming: 1, outgoing: 0 },
    ]);

    const source = sdb.newTable("changingDegreeSource")
      .loadArray([{ source: "A", target: "B" }]);
    const result = source.degree("source", "target", { outputTable: true });
    source.loadArray([{ source: "A", target: "C" }]);
    assertEquals(await result.getData(), [
      { node: "A", incoming: 0, outgoing: 1 },
      { node: "B", incoming: 1, outgoing: 0 },
    ]);
    assertEquals(await source.getData(), [{ source: "A", target: "C" }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("degree validates arguments before queuing", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      () => table.degree(1 as unknown as string, "target"),
      TypeError,
      "degree() source must be a string.",
    );
    assertThrows(
      () => table.degree("source", 1 as unknown as string),
      TypeError,
      "degree() target must be a string.",
    );
    assertThrows(
      () => table.degree("source", "target", null as never),
      TypeError,
      "degree() options must be an object.",
    );
    assertThrows(
      () => table.degree("source", "target", { count: "all" as "edges" }),
      TypeError,
      'degree() options.count must be "edges" or "neighbors".',
    );
    assertThrows(
      () =>
        table.degree("source", "target", { weight: 1 as unknown as string }),
      TypeError,
      "degree() options.weight must be a string.",
    );
    assertThrows(
      () =>
        table.degree("source", "target", {
          outputTable: 1 as unknown as boolean,
        }),
      TypeError,
      "degree() options.outputTable must be a string or boolean.",
    );
    assertThrows(
      () =>
        table.degree("source", "target", {
          count: "neighbors",
          weight: "weight",
        }),
      TypeError,
      "weighted sums operate on edges, not distinct neighbors",
    );
    assertEquals(table.pendingOps.length, 0);
  } finally {
    await sdb.close();
  }
});

Deno.test("degree rejects schema errors without row validation scans", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const missing = sdb.newTable("missingDegreeColumn")
      .loadArray([{ source: "A" }]);
    await assertRejects(
      () => missing.degree("source", "target").run(),
      Error,
      'degree() the column "target" does not exist',
    );

    const unsupported = sdb.newTable("unsupportedDegree")
      .loadData("test/data/graphs/unsupported-types.csv");
    await assertRejects(
      () => unsupported.degree("dateSource", "stringTarget").run(),
      TypeError,
      'column "dateSource" has type DATE',
    );
    await assertRejects(
      () =>
        unsupported.degree("stringTarget", "stringTarget", {
          weight: "stringWeight",
        }).run(),
      TypeError,
      'column "stringWeight" has type VARCHAR',
    );

    const incompatible = sdb.newTable("incompatibleDegree")
      .loadArray([{ source: 1, target: "1" }]);
    await assertRejects(
      () => incompatible.degree("source", "target").run(),
      TypeError,
      "requires compatible source and target ID types",
    );

    const valid = sdb.newTable("degreeNoPreflight").loadArray([
      { source: "A", target: "A", weight: 0 },
    ]).degree("source", "target", { weight: "weight" });
    await valid.run();
    const query = observer.queries.find((entry) =>
      entry.query.includes("graph_incoming")
    )?.query ?? "";
    assertStringIncludes(query, "SUM(");
    assertEquals(query.includes("isfinite"), false);
    assertEquals(query.includes("IS NULL"), false);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

Deno.test("degree rejects output collisions before queuing graph work", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("degreeCollisionSource")
      .loadArray([{ source: "A", target: "B" }]);
    await source.run();
    sdb.newTable("namedDegreeCollision");
    assertThrows(
      () =>
        source.degree("source", "target", {
          outputTable: "NAMEDDEGREECOLLISION",
        }),
      Error,
      "Table NAMEDDEGREECOLLISION already exists.",
    );
    assertEquals(source.pendingOps.length, 0);
  } finally {
    await sdb.close();
  }
});

Deno.test("degree output records its source as a cache dependency", async () => {
  let computationRuns = 0;
  const unique = crypto.randomUUID().replaceAll("-", "");
  const outputName = `degreeCacheOutput${unique}`;
  const sourceName = `degreeCacheSource${unique}`;
  const compute = (source: SimpleTable) => async (output: SimpleTable) => {
    computationRuns++;
    const result = source.degree("source", "target", { outputTable: true });
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
      { source: "A", target: "C" },
    ]);
    const output = secondSdb.newTable(outputName);
    await output.cache(compute(source));
    assertEquals(computationRuns, 2);
    assertEquals(await output.getData(), [
      { node: "A", incoming: 0, outgoing: 2 },
      { node: "B", incoming: 1, outgoing: 0 },
      { node: "C", incoming: 1, outgoing: 0 },
    ]);
  } finally {
    await secondSdb.close();
  }
});

Deno.test("degree internal relations do not shadow input table names", async () => {
  const sdb = new SimpleDB();
  try {
    for (
      const [index, name] of [
        "graph_edges",
        "GRAPH_NODE_CANDIDATES",
        "graph_nodes",
        "GRAPH_INCOMING",
        "graph_outgoing",
      ].entries()
    ) {
      const table = sdb.newTable(name).loadArray([
        { source: "A", target: "B", weight: 2 },
      ]);
      await table.run();
      const result = index % 2 === 0
        ? table.degree("source", "target")
        : table.degree("source", "target", { weight: "weight" });
      assertEquals(await result.getRowCount(), 2);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("degree JSDoc examples return their displayed outputs", async () => {
  const rows = [
    { origin: "Montreal", destination: "Toronto", passengers: 100 },
    { origin: "Montreal", destination: "Toronto", passengers: 200 },
    { origin: "Montreal", destination: "Vancouver", passengers: 50 },
  ];
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await sdb.newTable().loadArray(rows)
        .degree("origin", "destination").getData(),
      [
        { node: "Montreal", incoming: 0, outgoing: 3 },
        { node: "Toronto", incoming: 2, outgoing: 0 },
        { node: "Vancouver", incoming: 1, outgoing: 0 },
      ],
    );
    assertEquals(
      await sdb.newTable().loadArray(rows)
        .degree("origin", "destination", { count: "neighbors" }).getData(),
      [
        { node: "Montreal", incoming: 0, outgoing: 2 },
        { node: "Toronto", incoming: 1, outgoing: 0 },
        { node: "Vancouver", incoming: 1, outgoing: 0 },
      ],
    );
    const flights = sdb.newTable("degreeExampleFlights").loadArray(rows);
    assertEquals(
      await flights.degree("origin", "destination", {
        weight: "passengers",
        outputTable: "passengerTotals",
      }).getData(),
      [
        { node: "Montreal", incoming: 0, outgoing: 350 },
        { node: "Toronto", incoming: 300, outgoing: 0 },
        { node: "Vancouver", incoming: 50, outgoing: 0 },
      ],
    );
    assertEquals(
      await sdb.newTable().loadArray([
        { source: "A", target: "A" },
        { source: "A", target: "B" },
      ]).degree("source", "target").getData(),
      [
        { node: "A", incoming: 1, outgoing: 2 },
        { node: "B", incoming: 1, outgoing: 0 },
      ],
    );
  } finally {
    await sdb.close();
  }
});
