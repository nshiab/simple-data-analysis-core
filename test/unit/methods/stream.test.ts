import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should stream the same rows as getData", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/dailyTemperatures.csv");

  const streamed: { [key: string]: unknown }[] = [];
  for await (const row of table.stream()) {
    streamed.push(row);
  }

  assertEquals(streamed, await table.getData());
  await sdb.done();
});

Deno.test("should stream more rows than one DuckDB chunk", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("big");
  const data = Array.from({ length: 5000 }, (_, i) => ({
    id: i,
    value: `value-${i}`,
  }));
  await table.loadArray(data);

  let count = 0;
  let idSum = 0;
  for await (const row of table.stream()) {
    count++;
    idSum += row.id as number;
  }
  assertEquals(count, 5000);
  assertEquals(idSum, (4999 * 5000) / 2);
  await sdb.done();
});

Deno.test("should stream with columns and conditions", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("filtered");
  await table.loadArray([
    { name: "a", value: 1 },
    { name: "b", value: 2 },
    { name: "c", value: 3 },
  ]);

  const streamed: { [key: string]: unknown }[] = [];
  for await (
    const row of table.stream({ columns: "name", conditions: `value > 1` })
  ) {
    streamed.push(row);
  }
  assertEquals(streamed, [{ name: "b" }, { name: "c" }]);
  await sdb.done();
});

Deno.test("should convert values while streaming like getData", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("typed");
  await sdb.customQuery(
    `CREATE OR REPLACE TABLE "typed" AS SELECT
      DATE '2020-01-15' AS dt,
      TIMESTAMP '2020-01-15 14:30:45.123456' AS ts,
      4::BIGINT AS big,
      'NaN'::DOUBLE AS nan,
      NULL::INTEGER AS nullInt`,
  );

  const streamed: { [key: string]: unknown }[] = [];
  for await (const row of table.stream()) {
    streamed.push(row);
  }
  assertEquals(streamed, [
    {
      dt: new Date("2020-01-15T00:00:00.000Z"),
      ts: new Date("2020-01-15T14:30:45.123Z"),
      big: 4,
      nan: "NaN",
      nullInt: null,
    },
  ]);
  await sdb.done();
});

Deno.test("should allow breaking out of the stream early", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("early");
  await table.loadArray(
    Array.from({ length: 5000 }, (_, i) => ({ id: i })),
  );

  let count = 0;
  for await (const _row of table.stream()) {
    count++;
    if (count === 10) {
      break;
    }
  }
  assertEquals(count, 10);

  // The table is still usable after an early break.
  assertEquals(await table.getNbRows(), 5000);
  await sdb.done();
});
