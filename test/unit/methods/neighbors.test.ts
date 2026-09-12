import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import type SimpleTable from "../../../src/class/SimpleTable.ts";

function loadScenario(
  sdb: SimpleDB,
  name: string,
  scenario: string,
): SimpleTable {
  return sdb.newTable(name)
    .loadData("test/data/graphs/edges.csv")
    .filter(`scenario = '${scenario}'`)
    .selectColumns(["source", "target"]);
}

Deno.test("neighbors defaults to outgoing and supports every direction", async () => {
  const sdb = new SimpleDB();
  try {
    const outgoing = loadScenario(sdb, "outgoing", "baseline")
      .neighbors("source", "target", "A");
    const incoming = loadScenario(sdb, "incoming", "baseline")
      .neighbors("source", "target", "D", { direction: "incoming" });
    const both = loadScenario(sdb, "both", "baseline")
      .neighbors("source", "target", "D", { direction: "both" });

    assertEquals(await outgoing.getData(), [
      { start: "A", node: "B" },
      { start: "A", node: "C" },
    ]);
    assertEquals(await incoming.getData(), [
      { start: "D", node: "B" },
      { start: "D", node: "C" },
    ]);
    assertEquals(await both.getData(), [
      { start: "D", node: "B" },
      { start: "D", node: "C" },
      { start: "D", node: "E" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors sorts multiple starts and omits unknown starts", async () => {
  const sdb = new SimpleDB();
  try {
    const starts = ["F", "unknown", "A"];
    const table = loadScenario(sdb, "multiple", "baseline");
    table.neighbors("source", "target", starts);
    starts[0] = "changed-after-call";

    assertEquals(await table.getData(), [
      { start: "A", node: "B" },
      { start: "A", node: "C" },
      { start: "F", node: "G" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors deduplicates parallel edges and includes self-connections", async () => {
  const sdb = new SimpleDB();
  try {
    const parallel = loadScenario(sdb, "parallel", "parallel")
      .neighbors("source", "target", "A");
    const selfLoop = loadScenario(sdb, "selfLoop", "self-loop")
      .neighbors("source", "target", "A");

    assertEquals(await parallel.getData(), [{ start: "A", node: "B" }]);
    assertEquals(await selfLoop.getData(), [
      { start: "A", node: "A" },
      { start: "A", node: "B" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors supports overwrite and source-preserving output tables", async () => {
  const sdb = new SimpleDB();
  try {
    const overwritten = loadScenario(sdb, "overwritten", "baseline");
    assertStrictEquals(
      overwritten.neighbors("source", "target", "A", {
        outputTable: false,
      }),
      overwritten,
    );
    assertEquals(await overwritten.getColumns(), ["start", "node"]);

    const source = loadScenario(sdb, "preserved", "baseline");
    const named = source.neighbors("source", "target", "A", {
      outputTable: "namedNeighbors",
    }).filter("node = 'C'");
    assertEquals(named.name, "namedNeighbors");
    assertEquals(await named.getData(), [{ start: "A", node: "C" }]);
    assertEquals(await source.getRowCount(), 6);
    assertEquals(await source.getColumns(), ["source", "target"]);

    const generated = source.neighbors("source", "target", "F", {
      outputTable: true,
    });
    assertEquals(generated.name.startsWith("table"), true);
    assertEquals(generated.name === source.name, false);
    assertEquals(await generated.getData(), [{ start: "F", node: "G" }]);
    assertEquals(await source.getRowCount(), 6);
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors snapshots options before queued execution", async () => {
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

    assertEquals(result.name, "incomingSnapshot");
    assertEquals(await result.getData(), [
      { start: "D", node: "B" },
      { start: "D", node: "C" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors uses fixed output names with custom input columns", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("custom")
      .loadData("test/data/graphs/custom-columns.csv")
      .neighbors("ORIGIN", "Destination", "B");

    assertEquals(await table.getData(), [{ start: "B", node: "C" }]);
    assertEquals(await table.getColumns(), ["start", "node"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors preserves an empty result schema", async () => {
  const sdb = new SimpleDB();
  try {
    const empty = sdb.newTable("emptyGraph");
    await sdb.customQuery(
      'CREATE TABLE "emptyGraph" (source VARCHAR, target VARCHAR)',
    );
    empty.neighbors("source", "target", "A");
    assertEquals(await empty.getData(), []);
    assertEquals(await empty.getTypes(), { start: "VARCHAR", node: "VARCHAR" });

    const unknown = loadScenario(sdb, "unknown", "baseline")
      .neighbors("source", "target", "unknown");
    assertEquals(await unknown.getData(), []);
    assertEquals(await unknown.getTypes(), {
      start: "VARCHAR",
      node: "VARCHAR",
    });
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors supports numeric zero and numeric ordering", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("numeric")
      .loadData("test/data/graphs/numeric.csv")
      .neighbors("source", "target", [2, 0], { direction: "both" });

    assertEquals(await table.getData(), [
      { start: 0, node: 2 },
      { start: 0, node: 10 },
      { start: 2, node: 0 },
      { start: 2, node: 10 },
    ]);
    assertEquals(await table.getTypes(), { start: "BIGINT", node: "BIGINT" });
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors matches and sorts string IDs case-sensitively", async () => {
  const sdb = new SimpleDB();
  try {
    const fixture = sdb.newTable("stringIds")
      .loadData("test/data/graphs/edges.csv")
      .filter("scenario = 'string-ids'")
      .selectColumns(["source", "target"])
      .neighbors("source", "target", ["A", "001"]);
    assertEquals(await fixture.getData(), [
      { start: "001", node: "1" },
      { start: "A", node: "a" },
    ]);

    const collated = sdb.newTable("collatedStringIds");
    await sdb.customQuery(`CREATE TABLE "collatedStringIds" (
      source VARCHAR COLLATE NOCASE,
      target VARCHAR COLLATE NOCASE
    ); INSERT INTO "collatedStringIds" VALUES ('A', 'B'), ('a', 'C')`);
    collated.neighbors("source", "target", "A");
    assertEquals(await collated.getData(), [{ start: "A", node: "B" }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors binds bigint starts exactly and widens mixed integers exactly", async () => {
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
    assertEquals(await table.getData(), [
      { start: "9007199254740993", node: "1" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors supports exact decimal and representable floating ID columns", async () => {
  const sdb = new SimpleDB();
  try {
    const decimal = sdb.newTable("decimalGraph");
    await sdb.customQuery(`CREATE TABLE "decimalGraph" AS SELECT
      1::DECIMAL(20,0) AS "source",
      9007199254740993::BIGINT AS "target"`);
    decimal.neighbors("source", "target", 9007199254740993n, {
      direction: "incoming",
    });
    assertEquals(await decimal.getTypes(), {
      start: "DECIMAL(20,0)",
      node: "DECIMAL(20,0)",
    });
    assertEquals(await decimal.getData(), [
      { start: "9007199254740993", node: "1" },
    ]);

    const floating = sdb.newTable("floatingGraph");
    await sdb.customQuery(`CREATE TABLE "floatingGraph" AS SELECT
      1::FLOAT AS "source", 2::DOUBLE AS "target"`);
    floating.neighbors("source", "target", 1);
    assertEquals(await floating.getTypes(), {
      start: "DOUBLE",
      node: "DOUBLE",
    });
    assertEquals(await floating.getData(), [{ start: 1, node: 2 }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors validates starts and options before queuing", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      () => table.neighbors("source", "target", []),
      TypeError,
      "neighbors() start must not be an empty array.",
    );
    assertThrows(
      () => table.neighbors("source", "target", ["A", "A"]),
      TypeError,
      'neighbors() start contains duplicate IDs: "A".',
    );
    assertThrows(
      () => table.neighbors("source", "target", [0, 0n]),
      TypeError,
      "neighbors() start contains duplicate IDs: 0n.",
    );
    assertThrows(
      () => table.neighbors("source", "target", ["1", 1]),
      TypeError,
      "neighbors() start must not mix string and numeric IDs.",
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
    assertEquals(table.pendingOps.length, 0);
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors rejects missing, unsupported, and incompatible endpoint types", async () => {
  const sdb = new SimpleDB();
  try {
    const missing = sdb.newTable("missing").loadArray([{ source: "A" }]);
    await assertRejects(
      () => missing.neighbors("source", "target", "A").run(),
      Error,
      'neighbors() the column "target" does not exist',
    );

    const unsupported = sdb.newTable("unsupported")
      .loadData("test/data/graphs/unsupported-types.csv");
    await assertRejects(
      () => unsupported.neighbors("dateSource", "stringTarget", "A").run(),
      Error,
      'column "dateSource" has type DATE',
    );

    const incompatible = sdb.newTable("incompatible")
      .loadArray([{ source: 1, target: "1" }]);
    await assertRejects(
      () => incompatible.neighbors("source", "target", 1).run(),
      Error,
      "requires compatible source and target ID types",
    );

    const numeric = sdb.newTable("numericMismatch")
      .loadData("test/data/graphs/numeric.csv");
    await assertRejects(
      () => numeric.neighbors("source", "target", "0").run(),
      Error,
      "start contains string IDs",
    );

    const lossy = sdb.newTable("lossy");
    await sdb.customQuery(
      'CREATE TABLE "lossy" (source BIGINT, target DOUBLE)',
    );
    await assertRejects(
      () => lossy.neighbors("source", "target", 1).run(),
      Error,
      "without losing ID precision",
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors output records its source as a cache dependency", async () => {
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
    const source = firstSdb.newTable(sourceName)
      .loadArray([{ source: "A", target: "B" }]);
    const output = firstSdb.newTable(outputName);
    await output.cache(compute(source));
    assertEquals(await output.getData(), [{ start: "A", node: "B" }]);
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
    assertEquals(await output.getData(), [{ start: "A", node: "C" }]);
  } finally {
    await secondSdb.close();
  }
});

Deno.test("neighbors internal relations do not shadow input table names", async () => {
  const sdb = new SimpleDB();
  try {
    for (const name of ["graph_starts", "NEIGHBOR_MATCHES"]) {
      const table = sdb.newTable(name)
        .loadArray([{ source: "A", target: "B" }]);
      // Execute separately to exercise the physical input rather than a fused CTE.
      await table.run();
      assertEquals(
        await table.neighbors("source", "target", "A").getData(),
        [{ start: "A", node: "B" }],
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors preserves queued source and output operation order", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("changingSource")
      .loadArray([{ source: "A", target: "B" }]);
    const result = source.neighbors("source", "target", "A", {
      outputTable: true,
    });
    source.loadArray([{ source: "A", target: "C" }]);
    assertEquals(await result.getData(), [{ start: "A", node: "B" }]);
    assertEquals(await source.getData(), [{ source: "A", target: "C" }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors JSDoc examples return their complete displayed outputs", async () => {
  const sdb = new SimpleDB();
  try {
    for (const direction of [undefined, "incoming", "both"] as const) {
      const table = sdb.newTable().loadArray([
        { origin: "A", destination: "B" },
        { origin: "A", destination: "B" },
        { origin: "C", destination: "A" },
      ]);
      const result = direction === undefined
        ? table.neighbors("origin", "destination", "A")
        : table.neighbors("origin", "destination", "A", { direction });
      assertEquals(
        await result.getData(),
        direction === "incoming"
          ? [{ start: "A", node: "C" }]
          : direction === "both"
          ? [{ start: "A", node: "B" }, { start: "A", node: "C" }]
          : [{ start: "A", node: "B" }],
      );
    }
    const table = sdb.newTable().loadArray([
      { source: "Montreal", target: "Ottawa", cost: 2 },
      { source: "Ottawa", target: "Toronto", cost: 3 },
    ]);
    assertEquals(
      await table.neighbors("source", "target", ["Montreal", "Ottawa"])
        .getData(),
      [
        { start: "Montreal", node: "Ottawa" },
        { start: "Ottawa", node: "Toronto" },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors deduplicates every direction and evaluates starts independently", async () => {
  const sdb = new SimpleDB();
  try {
    const table = loadScenario(sdb, "duplicateDirections", "common");
    for (const direction of ["outgoing", "incoming", "both"] as const) {
      const starts = direction === "incoming" ? ["C", "A"] : ["B", "A"];
      const expected = direction === "incoming"
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
      assertEquals(
        await table.neighbors("source", "target", starts, {
          direction,
          outputTable: true,
        }).getData(),
        expected,
      );
    }

    const single = loadScenario(sdb, "singleDirections", "single");
    assertEquals(
      await single.neighbors("source", "target", ["A"], {
        outputTable: true,
      }).getData(),
      [{ start: "A", node: "B" }],
    );
    assertEquals(
      await single.neighbors("source", "target", "B", {
        outputTable: true,
      }).getData(),
      [],
    );
    assertEquals(
      await single.neighbors("source", "target", "A", {
        direction: "incoming",
        outputTable: true,
      }).getData(),
      [],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors preserves binary membership and ordering under endpoint collations", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("collatedMembership");
    await sdb.customQuery(`CREATE TABLE "collatedMembership" (
      source VARCHAR COLLATE NOCASE, target VARCHAR COLLATE NOCASE
    ); INSERT INTO "collatedMembership" VALUES
      ('a', 'b'), ('A', 'b'), ('A', 'B'), ('A', 'B'), ('a', 'B')`);
    assertEquals(
      await table.neighbors("source", "target", ["a", "A"]).getData(),
      [
        { start: "A", node: "B" },
        { start: "A", node: "b" },
        { start: "a", node: "B" },
        { start: "a", node: "b" },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("neighbors distinguishes out-of-range unknown IDs from lossy floating IDs", async () => {
  const sdb = new SimpleDB();
  try {
    const integers = sdb.newTable("boundedIds");
    await sdb.customQuery(`CREATE TABLE "boundedIds" AS SELECT
      0::TINYINT AS source, 1::TINYINT AS target`);
    assertEquals(
      await integers.neighbors("source", "target", [0, 128, -(2n ** 200n)])
        .getData(),
      [{ start: 0, node: 1 }],
    );

    const bignum = sdb.newTable("bignumIds");
    const huge = 2n ** 200n;
    await sdb.customQuery(`CREATE TABLE "bignumIds" AS SELECT
      '${huge}'::BIGNUM AS source, '${huge + 1n}'::BIGNUM AS target`);
    assertEquals(
      await bignum.neighbors("source", "target", huge)
        .convert({ start: "string", node: "string" }).getData(),
      [{ start: String(huge), node: String(huge + 1n) }],
    );

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
