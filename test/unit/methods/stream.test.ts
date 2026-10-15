import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should stream the same rows as getData", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/dailyTemperatures.csv");

  const streamed: { [key: string]: unknown }[] = [];
  for await (const row of table.stream()) {
    streamed.push(row);
  }

  expect(streamed).toStrictEqual(await table.getData());
  await sdb.close();
});

test("should stream more rows than one DuckDB chunk", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("big");
  const data = Array.from({ length: 5000 }, (_, i) => ({
    id: i,
    value: `value-${i}`,
  }));
  table.loadArray(data);

  let count = 0;
  let idSum = 0;
  for await (const row of table.stream()) {
    count++;
    idSum += row.id as number;
  }
  expect(count).toStrictEqual(5000);
  expect(idSum).toStrictEqual((4999 * 5000) / 2);
  await sdb.close();
});

test("should stream with columns and conditions", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("filtered");
  table.loadArray([
    { name: "a", value: 1 },
    { name: "b", value: 2 },
    { name: "c", value: 3 },
  ]);

  const streamed: { [key: string]: unknown }[] = [];
  for await (const row of table.stream({ columns: "name", conditions: `value > 1` })) {
    streamed.push(row);
  }
  expect(streamed).toStrictEqual([{ name: "b" }, { name: "c" }]);
  await sdb.close();
});

test("should convert values while streaming like getData", async () => {
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
  expect(streamed).toStrictEqual([
    {
      dt: new Date("2020-01-15T00:00:00.000Z"),
      ts: new Date("2020-01-15T14:30:45.123Z"),
      big: 4,
      nan: "NaN",
      nullInt: null,
    },
  ]);
  await sdb.close();
});

test("should allow breaking out of the stream early", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("early");
  table.loadArray(Array.from({ length: 5000 }, (_, i) => ({ id: i })));

  let count = 0;
  for await (const _row of table.stream()) {
    count++;
    if (count === 10) {
      break;
    }
  }
  expect(count).toStrictEqual(10);

  // The table is still usable after an early break.
  expect(await table.getRowCount()).toStrictEqual(5000);
  await sdb.close();
});

test("stream honors expressionSyntax for conditions", async () => {
  for (const expressionSyntax of ["js", "sql"] as const) {
    const sdb = new SimpleDB({ expressionSyntax });
    try {
      const table = sdb.newTable().loadArray([
        { active: true, admin: false, text: "a || b" },
        { active: false, admin: false, text: "other" },
      ]);
      const conditions =
        expressionSyntax === "js"
          ? "(active || admin) && text === 'a || b'"
          : "(active OR admin) AND text || '!' = 'a || b!'";
      const rows = [];
      for await (const row of table.stream({ conditions })) rows.push(row);
      expect(rows).toStrictEqual([{ active: true, admin: false, text: "a || b" }]);
      expect(rows).toStrictEqual(await table.getData({ conditions }));
    } finally {
      await sdb.close();
    }
  }
});

test("stream rejects unsafe top-level integers while retaining nested integer strings", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE stream_integers AS SELECT
      9007199254740991::UBIGINT AS id, [9007199254740993::HUGEINT] AS nested`);
    const table = sdb.newTable("stream_integers");
    const rows: Record<string, unknown>[] = [];
    for await (const row of table.stream()) rows.push(row);
    expect(rows).toStrictEqual([
      {
        id: Number.MAX_SAFE_INTEGER,
        nested: ["9007199254740993"],
      },
    ]);
    await sdb.customQuery(`UPDATE stream_integers SET id = 9007199254740993::UBIGINT`);
    await assertRejects(
      async () => {
        for await (const _row of table.stream()) {
          /* Consume the stream. */
        }
      },
      Error,
      "safe integer range",
    );
  } finally {
    await sdb.close();
  }
});
