import { test, expect, vi } from "vite-plus/test";
import { assertThrows } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should list available samples for an unknown sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  assertThrows(
    () => table.loadSample("unknown" as "fires"),
    Error,
    `loadSample() does not recognize sample "unknown". Available samples: "fires", "recipes", "temperatures", "temperaturesCities", "canada", "firesGeo".`,
  );

  await sdb.close();
});

test.skipIf(process.env.CI === "true")("should load the fires sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadSample("fires");
  const data = await table.getData();

  const tableLocal = sdb.newTable();
  tableLocal.loadData("test/geodata/files/firesCanada2023.csv");
  const dataLocal = await tableLocal.getData();

  expect(data).toStrictEqual(dataLocal);
  await sdb.close();
});

test.skipIf(process.env.CI === "true")("should load the recipes sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadSample("recipes");
  const data = await table.getData();

  const tableLocal = sdb.newTable();
  tableLocal.loadData("test/data/files/recipes.parquet");
  const dataLocal = await tableLocal.getData();

  expect(data).toStrictEqual(dataLocal);
  await sdb.close();
});

test.skipIf(process.env.CI === "true")("should load the temperatures sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadSample("temperatures");
  const data = await table.getData();

  const tableLocal = sdb.newTable();
  tableLocal.loadData("test/data/files/dailyTemperatures.csv");
  const dataLocal = await tableLocal.getData();

  expect(data).toStrictEqual(dataLocal);
  await sdb.close();
});

test.skipIf(process.env.CI === "true")("should load the temperaturesCities sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadSample("temperaturesCities");
  const data = await table.getData();

  const tableLocal = sdb.newTable();
  tableLocal.loadData("test/data/files/cities.csv");
  const dataLocal = await tableLocal.getData();

  expect(data).toStrictEqual(dataLocal);
  await sdb.close();
});

test.skipIf(process.env.CI === "true")("should load the canada sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadSample("canada");
  const data = await table.getGeoData();

  const tableLocal = sdb.newTable();
  tableLocal.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");
  const dataLocal = await tableLocal.getGeoData();

  expect(data).toStrictEqual(dataLocal);
  await sdb.close();
});

test.skipIf(process.env.CI === "true")("should load the firesGeo sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadSample("firesGeo");
  const data = await table.getGeoData();

  const tableLocal = sdb.newTable();
  tableLocal.loadGeoData("test/geodata/files/firesCanada2023.geojson");
  const dataLocal = await tableLocal.getGeoData();

  expect(data).toStrictEqual(dataLocal);
  await sdb.close();
});

for (const { sample, method, url } of [
  {
    sample: "fires",
    method: "loadData",
    url: "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/geodata/files/firesCanada2023.csv",
  },
  {
    sample: "recipes",
    method: "loadData",
    url: "https://github.com/nshiab/simple-data-analysis-core/raw/refs/heads/main/test/data/files/recipes.parquet",
  },
  {
    sample: "temperatures",
    method: "loadData",
    url: "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/data/files/dailyTemperatures.csv",
  },
  {
    sample: "temperaturesCities",
    method: "loadData",
    url: "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/data/files/cities.csv",
  },
  {
    sample: "canada",
    method: "loadGeoData",
    url: "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/geodata/files/CanadianProvincesAndTerritories.json",
  },
  {
    sample: "firesGeo",
    method: "loadGeoData",
    url: "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/geodata/files/firesCanada2023.geojson",
  },
] as const) {
  test(`loadSample routes ${sample} to its matching loader and remains fluent`, async () => {
    const sdb = new SimpleDB();
    const table = sdb.newTable();
    const loader = vi.spyOn(table, method).mockReturnValue(table);
    try {
      expect(table.loadSample(sample)).toBe(table);
      expect(loader).toHaveBeenCalledExactlyOnceWith(url);
    } finally {
      loader.mockRestore();
      await sdb.close();
    }
  });
}
