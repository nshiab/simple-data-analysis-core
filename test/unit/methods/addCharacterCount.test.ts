import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should add the character count for each string", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    { text: "hello" },
    { text: "café" },
    { text: "🙂" },
    { text: "" },
    { text: null },
  ]);
  table.addCharacterCount("text", "characterCount");

  const data = await table.getData();

  assertEquals(data, [
    { text: "hello", characterCount: 5 },
    { text: "café", characterCount: 4 },
    { text: "🙂", characterCount: 1 },
    { text: "", characterCount: 0 },
    { text: null, characterCount: null },
  ]);
  await sdb.close();
});

Deno.test("should support spaces in source and new column names", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([{ "full text": "hello world" }]);
  table.addCharacterCount("full text", "character count");

  const data = await table.getData();

  assertEquals(data, [{ "full text": "hello world", "character count": 11 }]);
  await sdb.close();
});

Deno.test("should reject an existing output column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([{ text: "hello" }]);
  table.addCharacterCount("text", "text");

  await assertRejects(
    () => table.getData(),
    Error,
    'addCharacterCount() the column "text" already exists.',
  );
  await sdb.close();
});
