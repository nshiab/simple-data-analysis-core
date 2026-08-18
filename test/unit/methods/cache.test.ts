import { assertEquals, assertRejects } from "@std/assert";
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
      columns: "key2",
      decimals: 4,
    });
  });
  const data = await table.getData();
  assertEquals(data, [
    {
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.9669,
      stdDev: 9.7639,
      variance: 95.3333,
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
      columns: "key2",
      decimals: 4,
    });
  });
  const data = await table.getData();
  assertEquals(data, [
    {
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.9669,
      stdDev: 9.7639,
      variance: 95.3333,
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
Deno.test("should invalidate the cache when a captured input changes", async () => {
  let computationRuns = 0;
  const createCompute = (table: SimpleTable, value: number) => () => {
    computationRuns++;
    table.loadArray([{ value }]);
  };

  const firstSdb = new SimpleDB({ dataTransport: "file" });
  const firstTable = firstSdb.newTable("cacheCapturedInput");
  await firstTable.cache(createCompute(firstTable, 1), {
    inputs: [1],
  });
  await firstSdb.close();

  const secondSdb = new SimpleDB({ dataTransport: "file" });
  const secondTable = secondSdb.newTable("cacheCapturedInput");
  await secondTable.cache(createCompute(secondTable, 2), {
    inputs: [2],
  });

  assertEquals(computationRuns, 2);
  assertEquals(await secondTable.getData(), [{ value: 2 }]);

  await secondSdb.close();
});
Deno.test("should compare cache inputs structurally", async () => {
  let computationRuns = 0;
  const createCompute = (table: SimpleTable) => () => {
    computationRuns++;
    table.loadArray([{ value: 1 }]);
  };

  const firstSdb = new SimpleDB({ dataTransport: "file" });
  const firstTable = firstSdb.newTable("cacheStructuralInputs");
  await firstTable.cache(createCompute(firstTable), {
    inputs: [{ threshold: 2, nested: { enabled: true } }],
  });
  await firstSdb.close();

  const secondSdb = new SimpleDB({ dataTransport: "file" });
  const secondTable = secondSdb.newTable("cacheStructuralInputs");
  await secondTable.cache(createCompute(secondTable), {
    inputs: [{ nested: { enabled: true }, threshold: 2 }],
  });

  assertEquals(computationRuns, 1);

  await secondSdb.close();
});
Deno.test("should compare cache inputs by array position", async () => {
  let computationRuns = 0;
  const createCompute = (table: SimpleTable) => () => {
    computationRuns++;
    table.loadArray([{ value: computationRuns }]);
  };

  const firstSdb = new SimpleDB({ dataTransport: "file" });
  const firstTable = firstSdb.newTable("cacheInputPositions");
  await firstTable.cache(createCompute(firstTable), { inputs: [10, 20] });
  await firstSdb.close();

  const secondSdb = new SimpleDB({ dataTransport: "file" });
  const secondTable = secondSdb.newTable("cacheInputPositions");
  await secondTable.cache(createCompute(secondTable), { inputs: [20, 10] });

  assertEquals(computationRuns, 2);

  await secondSdb.close();
});
Deno.test("should preserve legacy identity for empty inputs", async () => {
  let computationRuns = 0;
  const createCompute = (table: SimpleTable) => () => {
    computationRuns++;
    table.loadArray([{ value: 1 }]);
  };

  const firstSdb = new SimpleDB({ dataTransport: "file" });
  const firstTable = firstSdb.newTable("cacheEmptyInputs");
  await firstTable.cache(createCompute(firstTable));
  await firstSdb.close();

  const secondSdb = new SimpleDB({ dataTransport: "file" });
  const secondTable = secondSdb.newTable("cacheEmptyInputs");
  await secondTable.cache(createCompute(secondTable), { inputs: [] });

  assertEquals(computationRuns, 1);

  await secondSdb.close();
});
Deno.test("should exclude ttl from cache identity with inputs", async () => {
  let computationRuns = 0;
  const createCompute = (table: SimpleTable) => () => {
    computationRuns++;
    table.loadArray([{ value: 1 }]);
  };

  const firstSdb = new SimpleDB({ dataTransport: "file" });
  const firstTable = firstSdb.newTable("cacheInputsTtl");
  await firstTable.cache(createCompute(firstTable), {
    inputs: [1],
    ttl: 10,
  });
  await firstSdb.close();

  const secondSdb = new SimpleDB({ dataTransport: "file" });
  const secondTable = secondSdb.newTable("cacheInputsTtl");
  await secondTable.cache(createCompute(secondTable), {
    inputs: [1],
    ttl: 20,
  });

  assertEquals(computationRuns, 1);

  await secondSdb.close();
});
Deno.test("should hash function and class inputs by source", async () => {
  let computationRuns = 0;
  const createCompute = (table: SimpleTable) => () => {
    computationRuns++;
    table.loadArray([{ value: 1 }]);
  };
  const transformA = (value: number) => value + 1;
  const transformB = (value: number) => value + 2;
  class StrategyA {
    run(value: number) {
      return value + 1;
    }
  }
  class StrategyB {
    run(value: number) {
      return value + 2;
    }
  }

  const run = async (
    transform: (value: number) => number,
    Strategy: typeof StrategyA | typeof StrategyB,
  ) => {
    const sdb = new SimpleDB({ dataTransport: "file" });
    const table = sdb.newTable("cacheCodeInputs");
    await table.cache(createCompute(table), {
      inputs: [transform, Strategy],
    });
    await sdb.close();
  };

  await run(transformA, StrategyA);
  await run(transformA, StrategyA);
  await run(transformB, StrategyB);

  assertEquals(computationRuns, 2);
});
Deno.test("should compare SimpleTable inputs by generation", async () => {
  let sourceRuns = 0;
  let outputRuns = 0;
  const createSourceCompute = (
    source: SimpleTable,
    rows: { value: number }[],
  ) =>
  () => {
    sourceRuns++;
    source.loadArray(rows);
  };
  const createCompute =
    (source: SimpleTable, output: SimpleTable) => async () => {
      outputRuns++;
      output.loadArray(await source.getData());
    };
  const run = async (rows: { value: number }[]) => {
    const sdb = new SimpleDB({ dataTransport: "file" });
    const source = sdb.newTable("cacheTableInputSource");
    const output = sdb.newTable("cacheTableInputOutput");
    await source.cache(createSourceCompute(source, rows), { inputs: [rows] });
    await output.cache(createCompute(source, output), { inputs: [source] });
    const data = await output.getData();
    await sdb.close();
    return data;
  };

  assertEquals(await run([{ value: 1 }]), [{ value: 1 }]);
  assertEquals(await run([{ value: 1 }]), [{ value: 1 }]);
  assertEquals(await run([{ value: 2 }]), [{ value: 2 }]);
  assertEquals(sourceRuns, 2);
  assertEquals(outputRuns, 2);
});
Deno.test("should cache computations that read without mutating table inputs", async () => {
  let computationRuns = 0;
  const sdb = new SimpleDB({ dataTransport: "file" });
  const source = sdb.newTable("cacheReadOnlyInputSource");
  const output = sdb.newTable("cacheReadOnlyInputOutput");
  source.loadArray([{ year: 2025 }, { year: 2026 }]);
  const compute = async () => {
    computationRuns++;
    output.loadArray(
      await source.getData({ conditions: "year = 2026" }),
    );
  };

  await output.cache(compute, { inputs: [source, 2026] });
  await output.cache(compute, { inputs: [source, 2026] });

  assertEquals(computationRuns, 1);
  assertEquals(await output.getData(), [{ year: 2026 }]);

  await sdb.close();
});
Deno.test("should invalidate SimpleTable generations when removed", async () => {
  let computationRuns = 0;
  const sdb = new SimpleDB({ dataTransport: "file" });
  const source = sdb.newTable("cacheRemovedInputSource");
  const output = sdb.newTable("cacheRemovedInputOutput");
  source.loadArray([{ value: 1 }]);
  const compute = () => {
    computationRuns++;
    output.loadArray([{ value: computationRuns }]);
  };

  await output.cache(compute, { inputs: [source] });
  await source.removeTable();
  await output.cache(compute, { inputs: [source] });

  assertEquals(computationRuns, 2);
  assertEquals(await output.getData(), [{ value: 2 }]);

  await sdb.close();
});
Deno.test("should allow the cached table as an explicit input", async () => {
  let sourceRuns = 0;
  let transformRuns = 0;
  const createSourceCompute = (table: SimpleTable) => () => {
    sourceRuns++;
    table.loadArray([{ value: 1 }, { value: 2 }]);
  };
  const createTransformCompute = (table: SimpleTable) => () => {
    transformRuns++;
    table.filter("value = 2");
  };
  const run = async () => {
    const sdb = new SimpleDB({ dataTransport: "file" });
    const table = sdb.newTable("cacheResultTableInput");
    await table.cache(createSourceCompute(table), { inputs: ["source-v1"] });
    await table.cache(createTransformCompute(table), { inputs: [table] });
    const data = await table.getData();
    await sdb.close();
    return data;
  };

  assertEquals(await run(), [{ value: 2 }]);
  assertEquals(await run(), [{ value: 2 }]);
  assertEquals(sourceRuns, 1);
  assertEquals(transformRuns, 1);
});
Deno.test("should restore SimpleTable generations on cache hits", async () => {
  let sourceRuns = 0;
  let outputRuns = 0;
  const createSourceCompute = (source: SimpleTable) => () => {
    sourceRuns++;
    source.loadArray([{ value: 1 }]);
  };
  const createOutputCompute =
    (source: SimpleTable, output: SimpleTable) => async () => {
      outputRuns++;
      output.loadArray(await source.getData());
    };
  const run = async () => {
    const sdb = new SimpleDB({ dataTransport: "file" });
    const source = sdb.newTable("cacheGenerationSource");
    const output = sdb.newTable("cacheGenerationOutput");
    await source.cache(createSourceCompute(source));
    await output.cache(createOutputCompute(source, output), {
      inputs: [source],
    });
    await sdb.close();
  };

  await run();
  await run();

  assertEquals(sourceRuns, 1);
  assertEquals(outputRuns, 1);
});
Deno.test("should invalidate SimpleTable generations after a mutation", async () => {
  let outputRuns = 0;
  const sdb = new SimpleDB({ dataTransport: "file" });
  const source = sdb.newTable("cacheGenerationMutationSource");
  const output = sdb.newTable("cacheGenerationMutationOutput");
  source.loadArray([{ value: 1 }, { value: 2 }]);
  const compute = async () => {
    outputRuns++;
    output.loadArray(await source.getData());
  };

  await output.cache(compute, { inputs: [source] });
  source.filter("value = 1");
  await output.cache(compute, { inputs: [source] });

  assertEquals(outputRuns, 2);

  await sdb.close();
});
Deno.test("should invalidate SimpleTable generations after a refresh", async () => {
  let sourceRuns = 0;
  let outputRuns = 0;
  const createSourceCompute = (source: SimpleTable) => () => {
    sourceRuns++;
    source.loadArray([{ value: 1 }]);
  };
  const createOutputCompute =
    (source: SimpleTable, output: SimpleTable) => async () => {
      outputRuns++;
      output.loadArray(await source.getData());
    };
  const run = async () => {
    const sdb = new SimpleDB({ dataTransport: "file" });
    const source = sdb.newTable("cacheGenerationRefreshSource");
    const output = sdb.newTable("cacheGenerationRefreshOutput");
    await source.cache(createSourceCompute(source), { ttl: 0 });
    await output.cache(createOutputCompute(source, output), {
      inputs: [source],
    });
    await sdb.close();
  };

  await run();
  await run();

  assertEquals(sourceRuns, 2);
  assertEquals(outputRuns, 2);
});
Deno.test("should allow content hashes as explicit cache inputs", async () => {
  let sourceRuns = 0;
  let outputRuns = 0;
  const createSourceCompute = (source: SimpleTable) => () => {
    sourceRuns++;
    source.loadArray([{ value: 1 }]);
  };
  const createOutputCompute =
    (source: SimpleTable, output: SimpleTable) => async () => {
      outputRuns++;
      output.loadArray(await source.getData());
    };
  const run = async () => {
    const sdb = new SimpleDB({ dataTransport: "file" });
    const source = sdb.newTable("cacheContentHashSource");
    const output = sdb.newTable("cacheContentHashOutput");
    await source.cache(createSourceCompute(source), { ttl: 0 });
    await output.cache(createOutputCompute(source, output), {
      inputs: [await source.getHash()],
    });
    await sdb.close();
  };

  await run();
  await run();

  assertEquals(sourceRuns, 2);
  assertEquals(outputRuns, 1);
});
Deno.test("should reject cyclic cache inputs before computing", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("cacheCyclicInputs");
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  let computationRuns = 0;

  await assertRejects(
    () =>
      table.cache(
        () => {
          computationRuns++;
          table.loadArray([{ value: 1 }]);
        },
        { inputs: [cyclic] },
      ),
    TypeError,
    "cache() inputs[0].self is cyclic",
  );
  assertEquals(computationRuns, 0);

  await sdb.close();
});
Deno.test("should load data from the cache if ttl has not expired", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", cacheVerbose: true });
  const table = sdb.newTable();
  await table.cache(
    () => {
      table.loadData("test/data/files/dataSummarize.json");
      table.summarize({
        columns: "key2",
        decimals: 4,
      });
    },
    { ttl: 10 },
  );
  const data = await table.getData();
  assertEquals(data, [
    {
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.9669,
      stdDev: 9.7639,
      variance: 95.3333,
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
        columns: "key2",
        decimals: 4,
      });
    },
    { ttl: 0 },
  );
  const data = await table.getData();
  assertEquals(data, [
    {
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.9669,
      stdDev: 9.7639,
      variance: 95.3333,
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
      columns: "key2",
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
        "table1.7585b96900b173c77cca3419d14a1dd5e622bf4ee986adc72847a896d429de8a",
      ],
      files: [
        "sources.json",
        "table1.7585b96900b173c77cca3419d14a1dd5e622bf4ee986adc72847a896d429de8a.parquet",
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
