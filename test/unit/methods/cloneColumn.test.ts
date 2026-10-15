import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should clone a column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([{ firstName: "nael", lastName: "shiab" }]);

  table.cloneColumn("firstName", "firstNameCloned");

  const data = await table.getData();

  expect(data).toStrictEqual([{ firstName: "nael", lastName: "shiab", firstNameCloned: "nael" }]);

  await sdb.close();
});
test("should clone a column with spaces in its name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([{ "first name": "nael", "last name": "shiab" }]);

  table.cloneColumn("first name", "first name cloned");

  const data = await table.getData();

  expect(data).toStrictEqual([
    { "first name": "nael", "last name": "shiab", "first name cloned": "nael" },
  ]);

  await sdb.close();
});
test("should clone a column with geo data", async () => {
  const sdb = new SimpleDB();
  const table = sdb
    .newTable()
    .loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");

  table.cloneColumn("geom", "geom_cloned");

  expect(await table.getTypes()).toStrictEqual({
    geom: "GEOMETRY('EPSG:4326')",
    geom_cloned: "GEOMETRY('EPSG:4326')",
    nameEnglish: "VARCHAR",
    nameFrench: "VARCHAR",
  });

  await sdb.close();
});
