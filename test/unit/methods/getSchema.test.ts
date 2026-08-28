import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return the schema of a table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);

  const schema = await table.getSchema();
  assertEquals(schema, [
    {
      column_name: "key1",
      column_type: "BIGINT",
      null: "YES",
      key: null,
      default: null,
      extra: null,
    },
    {
      column_name: "key2",
      column_type: "VARCHAR",
      null: "YES",
      key: null,
      default: null,
      extra: null,
    },
  ]);

  await sdb.close();
});

Deno.test("should preserve primary-key schema metadata", async () => {
  const sdb = new SimpleDB();
  await sdb.customQuery(
    `CREATE TABLE "primaryKeySchema" (id INTEGER PRIMARY KEY)`,
  );
  const table = sdb.newTable("primaryKeySchema");

  assertEquals(await table.getSchema(), [
    {
      column_name: "id",
      column_type: "INTEGER",
      null: "NO",
      key: "PRI",
      default: null,
      extra: null,
    },
  ]);

  await sdb.close();
});
