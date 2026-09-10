import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return a column with new computed values", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/dataSummarize.json"]);
  table.convert({ key2: "integer" });
  table.addColumn("multiply", "double", `key2 * key3`);
  const data = await table.getData();

  assertEquals(data, [
    { key1: "Rubarbe", key2: 1, key3: 10.5, multiply: 10.5 },
    { key1: "Fraise", key2: 11, key3: 2.345, multiply: 25.795 },
    { key1: "Rubarbe", key2: 2, key3: 4.5657, multiply: 9.1314 },
    { key1: "Fraise", key2: 22, key3: 12.3434, multiply: 271.5548 },
    { key1: "Banane", key2: null, key3: null, multiply: null },
    { key1: "Banane", key2: null, key3: null, multiply: null },
  ]);
  await sdb.close();
});
Deno.test("should return a column with booleans", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/dataSummarize.json"]);
  table.convert({ key2: "integer" });
  table.addColumn("key2GreaterThanTen", "boolean", `key2 > 10`);

  const data = await table.getData();

  assertEquals(data, [
    {
      key1: "Rubarbe",
      key2: 1,
      key3: 10.5,
      key2GreaterThanTen: false,
    },
    {
      key1: "Fraise",
      key2: 11,
      key3: 2.345,
      key2GreaterThanTen: true,
    },
    {
      key1: "Rubarbe",
      key2: 2,
      key3: 4.5657,
      key2GreaterThanTen: false,
    },
    {
      key1: "Fraise",
      key2: 22,
      key3: 12.3434,
      key2GreaterThanTen: true,
    },
    {
      key1: "Banane",
      key2: null,
      key3: null,
      key2GreaterThanTen: null,
    },
    {
      key1: "Banane",
      key2: null,
      key3: null,
      key2GreaterThanTen: null,
    },
  ]);
  await sdb.close();
});
Deno.test("should return a column with geometry", async () => {
  const sdb = new SimpleDB();
  const geo = sdb.newTable("geo");
  geo.loadGeoData("test/geodata/files/polygons.geojson");

  geo.addColumn("centroid", "geometry('EPSG:4326')", `ST_Centroid(geom)`);
  geo.selectColumns(["name", "centroid"]);
  geo.reducePrecision(6);
  const data = await geo.getGeoData("centroid");

  assertEquals(data, {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [-78.404315, 47.992858],
        },
        properties: { name: "polygonA" },
      },
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [-109.102836, 57.319258],
        },
        properties: { name: "polygonB" },
      },
    ],
  });

  await sdb.close();
});
Deno.test("should return a column with a space in its name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/dataSummarize.json"]);
  table.convert({ key2: "integer" });
  table.addColumn("key 4", "double", `key2 * key3`);
  const data = await table.getData();

  assertEquals(data, [
    { key1: "Rubarbe", key2: 1, key3: 10.5, "key 4": 10.5 },
    { key1: "Fraise", key2: 11, key3: 2.345, "key 4": 25.795 },
    { key1: "Rubarbe", key2: 2, key3: 4.5657, "key 4": 9.1314 },
    { key1: "Fraise", key2: 22, key3: 12.3434, "key 4": 271.5548 },
    { key1: "Banane", key2: null, key3: null, "key 4": null },
    { key1: "Banane", key2: null, key3: null, "key 4": null },
  ]);
  await sdb.close();
});
Deno.test("should return a column with a $ in its name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/dataSummarize.json"]);
  table.convert({ key2: "integer" });
  table.addColumn("$key4", "double", `key2 * key3`);
  const data = await table.getData();

  assertEquals(data, [
    { key1: "Rubarbe", key2: 1, key3: 10.5, "$key4": 10.5 },
    { key1: "Fraise", key2: 11, key3: 2.345, "$key4": 25.795 },
    { key1: "Rubarbe", key2: 2, key3: 4.5657, "$key4": 9.1314 },
    { key1: "Fraise", key2: 22, key3: 12.3434, "$key4": 271.5548 },
    { key1: "Banane", key2: null, key3: null, "$key4": null },
    { key1: "Banane", key2: null, key3: null, "$key4": null },
  ]);
  await sdb.close();
});
Deno.test("should return a column with null values", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([{ key1: "Nael" }, { key1: "Graeme" }]);
  table.addColumn("age", "integer", "null");
  const data = await table.getData();

  assertEquals(data, [{ key1: "Nael", age: null }, {
    key1: "Graeme",
    age: null,
  }]);
  await sdb.close();
});
Deno.test("should add a column with a case statement and null", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([{ votes: 10, winnerMax: 10, party: "LIB" }, {
    votes: 5,
    winnerMax: 10,
    party: "CON",
  }]);
  table.addColumn(
    "winner",
    "string",
    `CASE WHEN votes === winnerMax THEN party ELSE NULL END`,
  );
  const data = await table.getData();

  assertEquals(data, [
    { votes: 10, winnerMax: 10, party: "LIB", winner: "LIB" },
    { votes: 5, winnerMax: 10, party: "CON", winner: null },
  ]);
  await sdb.close();
});

for (
  const [json, vector, geometry] of [
    ["JSON", "FLOAT[3]", "GEOMETRY('EPSG:4326')"],
    ["json", "float[3]", "geometry('EPSG:4326')"],
  ] as const
) {
  Deno.test(`addColumn creates JSON, vector and geometry values (${json})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().loadArray([{ value: 3 }])
        .addColumn("details", json, "json_object('count', value)")
        .addColumn("embedding", vector, "[0.25, 0.5, 0.75]")
        .addColumn("geom", geometry, "ST_Point(-73, 45)");
      assertEquals(await table.getTypes(), {
        value: "DOUBLE",
        details: "JSON",
        embedding: "FLOAT[3]",
        geom: "GEOMETRY('EPSG:4326')",
      });
      assertEquals(await table.getGeoData(), {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "Point", coordinates: [-73, 45] },
          properties: {
            value: 3,
            details: '{"count":3.0}',
            embedding: [0.25, 0.5, 0.75],
          },
        }],
      });
    } finally {
      await sdb.close();
    }
  });
}
