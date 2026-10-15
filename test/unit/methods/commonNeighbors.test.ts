import { test, expect } from "vite-plus/test";
import { assertThrows, assertRejects } from "../../helpers/assertions.ts";

import { observeSdaQueries } from "../../../benchmarks/queryProfile.ts";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import type SimpleTable from "../../../src/class/SimpleTable.ts";

function loadScenario(sdb: SimpleDB, name: string, scenario: string): SimpleTable {
  return sdb
    .newTable(name)
    .loadData("test/data/graphs/edges.csv")
    .filter(`scenario = '${scenario}'`)
    .selectColumns(["source", "target"]);
}

async function expectedCase(
  oracle: SimpleTable,
  caseName: string,
): Promise<Record<string, unknown>[]> {
  return await oracle.clone().filter(`"case" = '${caseName}'`).removeColumns("case").getData();
}

test("commonNeighbors matches every shared fixture oracle case", async () => {
  const cases = [
    ["baseline-B-C-outgoing", "baseline", "B", "C", "outgoing"],
    ["baseline-B-C-incoming", "baseline", "B", "C", "incoming"],
    ["baseline-B-C-both", "baseline", "B", "C", "both"],
    ["common-A-B-outgoing", "common", "A", "B", "outgoing"],
    ["common-A-B-both", "common", "A", "B", "both"],
  ] as const;
  const sdb = new SimpleDB();
  try {
    const oracle = sdb
      .newTable("commonNeighborsOracle")
      .loadData("test/data/graphs/expected/common_neighbors.csv");
    for (const [index, [caseName, scenario, nodeA, nodeB, direction]] of cases.entries()) {
      const input = loadScenario(sdb, `commonNeighborsOracleInput${index}`, scenario);
      const actual =
        direction === "outgoing"
          ? input.commonNeighbors("source", "target", nodeA, nodeB)
          : input.commonNeighbors("source", "target", nodeA, nodeB, {
              direction,
            });
      expect(await actual.getData(), caseName).toStrictEqual(await expectedCase(oracle, caseName));
      expect(await actual.getColumns()).toStrictEqual(["node"]);
    }
  } finally {
    await sdb.close();
  }
});

test("commonNeighbors defaults to outgoing and supports every direction", async () => {
  const sdb = new SimpleDB();
  try {
    expect(
      await loadScenario(sdb, "commonDefault", "baseline")
        .commonNeighbors("source", "target", "B", "C")
        .getData(),
    ).toStrictEqual([{ node: "D" }]);
    expect(
      await loadScenario(sdb, "commonOutgoing", "baseline")
        .commonNeighbors("source", "target", "B", "C", {
          direction: "outgoing",
        })
        .getData(),
    ).toStrictEqual([{ node: "D" }]);
    expect(
      await loadScenario(sdb, "commonIncoming", "baseline")
        .commonNeighbors("source", "target", "B", "C", {
          direction: "incoming",
        })
        .getData(),
    ).toStrictEqual([{ node: "A" }]);
    expect(
      await loadScenario(sdb, "commonBoth", "baseline")
        .commonNeighbors("source", "target", "B", "C", {
          direction: "both",
        })
        .getData(),
    ).toStrictEqual([{ node: "A" }, { node: "D" }]);
  } finally {
    await sdb.close();
  }
});

test("commonNeighbors deduplicates memberships and includes requested endpoints", async () => {
  const sdb = new SimpleDB();
  try {
    const source = loadScenario(sdb, "commonMembership", "common");
    expect(
      await source
        .commonNeighbors("source", "target", "A", "B", {
          outputTable: true,
        })
        .getData(),
    ).toStrictEqual([{ node: "A" }, { node: "C" }]);
    expect(
      await source
        .commonNeighbors("source", "target", "A", "B", {
          direction: "incoming",
          outputTable: true,
        })
        .getData(),
    ).toStrictEqual([]);
    expect(
      await source
        .commonNeighbors("source", "target", "A", "B", {
          direction: "both",
          outputTable: true,
        })
        .getData(),
    ).toStrictEqual([{ node: "A" }, { node: "C" }]);

    const neitherEndpoint = sdb.newTable("commonNeitherEndpoint").loadArray([
      { source: "A", target: "C" },
      { source: "B", target: "C" },
    ]);
    expect(
      await neitherEndpoint.commonNeighbors("source", "target", "A", "B").getData(),
    ).toStrictEqual([{ node: "C" }]);
  } finally {
    await sdb.close();
  }
});

test("commonNeighbors returns typed empty results for no match and unknown nodes", async () => {
  const sdb = new SimpleDB();
  try {
    const noMatch = loadScenario(sdb, "commonNoMatch", "single").commonNeighbors(
      "source",
      "target",
      "A",
      "B",
    );
    expect(await noMatch.getData()).toStrictEqual([]);
    expect(await noMatch.getTypes()).toStrictEqual({ node: "VARCHAR" });

    for (const [index, nodes] of [
      ["unknown", "B"],
      ["A", "unknown"],
      ["unknownA", "unknownB"],
    ].entries()) {
      const unknown = loadScenario(sdb, `commonUnknown${index}`, "baseline").commonNeighbors(
        "source",
        "target",
        nodes[0],
        nodes[1],
      );
      expect(await unknown.getData()).toStrictEqual([]);
      expect(await unknown.getTypes()).toStrictEqual({ node: "VARCHAR" });
    }

    const empty = sdb.newTable("emptyCommonNeighbors");
    await sdb.customQuery('CREATE TABLE "emptyCommonNeighbors" (source VARCHAR, target VARCHAR)');
    empty.commonNeighbors("source", "target", "A", "B");
    expect(await empty.getData()).toStrictEqual([]);
    expect(await empty.getTypes()).toStrictEqual({ node: "VARCHAR" });
  } finally {
    await sdb.close();
  }
});

test("commonNeighbors preserves exact numeric IDs and numeric ordering", async () => {
  const sdb = new SimpleDB();
  try {
    const numeric = sdb
      .newTable("commonNumeric")
      .loadData("test/data/graphs/numeric.csv")
      .commonNeighbors("source", "target", 0, 2);
    expect(await numeric.getData()).toStrictEqual([{ node: 10 }]);
    expect(await numeric.getTypes()).toStrictEqual({ node: "BIGINT" });

    const ordered = sdb
      .newTable("commonNumericOrder")
      .loadArray([
        { source: 1, target: 10 },
        { source: 0, target: 2 },
        { source: 1, target: 0 },
        { source: 0, target: 10 },
        { source: 1, target: 2 },
        { source: 0, target: -3 },
        { source: 1, target: -3 },
      ])
      .commonNeighbors("source", "target", 0, 1);
    expect(await ordered.getData()).toStrictEqual([{ node: -3 }, { node: 2 }, { node: 10 }]);

    const wide = sdb.newTable("commonWideIntegers");
    await sdb.customQuery(`CREATE TABLE "commonWideIntegers" AS
      SELECT * FROM (VALUES
        (1::INTEGER, 9007199254740993::BIGINT),
        (2::INTEGER, 9007199254740993::BIGINT)
      ) edges(source, target)`);
    wide.commonNeighbors("source", "target", 1, 2).convert({ node: "string" });
    expect(await wide.getData()).toStrictEqual([{ node: "9007199254740993" }]);
    expect(await wide.getTypes()).toStrictEqual({ node: "VARCHAR" });

    const decimals = sdb.newTable("commonDecimalIds");
    await sdb.customQuery(`CREATE TABLE "commonDecimalIds" AS
      SELECT * FROM (VALUES
        (1::INTEGER, 12345678901234567890::DECIMAL(20,0)),
        (2::INTEGER, 12345678901234567890::DECIMAL(20,0))
      ) edges(source, target)`);
    decimals.commonNeighbors("source", "target", 1, 2).convert({ node: "string" });
    expect(await decimals.getData()).toStrictEqual([{ node: "12345678901234567890" }]);

    const huge = 2n ** 200n;
    const bignum = sdb.newTable("commonBignumArguments");
    await sdb.customQuery(`CREATE TABLE "commonBignumArguments" AS
      SELECT * FROM (VALUES
        ('${huge}'::BIGNUM, 0::BIGNUM),
        ('${huge + 1n}'::BIGNUM, 0::BIGNUM)
      ) edges(source, target)`);
    expect(
      await bignum.commonNeighbors("source", "target", huge, huge + 1n).getData(),
    ).toStrictEqual([{ node: "0" }]);

    const bounded = sdb.newTable("commonBoundedUnknowns");
    await sdb.customQuery(`CREATE TABLE "commonBoundedUnknowns" AS SELECT
      0::TINYINT AS source, 1::TINYINT AS target`);
    expect(await bounded.commonNeighbors("source", "target", 128, 129).getData()).toStrictEqual([]);
  } finally {
    await sdb.close();
  }
});

test("commonNeighbors uses binary string membership under collations", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("collatedCommonNeighbors");
    await sdb.customQuery(`CREATE TABLE "collatedCommonNeighbors" (
      source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE
    ); INSERT INTO "collatedCommonNeighbors" VALUES
      ('A', 'B'), ('A', 'b'), ('a', 'B'), ('a', 'b')`);
    expect(await table.commonNeighbors("source", "target", "A", "a").getData()).toStrictEqual([
      { node: "B" },
      { node: "b" },
    ]);
  } finally {
    await sdb.close();
  }
});

test("commonNeighbors supports every output destination and chaining", async () => {
  const sdb = new SimpleDB();
  try {
    const defaultOverwrite = loadScenario(sdb, "defaultCommonNeighbors", "baseline");
    expect(defaultOverwrite.commonNeighbors("source", "target", "B", "C")).toBe(defaultOverwrite);
    expect(await defaultOverwrite.getData()).toStrictEqual([{ node: "D" }]);

    const explicitOverwrite = loadScenario(sdb, "explicitCommonNeighbors", "baseline");
    expect(
      explicitOverwrite.commonNeighbors("source", "target", "B", "C", {
        outputTable: false,
      }),
    ).toBe(explicitOverwrite);
    expect(await explicitOverwrite.getColumns()).toStrictEqual(["node"]);

    const source = loadScenario(sdb, "preservedCommonNeighbors", "baseline");
    const named = source
      .commonNeighbors("source", "target", "B", "C", {
        direction: "both",
        outputTable: "namedCommonNeighbors",
      })
      .filter("node = 'D'");
    expect(named.name).toStrictEqual("namedCommonNeighbors");
    expect(await named.getData()).toStrictEqual([{ node: "D" }]);
    expect(await source.getRowCount()).toStrictEqual(6);
    expect(await source.getColumns()).toStrictEqual(["source", "target"]);

    const generated = source.commonNeighbors("source", "target", "B", "C", { outputTable: true });
    expect(generated.name.startsWith("table")).toStrictEqual(true);
    expect(generated.name === source.name).toStrictEqual(false);
    expect(await generated.getData()).toStrictEqual([{ node: "D" }]);
    expect(await source.getRowCount()).toStrictEqual(6);
  } finally {
    await sdb.close();
  }
});

test("commonNeighbors snapshots options and preserves queued source order", async () => {
  const sdb = new SimpleDB();
  try {
    const options: {
      direction: "incoming" | "outgoing";
      outputTable: string;
    } = { direction: "incoming", outputTable: "commonNeighborsSnapshot" };
    const snapshot = loadScenario(sdb, "commonNeighborsSnapshotSource", "baseline").commonNeighbors(
      "source",
      "target",
      "B",
      "C",
      options,
    );
    options.direction = "outgoing";
    options.outputTable = "changed";
    expect(snapshot.name).toStrictEqual("commonNeighborsSnapshot");
    expect(await snapshot.getData()).toStrictEqual([{ node: "A" }]);

    const source = sdb.newTable("changingCommonNeighborsSource").loadArray([
      { source: "A", target: "C" },
      { source: "B", target: "C" },
    ]);
    const result = source.commonNeighbors("source", "target", "A", "B", {
      outputTable: true,
    });
    source.loadArray([
      { source: "A", target: "D" },
      { source: "B", target: "D" },
    ]);
    expect(await result.getData()).toStrictEqual([{ node: "C" }]);
    expect(await source.getData()).toStrictEqual([
      { source: "A", target: "D" },
      { source: "B", target: "D" },
    ]);
  } finally {
    await sdb.close();
  }
});

test("commonNeighbors validates scalar arguments and options before queuing", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      () => table.commonNeighbors(1 as unknown as string, "target", "A", "B"),
      TypeError,
      "commonNeighbors() sourceColumn must be a string.",
    );
    assertThrows(
      () => table.commonNeighbors("source", 1 as unknown as string, "A", "B"),
      TypeError,
      "commonNeighbors() targetColumn must be a string.",
    );
    assertThrows(
      () => table.commonNeighbors("source", "target", "A", "B", null as never),
      TypeError,
      "commonNeighbors() options must be an object.",
    );
    assertThrows(
      () =>
        table.commonNeighbors("source", "target", "A", "B", {
          direction: "sideways" as "outgoing",
        }),
      TypeError,
      'commonNeighbors() options.direction must be "outgoing", "incoming", or "both".',
    );
    assertThrows(
      () =>
        table.commonNeighbors("source", "target", "A", "B", {
          outputTable: 1 as unknown as boolean,
        }),
      TypeError,
      "commonNeighbors() options.outputTable must be a string or boolean.",
    );
    assertThrows(
      () => table.commonNeighbors("source", "target", ["A"] as never, "B"),
      TypeError,
      "commonNeighbors() nodeA must be one node ID.",
    );
    assertThrows(
      () => table.commonNeighbors("source", "target", "A", ["B"] as never),
      TypeError,
      "commonNeighbors() nodeB must be one node ID.",
    );
    assertThrows(
      () => table.commonNeighbors("source", "target", true as never, "B"),
      TypeError,
      "commonNeighbors() nodeA must be a string or a whole number",
    );
    assertThrows(
      () => table.commonNeighbors("source", "target", "A", 1),
      TypeError,
      "nodeA and nodeB must both be string IDs or both be numeric IDs",
    );
    assertThrows(
      () => table.commonNeighbors("source", "target", 0, 0n),
      TypeError,
      "commonNeighbors() nodeA and nodeB must be different.",
    );
    assertThrows(
      () => table.commonNeighbors("source", "target", "unknown", "unknown"),
      TypeError,
      "commonNeighbors() nodeA and nodeB must be different.",
    );
    assertThrows(
      () => table.commonNeighbors("source", "target", Number.MAX_SAFE_INTEGER + 1, 0),
      TypeError,
      "is not a safe whole number",
    );
    expect(table.pendingOps.length).toStrictEqual(0);
  } finally {
    await sdb.close();
  }
});

test("commonNeighbors rejects schema and supplied-ID type errors", async () => {
  const sdb = new SimpleDB();
  try {
    const missing = sdb.newTable("missingCommonNeighborColumn").loadArray([{ source: "A" }]);
    await assertRejects(
      () => missing.commonNeighbors("source", "target", "A", "B").run(),
      Error,
      'commonNeighbors() the column "target" does not exist',
    );

    const unsupported = sdb
      .newTable("unsupportedCommonNeighbors")
      .loadData("test/data/graphs/unsupported-types.csv");
    await assertRejects(
      () => unsupported.commonNeighbors("dateSource", "stringTarget", "A", "B").run(),
      TypeError,
      'column "dateSource" has type DATE',
    );

    const incompatible = sdb
      .newTable("incompatibleCommonNeighbors")
      .loadArray([{ source: 1, target: "1" }]);
    await assertRejects(
      () => incompatible.commonNeighbors("source", "target", 1, 2).run(),
      TypeError,
      "requires compatible source and target ID types",
    );

    const numeric = sdb
      .newTable("commonNeighborsNumericMismatch")
      .loadData("test/data/graphs/numeric.csv");
    await assertRejects(
      () => numeric.commonNeighbors("source", "target", "0", "2").run(),
      TypeError,
      "nodeA and nodeB contain string IDs",
    );

    const lossy = sdb.newTable("commonNeighborsLossy");
    await sdb.customQuery('CREATE TABLE "commonNeighborsLossy" (source BIGINT, target DOUBLE)');
    await assertRejects(
      () => lossy.commonNeighbors("source", "target", 1, 2).run(),
      TypeError,
      "without losing ID precision",
    );

    const floating = sdb.newTable("commonNeighborsUnrepresentableFloat");
    await sdb.customQuery(`CREATE TABLE "commonNeighborsUnrepresentableFloat" AS
      SELECT * FROM (VALUES
        (16777216::FLOAT, 0::FLOAT),
        (1::FLOAT, 0::FLOAT)
      ) edges(source, target)`);
    await assertRejects(
      () => floating.commonNeighbors("source", "target", 16777217, 1).run(),
      TypeError,
      "FLOAT cannot represent exactly",
    );
  } finally {
    await sdb.close();
  }
});

test("commonNeighbors uses one membership computation without validation scans", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    const table = sdb
      .newTable("commonNeighborsPlan")
      .loadArray([
        { source: "A", target: "C" },
        { source: "B", target: "C" },
      ])
      .commonNeighbors("source", "target", "A", "B");
    await table.run();
    const query =
      observer.queries.find((entry) => entry.query.includes("graph_neighbor_memberships"))?.query ??
      "";
    expect(query).toContain("INNER JOIN");
    expect(query).toContain("COUNT(DISTINCT");
    expect(query.includes("IS NULL")).toStrictEqual(false);
  } finally {
    observer.restore();
    await sdb.close();
  }
});

test("commonNeighbors rejects output collisions before queuing graph work", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb
      .newTable("commonNeighborsCollisionSource")
      .loadArray([{ source: "A", target: "B" }]);
    await source.run();
    sdb.newTable("namedCommonNeighborsCollision");
    assertThrows(
      () =>
        source.commonNeighbors("source", "target", "A", "B", {
          outputTable: "NAMEDCOMMONNEIGHBORSCOLLISION",
        }),
      Error,
      "Table NAMEDCOMMONNEIGHBORSCOLLISION already exists.",
    );
    expect(source.pendingOps.length).toStrictEqual(0);
  } finally {
    await sdb.close();
  }
});

test("commonNeighbors output records its source as a cache dependency", async () => {
  let computationRuns = 0;
  const unique = crypto.randomUUID().replaceAll("-", "");
  const outputName = `commonNeighborsCacheOutput${unique}`;
  const sourceName = `commonNeighborsCacheSource${unique}`;
  const compute = (source: SimpleTable) => async (output: SimpleTable) => {
    computationRuns++;
    const result = source.commonNeighbors("source", "target", "A", "B", {
      outputTable: true,
    });
    output.loadArray(await result.getData());
    await result.removeTable();
  };

  const firstSdb = new SimpleDB();
  try {
    const source = firstSdb.newTable(sourceName).loadArray([
      { source: "A", target: "C" },
      { source: "B", target: "C" },
    ]);
    const output = firstSdb.newTable(outputName);
    await output.cache(compute(source));
    expect(await output.getData()).toStrictEqual([{ node: "C" }]);
  } finally {
    await firstSdb.close();
  }

  const secondSdb = new SimpleDB();
  try {
    const source = secondSdb.newTable(sourceName).loadArray([
      { source: "A", target: "D" },
      { source: "B", target: "D" },
    ]);
    const output = secondSdb.newTable(outputName);
    await output.cache(compute(source));
    expect(computationRuns).toStrictEqual(2);
    expect(await output.getData()).toStrictEqual([{ node: "D" }]);
  } finally {
    await secondSdb.close();
  }
});

test("commonNeighbors internal relations do not shadow input table names", async () => {
  const sdb = new SimpleDB();
  try {
    for (const name of [
      "graph_requested_nodes",
      "GRAPH_EDGES",
      "graph_neighbor_memberships",
      "GRAPH_COMMON_NEIGHBORS",
    ]) {
      const table = sdb.newTable(name).loadArray([
        { source: "A", target: "C" },
        { source: "B", target: "C" },
      ]);
      await table.run();
      expect(await table.commonNeighbors("source", "target", "A", "B").getData()).toStrictEqual([
        { node: "C" },
      ]);
    }
  } finally {
    await sdb.close();
  }
});

test("commonNeighbors JSDoc examples execute their exact chains and displayed outputs", async () => {
  const sdb = new SimpleDB();
  try {
    const rows = [
      { origin: "A", destination: "C" },
      { origin: "A", destination: "C" },
      { origin: "B", destination: "C" },
      { origin: "B", destination: "C" },
      { origin: "D", destination: "A" },
      { origin: "D", destination: "B" },
    ];
    {
      const connections = sdb.newTable().loadArray(rows);
      await connections.commonNeighbors("origin", "destination", "A", "B").log();
      expect(await connections.getData()).toStrictEqual([{ node: "C" }]);
      expect(await connections.getTypes()).toStrictEqual({ node: "VARCHAR" });
    }
    {
      const connections = sdb.newTable().loadArray(rows);
      await connections
        .commonNeighbors("origin", "destination", "A", "B", {
          direction: "incoming",
        })
        .log();
      expect(await connections.getData()).toStrictEqual([{ node: "D" }]);
      expect(await connections.getTypes()).toStrictEqual({ node: "VARCHAR" });
    }
    {
      const connections = sdb.newTable().loadArray(rows);
      await connections
        .commonNeighbors("origin", "destination", "A", "B", {
          direction: "both",
        })
        .log();
      expect(await connections.getData()).toStrictEqual([{ node: "C" }, { node: "D" }]);
      expect(await connections.getTypes()).toStrictEqual({ node: "VARCHAR" });
    }
    {
      const connections = sdb.newTable().loadArray([
        { source: "A", target: "A" },
        { source: "B", target: "A" },
      ]);
      await connections.commonNeighbors("source", "target", "A", "B").log();
      expect(await connections.getData()).toStrictEqual([{ node: "A" }]);
      expect(await connections.getTypes()).toStrictEqual({ node: "VARCHAR" });
    }
  } finally {
    await sdb.close();
  }
});

test("commonNeighbors intersects mixed orientations and preserves both endpoint memberships", async () => {
  const sdb = new SimpleDB();
  try {
    const rows = [
      { source: "A", target: "A" },
      { source: "A", target: "B" },
      { source: "B", target: "A" },
      { source: "B", target: "B" },
      { source: "A", target: "C" },
      { source: "C", target: "B" },
    ];
    for (const reversed of [false, true]) {
      const input = sdb
        .newTable()
        .loadArray(reversed ? [...rows, ...rows].reverse() : [...rows, ...rows]);
      for (const direction of ["outgoing", "incoming", "both"] as const) {
        expect(
          await input
            .commonNeighbors("source", "target", "A", "B", {
              direction,
              outputTable: true,
            })
            .getData(),
        ).toStrictEqual(
          direction === "both"
            ? [{ node: "A" }, { node: "B" }, { node: "C" }]
            : [{ node: "A" }, { node: "B" }],
        );
      }
      const existing = "A";
      assertThrows(
        () => input.commonNeighbors("source", "target", existing, existing),
        TypeError,
        "commonNeighbors() nodeA and nodeB must be different.",
      );
    }
  } finally {
    await sdb.close();
  }
});
