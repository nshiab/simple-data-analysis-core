import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should add a column with the quantiles", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/dataRank.csv");
  table.quantiles("Mark", 4, "quantiles");
  const data = await table.getData();

  assertEquals(data, [
    { Name: "Isabella", Subject: "Maths", Mark: 50, quantiles: 1 },
    { Name: "Olivia", Subject: "Maths", Mark: 55, quantiles: 1 },
    { Name: "Olivia", Subject: "Science", Mark: 60, quantiles: 1 },
    { Name: "Lily", Subject: "Maths", Mark: 65, quantiles: 2 },
    { Name: "Lily", Subject: "English", Mark: 70, quantiles: 2 },
    { Name: "Isabella", Subject: "Science", Mark: 70, quantiles: 3 },
    { Name: "Lily", Subject: "Science", Mark: 80, quantiles: 3 },
    { Name: "Olivia", Subject: "English", Mark: 89, quantiles: 4 },
    { Name: "Isabella", Subject: "English", Mark: 90, quantiles: 4 },
  ]);

  await sdb.close();
});

Deno.test("should add a column with the quantiles after grouping", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/dataRank.csv");
  table.quantiles("Mark", 2, "quantiles", {
    by: "Subject",
  });

  table.sort({
    Subject: "asc",
    Mark: "asc",
  });

  const data = await table.getData();

  assertEquals(data, [
    { Name: "Lily", Subject: "English", Mark: 70, quantiles: 1 },
    { Name: "Olivia", Subject: "English", Mark: 89, quantiles: 1 },
    { Name: "Isabella", Subject: "English", Mark: 90, quantiles: 2 },
    { Name: "Isabella", Subject: "Maths", Mark: 50, quantiles: 1 },
    { Name: "Olivia", Subject: "Maths", Mark: 55, quantiles: 1 },
    { Name: "Lily", Subject: "Maths", Mark: 65, quantiles: 2 },
    { Name: "Olivia", Subject: "Science", Mark: 60, quantiles: 1 },
    { Name: "Isabella", Subject: "Science", Mark: 70, quantiles: 1 },
    { Name: "Lily", Subject: "Science", Mark: 80, quantiles: 2 },
  ]);

  await sdb.close();
});

Deno.test("should throw when the new column name already exists, instead of silently renaming it", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { value: 1, existing: "already here" },
    { value: 2, existing: "x" },
  ]);

  await assertRejects(
    () => table.quantiles("value", 4, "existing").run(),
    Error,
    'the column "existing" already exists',
  );

  await sdb.close();
});
