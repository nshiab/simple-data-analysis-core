import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should truncate strings in one column to specified length", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { description: "This is a long description" },
  ]);

  table.truncate("description", 10);

  const data = await table.getData();

  assertEquals(data, [{ description: "This is a " }]);
  await sdb.close();
});

Deno.test("should truncate strings shorter than specified length unchanged", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { name: "John" },
  ]);

  table.truncate("name", 10);

  const data = await table.getData();

  assertEquals(data, [{ name: "John" }]);
  await sdb.close();
});

Deno.test("should truncate strings to zero characters", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { text: "Hello World" },
  ]);

  table.truncate("text", 0);

  const data = await table.getData();

  assertEquals(data, [{ text: "" }]);
  await sdb.close();
});

Deno.test("should truncate multiple rows", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { firstName: "Alexander", lastName: "Washington" },
    { firstName: "Elizabeth", lastName: "Montgomery" },
    { firstName: "Christopher", lastName: "Anderson" },
  ]);

  table.truncate("firstName", 5);

  const data = await table.getData();

  assertEquals(data, [
    { firstName: "Alexa", lastName: "Washington" },
    { firstName: "Eliza", lastName: "Montgomery" },
    { firstName: "Chris", lastName: "Anderson" },
  ]);
  await sdb.close();
});

Deno.test("should truncate strings in column with spaces in name", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { "full name": "Alexander Washington" },
  ]);

  table.truncate("full name", 9);

  const data = await table.getData();

  assertEquals(data, [
    { "full name": "Alexander" },
  ]);
  await sdb.close();
});
