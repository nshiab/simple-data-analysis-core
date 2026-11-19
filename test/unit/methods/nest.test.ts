import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should nest rows based on a single category", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { city: "Montreal", neighborhoods: "Old Montreal" },
    { city: "Montreal", neighborhoods: "Chinatown" },
    { city: "Montreal", neighborhoods: "Griffintown" },
    { city: "Toronto", neighborhoods: "Kensington Market" },
    { city: "Toronto", neighborhoods: "Liberty village" },
    { city: "Toronto", neighborhoods: "Chinatown" },
    { city: "Vancouver", neighborhoods: "Coal Harbour" },
    { city: "Vancouver", neighborhoods: "West end" },
    { city: "Vancouver", neighborhoods: "Yaletown" },
  ]);

  table.nest("neighborhoods", "city");

  const data = await table.getData();

  expect(data).toStrictEqual([
    {
      city: "Montreal",
      neighborhoods: ["Old Montreal", "Chinatown", "Griffintown"],
    },
    {
      city: "Toronto",
      neighborhoods: ["Kensington Market", "Liberty village", "Chinatown"],
    },
    { city: "Vancouver", neighborhoods: ["Coal Harbour", "West end", "Yaletown"] },
  ]);

  await sdb.close();
});

test("should nest with multiple category columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { country: "Canada", city: "Montreal", tags: "red" },
    { country: "Canada", city: "Montreal", tags: "blue" },
    { country: "Canada", city: "Toronto", tags: "green" },
    { country: "Canada", city: "Toronto", tags: "yellow" },
    { country: "USA", city: "New York", tags: "orange" },
    { country: "USA", city: "New York", tags: "purple" },
  ]);

  table.nest("tags", ["country", "city"]);

  const data = await table.getData();

  expect(data).toStrictEqual([
    { country: "Canada", city: "Montreal", tags: ["red", "blue"] },
    { country: "Canada", city: "Toronto", tags: ["green", "yellow"] },
    { country: "USA", city: "New York", tags: ["orange", "purple"] },
  ]);

  await sdb.close();
});

test("keeps order, duplicates, nulls, and the numeric type through a nest and unnest round trip", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable()
      .loadArray(
        [
          { team: "A", score: 18 },
          { team: "B", score: 5 },
          { team: "A", score: null },
          { team: "A", score: 7 },
          { team: "A", score: 18 },
        ],
        { columnTypes: { score: "INTEGER" } },
      )
      .nest("score", "team");

    expect(await table.getTypes()).toStrictEqual({ team: "VARCHAR", score: "INTEGER[]" });
    expect(await table.getData()).toStrictEqual([
      { team: "A", score: [18, null, 7, 18] },
      { team: "B", score: [5] },
    ]);
    table.unnest("score");
    expect(await table.getTypes()).toStrictEqual({ team: "VARCHAR", score: "INTEGER" });
    expect(await table.getData()).toStrictEqual([
      { team: "A", score: 18 },
      { team: "A", score: null },
      { team: "A", score: 7 },
      { team: "A", score: 18 },
      { team: "B", score: 5 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("accepts quoted names and avoids collisions with the generated order column", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable()
      .loadArray([
        { __SDA_NEST_ORDER: "a", 'value "quoted"': "rock'n'roll" },
        { __SDA_NEST_ORDER: "a", 'value "quoted"': "coffee, tea" },
      ])
      .nest('value "quoted"', "__SDA_NEST_ORDER");
    expect(await table.getData()).toStrictEqual([
      { __SDA_NEST_ORDER: "a", 'value "quoted"': ["rock'n'roll", "coffee, tea"] },
    ]);
  } finally {
    await sdb.close();
  }
});

test("explains the new signature when given a positional separator", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    expect(() => {
      Reflect.apply(table.nest.bind(table), undefined, ["score", ",", "team"]);
    }).toThrow('Use nest("score", "team").');
  } finally {
    await sdb.close();
  }
});
