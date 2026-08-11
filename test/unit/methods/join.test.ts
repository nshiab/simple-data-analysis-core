import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should put the result of an inner join into a new table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should put the result of a left join into a new table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should put the result of a right join into a new table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should put the result of a full join into a new table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should put the result of a full join into a new table with a specific name in the DB", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should automatically find a common column, make left join and put the result into leftTable", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should join on multiple columns", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const dishes = sdb.newTable("normals");
  dishes.loadData("test/data/joins/normals.csv");
  const categories = sdb.newTable("projections");
  categories.loadData("test/data/joins/projections.csv");
  dishes.join(categories, { on: ["city", "season"] });

  await dishes.run();
  await sdb.done();
});

Deno.test("join captures options without mutating caller-owned objects", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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
  await sdb.done();
});

Deno.test("should keep the join keys of unmatched right rows in a right join", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});

Deno.test("should keep the join keys of unmatched rows on both sides in a full join with multiple keys", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  await sdb.done();
});
