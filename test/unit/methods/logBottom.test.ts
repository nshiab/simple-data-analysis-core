import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should log the last rows", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.logBottom(5);

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});

Deno.test("should log the default number of bottom rows", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.logBottom();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});

Deno.test("logBottom preserves nested digits and timestamps with original ordering", async () => {
  const sdb = new SimpleDB();
  const originalLog = console.log;
  const lines: string[] = [];
  try {
    await sdb.customQuery(
      `CREATE TABLE bottom_display AS SELECT i::INTEGER AS id,
      [9007199254740993::BIGINT, NULL] AS items,
      TIMESTAMP '2025-01-01 00:00:00.123456' AS ts FROM range(3) t(i)`,
    );
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    const table = sdb.newTable("bottom_display");
    for (const originalOrder of [true, false]) {
      lines.length = 0;
      await table.logBottom(2, { originalOrder });
      const output = lines.join("\n");
      assertEquals(output.includes('["9007199254740993",null]'), true);
      assertEquals(output.includes("2025-01-01 00:00:00.123456"), true);
      assertEquals(
        output.indexOf("\x1b[33m1") < output.indexOf("\x1b[33m2"),
        originalOrder,
      );
    }
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});
