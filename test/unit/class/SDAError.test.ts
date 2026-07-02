import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SDAError from "../../../src/class/SDAError.ts";

Deno.test("should throw an SDAError carrying method, parameters, query and cause", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("errorTable");
  await table.loadArray([{ key1: 1 }]);

  let error: unknown;
  try {
    await table.selectColumns("aColumnThatDoesNotExist");
  } catch (e) {
    error = e;
  }

  assertEquals(error instanceof SDAError, true);
  const sdaError = error as SDAError;
  assertEquals(sdaError.name, "SDAError");
  assertEquals(sdaError.method, "selectColumns()");
  assertEquals(sdaError.parameters, { columns: "aColumnThatDoesNotExist" });
  assertEquals(
    sdaError.query.includes("aColumnThatDoesNotExist"),
    true,
  );
  assertEquals(sdaError.cause instanceof Error, true);
  assertEquals(
    sdaError.message.includes("aColumnThatDoesNotExist"),
    true,
  );
  assertEquals(sdaError.message.includes("selectColumns()"), true);

  await sdb.done();
});

Deno.test("should throw an SDAError from a failing custom query", async () => {
  const sdb = new SimpleDB();

  let error: unknown;
  try {
    await sdb.customQuery("SELECT * FROM aTableThatDoesNotExist");
  } catch (e) {
    error = e;
  }

  assertEquals(error instanceof SDAError, true);
  const sdaError = error as SDAError;
  assertEquals(sdaError.method, "customQuery()");
  assertEquals(sdaError.query, "SELECT * FROM aTableThatDoesNotExist");

  await sdb.done();
});
