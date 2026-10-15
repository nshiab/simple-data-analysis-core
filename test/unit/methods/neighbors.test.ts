import { test, expect } from "vite-plus/test";
import { assertThrows, assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import type SimpleTable from "../../../src/class/SimpleTable.ts";

function loadScenario(sdb: SimpleDB, name: string, scenario: string): SimpleTable {
  return sdb
    .newTable(name)
    .loadData("test/data/graphs/edges.csv")
    .filter(`scenario = '${scenario}'`)
    .selectColumns(["source", "target"]);
}

test("neighbors defaults to outgoing and supports every direction", async () => {
  const sdb = new SimpleDB();
  try {
    const outgoing = loadScenario(sdb, "outgoing", "baseline").neighbors("source", "target", "A");
    const incoming = loadScenario(sdb, "incoming", "baseline").neighbors("source", "target", "D", {
      direction: "incoming",
    });
    const both = loadScenario(sdb, "both", "baseline").neighbors("source", "target", "D", {
      direction: "both",
    });

    expect(await outgoing.getData()).toStrictEqual([
      { start: "A", node: "B" },
      { start: "A", node: "C" },
    ]);
    expect(await incoming.getData()).toStrictEqual([
      { start: "D", node: "B" },
      { start: "D", node: "C" },
    ]);
    expect(await both.getData()).toStrictEqual([
      { start: "D", node: "B" },
      { start: "D", node: "C" },
      { start: "D", node: "E" },
    ]);
  } finally {
    await sdb.close();
  }
});

test("neighbors sorts multiple starts and omits unknown starts", async () => {
  const sdb = new SimpleDB();
  try {
    const starts = ["F", "unknown", "A"];
    const table = loadScenario(sdb, "multiple", "baseline");
    table.neighbors("source", "target", starts);
    starts[0] = "changed-after-call";

    expect(await table.getData()).toStrictEqual([
      { start: "A", node: "B" },
      { start: "A", node: "C" },
      { start: "F", node: "G" },
    ]);
  } finally {
    await sdb.close();
  }
});

test("neighbors deduplicates parallel edges and includes self-connections", async () => {
  const sdb = new SimpleDB();
  try {
    const parallel = loadScenario(sdb, "parallel", "parallel").neighbors("source", "target", "A");
    const selfLoop = loadScenario(sdb, "selfLoop", "self-loop").neighbors("source", "target", "A");

    expect(await parallel.getData()).toStrictEqual([{ start: "A", node: "B" }]);
    expect(await selfLoop.getData()).toStrictEqual([
      { start: "A", node: "A" },
      { start: "A", node: "B" },
    ]);
  } finally {
    await sdb.close();
  }
});

test("neighbors supports overwrite and source-preserving output tables", async () => {
  const sdb = new SimpleDB();
  try {
    const overwritten = loadScenario(sdb, "overwritten", "baseline");
    expect(
      overwritten.neighbors("source", "target", "A", {
        outputTable: false,
      }),
    ).toBe(overwritten);
    expect(await overwritten.getColumns()).toStrictEqual(["start", "node"]);

    const source = loadScenario(sdb, "preserved", "baseline");
    const named = source
      .neighbors("source", "target", "A", {
        outputTable: "namedNeighbors",
      })
      .filter("node = 'C'");
    expect(named.name).toStrictEqual("namedNeighbors");
    expect(await named.getData()).toStrictEqual([{ start: "A", node: "C" }]);
    expect(await source.getRowCount()).toStrictEqual(6);
    expect(await source.getColumns()).toStrictEqual(["source", "target"]);

    const generated = source.neighbors("source", "target", "F", {
      outputTable: true,
    });
    expect(generated.name.startsWith("table")).toStrictEqual(true);
    expect(generated.name === source.name).toStrictEqual(false);
    expect(await generated.getData()).toStrictEqual([{ start: "F", node: "G" }]);
    expect(await source.getRowCount()).toStrictEqual(6);
  } finally {
    await sdb.close();
  }
});

test("neighbors snapshots options before queued execution", async () => {
  const sdb = new SimpleDB();
  try {
    const table = loadScenario(sdb, "snapshots", "baseline");
    const options: {
      direction: "incoming" | "outgoing";
      outputTable: string;
    } = { direction: "incoming", outputTable: "incomingSnapshot" };
    const result = table.neighbors("source", "target", "D", options);
    options.direction = "outgoing";
    options.outputTable = "changed";

    expect(result.name).toStrictEqual("incomingSnapshot");
    expect(await result.getData()).toStrictEqual([
      { start: "D", node: "B" },
      { start: "D", node: "C" },
    ]);
  } finally {
    await sdb.close();
  }
});

test("neighbors uses fixed output names with custom input columns", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable("custom")
      .loadData("test/data/graphs/custom-columns.csv")
      .neighbors("ORIGIN", "Destination", "B");

    expect(await table.getData()).toStrictEqual([{ start: "B", node: "C" }]);
    expect(await table.getColumns()).toStrictEqual(["start", "node"]);
  } finally {
    await sdb.close();
  }
});

test("neighbors preserves an empty result schema", async () => {
  const sdb = new SimpleDB();
  try {
    const empty = sdb.newTable("emptyGraph");
    await sdb.customQuery('CREATE TABLE "emptyGraph" (source VARCHAR, target VARCHAR)');
    empty.neighbors("source", "target", "A");
    expect(await empty.getData()).toStrictEqual([]);
    expect(await empty.getTypes()).toStrictEqual({ start: "VARCHAR", node: "VARCHAR" });

    const unknown = loadScenario(sdb, "unknown", "baseline").neighbors(
      "source",
      "target",
      "unknown",
    );
    expect(await unknown.getData()).toStrictEqual([]);
    expect(await unknown.getTypes()).toStrictEqual({
      start: "VARCHAR",
      node: "VARCHAR",
    });
  } finally {
    await sdb.close();
  }
});

test("neighbors supports numeric zero and numeric ordering", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable("numeric")
      .loadData("test/data/graphs/numeric.csv")
      .neighbors("source", "target", [2, 0], { direction: "both" });

    expect(await table.getData()).toStrictEqual([
      { start: 0, node: 2 },
      { start: 0, node: 10 },
      { start: 2, node: 0 },
      { start: 2, node: 10 },
    ]);
    expect(await table.getTypes()).toStrictEqual({ start: "BIGINT", node: "BIGINT" });
  } finally {
    await sdb.close();
  }
});

test("neighbors matches and sorts string IDs case-sensitively", async () => {
  const sdb = new SimpleDB();
  try {
    const fixture = sdb
      .newTable("stringIds")
      .loadData("test/data/graphs/edges.csv")
      .filter("scenario = 'string-ids'")
      .selectColumns(["source", "target"])
      .neighbors("source", "target", ["A", "001"]);
    expect(await fixture.getData()).toStrictEqual([
      { start: "001", node: "1" },
      { start: "A", node: "a" },
    ]);

    const collated = sdb.newTable("collatedStringIds");
    await sdb.customQuery(`CREATE TABLE "collatedStringIds" (
      source VARCHAR COLLATE NOCASE,
      target VARCHAR COLLATE NOCASE
    ); INSERT INTO "collatedStringIds" VALUES ('A', 'B'), ('a', 'C')`);
    collated.neighbors("source", "target", "A");
    expect(await collated.getData()).toStrictEqual([{ start: "A", node: "B" }]);
  } finally {
    await sdb.close();
  }
});

test("neighbors binds bigint starts exactly and widens mixed integers exactly", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("wideIntegerGraph");
    await sdb.customQuery(`CREATE TABLE "wideIntegerGraph" AS
      SELECT * FROM (VALUES
        (1::INTEGER, 9007199254740993::BIGINT),
        (2::INTEGER, 9007199254740995::BIGINT)
      ) edges(source, target)`);

    table
      .neighbors("source", "target", 9007199254740993n, {
        direction: "incoming",
      })
      .convert({ start: "string", node: "string" });
    expect(await table.getData()).toStrictEqual([{ start: "9007199254740993", node: "1" }]);
  } finally {
    await sdb.close();
  }
});

test("neighbors supports exact decimal and representable floating ID columns", async () => {
  const sdb = new SimpleDB();
  try {
    const decimal = sdb.newTable("decimalGraph");
    await sdb.customQuery(`CREATE TABLE "decimalGraph" AS SELECT
      1::DECIMAL(20,0) AS "source",
      9007199254740993::BIGINT AS "target"`);
    decimal.neighbors("source", "target", 9007199254740993n, {
      direction: "incoming",
    });
    expect(await decimal.getTypes()).toStrictEqual({
      start: "DECIMAL(20,0)",
      node: "DECIMAL(20,0)",
    });
    expect(await decimal.getData()).toStrictEqual([{ start: "9007199254740993", node: "1" }]);

    const floating = sdb.newTable("floatingGraph");
    await sdb.customQuery(`CREATE TABLE "floatingGraph" AS SELECT
      1::FLOAT AS "source", 2::DOUBLE AS "target"`);
    floating.neighbors("source", "target", 1);
    expect(await floating.getTypes()).toStrictEqual({
      start: "DOUBLE",
      node: "DOUBLE",
    });
    expect(await floating.getData()).toStrictEqual([{ start: 1, node: 2 }]);
  } finally {
    await sdb.close();
  }
});

test("neighbors validates starts and options before queuing", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      () => table.neighbors("source", "target", []),
      TypeError,
      "neighbors() startNodes must not be an empty array.",
    );
    assertThrows(
      () => table.neighbors("source", "target", ["A", "A"]),
      TypeError,
      'neighbors() startNodes contains duplicate IDs: "A".',
    );
    assertThrows(
      () => table.neighbors("source", "target", [0, 0n]),
      TypeError,
      "neighbors() startNodes contains duplicate IDs: 0n.",
    );
    assertThrows(
      () => table.neighbors("source", "target", ["1", 1]),
      TypeError,
      "neighbors() startNodes must not mix string and numeric IDs.",
    );
    assertThrows(
      () => table.neighbors("source", "target", Number.MAX_SAFE_INTEGER + 1),
      TypeError,
      "is not a safe whole number",
    );
    assertThrows(
      () =>
        table.neighbors("source", "target", "A", {
          direction: "sideways" as "outgoing",
        }),
      TypeError,
      'neighbors() options.direction must be "outgoing", "incoming", or "both".',
    );
    expect(table.pendingOps.length).toStrictEqual(0);
  } finally {
    await sdb.close();
  }
});

test("neighbors rejects missing, unsupported, and incompatible endpoint types", async () => {
  const sdb = new SimpleDB();
  try {
    const missing = sdb.newTable("missing").loadArray([{ source: "A" }]);
    await assertRejects(
      () => missing.neighbors("source", "target", "A").run(),
      Error,
      'neighbors() the column "target" does not exist',
    );

    const unsupported = sdb
      .newTable("unsupported")
      .loadData("test/data/graphs/unsupported-types.csv");
    await assertRejects(
      () => unsupported.neighbors("dateSource", "stringTarget", "A").run(),
      Error,
      'column "dateSource" has type DATE',
    );

    const incompatible = sdb.newTable("incompatible").loadArray([{ source: 1, target: "1" }]);
    await assertRejects(
      () => incompatible.neighbors("source", "target", 1).run(),
      Error,
      "requires compatible source and target ID types",
    );

    const numeric = sdb.newTable("numericMismatch").loadData("test/data/graphs/numeric.csv");
    await assertRejects(
      () => numeric.neighbors("source", "target", "0").run(),
      Error,
      "startNodes contain string IDs",
    );

    const lossy = sdb.newTable("lossy");
    await sdb.customQuery('CREATE TABLE "lossy" (source BIGINT, target DOUBLE)');
    await assertRejects(
      () => lossy.neighbors("source", "target", 1).run(),
      Error,
      "without losing ID precision",
    );
  } finally {
    await sdb.close();
  }
});

test("neighbors output records its source as a cache dependency", async () => {
  let computationRuns = 0;
  const unique = crypto.randomUUID().replaceAll("-", "");
  const outputName = `neighborsCacheOutput${unique}`;
  const sourceName = `neighborsCacheSource${unique}`;
  const compute = (source: SimpleTable) => async (output: SimpleTable) => {
    computationRuns++;
    const result = source.neighbors("source", "target", "A", {
      outputTable: true,
    });
    output.loadArray(await result.getData());
    await result.removeTable();
  };

  const firstSdb = new SimpleDB();
  try {
    const source = firstSdb.newTable(sourceName).loadArray([{ source: "A", target: "B" }]);
    const output = firstSdb.newTable(outputName);
    await output.cache(compute(source));
    expect(await output.getData()).toStrictEqual([{ start: "A", node: "B" }]);
  } finally {
    await firstSdb.close();
  }

  const secondSdb = new SimpleDB();
  try {
    const source = secondSdb.newTable(sourceName).loadArray([{ source: "A", target: "C" }]);
    const output = secondSdb.newTable(outputName);
    await output.cache(compute(source));
    expect(computationRuns).toStrictEqual(2);
    expect(await output.getData()).toStrictEqual([{ start: "A", node: "C" }]);
  } finally {
    await secondSdb.close();
  }
});

test("neighbors internal relations do not shadow input table names", async () => {
  const sdb = new SimpleDB();
  try {
    for (const name of ["graph_starts", "NEIGHBOR_MATCHES"]) {
      const table = sdb.newTable(name).loadArray([{ source: "A", target: "B" }]);
      // Execute separately to exercise the physical input rather than a fused CTE.
      await table.run();
      expect(await table.neighbors("source", "target", "A").getData()).toStrictEqual([
        { start: "A", node: "B" },
      ]);
    }
  } finally {
    await sdb.close();
  }
});

test("neighbors preserves queued source and output operation order", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("changingSource").loadArray([{ source: "A", target: "B" }]);
    const result = source.neighbors("source", "target", "A", {
      outputTable: true,
    });
    source.loadArray([{ source: "A", target: "C" }]);
    expect(await result.getData()).toStrictEqual([{ start: "A", node: "B" }]);
    expect(await source.getData()).toStrictEqual([{ source: "A", target: "C" }]);
  } finally {
    await sdb.close();
  }
});

test("neighbors JSDoc examples return their complete displayed outputs", async () => {
  const sdb = new SimpleDB();
  try {
    for (const direction of [undefined, "incoming", "both"] as const) {
      const table = sdb.newTable().loadArray([
        { origin: "A", destination: "B" },
        { origin: "A", destination: "B" },
        { origin: "C", destination: "A" },
      ]);
      const result =
        direction === undefined
          ? table.neighbors("origin", "destination", "A")
          : table.neighbors("origin", "destination", "A", { direction });
      await result.log();
      expect(await result.getData()).toStrictEqual(
        direction === "incoming"
          ? [{ start: "A", node: "C" }]
          : direction === "both"
            ? [
                { start: "A", node: "B" },
                { start: "A", node: "C" },
              ]
            : [{ start: "A", node: "B" }],
      );
    }
    const table = sdb.newTable().loadArray([
      { source: "Montreal", target: "Ottawa", cost: 2 },
      { source: "Ottawa", target: "Toronto", cost: 3 },
    ]);
    await table.neighbors("source", "target", ["Montreal", "Ottawa"]).log();
    expect(await table.getData()).toStrictEqual([
      { start: "Montreal", node: "Ottawa" },
      { start: "Ottawa", node: "Toronto" },
    ]);
  } finally {
    await sdb.close();
  }
});

test("neighbors binds unusual string IDs and quotes endpoint names", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      { 'from "node"': "O'Brien", select: "" },
      { 'from "node"': "O'Brien", select: "" },
      { 'from "node"': "", select: "O'Brien" },
      { 'from "node"': "O'Brien", select: "O'Brien" },
      { 'from "node"': "unrelated", select: "farther" },
    ]);
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      expect(
        await table
          .neighbors('from "node"', "select", ["O'Brien", ""], {
            direction,
            outputTable: true,
          })
          .getData(),
      ).toStrictEqual([
        { start: "", node: "O'Brien" },
        { start: "O'Brien", node: "" },
        { start: "O'Brien", node: "O'Brien" },
      ]);
    }
  } finally {
    await sdb.close();
  }
});

test("neighbors accepts the same endpoint column and keeps each self-connection once", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ node: "B" }, { node: "A" }, { node: "A" }]);
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      expect(
        await table
          .neighbors("node", "node", ["B", "unknown", "A"], {
            direction,
            outputTable: true,
          })
          .getData(),
      ).toStrictEqual([
        { start: "A", node: "A" },
        { start: "B", node: "B" },
      ]);
    }
  } finally {
    await sdb.close();
  }
});

test("neighbors deduplicates every direction and evaluates starts independently", async () => {
  const sdb = new SimpleDB();
  try {
    const table = loadScenario(sdb, "duplicateDirections", "common");
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      const starts = direction === "incoming" ? ["C", "A"] : ["B", "A"];
      const expected =
        direction === "incoming"
          ? [
              { start: "A", node: "A" },
              { start: "A", node: "B" },
              { start: "C", node: "A" },
              { start: "C", node: "B" },
            ]
          : direction === "outgoing"
            ? [
                { start: "A", node: "A" },
                { start: "A", node: "C" },
                { start: "B", node: "A" },
                { start: "B", node: "C" },
              ]
            : [
                { start: "A", node: "A" },
                { start: "A", node: "B" },
                { start: "A", node: "C" },
                { start: "B", node: "A" },
                { start: "B", node: "C" },
              ];
      expect(
        await table
          .neighbors("source", "target", starts, {
            direction,
            outputTable: true,
          })
          .getData(),
      ).toStrictEqual(expected);
    }

    const single = loadScenario(sdb, "singleDirections", "single");
    expect(
      await single
        .neighbors("source", "target", ["A"], {
          outputTable: true,
        })
        .getData(),
    ).toStrictEqual([{ start: "A", node: "B" }]);
    expect(
      await single
        .neighbors("source", "target", "B", {
          outputTable: true,
        })
        .getData(),
    ).toStrictEqual([]);
    expect(
      await single
        .neighbors("source", "target", "A", {
          direction: "incoming",
          outputTable: true,
        })
        .getData(),
    ).toStrictEqual([]);
  } finally {
    await sdb.close();
  }
});

test("neighbors preserves binary membership and ordering under endpoint collations", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("collatedMembership");
    await sdb.customQuery(`CREATE TABLE "collatedMembership" (
      source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE
    ); INSERT INTO "collatedMembership" VALUES
      ('a', 'b'), ('A', 'b'), ('A', 'B'), ('A', 'B'), ('a', 'B')`);
    expect(await table.neighbors("source", "target", ["a", "A"]).getData()).toStrictEqual([
      { start: "A", node: "B" },
      { start: "A", node: "b" },
      { start: "a", node: "B" },
      { start: "a", node: "b" },
    ]);
  } finally {
    await sdb.close();
  }
});

test("neighbors distinguishes out-of-range unknown IDs from lossy floating IDs", async () => {
  const sdb = new SimpleDB();
  try {
    const integers = sdb.newTable("boundedIds");
    await sdb.customQuery(`CREATE TABLE "boundedIds" AS SELECT
      0::TINYINT AS source, 1::TINYINT AS target`);
    expect(
      await integers.neighbors("source", "target", [0, 128, -(2n ** 200n)]).getData(),
    ).toStrictEqual([{ start: 0, node: 1 }]);

    const bignum = sdb.newTable("bignumIds");
    const huge = 2n ** 200n;
    await sdb.customQuery(`CREATE TABLE "bignumIds" AS SELECT
      '${huge}'::BIGNUM AS source, '${huge + 1n}'::BIGNUM AS target`);
    expect(
      await bignum
        .neighbors("source", "target", huge)
        .convert({ start: "string", node: "string" })
        .getData(),
    ).toStrictEqual([{ start: String(huge), node: String(huge + 1n) }]);

    const floating = sdb.newTable("unrepresentableFloat");
    await sdb.customQuery(`CREATE TABLE "unrepresentableFloat" AS SELECT
      16777216::FLOAT AS source, 0::FLOAT AS target`);
    await assertRejects(
      () => floating.neighbors("source", "target", 16777217).run(),
      Error,
      "FLOAT cannot represent exactly",
    );
  } finally {
    await sdb.close();
  }
});
