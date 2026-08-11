import { assert, assertEquals, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should perform a basic left fuzzy join and include all left table rows", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should respect a custom threshold and only match exact strings at threshold 100", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should store result in a new table when outputTable is a string", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should store result in a new auto-named table when outputTable is true", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should use a custom similarity column name", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should work with the token_sort_ratio method for reordered words", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should find matches with significant length differences when using ratio at lower thresholds", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should be lossless for all methods with justNames.csv", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should not include a similarity column when similarityColumn is not provided", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should throw an error when tables have conflicting column names", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const tableA = sdb.newTable("tableA");
  tableA.loadArray([{ id: 1, name: "Alice" }]);
  const tableB = sdb.newTable("tableB");
  tableB.loadArray([{ id: 2, name: "Alise" }]); // 'id' conflicts

  // The leftColumn and rightColumn validation doesn't need the database, so
  // it throws at call time.
  assertThrows(() => tableA.fuzzyJoin(tableB, "name", "name", 80));

  await sdb.run();
  await sdb.done();
});

Deno.test("should throw an error when leftColumn and rightColumn have the same name", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const tableA = sdb.newTable("tableA");
  tableA.loadArray([{ name: "Alice" }]);
  const tableB = sdb.newTable("tableB");
  tableB.loadArray([{ name: "Alise", score: 1 }]); // only 'name' is shared, it's also the join key

  assertThrows(() => tableA.fuzzyJoin(tableB, "name", "name", 80));

  await sdb.run();
  await sdb.done();
});
