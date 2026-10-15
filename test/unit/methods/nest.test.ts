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

  table.nest("neighborhoods", " / ", "city");

  const data = await table.getData();

  expect(data).toStrictEqual([
    {
      city: "Montreal",
      neighborhoods: "Old Montreal / Chinatown / Griffintown",
    },
    {
      city: "Toronto",
      neighborhoods: "Kensington Market / Liberty village / Chinatown",
    },
    { city: "Vancouver", neighborhoods: "Coal Harbour / West end / Yaletown" },
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

  table.nest("tags", ",", ["country", "city"]);

  const data = await table.getData();

  expect(data).toStrictEqual([
    { country: "Canada", city: "Montreal", tags: "red,blue" },
    { country: "Canada", city: "Toronto", tags: "green,yellow" },
    { country: "USA", city: "New York", tags: "orange,purple" },
  ]);

  await sdb.close();
});

test("should work as inverse of unnest (round-trip test)", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  // Start with nested data
  const originalData = [
    {
      city: "Montreal",
      neighborhoods: "Old Montreal / Chinatown / Griffintown",
    },
    {
      city: "Toronto",
      neighborhoods: "Kensington Market / Liberty village / Chinatown",
    },
    { city: "Vancouver", neighborhoods: "Coal Harbour / West end / Yaletown" },
  ];

  table.loadArray(originalData);

  // Unnest to expand rows
  table.unnest("neighborhoods", " / ");

  const unnested = await table.getData();
  expect(unnested.length).toStrictEqual(9); // 3 rows expanded to 9

  // Nest back to original structure
  table.nest("neighborhoods", " / ", "city");

  const nested = await table.getData();
  expect(nested).toStrictEqual(originalData);

  await sdb.close();
});

test("should bind a nesting separator containing an apostrophe", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("boundNest");

  table
    .loadArray([
      { group: "a", value: "rock" },
      { group: "a", value: "roll" },
    ])
    .nest("value", "'n'", "group");

  expect(await table.getData()).toStrictEqual([{ group: "a", value: "rock'n'roll" }]);
  await sdb.close();
});
