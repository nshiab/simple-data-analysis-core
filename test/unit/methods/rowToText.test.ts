import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should concatenate multiple columns with labels into a new column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    {
      summary: "A brief overview",
      findings: "Key discoveries",
      context: "Background information",
    },
    {
      summary: "Another summary",
      findings: "More findings",
      context: "Additional context",
    },
  ]);

  table.rowToText(["summary", "findings", "context"], "fullText");
  const data = await table.getData();

  assertEquals(data, [
    {
      summary: "A brief overview",
      findings: "Key discoveries",
      context: "Background information",
      fullText:
        "summary:\nA brief overview\n\nfindings:\nKey discoveries\n\ncontext:\nBackground information",
    },
    {
      summary: "Another summary",
      findings: "More findings",
      context: "Additional context",
      fullText:
        "summary:\nAnother summary\n\nfindings:\nMore findings\n\ncontext:\nAdditional context",
    },
  ]);

  await sdb.done();
});

Deno.test("should handle null values when concatenating with labels", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    {
      name: "John",
      age: null,
      city: "NYC",
    },
    {
      name: null,
      age: "30",
      city: "Boston",
    },
  ]);

  table.rowToText(["name", "age", "city"], "profile");

  const data = await table.getData();

  assertEquals(data, [
    {
      name: "John",
      age: null,
      city: "NYC",
      profile: "name:\nJohn\n\nage:\nUnknown\n\ncity:\nNYC",
    },
    {
      name: null,
      age: "30",
      city: "Boston",
      profile: "name:\nUnknown\n\nage:\n30\n\ncity:\nBoston",
    },
  ]);

  await sdb.done();
});

Deno.test("should concatenate a single column with label", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    { title: "First" },
    { title: "Second" },
  ]);

  table.rowToText(["title"], "labeled");

  const data = await table.getData();

  assertEquals(data, [
    {
      title: "First",
      labeled: "title:\nFirst",
    },
    {
      title: "Second",
      labeled: "title:\nSecond",
    },
  ]);

  await sdb.done();
});

Deno.test("should handle columns with special characters in names", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    {
      "First Name": "Jane",
      "Last-Name": "Doe",
      "Age (years)": "25",
    },
  ]);

  table.rowToText(
    ["First Name", "Last-Name", "Age (years)"],
    "fullInfo",
  );

  const data = await table.getData();

  assertEquals(data, [
    {
      "First Name": "Jane",
      "Last-Name": "Doe",
      "Age (years)": "25",
      fullInfo: "First Name:\nJane\n\nLast-Name:\nDoe\n\nAge (years):\n25",
    },
  ]);

  await sdb.done();
});

Deno.test("should concatenate after converting numeric columns to strings", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("mixed");
  table.loadArray([
    {
      name: "Alice",
      age: 30,
      salary: 50000,
      department: "Engineering",
    },
    {
      name: "Bob",
      age: null,
      salary: 60000,
      department: "Sales",
    },
    {
      name: "Charlie",
      age: 45,
      salary: null,
      department: "Marketing",
    },
  ]);

  // Convert numeric columns to strings first
  table.convert({ age: "string", salary: "string" });

  table.rowToText(
    ["name", "age", "salary", "department"],
    "employeeProfile",
  );

  const data = await table.getData();

  assertEquals(data, [
    {
      name: "Alice",
      age: "30.0",
      salary: "50000.0",
      department: "Engineering",
      employeeProfile:
        "name:\nAlice\n\nage:\n30.0\n\nsalary:\n50000.0\n\ndepartment:\nEngineering",
    },
    {
      name: "Bob",
      age: null,
      salary: "60000.0",
      department: "Sales",
      employeeProfile:
        "name:\nBob\n\nage:\nUnknown\n\nsalary:\n60000.0\n\ndepartment:\nSales",
    },
    {
      name: "Charlie",
      age: "45.0",
      salary: null,
      department: "Marketing",
      employeeProfile:
        "name:\nCharlie\n\nage:\n45.0\n\nsalary:\nUnknown\n\ndepartment:\nMarketing",
    },
  ]);

  await sdb.done();
});

Deno.test("should throw error when trying to concatenate non-VARCHAR columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    { name: "Alice", age: 30, salary: 50000 },
  ]);

  await assertRejects(
    async () => {
      // rowToText() queues the operation; run() executes it.
      await table.rowToText(["name", "age", "salary"], "profile").run();
    },
    Error,
    "The column age is of type DOUBLE. The rowToText() method only works with string columns. Please convert the column to string first with the .convert() method.",
  );

  await sdb.done();
});

Deno.test("should bind labels derived from column names", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("boundRowToText");

  table.loadArray([{ "author's name": "Ada" }]);
  table.rowToText(["author's name"], "profile");

  assertEquals(await table.getData(), [{
    "author's name": "Ada",
    profile: "author's name:\nAda",
  }]);
  await sdb.done();
});
