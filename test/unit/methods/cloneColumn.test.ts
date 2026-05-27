import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should clone a column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadArray([{ firstName: "nael", lastName: "shiab" }]);

  await table.cloneColumn("firstName", "firstNameCloned");

  const data = await table.getData();

  assertEquals(data, [
    { firstName: "nael", lastName: "shiab", firstNameCloned: "nael" },
  ]);

  await sdb.done();
});
Deno.test("should clone a column with spaces in its name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadArray([{ "first name": "nael", "last name": "shiab" }]);

  await table.cloneColumn("first name", "first name cloned");

  const data = await table.getData();

  assertEquals(data, [
    { "first name": "nael", "last name": "shiab", "first name cloned": "nael" },
  ]);

  await sdb.done();
});
Deno.test("should clone a column with geo data", async () => {
  const sdb = new SimpleDB();
  const table = await sdb
    .newTable()
    .loadGeoData(
      "test/geodata/files/CanadianProvincesAndTerritories.json",
    );

  await table.cloneColumn("geom", "geom_cloned");

  assertEquals(await table.getTypes(), {
    geom: "GEOMETRY('EPSG:4326')",
    geom_cloned: "GEOMETRY('EPSG:4326')",
    nameEnglish: "VARCHAR",
    nameFrench: "VARCHAR",
  });

  await sdb.done();
});
