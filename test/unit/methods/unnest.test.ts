import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should unnest rows based on a specific column values", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/nestedData.csv");
  table.unnest("neighbourhoods", " / ");

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
  table.unnest("value", "'n'");

  expect(await table.getData()).toStrictEqual([
    { group: "a", value: "rock" },
    { group: "a", value: "roll" },
  ]);
  await sdb.close();
});
