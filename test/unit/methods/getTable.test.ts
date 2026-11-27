import { expect, test } from "vite-plus/test";
import { SimpleDB } from "../../../src/index.ts";

test("getTable registers one handle for a SQL-created table", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery('CREATE TABLE "Annual" AS SELECT 2024 AS year');

    const [first, second] = await Promise.all([sdb.getTable("annual"), sdb.getTable("Annual")]);
    expect(first).toBe(second);
    expect(first.name).toBe("Annual");
    expect(sdb.getTables()).toStrictEqual([first]);
    expect(await first.getData()).toStrictEqual([{ year: 2024 }]);
  } finally {
    await sdb.close();
  }
});

test("getTable rejects base tables shadowed by temporary relations", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`
      CREATE TABLE annual AS SELECT 2024 AS year;
      CREATE TEMP TABLE annual AS SELECT 2025 AS year;
      CREATE TABLE observations AS SELECT 1 AS year;
      CREATE TEMP VIEW observations AS SELECT 2 AS year;
    `);

    await expect(sdb.getTable("annual")).rejects.toThrow('could not find table "annual"');
    await expect(sdb.getTable("observations")).rejects.toThrow(
      'could not find table "observations"',
    );
    expect(sdb.getTables()).toStrictEqual([]);

    await sdb.customQuery("DROP TABLE temp.main.annual");
    expect(await (await sdb.getTable("annual")).getData()).toStrictEqual([{ year: 2024 }]);
  } finally {
    await sdb.close();
  }
});

test("getTable leaves queued work pending during lookup", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery("CREATE TABLE annual AS SELECT 2024 AS year");
    const pending = sdb.newTable("pending").loadArray([{ value: 1 }]);

    expect(await sdb.getTable("PENDING")).toBe(pending);
    expect((await sdb.getTable("annual")).name).toBe("annual");
    await expect(sdb.getTable("missing")).rejects.toThrow('could not find table "missing"');
    expect(pending.pendingOps).toHaveLength(1);
  } finally {
    await sdb.close();
  }
});
