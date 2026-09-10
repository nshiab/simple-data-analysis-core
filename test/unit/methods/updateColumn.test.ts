import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should update a column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/cities.csv"]);
  table.updateColumn("city", `left("city", 3)`);

  const data = await table.getData();

  assertEquals(data, [
    { id: 1108380, city: "VAN" },
    { id: 6158355, city: "TOR" },
    { id: 7024745, city: "MON" },
  ]);

  await sdb.close();
});

Deno.test("should update a column with a space in its name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  table.updateColumn(
    "Department or unit",
    `left("Department or unit", 1)`,
  );
  table.selectRows(3);

  const data = await table.getData();

  assertEquals(data, [
    {
      Name: "OConnell, Donald",
      "Hire date": "21-JUN-07",
      Job: "Clerk",
      Salary: "2600",
      "Department or unit": "5",
      "End-of_year-BONUS?": "1,94%",
    },
    {
      Name: "OConnell, Donald",
      "Hire date": "21-JUN-07",
      Job: "Clerk",
      Salary: "2600",
      "Department or unit": "5",
      "End-of_year-BONUS?": "1,94%",
    },
    {
      Name: "Grant, Douglas",
      "Hire date": "13-JAN-08",
      Job: "Clerk",
      Salary: "NaN",
      "Department or unit": "5",
      "End-of_year-BONUS?": "23,39%",
    },
  ]);

  await sdb.close();
});

Deno.test("updateColumn reads a JSON field with dot notation", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      { count: 0, details: { count: 3 } },
      { count: 0, details: { other: 4 } },
      { count: 0, details: null },
    ], { columnTypes: { details: "JSON" } })
      .updateColumn("count", "details.count");
    assertEquals(await table.getData(), [
      { count: 3, details: '{"count":3}' },
      { count: null, details: '{"other":4}' },
      { count: null, details: null },
    ]);
    assertEquals(await table.getTypes(), { count: "DOUBLE", details: "JSON" });
  } finally {
    await sdb.close();
  }
});

for (const materializeBetweenUpdates of [false, true]) {
  Deno.test(`updateColumn preserves JSON, vector and geometry types and nulls (materialize: ${materializeBetweenUpdates})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().loadArray([
        {
          details: { count: 3 },
          embedding: [0.25, 0.5, 0.75],
          geom: { type: "Point", coordinates: [-73, 45] },
        },
        { details: null, embedding: null, geom: null },
      ], {
        columnTypes: {
          details: "JSON",
          embedding: "FLOAT[3]",
          geom: "GEOMETRY('EPSG:4326')",
        },
      });
      const types = await table.getTypes();
      for (
        const [column, expression] of [
          [
            "details",
            `CASE WHEN details IS NULL THEN NULL ELSE json_merge_patch(details, '{"active":true}') END`,
          ],
          ["embedding", "list_transform(embedding, x -> x * 2)"],
          ["geom", "ST_Point(ST_X(geom) + 1, ST_Y(geom))"],
        ]
      ) {
        table.updateColumn(column, expression);
        if (materializeBetweenUpdates) await table.getTypes();
      }
      const geo = await table.getGeoData();
      assertEquals(geo, {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-72, 45] },
            properties: {
              details: '{"count":3,"active":true}',
              embedding: [0.5, 1, 1.5],
            },
          },
          {
            type: "Feature",
            geometry: null,
            properties: { details: null, embedding: null },
          },
        ],
      });
      assertEquals(await table.getTypes(), types);
    } finally {
      await sdb.close();
    }
  });
}

for (
  const [column, expression] of [
    ["details", "'invalid JSON'"],
    ["embedding", "[1, 2]"],
    ["geom", "'invalid geometry'"],
  ]
) {
  Deno.test(`updateColumn rejects invalid ${column} values without changing the table`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().loadArray([{
        details: { count: 3 },
        embedding: [0.25, 0.5, 0.75],
        geom: { type: "Point", coordinates: [-73, 45] },
      }], {
        columnTypes: {
          details: "JSON",
          embedding: "FLOAT[3]",
          geom: "GEOMETRY('EPSG:4326')",
        },
      });
      const original = await table.getGeoData();
      const types = await table.getTypes();
      table.updateColumn(column, expression);
      await assertRejects(() => table.getTypes());
      assertEquals(await table.getGeoData(), original);
      assertEquals(await table.getTypes(), types);
    } finally {
      await sdb.close();
    }
  });
}
