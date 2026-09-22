import { assert, assertEquals, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import buildFuzzyMatchSql from "../../../src/helpers/buildFuzzyMatchSql.ts";
import quoteIdentifier from "../../../src/helpers/quoteIdentifier.ts";

Deno.test("should preserve every repeated-value match across scorers, thresholds and prefix filters", async () => {
  const sdb = new SimpleDB();
  try {
    const left = sdb.newTable("left input");
    const right = sdb.newTable('right "input');
    const leftColumn = 'left "value';
    const rightColumn = "right value";
    const names = ["Alice", "Alicee", "café", "cafe", "😀", "😀😀", "", null];
    const leftRows = Array.from(
      { length: 40 },
      (_, i) =>
        [...names, "only-left"].map((name) => ({ id: i, [leftColumn]: name })),
    ).flat();
    const rightRows = Array.from(
      { length: 40 },
      (_, i) =>
        [...names, "only-right"].map((name) => ({
          rightId: i,
          [rightColumn]: name,
        })),
    ).flat();
    await left.loadArray(leftRows).run();
    await right.loadArray(rightRows).run();
    const queries: string[] = [];
    const original = left.runQuery;
    left.runQuery = (query, ...args) => {
      queries.push(query);
      return original(query, ...args);
    };
    await sdb.customQuery("INSTALL rapidfuzz FROM community; LOAD rapidfuzz");
    const q = quoteIdentifier;
    for (
      const method of [
        "ratio",
        "partial_ratio",
        "token_sort_ratio",
        "token_set_ratio",
      ] as const
    ) {
      for (const threshold of [0, 80, 100]) {
        for (const prefix of [undefined, 1]) {
          // Exercise both projection/order modes for each scorer and threshold.
          const similarityColumn = prefix === undefined
            ? 'match "score'
            : undefined;
          const { scoreExpression, condition } = buildFuzzyMatchSql(
            `l.${q(leftColumn)}`,
            `r.${q(rightColumn)}`,
            method,
            threshold,
            { decimals: 2, prefilterPrefixLength: prefix },
          );
          await sdb.customQuery(`CREATE OR REPLACE TABLE expected AS
            SELECT l.*, r.*${
            similarityColumn
              ? `, ${scoreExpression} AS ${q(similarityColumn)}`
              : ""
          }
            FROM ${q(left.name)} l LEFT JOIN ${
            q(right.name)
          } r ON ${condition}`);
          const output = await left.fuzzyJoin(
            right,
            leftColumn,
            rightColumn,
            threshold,
            {
              method,
              similarityColumn,
              prefilterPrefixLength: prefix,
              outputTable: "joined",
            },
          ).run();
          assertEquals(
            (await sdb.connection!.runAndReadAll(`
            (FROM joined EXCEPT ALL FROM expected)
            UNION ALL (FROM expected EXCEPT ALL FROM joined)`))
              .getRowObjectsJS(),
            [],
            `${method}, ${threshold}, prefix ${prefix}`,
          );
          assertEquals(await output.getColumns(), [
            "id",
            leftColumn,
            "rightId",
            rightColumn,
            ...(similarityColumn ? [similarityColumn] : []),
          ]);
          await sdb.removeTables("joined");
        }
      }
    }
    assertEquals(
      queries.filter((query) => query.includes("AS MATERIALIZED")).length,
      24,
    );
    assertEquals(await left.getData(), leftRows);
    assertEquals(await right.getData(), rightRows);
  } finally {
    await sdb.close();
  }
});

Deno.test("should match repeated values byte-for-byte with case-insensitive columns", async () => {
  const sdb = new SimpleDB();
  try {
    const left = sdb.newTable("collatedLeft");
    const right = sdb.newTable("collatedRight");
    await sdb.customQuery(`
      CREATE TABLE collatedLeft (id INTEGER, name VARCHAR COLLATE NOCASE);
      INSERT INTO collatedLeft SELECT i, n FROM range(180) t(i), (VALUES ('Alice'), ('alice')) t(n);
      CREATE TABLE collatedRight (rightId INTEGER, candidate VARCHAR COLLATE NOCASE);
      INSERT INTO collatedRight SELECT i, n FROM range(180) t(i), (VALUES ('Alice'), ('alice')) t(n)`);
    for (const threshold of [80, 100]) {
      const output = await left.fuzzyJoin(
        right,
        "name",
        "candidate",
        threshold,
        {
          prefilterPrefixLength: 1,
          similarityColumn: "score",
          outputTable: "collatedResult",
        },
      ).run();
      // At 80 both cases match (prefix equality inherits NOCASE); at 100
      // only byte-identical strings match. Expansion must never multiply them.
      assertEquals(
        await output.getRowCount(),
        threshold === 80 ? 129600 : 64800,
      );
      assertEquals(
        (await sdb.connection!.runAndReadAll(`SELECT * FROM collatedResult
        WHERE score != ROUND(rapidfuzz_ratio(name, candidate), 2)
          OR score < ${threshold}`)).getRowObjectsJS(),
        [],
      );
      await sdb.removeTables("collatedResult");
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("should preserve empty and null-only inputs when choosing a join strategy", async () => {
  const sdb = new SimpleDB();
  try {
    for (const [leftRows, rightRows] of [[0, 400], [400, 0], [400, 400]]) {
      const left = sdb.newTable("nullableLeft");
      const right = sdb.newTable("nullableRight");
      await sdb.customQuery(`CREATE OR REPLACE TABLE nullableLeft AS
        SELECT i AS id, NULL::VARCHAR AS name FROM range(${leftRows}) t(i);
        CREATE OR REPLACE TABLE nullableRight AS
        SELECT i AS rightId, 'value' AS candidate FROM range(${rightRows}) t(i)`);
      await left.fuzzyJoin(right, "name", "candidate", 0, {
        similarityColumn: "score",
      }).run();
      assertEquals(await left.getRowCount(), leftRows);
      assertEquals(
        (await sdb.connection!.runAndReadAll(`SELECT * FROM nullableLeft
        WHERE name IS NOT NULL OR rightId IS NOT NULL OR candidate IS NOT NULL OR score IS NOT NULL`))
          .getRowObjectsJS(),
        [],
      );
      assertEquals(await left.getColumns(), [
        "id",
        "name",
        "rightId",
        "candidate",
        "score",
      ]);
      await sdb.removeTables(["nullableLeft", "nullableRight"]);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("should retain score ordering when repeated matches are expanded", async () => {
  const sdb = new SimpleDB();
  try {
    const left = sdb.newTable("sortedLeft");
    const right = sdb.newTable("sortedRight");
    await left.loadArray(Array.from({ length: 400 }, () => ({ name: "Alice" })))
      .run();
    await right.loadArray(
      Array.from({ length: 200 }, () => [
        { candidate: "Alicee" },
        { candidate: "Alice" },
      ]).flat(),
    ).run();
    await left.fuzzyJoin(right, "name", "candidate", 80, {
      similarityColumn: "score",
    }).run();
    const rows = await left.getData();
    assertEquals(rows.length, 160000);
    assertEquals(rows[0].score, 100);
    assertEquals(rows.at(-1)!.score, 90.91);
    for (let i = 1; i < rows.length; i++) {
      assert(Number(rows[i - 1].score) >= Number(rows[i].score));
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("should expand repetition on either side and preserve a shared right key column", async () => {
  const sdb = new SimpleDB();
  try {
    for (const leftCopies of [1, 32]) {
      const rightCopies = leftCopies === 1 ? 32 : 1;
      const left = sdb.newTable("repeatLeft");
      const right = sdb.newTable("repeatRight");
      await sdb.customQuery(`CREATE OR REPLACE TABLE repeatLeft AS
        SELECT i AS id, md5(i::VARCHAR) AS name, 'original' AS candidate
        FROM range(64) t(i), range(${leftCopies});
        CREATE OR REPLACE TABLE repeatRight AS
        SELECT i AS rightId, md5(i::VARCHAR) AS candidate
        FROM range(64) t(i), range(${rightCopies})`);
      await left.fuzzyJoin(right, "name", "candidate", 100, {
        similarityColumn: "score",
      }).run();
      assertEquals(await left.getRowCount(), 2048);
      assertEquals(
        (await sdb.connection!.runAndReadAll(`SELECT * FROM repeatLeft
        WHERE candidate != 'original' OR score != 100 OR id != rightId`))
          .getRowObjectsJS(),
        [],
      );
      assertEquals(await left.getColumns(), [
        "id",
        "name",
        "candidate",
        "rightId",
        "score",
      ]);
      await sdb.removeTables(["repeatLeft", "repeatRight"]);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("should perform a basic left fuzzy join and include all left table rows", async () => {
  const sdb = new SimpleDB();
  const peopleA = sdb.newTable("peopleA");
  peopleA.loadData("test/data/files/people_a.csv");
  const peopleB = sdb.newTable("peopleB");
  peopleB.loadData("test/data/files/people_b.csv");

  peopleA.fuzzyJoin(peopleB, "name", "standardName", 80, {
    similarityColumn: "fuzzyScore",
  });

  const data = await peopleA.getData();

  assertEquals(data, [
    {
      id: 1,
      name: "Alice Smith",
      personId: "X",
      standardName: "Alice Smith",
      fuzzyScore: 100,
    },
    {
      id: 2,
      name: "Bob Johnson",
      personId: "Y",
      standardName: "Bob Jonson",
      fuzzyScore: 95.24,
    },
    {
      id: 3,
      name: "Carol Williams",
      personId: "Z",
      standardName: "Carol Williams",
      fuzzyScore: 100,
    },
    {
      id: 4,
      name: "David Jones",
      personId: null,
      standardName: null,
      fuzzyScore: null,
    },
  ]);

  await sdb.close();
});

Deno.test("should respect a custom threshold and only match exact strings at threshold 100", async () => {
  const sdb = new SimpleDB();
  const peopleA = sdb.newTable("peopleA");
  peopleA.loadData("test/data/files/people_a.csv");
  const peopleB = sdb.newTable("peopleB");
  peopleB.loadData("test/data/files/people_b.csv");

  peopleA.fuzzyJoin(peopleB, "name", "standardName", 100);

  const data = await peopleA.getData();

  assertEquals(data, [
    { id: 1, name: "Alice Smith", personId: "X", standardName: "Alice Smith" },
    { id: 2, name: "Bob Johnson", personId: null, standardName: null },
    {
      id: 3,
      name: "Carol Williams",
      personId: "Z",
      standardName: "Carol Williams",
    },
    { id: 4, name: "David Jones", personId: null, standardName: null },
  ]);

  await sdb.close();
});

Deno.test("should restrict comparisons with prefilterPrefixLength", async () => {
  const sdb = new SimpleDB();
  const left = sdb.newTable("prefixLeft");
  left.loadArray([{ id: 1, label: "alpha" }]);
  const right = sdb.newTable("prefixRight");
  right.loadArray([{ matchId: 2, candidate: "alphi" }]);

  const data = await left
    .fuzzyJoin(right, "label", "candidate", 70, {
      prefilterPrefixLength: 5,
    })
    .getData();

  assertEquals(data, [{
    id: 1,
    label: "alpha",
    matchId: null,
    candidate: null,
  }]);

  await sdb.close();
});

Deno.test("should store result in a new table when outputTable is a string", async () => {
  const sdb = new SimpleDB();
  const peopleA = sdb.newTable("peopleA");
  peopleA.loadData("test/data/files/people_a.csv");
  const peopleB = sdb.newTable("peopleB");
  peopleB.loadData("test/data/files/people_b.csv");

  const fuzzyResult = peopleA.fuzzyJoin(
    peopleB,
    "name",
    "standardName",
    80,
    { outputTable: "fuzzyResult" },
  );

  const tables = await sdb.getTableNames();
  assert(tables.includes("fuzzyResult"), "fuzzyResult table should exist");

  const data = await fuzzyResult.getData();

  assertEquals(data, [
    { id: 1, name: "Alice Smith", personId: "X", standardName: "Alice Smith" },
    { id: 2, name: "Bob Johnson", personId: "Y", standardName: "Bob Jonson" },
    {
      id: 3,
      name: "Carol Williams",
      personId: "Z",
      standardName: "Carol Williams",
    },
    { id: 4, name: "David Jones", personId: null, standardName: null },
  ]);

  // Original tables should be unchanged
  assertEquals(await peopleA.getData(), [
    { id: 1, name: "Alice Smith" },
    { id: 2, name: "Bob Johnson" },
    { id: 3, name: "Carol Williams" },
    { id: 4, name: "David Jones" },
  ]);
  assertEquals(await peopleB.getData(), [
    { personId: "X", standardName: "Alice Smith" },
    { personId: "Y", standardName: "Bob Jonson" },
    { personId: "Z", standardName: "Carol Williams" },
    { personId: "W", standardName: "Emma Wilson" },
  ]);

  await sdb.close();
});

Deno.test("should store result in a new auto-named table when outputTable is true", async () => {
  const sdb = new SimpleDB();
  const peopleA = sdb.newTable("peopleA");
  peopleA.loadData("test/data/files/people_a.csv");
  const peopleB = sdb.newTable("peopleB");
  peopleB.loadData("test/data/files/people_b.csv");

  const result = peopleA.fuzzyJoin(peopleB, "name", "standardName", 80, {
    outputTable: true,
  });

  assertEquals(await result.getData(), [
    { id: 1, name: "Alice Smith", personId: "X", standardName: "Alice Smith" },
    { id: 2, name: "Bob Johnson", personId: "Y", standardName: "Bob Jonson" },
    {
      id: 3,
      name: "Carol Williams",
      personId: "Z",
      standardName: "Carol Williams",
    },
    { id: 4, name: "David Jones", personId: null, standardName: null },
  ]);

  // peopleA should be unchanged (original table)
  assertEquals(await peopleA.getData(), [
    { id: 1, name: "Alice Smith" },
    { id: 2, name: "Bob Johnson" },
    { id: 3, name: "Carol Williams" },
    { id: 4, name: "David Jones" },
  ]);

  await sdb.close();
});

Deno.test("should use a custom similarity column name", async () => {
  const sdb = new SimpleDB();
  const peopleA = sdb.newTable("peopleA");
  peopleA.loadData("test/data/files/people_a.csv");
  const peopleB = sdb.newTable("peopleB");
  peopleB.loadData("test/data/files/people_b.csv");

  peopleA.fuzzyJoin(peopleB, "name", "standardName", 80, {
    similarityColumn: "matchScore",
  });

  assertEquals(await peopleA.getData(), [
    {
      id: 1,
      name: "Alice Smith",
      personId: "X",
      standardName: "Alice Smith",
      matchScore: 100,
    },
    {
      id: 2,
      name: "Bob Johnson",
      personId: "Y",
      standardName: "Bob Jonson",
      matchScore: 95.24,
    },
    {
      id: 3,
      name: "Carol Williams",
      personId: "Z",
      standardName: "Carol Williams",
      matchScore: 100,
    },
    {
      id: 4,
      name: "David Jones",
      personId: null,
      standardName: null,
      matchScore: null,
    },
  ]);

  await sdb.close();
});

Deno.test("should work with the token_sort_ratio method for reordered words", async () => {
  const sdb = new SimpleDB();
  const tableA = sdb.newTable("tableA");
  tableA.loadArray([
    { rowId: 1, label: "world hello" },
  ]);
  const tableB = sdb.newTable("tableB");
  tableB.loadArray([
    { itemId: "a", text: "hello world" },
  ]);

  tableA.fuzzyJoin(tableB, "label", "text", 90, {
    method: "token_sort_ratio",
    similarityColumn: "fuzzyScore",
  });

  assertEquals(await tableA.getData(), [
    {
      rowId: 1,
      label: "world hello",
      itemId: "a",
      text: "hello world",
      fuzzyScore: 100,
    },
  ]);

  await sdb.close();
});

Deno.test("should find matches with significant length differences when using ratio at lower thresholds", async () => {
  const sdb = new SimpleDB();
  const dataA = [
    { id: 1, name: "New York City" },
    { id: 2, name: "Paris, France" },
    { id: 3, name: "San Francisco" },
    { id: 4, name: "Short" },
  ];
  const dataB = [
    { name_B: "New York" },
    { name_B: "France, Paris" },
    { name_B: "San Francisco" },
  ];

  const tA = sdb.newTable("tA");
  tA.insertRows(dataA);
  const tB = sdb.newTable("tB");
  tB.insertRows(dataB);

  tA.fuzzyJoin(tB, "name", "name_B", 60, {
    method: "ratio",
  });

  const res = await tA.getData();
  const nyMatch = res.find((d) =>
    d.name === "New York City" && d.name_B === "New York"
  );

  assert(
    !!nyMatch,
    "Ratio should find match 'New York City' / 'New York' (approx 76%) at threshold 60",
  );

  await sdb.close();
});

Deno.test("should be lossless for all methods with justNames.csv", async () => {
  const sdb = new SimpleDB();
  const methods = [
    "ratio",
    "partial_ratio",
    "token_sort_ratio",
    "token_set_ratio",
  ] as const;

  for (const method of methods) {
    const tA = sdb.newTable(`tA_${method.replace(/_/g, "")}`);
    tA.loadData("test/data/files/justNames.csv");

    const tB = sdb.newTable(`tB_${method.replace(/_/g, "")}`);
    tB.loadData("test/data/files/justNames.csv");
    tB.renameColumns({ "landlordNames": "landlordNames_B" });

    // Every row should match itself at threshold 100
    tA.fuzzyJoin(tB, "landlordNames", "landlordNames_B", 100, {
      method,
    });

    const data = await tA.getData();
    // Verify that every row matched itself
    for (const row of data) {
      const matchFound = data.some((d) =>
        d.landlordNames === row.landlordNames &&
        d.landlordNames_B === row.landlordNames
      );
      assert(
        matchFound,
        `Method ${method} failed to match "${row.landlordNames}" with itself`,
      );
    }
  }

  await sdb.close();
});

Deno.test("should not include a similarity column when similarityColumn is not provided", async () => {
  const sdb = new SimpleDB();
  const peopleA = sdb.newTable("peopleA");
  peopleA.loadData("test/data/files/people_a.csv");
  const peopleB = sdb.newTable("peopleB");
  peopleB.loadData("test/data/files/people_b.csv");

  peopleA.fuzzyJoin(peopleB, "name", "standardName", 80);

  assertEquals(await peopleA.getData(), [
    { id: 1, name: "Alice Smith", personId: "X", standardName: "Alice Smith" },
    { id: 2, name: "Bob Johnson", personId: "Y", standardName: "Bob Jonson" },
    {
      id: 3,
      name: "Carol Williams",
      personId: "Z",
      standardName: "Carol Williams",
    },
    { id: 4, name: "David Jones", personId: null, standardName: null },
  ]);

  await sdb.close();
});

Deno.test("should throw an error when tables have conflicting column names", async () => {
  const sdb = new SimpleDB();
  const tableA = sdb.newTable("tableA");
  tableA.loadArray([{ id: 1, name: "Alice" }]);
  const tableB = sdb.newTable("tableB");
  tableB.loadArray([{ id: 2, name: "Alise" }]); // 'id' conflicts

  // The leftColumn and rightColumn validation doesn't need the database, so
  // it throws at call time.
  assertThrows(() => tableA.fuzzyJoin(tableB, "name", "name", 80));

  await sdb.run();
  await sdb.close();
});

Deno.test("should throw an error when leftColumn and rightColumn have the same name", async () => {
  const sdb = new SimpleDB();
  const tableA = sdb.newTable("tableA");
  tableA.loadArray([{ name: "Alice" }]);
  const tableB = sdb.newTable("tableB");
  tableB.loadArray([{ name: "Alise", score: 1 }]); // only 'name' is shared, it's also the join key

  assertThrows(() => tableA.fuzzyJoin(tableB, "name", "name", 80));

  await sdb.run();
  await sdb.close();
});
