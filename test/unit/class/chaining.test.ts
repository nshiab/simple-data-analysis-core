import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should chain sync builder methods, with a single await at the observation point", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("chained");

  const data = await table
    .loadArray([
      { name: "b", value: 2 },
      { name: "c", value: 3 },
      { name: "a", value: 1 },
    ])
    .filter(`value > 1`)
    .addColumn("double", "number", `value * 2`)
    .getData();

  assertEquals(data, [
    { name: "b", value: 2, double: 4 },
    { name: "c", value: 3, double: 6 },
  ]);

  await sdb.close();
});

Deno.test("should chain async mutation methods with then", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("chainedAsync");

  const data = await table
    .loadArray([
      { name: "b", value: 2 },
      { name: "c", value: 3 },
      { name: "a", value: 1 },
    ])
    .renameColumns({ value: "amount" })
    .sort({ name: "asc" })
    .renameTable("chainedAsyncRenamed")
    .then((t) => t.getData());

  assertEquals(data, [
    { name: "a", amount: 1 },
    { name: "b", amount: 2 },
    { name: "c", amount: 3 },
  ]);

  await sdb.close();
});

Deno.test("should return the same table instance from mutation methods", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("sameInstance");
  const returned = table.loadArray([{ key1: 1 }]);
  assertEquals(returned === table, true);
  const returnedFromRun = await table.run();
  assertEquals(returnedFromRun === table, true);
  await sdb.close();
});
