import { test, expect, vi } from "vite-plus/test";
import SimpleDB from "../../../src/class/SimpleDB.ts";

test("logColumns prints column names and optionally their types", async () => {
  const sdb = new SimpleDB();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const table = sdb.newTable("names").loadArray([{ name: "Alice", age: 30 }]);
    await table.logColumns();
    expect(log.mock.calls.at(-1)).toStrictEqual([["name", "age"]]);
    await table.logColumns({ types: true });
    expect(log.mock.calls.at(-1)).toStrictEqual([{ name: "VARCHAR", age: "DOUBLE" }]);
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});
