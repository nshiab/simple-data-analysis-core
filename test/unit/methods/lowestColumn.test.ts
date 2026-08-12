import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should add the lowest column name", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { id: 1, a: 1, b: 3, c: 2 },
    { id: 2, a: 5, b: 4, c: 6 },
  ]);

  table.lowestColumn(["a", "b", "c"], "lowest");

  assertEquals(await table.getData(), [
    { id: 1, a: 1, b: 3, c: 2, lowest: "a" },
    { id: 2, a: 5, b: 4, c: 6, lowest: "b" },
  ]);

  await sdb.close();
});

Deno.test("should keep the first supplied lowest column when ties is first", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ id: 1, a: 5, b: 5, c: 10 }]);

  table.lowestColumn(["b", "a", "c"], "smallest", { ties: "first" });

  assertEquals(await table.getData(), [
    { id: 1, a: 5, b: 5, c: 10, smallest: "b" },
  ]);

  await sdb.close();
});

Deno.test("should produce tidy rows for all tied lowest columns", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { id: 1, a: 5, b: 5, c: 10 },
    { id: 2, a: 3, b: 2, c: 1 },
    { id: 3, a: null, b: null, c: null },
  ]);

  table.lowestColumn(["a", "b", "c"], "smallest", { ties: "all" });
  table.sort({ id: "asc", smallest: "asc" });

  assertEquals(await table.getData(), [
    { id: 1, a: 5, b: 5, c: 10, smallest: "a" },
    { id: 1, a: 5, b: 5, c: 10, smallest: "b" },
    { id: 2, a: 3, b: 2, c: 1, smallest: "c" },
    { id: 3, a: null, b: null, c: null, smallest: null },
  ]);

  await sdb.close();
});

Deno.test("should reject tied lowest columns in strict mode", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ id: 1, a: 5, b: 5 }]);
  table.lowestColumn(["a", "b"], "smallest");

  await assertRejects(
    () => table.run(),
    Error,
    'lowestColumn() found a tie between columns "a", "b". Use { ties: "first" } to select the first tied column, or { ties: "all" } to produce one row for each tied column.',
  );

  await sdb.close();
});
