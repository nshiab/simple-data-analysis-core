import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should change the name of one column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.json"]);

  table.renameColumns({
    key1: "A",
  });
  const data = await table.getData();

  assertEquals(data, [
    { A: 1, key2: "un" },
    { A: 2, key2: "deux" },
    { A: 3, key2: "trois" },
    { A: 4, key2: "quatre" },
  ]);

  await sdb.close();
});

Deno.test("should change the name of multiple columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.json"]);

  table.renameColumns({
    key1: "A",
    key2: "B",
  });
  const data = await table.getData();

  assertEquals(data, [
    { A: 1, B: "un" },
    { A: 2, B: "deux" },
    { A: 3, B: "trois" },
    { A: 4, B: "quatre" },
  ]);

  await sdb.close();
});

Deno.test("should throw when a source column does not exist", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.json"]);

  table.renameColumns({ nope: "A" });

  await assertRejects(() => table.getData());

  await sdb.close();
});

Deno.test("should throw when only some source columns exist", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.json"]);

  table.renameColumns({ key1: "A", nope: "B" });

  await assertRejects(() => table.getData());

  await sdb.close();
});

Deno.test("should skip the existence check when strict is false", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.json"]);

  // "nope" does not exist; with the check off, the rename is silently ignored
  // by DuckDB and the real column is still renamed.
  table.renameColumns({ key1: "A", nope: "B" }, { strict: false });
  const data = await table.getData();

  assertEquals(data, [
    { A: 1, key2: "un" },
    { A: 2, key2: "deux" },
    { A: 3, key2: "trois" },
    { A: 4, key2: "quatre" },
  ]);

  await sdb.close();
});

Deno.test("should change the name of a column with $ in its name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ "$ value": 10 }, { "$ value": 20 }]);

  table.renameColumns({
    "$ value": "value",
  });
  const data = await table.getData();

  assertEquals(data, [
    { value: 10 },
    { value: 20 },
  ]);

  await sdb.close();
});
