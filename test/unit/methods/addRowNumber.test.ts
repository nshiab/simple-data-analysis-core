import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return a column with the row number", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadArray([
    { first: "Nael", last: "Shiab" },
    { first: "Graeme", last: "Bruce" },
  ]);
  await table.addRowNumber("rowNumber");

  const data = await table.getData();

  assertEquals(data, [
    { first: "Nael", last: "Shiab", rowNumber: 0 },
    { first: "Graeme", last: "Bruce", rowNumber: 1 },
  ]);
  await sdb.done();
});

Deno.test("should return a column with the row number restarting for each category (starting at 0)", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadArray([
    { first: "Nael", last: "Shiab", city: "Montreal" },
    { first: "Graeme", last: "Bruce", city: "Montreal" },
    { first: "John", last: "Doe", city: "Toronto" },
    { first: "Jane", last: "Doe", city: "Toronto" },
  ]);
  await table.addRowNumber("rowNumber", { categories: "city" });

  const data = await table.getData();

  assertEquals(data, [
    { first: "Nael", last: "Shiab", city: "Montreal", rowNumber: 0 },
    { first: "Graeme", last: "Bruce", city: "Montreal", rowNumber: 1 },
    { first: "John", last: "Doe", city: "Toronto", rowNumber: 0 },
    { first: "Jane", last: "Doe", city: "Toronto", rowNumber: 1 },
  ]);
  await sdb.done();
});
