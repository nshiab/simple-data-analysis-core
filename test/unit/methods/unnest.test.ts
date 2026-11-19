import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should unnest rows based on a specific column values", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/nestedData.csv");
  table.unnest("neighbourhoods", { separator: " / " });

  const data = await table.getData();

  expect(data).toStrictEqual([
    { city: "Montreal", neighbourhoods: "Old Montreal" },
    { city: "Montreal", neighbourhoods: "Chinatown" },
    { city: "Montreal", neighbourhoods: "Griffintown" },
    { city: "Toronto", neighbourhoods: "Kensington Market" },
    { city: "Toronto", neighbourhoods: "Liberty village" },
    { city: "Toronto", neighbourhoods: "Chinatown" },
    { city: "Vancouver", neighbourhoods: "Coal Harbour" },
    { city: "Vancouver", neighbourhoods: "West end" },
    { city: "Vancouver", neighbourhoods: "Yaletown" },
  ]);

  await sdb.close();
});

test("should bind an unnesting separator containing an apostrophe", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("boundUnnest");

  table.loadArray([{ group: "a", value: "rock'n'roll" }]);
  table.unnest("value", { separator: "'n'" });

  expect(await table.getData()).toStrictEqual([
    { group: "a", value: "rock" },
    { group: "a", value: "roll" },
  ]);
  await sdb.close();
});

test("expands DuckDB lists and keeps empty rows with a null position", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE lists AS
      SELECT * FROM (VALUES (1, [8, 3]::INTEGER[]), (2, []), (3, NULL), (4, [NULL]))
      AS rows(id, items)`);
    const table = sdb
      .newTable("lists")
      .unnest("items", { indexColumn: "position", keepEmpty: true });
    expect(await table.getTypes()).toStrictEqual({
      id: "INTEGER",
      items: "INTEGER",
      position: "BIGINT",
    });
    expect(await table.getData()).toStrictEqual([
      { id: 1, items: 8, position: 1 },
      { id: 1, items: 3, position: 2 },
      { id: 2, items: null, position: null },
      { id: 3, items: null, position: null },
      { id: 4, items: null, position: 1 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("expands native fixed-size arrays and drops null arrays by default", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable()
      .loadArray(
        [
          { id: 1, items: [2, 1] },
          { id: 2, items: null },
        ],
        { columnTypes: { items: "FLOAT[2]" } },
      )
      .unnest("ITEMS");
    expect(await table.getTypes()).toStrictEqual({ id: "DOUBLE", items: "FLOAT" });
    expect(await table.getData()).toStrictEqual([
      { id: 1, items: 2 },
      { id: 1, items: 1 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("infers JSON arrays and expands them by one level", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable()
      .loadArray(
        [
          { id: 1, items: null },
          { id: 2, items: [] },
          { id: 3, items: [[1, 2], { name: "Jasper" }, null] },
        ],
        { columnTypes: { items: "JSON" } },
      )
      .unnest("items");
    expect(await table.getData()).toStrictEqual([
      { id: 3, items: "[1,2]" },
      { id: 3, items: '{"name":"Jasper"}' },
      { id: 3, items: null },
    ]);
  } finally {
    await sdb.close();
  }
});

test("infers JSON objects and replaces the source with key and value columns", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable()
      .loadArray(
        [
          { id: 1, snapshot: null },
          { id: 2, snapshot: {} },
          { id: 3, snapshot: { "101": { from: "Jasper" }, "/102 (04-26)": null } },
        ],
        { columnTypes: { snapshot: "JSON" } },
      )
      .unnest("snapshot")
      .sort({ key: "asc" });
    expect(await table.getData()).toStrictEqual([
      { id: 3, key: "/102 (04-26)", value: null },
      { id: 3, key: "101", value: '{"from":"Jasper"}' },
    ]);
  } finally {
    await sdb.close();
  }
});

test("can choose the JSON object shape for null and empty inputs", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE snapshots AS
      SELECT * FROM (VALUES (1, NULL::JSON), (2, 'null'::JSON), (3, '{}'::JSON))
      AS rows(id, snapshot)`);
    const table = sdb
      .newTable("snapshots")
      .unnest("snapshot", { valueColumn: "snapshot", keepEmpty: true })
      .sort({ id: "asc" });
    expect(await table.getTypes()).toStrictEqual({
      id: "INTEGER",
      key: "VARCHAR",
      snapshot: "JSON",
    });
    expect(await table.getData()).toStrictEqual([
      { id: 1, key: null, snapshot: null },
      { id: 2, key: null, snapshot: null },
      { id: 3, key: null, snapshot: null },
    ]);
  } finally {
    await sdb.close();
  }
});

test("expands train keys and stops from a compressed JSON snapshot", async () => {
  const sdb = new SimpleDB();
  try {
    const file = "snapshot.json.gz";
    await writeFile(
      file,
      gzipSync(
        JSON.stringify({
          "101": {
            times: [
              { station: "Jasper", arrival: { scheduled: "10:00" } },
              { station: "Edmonton" },
            ],
          },
          "102 (04-26)": { times: [{ station: "Ottawa" }] },
        }),
      ),
    );
    const table = sdb
      .newTable()
      .loadData(file, { records: false, columnTypes: { snapshot: "JSON" } })
      .unnest("snapshot", { keyColumn: "trainKey", valueColumn: "train" })
      .addColumn("times", "JSON", "json_extract(train, '$.times')")
      .unnest("times", { indexColumn: "stopNumber" })
      .addColumn("station", "string", "json_extract_string(times, '$.station')")
      .addColumn("arrival", "string", "json_extract_string(times, '$.arrival.scheduled')")
      .selectColumns(["trainKey", "stopNumber", "station", "arrival"])
      .sort({ trainKey: "asc", stopNumber: "asc" });
    expect(await table.getData()).toStrictEqual([
      { trainKey: "101", stopNumber: 1, station: "Jasper", arrival: "10:00" },
      { trainKey: "101", stopNumber: 2, station: "Edmonton", arrival: null },
      { trainKey: "102 (04-26)", stopNumber: 1, station: "Ottawa", arrival: null },
    ]);
  } finally {
    await sdb.close();
  }
});

test.each([
  {
    items: [[], {}],
    options: {},
    hint: 'column "item" requires JSON arrays. Found JSON type OBJECT.',
  },
  {
    items: [{}, []],
    options: {},
    hint: 'column "item" requires JSON objects. Found JSON type ARRAY.',
  },
  {
    items: [12],
    options: {},
    hint: 'column "item" contains JSON type UBIGINT. Use a JSON column containing arrays or objects.',
  },
  {
    items: [[]],
    options: { keyColumn: "key" },
    hint: "Found JSON type ARRAY. Use one JSON shape per column.",
  },
  {
    items: [[]],
    options: { valueColumn: "value" },
    hint: 'column "item" requires JSON objects.',
  },
  {
    items: [{}],
    options: { indexColumn: "position" },
    hint: 'column "item" requires JSON arrays. Found JSON type OBJECT.',
  },
])("rejects incompatible JSON shapes for $items and $options", async ({ items, options, hint }) => {
  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable()
      .loadArray(
        items.map((item) => ({ item })),
        {
          columnTypes: { item: "JSON" },
        },
      )
      .unnest("item", options);
    await expect(table.run()).rejects.toThrow(hint);
  } finally {
    await sdb.close();
  }
});

test.each([
  { options: {}, hint: "To split text, use options.separator by itself." },
  { options: { separator: "," }, hint: "options.separator requires a string (VARCHAR) column." },
  {
    options: { keyColumn: "key" },
    hint: "options.keyColumn and options.valueColumn require a JSON object column.",
  },
  {
    options: { valueColumn: "value" },
    hint: "options.keyColumn and options.valueColumn require a JSON object column.",
  },
  {
    options: { indexColumn: "position" },
    hint: "options.indexColumn requires a DuckDB list, fixed-size array, or JSON array.",
  },
  {
    options: { keepEmpty: true },
    hint: "options.keepEmpty requires a list, array, or JSON object.",
  },
])("reports the column type and expected input for $options", async ({ options, hint }) => {
  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable()
      .loadArray([{ item: 12 }])
      .unnest("item", options);
    const result = table.run();
    await expect(result).rejects.toThrow('unnest() column "item" has type DOUBLE.');
    await expect(result).rejects.toThrow(hint);
  } finally {
    await sdb.close();
  }
});

test.each([
  { options: ",", hint: 'Pass a text separator as { separator: "," }.' },
  { options: { separator: 3 }, hint: "options.separator must be a string." },
  { options: { keyColumn: "" }, hint: "options.keyColumn must be a non-empty column name." },
  { options: { valueColumn: true }, hint: "options.valueColumn must be a non-empty column name." },
  { options: { indexColumn: 3 }, hint: "options.indexColumn must be a non-empty column name." },
  { options: { keepEmpty: "true" }, hint: "options.keepEmpty must be true or false." },
  { options: { separator: ",", keepEmpty: true }, hint: "use options.separator by itself" },
  { options: { separator: ",", keyColumn: "key" }, hint: "use options.separator by itself" },
  { options: { separator: ",", valueColumn: "value" }, hint: "use options.separator by itself" },
  { options: { separator: ",", indexColumn: "position" }, hint: "use options.separator by itself" },
  {
    options: { keyColumn: "key", indexColumn: "position" },
    hint: "Choose the options for one input shape.",
  },
  {
    options: { valueColumn: "value", indexColumn: "position" },
    hint: "Choose the options for one input shape.",
  },
])("rejects invalid options $options when called", async ({ options, hint }) => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    expect(() =>
      table.unnest("item", options as unknown as Parameters<typeof table.unnest>[1]),
    ).toThrow(hint);
  } finally {
    await sdb.close();
  }
});

test("reports a missing column before expanding it", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable()
      .loadArray([{ item: "a,b" }])
      .unnest("missing", { separator: "," });
    await expect(table.run()).rejects.toThrow(
      'column "missing" does not exist. Check the column name.',
    );
  } finally {
    await sdb.close();
  }
});

test("rejects output names that would collide with another column", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable()
      .loadArray([{ key: "existing", snapshot: { a: 1 } }], {
        columnTypes: { snapshot: "JSON" },
      })
      .unnest("snapshot", { keyColumn: "KEY" });
    await expect(table.run()).rejects.toThrow('the output column "KEY" already exists');
  } finally {
    await sdb.close();
  }
});
