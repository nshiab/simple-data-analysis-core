import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should reject tables from different databases", async () => {
  const leftDB = new SimpleDB();
  const rightDB = new SimpleDB();
  const left = leftDB.newTable("left");
  const right = rightDB.newTable("right");

  assertThrows(
    () => left.join(right),
    Error,
    "join() all tables must belong to the same SimpleDB instance.",
  );

  await leftDB.close();
  await rightDB.close();
});

Deno.test("should put the result of an inner join into a new table", async () => {
  const sdb = new SimpleDB();
  const dishes = sdb.newTable("dishes");
  dishes.loadData("test/data/joins/dishes.csv");
  const categories = sdb.newTable("categories");
  categories.loadData("test/data/joins/categories.csv");

  const joined = dishes.join(categories, {
    on: "dishId",
    type: "inner",
    outputTable: true,
  });

  const data = await joined.getData();

  assertEquals(data, [
    {
      dishId: 1,
      name: "Crème brûlée",
      country: "France",
      category: "Dessert",
    },
    { dishId: 2, name: "Pizza", country: "Italy", category: "Main" },
    {
      dishId: 3,
      name: "Churros",
      country: "Mexico",
      category: "Dessert",
    },
  ]);

  await sdb.close();
});

Deno.test("should put the result of a left join into a new table", async () => {
  const sdb = new SimpleDB();
  const dishes = sdb.newTable("dishes");
  dishes.loadData("test/data/joins/dishes.csv");
  const categories = sdb.newTable("categories");
  categories.loadData("test/data/joins/categories.csv");

  const joined = dishes.join(categories, {
    on: "dishId",
    type: "left",
    outputTable: true,
  });

  const data = await joined.getData();

  assertEquals(data, [
    {
      dishId: 1,
      name: "Crème brûlée",
      country: "France",
      category: "Dessert",
    },
    { dishId: 2, name: "Pizza", country: "Italy", category: "Main" },
    {
      dishId: 3,
      name: "Churros",
      country: "Mexico",
      category: "Dessert",
    },
    {
      dishId: 4,
      name: "Couscous",
      country: "Morrocco",
      category: null,
    },
    { dishId: 5, name: "Mochi", country: "Japan", category: null },
  ]);

  await sdb.close();
});

Deno.test("should put the result of a right join into a new table", async () => {
  const sdb = new SimpleDB();
  const dishes = sdb.newTable("dishes");
  dishes.loadData("test/data/joins/dishes.csv");
  const categories = sdb.newTable("categories");
  categories.loadData("test/data/joins/categories.csv");

  const joined = dishes.join(categories, {
    on: "dishId",
    type: "right",
    outputTable: true,
  });

  const data = await joined.getData();

  assertEquals(data, [
    {
      dishId: 1,
      name: "Crème brûlée",
      country: "France",
      category: "Dessert",
    },
    { dishId: 2, name: "Pizza", country: "Italy", category: "Main" },
    {
      dishId: 3,
      name: "Churros",
      country: "Mexico",
      category: "Dessert",
    },
    { dishId: 8, name: null, country: null, category: "Dessert" },
    { dishId: 7, name: null, country: null, category: "Main" },
    { dishId: 6, name: null, country: null, category: "Main" },
  ]);

  await sdb.close();
});

Deno.test("should put the result of a full join into a new table", async () => {
  const sdb = new SimpleDB();
  const dishes = sdb.newTable("dishes");
  dishes.loadData("test/data/joins/dishes.csv");
  const categories = sdb.newTable("categories");
  categories.loadData("test/data/joins/categories.csv");

  const joined = dishes.join(categories, {
    on: "dishId",
    type: "full",
    outputTable: true,
  });

  const data = await joined.getData();

  assertEquals(data, [
    {
      dishId: 1,
      name: "Crème brûlée",
      country: "France",
      category: "Dessert",
    },
    { dishId: 2, name: "Pizza", country: "Italy", category: "Main" },
    {
      dishId: 3,
      name: "Churros",
      country: "Mexico",
      category: "Dessert",
    },
    { dishId: 4, name: "Couscous", country: "Morrocco", category: null },
    { dishId: 5, name: "Mochi", country: "Japan", category: null },
    { dishId: 8, name: null, country: null, category: "Dessert" },
    { dishId: 7, name: null, country: null, category: "Main" },
    { dishId: 6, name: null, country: null, category: "Main" },
  ]);

  await sdb.close();
});

Deno.test("should put the result of a full join into a new table with a specific name in the DB", async () => {
  const sdb = new SimpleDB();
  const dishes = sdb.newTable("dishes");
  dishes.loadData("test/data/joins/dishes.csv");
  const categories = sdb.newTable("categories");
  categories.loadData("test/data/joins/categories.csv");

  dishes.join(categories, {
    on: "dishId",
    type: "full",
    outputTable: "joined",
  });

  const data = await sdb.customQuery("select * from joined", {
    returnData: true,
  });

  assertEquals(data, [
    {
      dishId: 1,
      name: "Crème brûlée",
      country: "France",
      category: "Dessert",
    },
    { dishId: 2, name: "Pizza", country: "Italy", category: "Main" },
    {
      dishId: 3,
      name: "Churros",
      country: "Mexico",
      category: "Dessert",
    },
    { dishId: 4, name: "Couscous", country: "Morrocco", category: null },
    { dishId: 5, name: "Mochi", country: "Japan", category: null },
    { dishId: 8, name: null, country: null, category: "Dessert" },
    { dishId: 7, name: null, country: null, category: "Main" },
    { dishId: 6, name: null, country: null, category: "Main" },
  ]);

  await sdb.close();
});

Deno.test("should automatically find a common column, make left join and put the result into leftTable", async () => {
  const sdb = new SimpleDB();
  const dishes = sdb.newTable("dishes");
  dishes.loadData("test/data/joins/dishes.csv");
  const categories = sdb.newTable("categories");
  categories.loadData("test/data/joins/categories.csv");

  dishes.join(categories);

  const data = await dishes.getData();

  assertEquals(data, [
    {
      dishId: 1,
      name: "Crème brûlée",
      country: "France",
      category: "Dessert",
    },
    { dishId: 2, name: "Pizza", country: "Italy", category: "Main" },
    {
      dishId: 3,
      name: "Churros",
      country: "Mexico",
      category: "Dessert",
    },
    {
      dishId: 4,
      name: "Couscous",
      country: "Morrocco",
      category: null,
    },
    { dishId: 5, name: "Mochi", country: "Japan", category: null },
  ]);

  await sdb.close();
});

Deno.test("should explain when tables have no common join column", async () => {
  const sdb = new SimpleDB();
  const votes = sdb.newTable("votes");
  votes.loadArray([{ voteId: 1 }]);
  const districts = sdb.newTable("districts");
  districts.loadArray([{ districtId: 1 }]);

  const error = await assertRejects(() => votes.join(districts).run());
  assert(error instanceof Error);
  assertEquals(
    error.message,
    `join() cannot infer a join column because tables "votes" and "districts" have no columns in common. Pass { on: "column" } after ensuring that column exists in both tables.`,
  );

  await sdb.close();
});

Deno.test("should list possible columns when a join is ambiguous", async () => {
  const sdb = new SimpleDB();
  const votes = sdb.newTable("votes");
  votes.loadArray([{ districtId: 1, year: 2026, votes: 10 }]);
  const districts = sdb.newTable("districts");
  districts.loadArray([{ districtId: 1, year: 2026, name: "Example" }]);

  const error = await assertRejects(() => votes.join(districts).run());
  assert(error instanceof Error);
  assertEquals(
    error.message,
    `join() found 2 possible join columns shared by tables "votes" and "districts": "districtId", "year". Pass { on: "column" } or { on: ["column1", "column2"] } to choose.`,
  );

  await sdb.close();
});

Deno.test("should join on multiple columns", async () => {
  const sdb = new SimpleDB();
  const dishes = sdb.newTable("normals");
  dishes.loadData("test/data/joins/normals.csv");
  const categories = sdb.newTable("projections");
  categories.loadData("test/data/joins/projections.csv");
  dishes.join(categories, { on: ["city", "season"] });

  await dishes.run();
  await sdb.close();
});

Deno.test("join captures options without mutating caller-owned objects", async () => {
  const sdb = new SimpleDB();
  const left = sdb.newTable("capturedJoinLeft");
  const right = sdb.newTable("capturedJoinRight");
  left.loadArray([{ id: 1, left: "a" }]);
  right.loadArray([{ id: 1, right: "b" }]);
  const on = ["id"];
  const options: {
    on: string[];
    type: "inner" | "left";
    outputTable: boolean;
  } = { on, type: "inner", outputTable: true };

  const joined = left.join(right, options);
  on[0] = "changed";
  options.type = "left";

  assertEquals(options, {
    on: ["changed"],
    type: "left",
    outputTable: true,
  });
  assertEquals(await joined.getData(), [{ id: 1, left: "a", right: "b" }]);
  await sdb.close();
});

Deno.test("should keep the join keys of unmatched right rows in a right join", async () => {
  const sdb = new SimpleDB();
  const tableA = sdb.newTable("tableA");
  tableA.loadArray([
    { key: "a", valueA: 1 },
    { key: "b", valueA: 2 },
  ]);
  const tableB = sdb.newTable("tableB");
  tableB.loadArray([
    { key: "b", valueB: 20 },
    { key: "c", valueB: 30 },
  ]);

  const joined = tableA.join(tableB, { type: "right", outputTable: true });
  joined.sort({ key: "asc" });
  const data = await joined.getData();

  assertEquals(data, [
    { key: "b", valueA: 2, valueB: 20 },
    { key: "c", valueA: null, valueB: 30 },
  ]);

  await sdb.close();
});

Deno.test("should keep the join keys of unmatched rows on both sides in a full join with multiple keys", async () => {
  const sdb = new SimpleDB();
  const tableA = sdb.newTable("tableA");
  tableA.loadArray([
    { year: 2024, city: "Montreal", sales: 10 },
    { year: 2025, city: "Toronto", sales: 20 },
  ]);
  const tableB = sdb.newTable("tableB");
  tableB.loadArray([
    { year: 2024, city: "Montreal", visits: 100 },
    { year: 2026, city: "Vancouver", visits: 300 },
  ]);

  const joined = tableA.join(tableB, {
    on: ["year", "city"],
    type: "full",
    outputTable: true,
  });
  joined.sort({ year: "asc" });
  const data = await joined.getData();

  assertEquals(data, [
    { year: 2024, city: "Montreal", sales: 10, visits: 100 },
    { year: 2025, city: "Toronto", sales: 20, visits: null },
    { year: 2026, city: "Vancouver", sales: null, visits: 300 },
  ]);

  await sdb.close();
});

for (const shape of ["narrow", "wide", "high-fanout"]) {
  for (const outputTable of [undefined, true, "joined"]) {
    Deno.test(`should fuse ${shape} joins with downstream operations (output ${outputTable})`, async () => {
      const sdb = new SimpleDB();
      try {
        const left = sdb.newTable("left");
        const right = sdb.newTable("right");
        await left.loadArray(Array.from({ length: 100 }, (_, i) => ({
          key: i % 10,
          value: i,
          ...(shape === "wide" ? { unused: "x".repeat(1000) } : {}),
        }))).run();
        await right.loadArray(
          Array.from(
            { length: shape === "high-fanout" ? 100 : 10 },
            (_, i) => ({
              key: i % 10,
              category: i % 2,
            }),
          ),
        ).run();
        const baseline = left.join(right, {
          on: "key",
          type: "inner",
          outputTable: "baseline",
        });
        await baseline.run();
        const expected = await baseline.selectColumns(["value", "category"])
          .filter("value >= 50")
          .summarize({ columns: "value", by: "category", stats: "sum" })
          .sort({ category: "asc" }).getData();
        const joined = left.join(right, {
          on: "key",
          type: "inner",
          outputTable,
        });
        const queries: string[] = [];
        const original = joined.runQuery;
        joined.runQuery = (query, connection, returnData, options) => {
          queries.push(query);
          return original(query, connection, returnData, options);
        };
        const actual = await joined.selectColumns(["value", "category"])
          .filter("value >= 50")
          .summarize({ columns: "value", by: "category", stats: "sum" })
          .sort({ category: "asc" }).getData();
        assertEquals(actual, expected);
        const writes = queries.filter((query) =>
          query.startsWith("CREATE OR REPLACE TABLE")
        );
        assertEquals(writes.length, 1);
        assert(writes[0].includes(" JOIN "));
        assert(writes[0].includes("SUM("));
      } finally {
        await sdb.close();
      }
    });
  }
}

Deno.test("fused joins preserve preceding input changes and later right-table changes", async () => {
  const sdb = new SimpleDB();
  try {
    const left = sdb.newTable("left").loadArray([{ key: 1 }, { key: 2 }]);
    const right = sdb.newTable("right").loadArray([{ key: 1, value: 10 }, {
      key: 2,
      value: 20,
    }]);
    left.filter("key = 2");
    left.join(right, { on: "key" }).selectColumns("value");
    right.filter("key = 1");
    assertEquals(await left.getData(), [{ value: 20 }]);
    assertEquals(await right.getData(), [{ key: 1, value: 10 }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("a self-referencing filter after a fused join reads the joined result", async () => {
  const sdb = new SimpleDB();
  try {
    const left = sdb.newTable('left"table').loadArray([{ key: 1 }, { key: 2 }]);
    const right = sdb.newTable("right").loadArray([{ key: 1, value: 10 }, {
      key: 2,
      value: 20,
    }]);
    assertEquals(
      await left.join(right, { on: "key" }).selectColumns("value")
        .filter('value > (SELECT AVG(value) FROM "left""table")').getData(),
      [{ value: 20 }],
    );
  } finally {
    await sdb.close();
  }
});

for (const failure of ["validation", "execution"]) {
  Deno.test(`a downstream ${failure} failure preserves the successful join and other queued work`, async () => {
    const sdb = new SimpleDB();
    try {
      const left = sdb.newTable("left").loadArray([{ key: 1 }]);
      const right = sdb.newTable("right").loadArray([{ key: 1, value: 10 }]);
      const joined = left.join(right, { on: "key", outputTable: "joined" });
      if (failure === "validation") joined.selectColumns("missing");
      else joined.filter("missing > 0");
      right.filter("value > 20");
      await assertRejects(() => joined.run());
      assertEquals(await joined.getData(), [{ key: 1, value: 10 }]);
      assertEquals(await right.getData(), []);
    } finally {
      await sdb.close();
    }
  });
}

Deno.test("join sources do not collide with generated CTE names", async () => {
  const sdb = new SimpleDB();
  try {
    const left = sdb.newTable("s1");
    const right = sdb.newTable("S2");
    await left.loadArray([{ key: 1 }]).run();
    await right.loadArray([{ key: 1, value: 10 }]).run();
    const queries: string[] = [];
    const original = left.runQuery;
    left.runQuery = (query, connection, returnData, options) => {
      queries.push(query);
      return original(query, connection, returnData, options);
    };
    assertEquals(
      await left.join(right, { on: "key" }).selectColumns("value").getData(),
      [{ value: 10 }],
    );
    assertEquals(
      queries.filter((query) => query.startsWith("CREATE OR REPLACE TABLE"))
        .length,
      1,
    );
  } finally {
    await sdb.close();
  }
});
