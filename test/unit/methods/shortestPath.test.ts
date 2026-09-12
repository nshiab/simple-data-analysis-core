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

function baselineRoutes() {
  return [
    {
      pathId: 0,
      step: 1,
      edgeId: "B1",
      source: "A",
      target: "B",
      weight: 1,
      distance: 1,
    },
    {
      pathId: 0,
      step: 2,
      edgeId: "B3",
      source: "B",
      target: "D",
      weight: 1,
      distance: 2,
    },
    {
      pathId: 0,
      step: 3,
      edgeId: "B5",
      source: "D",
      target: "E",
      weight: 1,
      distance: 3,
    },
    {
      pathId: 1,
      step: 1,
      edgeId: "B2",
      source: "A",
      target: "C",
      weight: 1,
      distance: 1,
    },
    {
      pathId: 1,
      step: 2,
      edgeId: "B4",
      source: "C",
      target: "D",
      weight: 1,
      distance: 2,
    },
    {
      pathId: 1,
      step: 3,
      edgeId: "B5",
      source: "D",
      target: "E",
      weight: 1,
      distance: 3,
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
          source: "E",
          target: "D",
          weight: 1,
          distance: 1,
        },
        {
          pathId: 0,
          step: 2,
          edgeId: "B3",
          source: "D",
          target: "B",
          weight: 1,
          distance: 2,
        },
        {
          pathId: 0,
          step: 3,
          edgeId: "B1",
          source: "B",
          target: "A",
          weight: 1,
          distance: 3,
        },
        {
          pathId: 1,
          step: 1,
          edgeId: "B5",
          source: "E",
          target: "D",
          weight: 1,
          distance: 1,
        },
        {
          pathId: 1,
          step: 2,
          edgeId: "B4",
          source: "D",
          target: "C",
          weight: 1,
          distance: 2,
        },
        {
          pathId: 1,
          step: 3,
          edgeId: "B2",
          source: "C",
          target: "A",
          weight: 1,
          distance: 3,
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
        source: "B",
        target: "A",
        weight: 1,
        distance: 1,
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
      await loadScenario(sdb, "unweighted", "weighted", true)
        .shortestPath("source", "target", "edgeId", "A", "E").getData(),
      [{
        pathId: 0,
        step: 1,
        edgeId: "W1",
        source: "A",
        target: "E",
        weight: 1,
        distance: 1,
      }],
    );
    assertEquals(
      await loadScenario(sdb, "weighted", "weighted", true)
        .shortestPath("source", "target", "edgeId", "A", "E", {
          weight: "weight",
        }).getData(),
      [
        {
          pathId: 0,
          step: 1,
          edgeId: "W2",
          source: "A",
          target: "B",
          weight: 1,
          distance: 1,
        },
        {
          pathId: 0,
          step: 2,
          edgeId: "W3",
          source: "B",
          target: "D",
          weight: 1,
          distance: 2,
        },
        {
          pathId: 0,
          step: 3,
          edgeId: "W4",
          source: "D",
          target: "E",
          weight: 1,
          distance: 3,
        },
        {
          pathId: 1,
          step: 1,
          edgeId: "W5",
          source: "A",
          target: "C",
          weight: 0,
          distance: 0,
        },
        {
          pathId: 1,
          step: 2,
          edgeId: "W6",
          source: "C",
          target: "E",
          weight: 3,
          distance: 3,
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
      weight: "weight",
    }).getData();
    assertEquals(weightedParallel.map((row) => row.edgeId), ["P1", "P3"]);

    const equalParallel = await loadScenario(
      sdb,
      "equalParallel",
      "parallel-equal",
      true,
    ).shortestPath("source", "target", "edgeId", "A", "C", {
      weight: "weight",
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
        distance: 1,
      }],
    );
    assertEquals(
      await loadScenario(sdb, "zeroCycle", "zero-cycle", true)
        .shortestPath("source", "target", "edgeId", "A", "C", {
          weight: "weight",
        }).getData(),
      [
        {
          pathId: 0,
          step: 1,
          edgeId: "Z1",
          source: "A",
          target: "B",
          weight: 0,
          distance: 0,
        },
        {
          pathId: 0,
          step: 2,
          edgeId: "Z2",
          source: "B",
          target: "C",
          weight: 2,
          distance: 2,
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
      ) edges(edgeId, source, target, weight)`);
    const tied = await floating
      .shortestPath("source", "target", "edgeId", "A", "E", {
        weight: "weight",
      }).getData();
    assertEquals(tied.map((row) => [row.pathId, row.edgeId]), [
      [0, "E1"],
      [0, "E4"],
      [1, "E2"],
      [1, "E3"],
      [1, "E4"],
    ]);
    assertEquals(
      tied.filter((row) => row.target === "E").map((row) => row.distance),
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
      ) edges(edgeId, source, target, weight)`);
    assertEquals(
      (await actualTie.shortestPath(
        "source",
        "target",
        "edgeId",
        "A",
        "C",
        { weight: "weight" },
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
      .shortestPath("source", "target", "edgeId", 0, 10, {
        weight: "weight",
      });
    assertEquals(await numeric.getData(), [
      {
        pathId: 0,
        step: 1,
        edgeId: 0,
        source: 0,
        target: 10,
        weight: 1,
        distance: 1,
      },
      {
        pathId: 1,
        step: 1,
        edgeId: 1,
        source: 0,
        target: 2,
        weight: 0,
        distance: 0,
      },
      {
        pathId: 1,
        step: 2,
        edgeId: 2,
        source: 2,
        target: 10,
        weight: 1,
        distance: 1,
      },
    ]);
    assertEquals(await numeric.getTypes(), {
      pathId: "BIGINT",
      step: "BIGINT",
      edgeId: "BIGINT",
      source: "BIGINT",
      target: "BIGINT",
      weight: "HUGEINT",
      distance: "HUGEINT",
    });

    const decimal = sdb.newTable("decimalWeights");
    await sdb.customQuery(`CREATE TABLE "decimalWeights" AS
      SELECT * FROM (VALUES
        (0, 'A', 'B', 99999999999999999999.25::DECIMAL(22,2)),
        (1, 'B', 'C', 0.50::DECIMAL(22,2))
      ) edges(edgeId, source, target, weight)`);
    decimal.shortestPath("source", "target", "edgeId", "A", "C", {
      weight: "weight",
    });
    assertEquals(await decimal.getTypes(), {
      pathId: "BIGINT",
      step: "BIGINT",
      edgeId: "INTEGER",
      source: "VARCHAR",
      target: "VARCHAR",
      weight: "DECIMAL(38,2)",
      distance: "DECIMAL(38,2)",
    });
    assertEquals(await decimal.getData(), [
      {
        pathId: 0,
        step: 1,
        edgeId: 0,
        source: "A",
        target: "B",
        weight: "99999999999999999999.25",
        distance: "99999999999999999999.25",
      },
      {
        pathId: 0,
        step: 2,
        edgeId: 1,
        source: "B",
        target: "C",
        weight: "0.50",
        distance: "99999999999999999999.75",
      },
    ]);

    const fraction = loadScenario(
      sdb,
      "fraction",
      "fraction-weight",
      true,
    ).shortestPath("source", "target", "edgeId", "A", "C", {
      weight: "weight",
    });
    assertEquals((await fraction.getData()).map((row) => row.distance), [
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
      edgeId VARCHAR, source VARCHAR, target VARCHAR, weight DECIMAL(8,3)
    )`);
    empty.shortestPath("source", "target", "edgeId", "A", "B", {
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
      "shortestPath() source must be a string.",
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
      "edgeId",
      "source",
      "target",
      "weight",
      "distance",
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
    assertEquals((await snapshotted.getData()).map((row) => row.source), ["B"]);
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
    assertEquals((await existing.getData()).map((row) => row.edgeId), [
      "F1",
      "F2",
    ]);

    const numeric = sdb.newTable("generatedNumeric")
      .loadData("test/data/graphs/without-edge-id.csv")
      .addId("edgeId")
      .shortestPath("source", "target", "edgeId", "A", "C");
    assertEquals((await numeric.getData()).map((row) => row.edgeId), [0, 1]);

    const prefixed = sdb.newTable("generatedPrefixed")
      .loadData("test/data/graphs/without-edge-id.csv")
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
      .shortestPath("source", "target", "edgeId", 0, 10, {
        weight: "weight",
      });
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
      distance: 140,
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

Deno.test("shortestPath uses native bounded simple-route enumeration", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const table = loadScenario(sdb, "queryShape", "weighted", true)
      .shortestPath("source", "target", "edgeId", "A", "E", {
        weight: "weight",
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
      SELECT edgeId::BIGNUM AS edgeId, source, target, weight::HUGEINT AS weight
      FROM (VALUES
        ('10000000000000000000000000000000000000000', 'A', 'B',
          '170141183460469231731687303715884105727'),
        ('2', 'A', 'B', '170141183460469231731687303715884105727'),
        ('3', 'B', 'C', '1')
      ) edges(edgeId, source, target, weight)`);
    const result = table.shortestPath("source", "target", "edgeId", "A", "C", {
      weight: "weight",
    });
    const rows = await result.getData();
    assertEquals(rows.map((row) => [row.pathId, row.step, row.edgeId]), [
      [0, 1, "2"],
      [0, 2, "3"],
      [1, 1, "10000000000000000000000000000000000000000"],
      [1, 2, "3"],
    ]);
    assertEquals(
      rows.filter((row) => row.step === 2).map((row) => row.distance),
      [
        "170141183460469231731687303715884105728",
        "170141183460469231731687303715884105728",
      ],
    );
    assertEquals((await result.getTypes()).distance, "BIGNUM");
  } finally {
    await sdb.close();
  }
});

Deno.test("shortestPath custom-column weighted JSDoc examples match their tables", async () => {
  const sdb = new SimpleDB();
  try {
    const flights = sdb.newTable("flights").loadArray([
      { flightId: "F1", origin: "A", destination: "E", minutes: 10 },
      { flightId: "F2", origin: "A", destination: "B", minutes: 1 },
      { flightId: "F3", origin: "B", destination: "D", minutes: 1 },
      { flightId: "F4", origin: "D", destination: "E", minutes: 1 },
    ]);
    assertEquals(
      await flights.shortestPath(
        "origin",
        "destination",
        "flightId",
        "A",
        "E",
        {
          weight: "minutes",
          outputTable: true,
        },
      ).getData(),
      [
        {
          pathId: 0,
          step: 1,
          edgeId: "F2",
          source: "A",
          target: "B",
          weight: 1,
          distance: 1,
        },
        {
          pathId: 0,
          step: 2,
          edgeId: "F3",
          source: "B",
          target: "D",
          weight: 1,
          distance: 2,
        },
        {
          pathId: 0,
          step: 3,
          edgeId: "F4",
          source: "D",
          target: "E",
          weight: 1,
          distance: 3,
        },
      ],
    );
    assertEquals(
      await flights.shortestPath(
        "origin",
        "destination",
        "flightId",
        "A",
        "E",
        {
          outputTable: true,
        },
      ).getData(),
      [{
        pathId: 0,
        step: 1,
        edgeId: "F1",
        source: "A",
        target: "E",
        weight: 1,
        distance: 1,
      }],
    );
  } finally {
    await sdb.close();
  }
});
