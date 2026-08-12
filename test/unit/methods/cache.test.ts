import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import type SimpleTable from "../../../src/class/SimpleTable.ts";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

if (existsSync("./.sda-cache")) {
  rmSync("./.sda-cache", { recursive: true });
}

Deno.test("should log a warning, not an error, when no data or table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", cacheVerbose: true });
  const table = sdb.newTable();
  await table.cache(() => {
    // Nothing in cache
  });
  await sdb.close();
  assertEquals(true, true);
});
Deno.test("should log a warning, not an error, when loading cache when no data or table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", cacheVerbose: true });
  const table = sdb.newTable();
  await table.cache(() => {
    // Nothing in cache
  });
  await sdb.close();
  assertEquals(true, true);
});
Deno.test("should cache computed values for tabular data", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", cacheVerbose: true });
  const table = sdb.newTable();
  await table.cache(() => {
    table.loadData("test/data/files/dataSummarize.json");
    table.summarize({
      values: "key2",
      decimals: 4,
    });
  });
  const data = await table.getData();
  assertEquals(data, [
    {
      count: 6,
      countUnique: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.9669,
      stdDev: 9.7639,
      var: 95.3333,
    },
  ]);
  await sdb.close();
});
Deno.test("should load data from the cache instead of running computations", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", cacheVerbose: true });
  const table = sdb.newTable();
  await table.cache(() => {
    table.loadData("test/data/files/dataSummarize.json");
    table.summarize({
      values: "key2",
      decimals: 4,
    });
  });
  const data = await table.getData();
  assertEquals(data, [
    {
      count: 6,
      countUnique: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.9669,
      stdDev: 9.7639,
      var: 95.3333,
    },
  ]);
  await sdb.close();
});
Deno.test("should execute a cached load before cache resolves", async () => {
  let computationRuns = 0;
  const createCompute = (table: SimpleTable) => () => {
    computationRuns++;
    table.loadArray([{ value: 1 }]);
  };

  const firstSdb = new SimpleDB({ dataTransport: "file" });
  const firstTable = firstSdb.newTable("cacheHitExecution");
  await firstTable.cache(createCompute(firstTable));
  await firstSdb.close();

  const secondSdb = new SimpleDB({ dataTransport: "file" });
  const secondTable = secondSdb.newTable("cacheHitExecution");
  await secondTable.cache(createCompute(secondTable));

  assertEquals(computationRuns, 1);
  assertEquals(secondTable.pendingOps.map((op) => op.method), []);

  await secondSdb.close();
});
Deno.test("should execute a cached geospatial load before cache resolves", async () => {
  let computationRuns = 0;
  const createCompute = (table: SimpleTable) => () => {
    computationRuns++;
    table.loadGeoData("test/geodata/files/pointsInside.json");
  };

  const firstSdb = new SimpleDB({ dataTransport: "file" });
  const firstTable = firstSdb.newTable("geoCacheHitExecution");
  await firstTable.cache(createCompute(firstTable));
  await firstSdb.close();

  const secondSdb = new SimpleDB({ dataTransport: "file" });
  const secondTable = secondSdb.newTable("geoCacheHitExecution");
  await secondTable.cache(createCompute(secondTable));

  assertEquals(computationRuns, 1);
  assertEquals(secondTable.pendingOps.map((op) => op.method), []);

  await secondSdb.close();
});
Deno.test("should load data from the cache if ttl has not expired", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", cacheVerbose: true });
  const table = sdb.newTable();
  await table.cache(
    () => {
      table.loadData("test/data/files/dataSummarize.json");
      table.summarize({
        values: "key2",
        decimals: 4,
      });
    },
    { ttl: 10 },
  );
  const data = await table.getData();
  assertEquals(data, [
    {
      count: 6,
      countUnique: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.9669,
      stdDev: 9.7639,
      var: 95.3333,
    },
  ]);
  await sdb.close();
});
Deno.test("should not load data from the cache if ttl has expired", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", cacheVerbose: true });
  const table = sdb.newTable();
  await table.cache(
    () => {
      table.loadData("test/data/files/dataSummarize.json");
      table.summarize({
        values: "key2",
        decimals: 4,
      });
    },
    { ttl: 0 },
  );
  const data = await table.getData();
  assertEquals(data, [
    {
      count: 6,
      countUnique: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.9669,
      stdDev: 9.7639,
      var: 95.3333,
    },
  ]);
  await sdb.close();
});
Deno.test("should cache computed values for geospatial data", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", cacheVerbose: true });
  const tableGeo = sdb.newTable("geodata");
  await tableGeo.cache(() => {
    tableGeo.loadGeoData("test/geodata/files/pointsInside.json");
    tableGeo.renameColumns({ geom: "points" });
    tableGeo.latLon("points", "lat", "lon");
  });

  tableGeo.removeColumns("points");
  tableGeo.sort();
  const data = await tableGeo.getData();

  assertEquals(data, [
    {
      name: "pointA",
      lat: 48.241182892559266,
      lon: -76.34553248992202,
    },
    {
      name: "pointB",
      lat: 50.15023361660323,
      lon: -73.18043031919933,
    },
    {
      name: "pointC",
      lat: 48.47150751404138,
      lon: -72.78960434234926,
    },
    {
      name: "pointD",
      lat: 47.43075362784262,
      lon: -72.2926406368759,
    },
  ]);
  await sdb.close();
});
Deno.test("should load geospatial data from the cache instead of running computations", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", cacheVerbose: true });
  const tableGeo = sdb.newTable("geodata");

  await tableGeo.cache(() => {
    tableGeo.loadGeoData("test/geodata/files/pointsInside.json");
    tableGeo.renameColumns({ geom: "points" });
    tableGeo.latLon("points", "lat", "lon");
  });

  tableGeo.removeColumns("points");
  const data = await tableGeo.getData();

  assertEquals(data, [
    {
      name: "pointA",
      lat: 48.241182892559266,
      lon: -76.34553248992202,
    },
    {
      name: "pointB",
      lat: 50.15023361660323,
      lon: -73.18043031919933,
    },
    {
      name: "pointC",
      lat: 48.47150751404138,
      lon: -72.78960434234926,
    },
    {
      name: "pointD",
      lat: 47.43075362784262,
      lon: -72.2926406368759,
    },
  ]);
  await sdb.close();
});
Deno.test("should not load data from the cache if ttl has expired", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", cacheVerbose: true });
  const tableGeo = sdb.newTable("geodata");
  await tableGeo.cache(
    () => {
      tableGeo.loadGeoData(
        "test/geodata/files/pointsInside.json",
      );
      tableGeo.renameColumns({ geom: "points" });
      tableGeo.latLon("points", "lat", "lon");
    },
    { ttl: 0 },
  );

  tableGeo.removeColumns("points");
  const data = await tableGeo.getData();

  assertEquals(data, [
    {
      name: "pointA",
      lat: 48.241182892559266,
      lon: -76.34553248992202,
    },
    {
      name: "pointB",
      lat: 50.15023361660323,
      lon: -73.18043031919933,
    },
    {
      name: "pointC",
      lat: 48.47150751404138,
      lon: -72.78960434234926,
    },
    {
      name: "pointD",
      lat: 47.43075362784262,
      lon: -72.2926406368759,
    },
  ]);
  await sdb.close();
});
Deno.test("should clean the cache when calling close", async () => {
  if (existsSync("./.sda-cache")) {
    rmSync("./.sda-cache", { recursive: true });
  }

  const sdb = new SimpleDB({ dataTransport: "file", cacheVerbose: true });
  const table = sdb.newTable();
  await table.cache(() => {
    table.loadData("test/data/files/dataSummarize.json");
    table.summarize({
      values: "key2",
      decimals: 4,
    });
  });

  // We create a fake cached file.

  const cacheSources = JSON.parse(
    readFileSync(".sda-cache/sources.json", "utf-8"),
  );
  cacheSources["testForCache"] = {
    timestamp: 1720117189389,
    file: "./.sda-cache/testForCache.json",
    geo: false,
    geoColumnName: null,
  };
  writeFileSync(".sda-cache/sources.json", JSON.stringify(cacheSources));
  writeFileSync(".sda-cache/testForCache.json", JSON.stringify("Hi!"));

  await sdb.close();

  const cacheSourcesIdsUpdated = Object.keys(
    JSON.parse(readFileSync(".sda-cache/sources.json", "utf-8")),
  );
  const files = readdirSync(".sda-cache/").sort((a, b) => a > b ? 1 : -1);

  assertEquals(
    { cacheSourcesIdsUpdated, files },
    {
      cacheSourcesIdsUpdated: [
        "table1.6ab14dfaa5a442a445453499424bfa92a69af566e1d3fd164794d7c7df8996d2",
      ],
      files: [
        "sources.json",
        "table1.6ab14dfaa5a442a445453499424bfa92a69af566e1d3fd164794d7c7df8996d2.parquet",
      ],
    },
  );
});
Deno.test("should cache dates and retrieve dates", async () => {
  // Example from Code Like a Journalist lesson about tabular data

  const sdb = new SimpleDB({ dataTransport: "file", cacheVerbose: true });
  const temperatures = sdb.newTable("temperatures");
  await temperatures.cache(() => {
    temperatures.loadData(
      "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/main/test/data/files/dailyTemperatures.csv",
    );
    const cities = sdb.newTable("cities");
    cities.loadData(
      "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/main/test/data/files/cities.csv",
    );
    temperatures.join(cities);
  });
  const firstPass = await temperatures.getTop(10);
  // await temperatures.log();

  await temperatures.cache(() => {
    temperatures.loadData(
      "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/main/test/data/files/dailyTemperatures.csv",
    );
    const cities = sdb.newTable("cities");
    cities.loadData(
      "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/main/test/data/files/cities.csv",
    );
    temperatures.join(cities);
  });
  const secondPass = await temperatures.getTop(10);
  // await temperatures.log();

  await sdb.close();

  assertEquals(firstPass, secondPass);
});
