import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should throw when the source column does not exist", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { name: "Shiab, Nael" },
    { name: "Bruce, Graeme" },
  ]);

  table.splitExtract("nope", ",", 0, "lastName");

  await assertRejects(() => table.getData());

  await sdb.close();
});

Deno.test("should extract a substring based on a separator and substring", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { name: "Shiab, Nael" },
    { name: "Bruce, Graeme" },
  ]);

  table.splitExtract("name", ",", 0, "lastName");

  const data = await table.getData();

  assertEquals(data, [{ name: "Shiab, Nael", lastName: "Shiab" }, {
    name: "Bruce, Graeme",
    lastName: "Bruce",
  }]);
  await sdb.close();
});
Deno.test("should extract a substring based on a separator and substring, and overwrite the original column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { name: "Shiab, Nael" },
    { name: "Bruce, Graeme" },
  ]);

  table.splitExtract("name", ",", 0, "name");

  const data = await table.getData();

  assertEquals(data, [{ name: "Shiab" }, { name: "Bruce" }]);
  await sdb.close();
});

Deno.test("should bind an extraction separator containing an apostrophe", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("boundSplitExtract");

  table.loadArray([{ value: "rock'n'roll" }]);
  table.splitExtract("value", "'n'", 1, "part");

  assertEquals(await table.getData(), [{ value: "rock'n'roll", part: "roll" }]);
  await sdb.close();
});
