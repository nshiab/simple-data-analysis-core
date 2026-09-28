import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return a specific row", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const data = await table.getRow(`Name === 'Grant, Douglas'`);

  assertEquals(data, {
    Name: "Grant, Douglas",
    "Hire date": "13-JAN-08",
    Job: "Clerk",
    Salary: "NaN",
    "Department or unit": "50",
    "End-of_year-BONUS?": "23,39%",
  });
  await sdb.close();
});

Deno.test("should throw when no row matches", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");

  await assertRejects(
    () => table.getRow(`Name === 'Nobody'`),
    Error,
    "No row found",
  );
  await sdb.close();
});

Deno.test("should throw when more than one row matches", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");

  await assertRejects(
    () => table.getRow(`Job === 'Clerk'`),
    Error,
    "More than one row found",
  );
  await sdb.close();
});

Deno.test("should throw when no row matches and strict is false", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  await assertRejects(
    () => table.getRow(`Name === 'Nobody'`, { strict: false }),
    Error,
    "No row found",
  );
  await sdb.close();
});

Deno.test("should return the first row when more than one row matches and strict is false", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const data = await table.getRow(`Job === 'Clerk'`, { strict: false });

  assertEquals(
    data,
    (await table.getData({ conditions: `Job === 'Clerk'` }))[0],
  );
  assertEquals(data.Job, "Clerk");
  await sdb.close();
});

Deno.test("should return a non-null row with explicit or dynamic strict options", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("data").loadArray([{ id: 1 }]);
    const dynamicOptions: { strict?: boolean } = {
      strict: true,
    };
    for (
      const options of [{ strict: true }, { strict: false }, dynamicOptions]
    ) {
      const row: { [key: string]: unknown } = await table.getRow(
        "id === 1",
        options,
      );
      assertEquals(row.id, 1);
    }
  } finally {
    await sdb.close();
  }
});
