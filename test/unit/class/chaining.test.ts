import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should chain mutation methods with then", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("chained");

  const data = await table
    .loadArray([
      { name: "b", value: 2 },
      { name: "c", value: 3 },
      { name: "a", value: 1 },
    ])
    .then((t) => t.renameColumns({ value: "amount" }))
    .then((t) => t.filter(`amount > 1`))
    .then((t) => t.sort({ name: "asc" }))
    .then((t) => t.getData());

  assertEquals(data, [
    { name: "b", amount: 2 },
    { name: "c", amount: 3 },
  ]);

  await sdb.done();
});

Deno.test("should return the same table instance from mutation methods", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("sameInstance");
  const returned = await table.loadArray([{ key1: 1 }]);
  assertEquals(returned === table, true);
  await sdb.done();
});
