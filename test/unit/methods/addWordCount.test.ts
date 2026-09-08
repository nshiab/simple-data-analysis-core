import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should add a whitespace-delimited word count for each string", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  const paragraphs = `First paragraph.

Second paragraph has words.`;
  table.loadArray([
    { text: "hello world" },
    { text: "hello   world\tfrom\nSDA" },
    { text: paragraphs },
    { text: "Hello, world!" },
    { text: "well-known" },
    { text: "..." },
    { text: "中文" },
    { text: "" },
    { text: " \t\n " },
    { text: null },
  ]);
  table.addWordCount("text", "wordCount");

  const data = await table.getData();

  assertEquals(data, [
    { text: "hello world", wordCount: 2 },
    { text: "hello   world\tfrom\nSDA", wordCount: 4 },
    { text: paragraphs, wordCount: 6 },
    { text: "Hello, world!", wordCount: 2 },
    { text: "well-known", wordCount: 1 },
    { text: "...", wordCount: 1 },
    { text: "中文", wordCount: 1 },
    { text: "", wordCount: 0 },
    { text: " \t\n ", wordCount: 0 },
    { text: null, wordCount: null },
  ]);
  await sdb.close();
});

Deno.test("should support spaces in source and new column names", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([{ "full text": "hello world" }]);
  table.addWordCount("full text", "word count");

  const data = await table.getData();

  assertEquals(data, [{ "full text": "hello world", "word count": 2 }]);
  await sdb.close();
});

Deno.test("should reject an existing output column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([{ text: "hello world" }]);
  table.addWordCount("text", "text");

  await assertRejects(
    () => table.getData(),
    Error,
    'addWordCount() the column "text" already exists.',
  );
  await sdb.close();
});
