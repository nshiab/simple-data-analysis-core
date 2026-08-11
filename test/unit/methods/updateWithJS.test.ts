import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should update the data from the table with a javascript function and reinsert it into the table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.json");
  await table.updateWithJS((rows) => {
    const modifiedRows = rows.map((d) => ({
      Name: typeof d.Name === "string" ? d.Name.slice(0, 4) : d.Name,
    }));

    return modifiedRows;
  });

  const data = await table.getData();

  assertEquals(data, [
    { Name: "OCon" },
    { Name: "OCon" },
    { Name: "Gran" },
    { Name: null },
    { Name: "Hart" },
    { Name: "Fay," },
    { Name: "Mavr" },
    { Name: null },
    { Name: "Higg" },
    { Name: null },
    { Name: "King" },
    { Name: "Koch" },
    { Name: "De H" },
    { Name: "Huno" },
    { Name: "Erns" },
    { Name: "Aust" },
    { Name: "Pata" },
    { Name: "Lore" },
    { Name: "Gree" },
    { Name: "Favi" },
    { Name: "Chen" },
    { Name: "Scia" },
    { Name: "Urma" },
    { Name: "Popp" },
    { Name: "Raph" },
    { Name: "Khoo" },
    { Name: "Baid" },
    { Name: "Tobi" },
    { Name: "Himu" },
    { Name: "Colm" },
    { Name: "Weis" },
    { Name: "Frip" },
    { Name: "Kauf" },
    { Name: "Voll" },
    { Name: "Mour" },
    { Name: "Naye" },
    { Name: "Mikk" },
    { Name: "Land" },
    { Name: "Mark" },
    { Name: "Biss" },
    { Name: "Atki" },
    { Name: "Marl" },
    { Name: "Olso" },
    { Name: null },
    { Name: "Roge" },
    { Name: "Gee," },
    { Name: "Phil" },
    { Name: "Ladw" },
    { Name: "Stil" },
    { Name: "Seo," },
    { Name: "Pate" },
  ]);

  await sdb.done();
});

Deno.test("should update the data from the table with an async javascript function and reinsert it into the table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.json");
  await table.updateWithJS((rows) => {
    const modifiedRows = rows.map((d) => ({
      Name: typeof d.Name === "string" ? d.Name.slice(0, 4) : d.Name,
    }));

    return modifiedRows;
  });

  const data = await table.getData();

  assertEquals(data, [
    { Name: "OCon" },
    { Name: "OCon" },
    { Name: "Gran" },
    { Name: null },
    { Name: "Hart" },
    { Name: "Fay," },
    { Name: "Mavr" },
    { Name: null },
    { Name: "Higg" },
    { Name: null },
    { Name: "King" },
    { Name: "Koch" },
    { Name: "De H" },
    { Name: "Huno" },
    { Name: "Erns" },
    { Name: "Aust" },
    { Name: "Pata" },
    { Name: "Lore" },
    { Name: "Gree" },
    { Name: "Favi" },
    { Name: "Chen" },
    { Name: "Scia" },
    { Name: "Urma" },
    { Name: "Popp" },
    { Name: "Raph" },
    { Name: "Khoo" },
    { Name: "Baid" },
    { Name: "Tobi" },
    { Name: "Himu" },
    { Name: "Colm" },
    { Name: "Weis" },
    { Name: "Frip" },
    { Name: "Kauf" },
    { Name: "Voll" },
    { Name: "Mour" },
    { Name: "Naye" },
    { Name: "Mikk" },
    { Name: "Land" },
    { Name: "Mark" },
    { Name: "Biss" },
    { Name: "Atki" },
    { Name: "Marl" },
    { Name: "Olso" },
    { Name: null },
    { Name: "Roge" },
    { Name: "Gee," },
    { Name: "Phil" },
    { Name: "Ladw" },
    { Name: "Stil" },
    { Name: "Seo," },
    { Name: "Pate" },
  ]);

  await sdb.done();
});
Deno.test("should produce the same result with and without batchSize", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const data = Array.from({ length: 25 }, (_, i) => ({
    id: i,
    value: i * 10,
    date: new Date(Date.UTC(2020, 0, 1 + i)),
    label: i % 3 === 0 ? null : `label-${i}`,
  }));
  const modifier = (rows: { [key: string]: unknown }[]) =>
    rows.map((d) => ({
      ...d,
      value: typeof d.value === "number" ? d.value + 1 : null,
    }));

  const plain = sdb.newTable("plain");
  plain.loadArray(data);
  await plain.updateWithJS(modifier);

  const batched = sdb.newTable("batched");
  batched.loadArray(data);
  await batched.updateWithJS(modifier, { batchSize: 4 });

  assertEquals(await batched.getData(), await plain.getData());
  await sdb.done();
});

Deno.test("should call the modifier once per batch", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("batchCalls");
  table.loadArray(Array.from({ length: 10 }, (_, i) => ({ id: i })));

  const batchSizes: number[] = [];
  await table.updateWithJS((rows) => {
    batchSizes.push(rows.length);
    return rows;
  }, { batchSize: 4 });

  assertEquals(batchSizes, [4, 4, 2]);
  assertEquals(await table.getNbRows(), 10);
  await sdb.done();
});

Deno.test("should work with a batchSize larger than the table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("bigBatch");
  table.loadArray([{ id: 1 }, { id: 2 }]);

  let calls = 0;
  await table.updateWithJS((rows) => {
    calls++;
    return rows.map((d) => ({ ...d, id: (d.id as number) * 100 }));
  }, { batchSize: 1000 });

  assertEquals(calls, 1);
  assertEquals(await table.getData(), [{ id: 100 }, { id: 200 }]);
  await sdb.done();
});

Deno.test("should not leave temporary tables behind when batching", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("cleanup");
  table.loadArray(Array.from({ length: 5 }, (_, i) => ({ id: i })));

  await table.updateWithJS((rows) => rows, { batchSize: 2 });

  const tables = await sdb.getTableNames();
  assertEquals(tables, ["cleanup"]);
  await sdb.done();
});

Deno.test("should throw for an invalid batchSize", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("invalidBatch");
  table.loadArray([{ id: 1 }]);

  let error: unknown;
  try {
    await table.updateWithJS((rows) => rows, { batchSize: 0 });
  } catch (e) {
    error = e;
  }
  assertEquals(
    (error as Error).message,
    "batchSize must be a positive integer.",
  );
  await sdb.done();
});

Deno.test("should handle batches for which the modifier returns no rows", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("emptyBatches");
  table.loadArray(Array.from({ length: 10 }, (_, i) => ({ id: i })));

  // Rows 4 to 7 fill entire batches, so with batchSize 2 the modifier
  // returns an empty array for two of the batches.
  await table.updateWithJS(
    (rows) => rows.filter((d) => (d.id as number) < 4 || (d.id as number) > 7),
    { batchSize: 2 },
  );

  assertEquals(await table.getData(), [
    { id: 0 },
    { id: 1 },
    { id: 2 },
    { id: 3 },
    { id: 8 },
    { id: 9 },
  ]);
  await sdb.done();
});

Deno.test("should throw a clear error when the modifier returns no rows at all", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const expectedMessage =
    "The dataModifier returned no rows. updateWithJS can't infer the table schema from zero rows.";

  const plain = sdb.newTable("noRowsPlain");
  plain.loadArray([{ id: 1 }, { id: 2 }]);
  let plainError: unknown;
  try {
    await plain.updateWithJS(() => []);
  } catch (e) {
    plainError = e;
  }
  assertEquals((plainError as Error).message, expectedMessage);

  const batched = sdb.newTable("noRowsBatched");
  batched.loadArray([{ id: 1 }, { id: 2 }]);
  let batchedError: unknown;
  try {
    await batched.updateWithJS(() => [], { batchSize: 1 });
  } catch (e) {
    batchedError = e;
  }
  assertEquals((batchedError as Error).message, expectedMessage);

  // The tables are left unchanged and no temporary tables are left behind.
  assertEquals(await plain.getData(), [{ id: 1 }, { id: 2 }]);
  assertEquals(await batched.getData(), [{ id: 1 }, { id: 2 }]);
  assertEquals(await sdb.getTableNames(), ["noRowsBatched", "noRowsPlain"]);
  await sdb.done();
});

Deno.test("should not leave temporary tables behind when the modifier throws", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("modifierThrows");
  table.loadArray(Array.from({ length: 10 }, (_, i) => ({ id: i })));

  let calls = 0;
  let error: unknown;
  try {
    await table.updateWithJS((rows) => {
      calls++;
      if (calls === 2) {
        throw new Error("Boom!");
      }
      return rows;
    }, { batchSize: 4 });
  } catch (e) {
    error = e;
  }
  assertEquals((error as Error).message, "Boom!");
  assertEquals(await sdb.getTableNames(), ["modifierThrows"]);
  assertEquals(await table.getNbRows(), 10);
  await sdb.done();
});

Deno.test("should throw a clear error when the table has a __sda_rowid column and batchSize is used", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("rowidConflict");
  table.loadArray([{ __sda_rowid: 1, value: "a" }]);

  let error: unknown;
  try {
    await table.updateWithJS((rows) => rows, { batchSize: 1 });
  } catch (e) {
    error = e;
  }
  assertEquals(
    (error as Error).message,
    'The table has a column named "__sda_rowid", which conflicts with the internal column used by the batchSize option. Rename it or run updateWithJS without batchSize.',
  );
  await sdb.done();
});

Deno.test("should be a no-op on an empty table when the modifier returns no rows", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const plain = sdb.newTable("emptyPlain");
  await sdb.customQuery(
    `CREATE OR REPLACE TABLE "emptyPlain" AS SELECT 1 AS id WHERE false`,
  );
  await plain.updateWithJS((rows) => rows);
  assertEquals(await plain.getNbRows(), 0);

  const batched = sdb.newTable("emptyBatched");
  await sdb.customQuery(
    `CREATE OR REPLACE TABLE "emptyBatched" AS SELECT 1 AS id WHERE false`,
  );
  await batched.updateWithJS((rows) => rows, { batchSize: 2 });
  assertEquals(await batched.getNbRows(), 0);
  await sdb.done();
});

Deno.test("should throw on a table containing a geometry column", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geodata");
  table.loadGeoData("test/geodata/files/pointsInside.json");

  await assertRejects(
    () => table.updateWithJS((rows) => rows),
    Error,
    "updateWithJS doesn't work with tables containing geometries.",
  );

  await sdb.done();
});
