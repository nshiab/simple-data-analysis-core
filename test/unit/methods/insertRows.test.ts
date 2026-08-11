import { assert, assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("add rows in an empty table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });

  const table = sdb.newTable("data");

  table.insertRows([
    { key1: 5, key2: "cinq" },
    { key1: 6, key2: "six" },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    { key1: 5, key2: "cinq" },
    { key1: 6, key2: "six" },
  ]);

  await sdb.done();
});

Deno.test("add rows in a table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });

  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");

  table.insertRows([
    { key1: 5, key2: "cinq" },
    { key1: 6, key2: "six" },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    { key1: 1, key2: "un" },
    { key1: 2, key2: "deux" },
    { key1: 3, key2: "trois" },
    { key1: 4, key2: "quatre" },
    { key1: 5, key2: "cinq" },
    { key1: 6, key2: "six" },
  ]);

  await sdb.done();
});

Deno.test("insertRows binds data values separately from generated SQL", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", logSQL: true });
  const table = sdb.newTable('bound "rows"');
  table.loadArray([{
    text: "base",
    nullable: "value",
    date: new Date("2020-01-01T00:00:00.000Z"),
    flag: true,
    number: 0,
  }]);
  await table.run();

  const logs: unknown[][] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args);
  try {
    table.insertRows([{
      text: "O'Brien",
      nullable: null,
      date: new Date("2024-02-03T04:05:06.000Z"),
      flag: false,
      number: 42.5,
    }]);
    await table.run();
  } finally {
    console.log = originalLog;
  }

  assert(logs.some(([message]) =>
    typeof message === "string" &&
    message.includes('INSERT INTO "bound ""rows"""') &&
    message.includes("VALUES\n(?, ?, ?, ?, ?)")
  ));
  assert(logs.some(([message]) => message === "Bound values:"));
  assertEquals(await table.getData(), [
    {
      text: "base",
      nullable: "value",
      date: new Date("2020-01-01T00:00:00.000Z"),
      flag: true,
      number: 0,
    },
    {
      text: "O'Brien",
      nullable: null,
      date: new Date("2024-02-03T04:05:06.000Z"),
      flag: false,
      number: 42.5,
    },
  ]);

  await sdb.done();
});
