import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should update the data from the table with a javascript function and reinsert it into the table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadData("test/data/files/employees.json");
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
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadData("test/data/files/employees.json");
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
  const sdb = new SimpleDB();
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
  await plain.loadArray(data);
  await plain.updateWithJS(modifier);

  const batched = sdb.newTable("batched");
  await batched.loadArray(data);
  await batched.updateWithJS(modifier, { batchSize: 4 });

  assertEquals(await batched.getData(), await plain.getData());
  await sdb.done();
});

Deno.test("should call the modifier once per batch", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("batchCalls");
  await table.loadArray(Array.from({ length: 10 }, (_, i) => ({ id: i })));

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
  const sdb = new SimpleDB();
  const table = sdb.newTable("bigBatch");
  await table.loadArray([{ id: 1 }, { id: 2 }]);

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
  const sdb = new SimpleDB();
  const table = sdb.newTable("cleanup");
  await table.loadArray(Array.from({ length: 5 }, (_, i) => ({ id: i })));

  await table.updateWithJS((rows) => rows, { batchSize: 2 });

  const tables = await sdb.getTableNames();
  assertEquals(tables, ["cleanup"]);
  await sdb.done();
});

Deno.test("should throw for an invalid batchSize", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("invalidBatch");
  await table.loadArray([{ id: 1 }]);

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
