import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import SDAError from "../../../src/class/SDAError.ts";

test("should throw an SDAError carrying method, parameters, query and cause", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("errorTable");
  table.loadArray([{ key1: 1 }]);

  let error: unknown;
  try {
    // selectColumns() queues the operation; run() executes it.
    await table.selectColumns("aColumnThatDoesNotExist").run();
  } catch (e) {
    error = e;
  }

  expect(error instanceof SDAError).toStrictEqual(true);
  const sdaError = error as SDAError;
  expect(sdaError.name).toStrictEqual("SDAError");
  expect(sdaError.method).toStrictEqual("selectColumns()");
  expect(sdaError.parameters).toStrictEqual({ columns: "aColumnThatDoesNotExist" });
  expect(sdaError.query.includes("aColumnThatDoesNotExist")).toStrictEqual(true);
  expect(sdaError.cause instanceof Error).toStrictEqual(true);
  expect(sdaError.message.includes("aColumnThatDoesNotExist")).toStrictEqual(true);
  expect(sdaError.message.includes("selectColumns()")).toStrictEqual(true);

  await sdb.close();
});

test("should throw an SDAError from a failing custom query", async () => {
  const sdb = new SimpleDB();

  let error: unknown;
  try {
    await sdb.customQuery("SELECT * FROM aTableThatDoesNotExist");
  } catch (e) {
    error = e;
  }

  expect(error instanceof SDAError).toStrictEqual(true);
  const sdaError = error as SDAError;
  expect(sdaError.method).toStrictEqual("customQuery()");
  expect(sdaError.query).toStrictEqual("SELECT * FROM aTableThatDoesNotExist");

  await sdb.close();
});
