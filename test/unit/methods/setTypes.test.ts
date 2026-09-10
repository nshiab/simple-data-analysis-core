import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should create a new SimpleTable with types", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.setTypes({ name: "string", age: "number" });
  const types = await table.getTypes();
  assertEquals(types, { name: "VARCHAR", age: "DOUBLE" });
  await sdb.close();
});

Deno.test("should create a new SimpleTable with geometry in types", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.setTypes({
    name: "string",
    age: "number",
    city: "geometry('EPSG:4326')",
  });
  const types = await table.getTypes();
  assertEquals(
    { name: "VARCHAR", age: "DOUBLE", city: "GEOMETRY('EPSG:4326')" },
    types,
  );
  await sdb.close();
});

Deno.test("should create a new SimpleTable with types and column names containing spaces", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.setTypes({ "first name": "string", age: "number" });
  const types = await table.getTypes();
  assertEquals(types, { "first name": "VARCHAR", age: "DOUBLE" });
  await sdb.close();
});

Deno.test("should create a new SimpleTable with types and column names with special uses", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.setTypes({
    "first name": "string",
    age: "number",
    Group: "string",
  });
  const types = await table.getTypes();
  assertEquals(types, {
    "first name": "VARCHAR",
    age: "DOUBLE",
    Group: "VARCHAR",
  });
  await sdb.close();
});

for (
  const [json, vector, geometry] of [
    ["JSON", "FLOAT[3]", "GEOMETRY('EPSG:4326')"],
    ["json", "float[3]", "geometry('EPSG:4326')"],
  ] as const
) {
  Deno.test(`setTypes creates JSON, vector and geometry columns (${json})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().setTypes({
        details: json,
        embedding: vector,
        geom: geometry,
      });
      assertEquals(await table.getTypes(), {
        details: "JSON",
        embedding: "FLOAT[3]",
        geom: "GEOMETRY('EPSG:4326')",
      });
      assertEquals(await table.getGeoData(), {
        type: "FeatureCollection",
        features: [],
      });
    } finally {
      await sdb.close();
    }
  });
}
