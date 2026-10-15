import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "vite-plus/test";
import { assertRejects, assertThrows } from "../../helpers/assertions.ts";
import { writeFile as nodeWriteFile, rm as nodeRm } from "node:fs/promises";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";
import SDAError from "../../../src/class/SDAError.ts";
import { loadDataQuery } from "../../../src/methods/loadData.ts";

for (const { file, conditions, columns, expected } of [
  {
    file: "test/data/files/data.csv",
    conditions: "key1 = '8' OR key1 = 'brioche'",
    columns: ["key2"],
    expected: [{ key2: "10" }],
  },
  {
    file: "test/data/files/data.json",
    conditions: "key1 >= 3",
    columns: ["key2"],
    expected: [{ key2: "trois" }],
  },
  {
    file: "test/data/files/data.parquet",
    conditions: "key1 >= 8",
    columns: ["key2"],
    expected: [{ key2: "trois" }],
  },
  {
    file: "test/data/files/populations-one-sheet.xlsx",
    conditions: '"Population (million)" > 40',
    columns: undefined,
    expected: [{ Country: "US", "Population (million)": 332 }],
  },
]) {
  test(`loadData applies conditions before projection and limit: ${file}`, async () => {
    const sdb = new SimpleDB();
    try {
      expect(
        await sdb.newTable().loadData(file, { conditions, columns, limit: 1 }).getData(),
      ).toStrictEqual(expected);
    } finally {
      await sdb.close();
    }
  });
}

test("loadData captures conditions and fuses downstream operations across multiple files", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("filteredLoad");
    const queries: string[] = [];
    const original = table.runQuery;
    table.runQuery = (query, connection, returnData, options) => {
      queries.push(query);
      return original(query, connection, returnData, options);
    };
    const options = {
      conditions: "key1 === 2 || key1 === 3",
      columns: ["key2"],
    };
    table
      .loadData(["test/data/files/data.json", "test/data/files/data.json"], options)
      .filter("key2 !== 'deux'")
      .addColumn("selected", "boolean", "TRUE");
    options.conditions = "FALSE";

    expect(await table.getData()).toStrictEqual([
      { key2: "trois", selected: true },
      { key2: "trois", selected: true },
    ]);
    expect(
      queries.filter((query) => query.includes("CREATE OR REPLACE TABLE")).length,
    ).toStrictEqual(1);
  } finally {
    await sdb.close();
  }
});

test("loadData handles empty, unmatched, and invalid conditions", async () => {
  const sdb = new SimpleDB();
  try {
    for (const conditions of [undefined, "", "FALSE"]) {
      const table = sdb.newTable().loadData("test/data/files/data.json", {
        conditions,
      });
      expect(await table.getRowCount()).toStrictEqual(conditions === "FALSE" ? 0 : 4);
      expect(await table.getColumns()).toStrictEqual(["key1", "key2"]);
    }
    for (const conditions of ["missing_column > 1", "key1 >"]) {
      const table = sdb.newTable().loadData("test/data/files/data.json", {
        conditions,
      });
      const error = await assertRejects(() => table.getData(), SDAError);
      expect(error.method).toStrictEqual("loadData()");
      expect(error.parameters).toStrictEqual({
        files: "test/data/files/data.json",
        options: { conditions },
      });
    }
  } finally {
    await sdb.close();
  }
});

test("loadData conditions read preceding changes to the same table", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("previousLoad");
    table
      .loadArray([{ key1: 1 }, { key1: 3 }])
      .filter("key1 = 3")
      .loadData("test/data/files/data.json", {
        conditions: 'key1 IN (SELECT key1 FROM "previousLoad")',
      });
    expect(await table.getData()).toStrictEqual([{ key1: 3, key2: "trois" }]);
  } finally {
    await sdb.close();
  }
});

test("loadData tracks table dependencies in conditions for cache invalidation", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("loadConditionsSource");
    const output = sdb.newTable("loadConditionsOutput");
    source.loadArray([{ key1: 1 }, { key1: 3 }]);
    let runs = 0;
    const compute = () => {
      runs++;
      output.loadData("test/data/files/data.json", {
        conditions: `key1 IN (SELECT key1 FROM "${source.name}")`,
      });
    };
    await output.cache(compute);
    await output.cache(compute);
    expect(runs).toStrictEqual(1);
    source.filter("key1 = 3");
    await output.cache(compute);
    expect(runs).toStrictEqual(2);
    expect(await output.getData()).toStrictEqual([{ key1: 3, key2: "trois" }]);
  } finally {
    await sdb.close();
  }
});

test("loadDataQuery escapes generated string literals", () => {
  const csvQuery = loadDataQuery("data", ["owner's.csv"], {
    fileType: "csv",
    delim: "'",
    encoding: "owner's encoding",
  });
  expect(csvQuery).toContain("['owner''s.csv']");
  expect(csvQuery).toContain("delim=''''");
  expect(csvQuery).toContain("encoding='owner''s encoding'");

  const excelQuery = loadDataQuery("data", ["owner's.xlsx"], {
    fileType: "excel",
    sheet: "Owner's Data",
  });
  expect(excelQuery).toContain("read_xlsx('owner''s.xlsx'");
  expect(excelQuery).toContain("sheet='Owner''s Data'");
});

test("loadDataQuery uses partial CSV type overrides", () => {
  const query = loadDataQuery("coordinates", ["coordinates.csv"], {
    columns: ["lat"],
    columnTypes: { lat: "DOUBLE" },
  });
  expect(query).toContain("types={'lat': 'DOUBLE'}");
  expect(query.includes("columns={'lat': 'DOUBLE'}")).toStrictEqual(false);
});

test("loadDataQuery reports supported file types", () => {
  assertThrows(
    () =>
      loadDataQuery("data", ["data.csv"], {
        fileType: "xml" as "csv",
      }),
    Error,
    `loadData() could not determine a supported file type for "data.csv". options.fileType: "xml". Detected extension: ".csv". Supported file types: "csv", "dsv", "json", "parquet", and "excel" (for .xlsx files).`,
  );
});

test("should load data from a csv file and return the table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable().loadData(["test/data/files/data.csv"]);

  expect(table instanceof SimpleTable).toStrictEqual(true);
  await table.run();
  await sdb.close();
});
test("should load data from a csv file with a specific encoding and return the table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable().loadData(["test/data/files/data.csv"], { encoding: "latin-1" });

  expect(table instanceof SimpleTable).toStrictEqual(true);
  await table.run();
  await sdb.close();
});
test("should load data from a csv file with strict false", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable().loadData(["test/data/files/data.csv"], { strict: false });

  expect(table instanceof SimpleTable).toStrictEqual(true);
  await table.run();
  await sdb.close();
});
test("should load data from a csv file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.csv"]);

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: "1", key2: "2" },
    { key1: "3", key2: "coucou" },
    { key1: "8", key2: "10" },
    { key1: "brioche", key2: "croissant" },
  ]);
  await sdb.close();
});

test("should partially override CSV column types", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  const data = await table
    .loadData("test/geodata/files/coordinates.csv", {
      columns: ["name", "lat"],
      columnTypes: { lat: "DOUBLE" },
    })
    .getData();

  expect(data).toStrictEqual([
    { name: "montreal", lat: 43.77 },
    { name: "toronto", lat: 45.35 },
    { name: "vancouver", lat: 49.07 },
  ]);
  await sdb.close();
});
test("should load data from a csv file with a limit", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.csv"], {
    limit: 2,
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: "1", key2: "2" },
    { key1: "3", key2: "coucou" },
  ]);
  await sdb.close();
});
test("should load data from a compressed csv file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.csv.gz"]);

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: "1", key2: "2" },
    { key1: "3", key2: "coucou" },
    { key1: "8", key2: "10" },
    { key1: "brioche", key2: "croissant" },
  ]);
  await sdb.close();
});
test("should load data with dates", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataDates.csv"]);

  const data = await table.getData();

  expect(data).toStrictEqual([
    {
      date: new Date("2010-01-01T00:00:00.000Z"),
      datetime: new Date("2010-01-01T14:01:12.000Z"),
      datetimeWithMs: new Date("2010-01-01T14:12:12.014Z"),
      time: "14:12:12",
      timeMs: "14:12:12.014",
      weirdDatetime: "2010/01/01_14h_01min_12sec",
    },
    {
      date: new Date("2010-01-02T00:00:00.000Z"),
      datetime: new Date("2010-01-02T01:12:54.000Z"),
      datetimeWithMs: new Date("2010-01-02T01:12:54.955Z"),
      time: "01:12:54",
      timeMs: "01:12:54.955",
      weirdDatetime: "2010/01/02_01h_12min_54sec",
    },
    {
      date: new Date("2010-01-03T00:00:00.000Z"),
      datetime: new Date("2010-01-03T02:25:01.000Z"),
      datetimeWithMs: new Date("2010-01-03T02:25:01.111Z"),
      time: "02:25:01",
      timeMs: "02:25:01.111",
      weirdDatetime: "2010/01/03_02h_25min_54sec",
    },
    {
      date: new Date("2010-01-04T00:00:00.000Z"),
      datetime: new Date("2010-01-04T23:25:15.000Z"),
      datetimeWithMs: new Date("2010-01-04T12:01:15.123Z"),
      time: "12:01:15",
      timeMs: "12:01:15.123",
      weirdDatetime: "2010/01/04_23h_25min_15sec",
    },
  ]);
  await sdb.close();
});
test("should load data while keeping everything as text", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataDates.csv"], {
    allText: true,
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    {
      date: "2010-01-01",
      datetime: "2010-01-01 14:01:12",
      datetimeWithMs: "2010-01-01 14:12:12.014",
      time: "14:12:12",
      timeMs: "14:12:12.014",
      weirdDatetime: "2010/01/01_14h_01min_12sec",
    },
    {
      date: "2010-01-02",
      datetime: "2010-01-02 01:12:54",
      datetimeWithMs: "2010-01-02 01:12:54.955",
      time: "01:12:54",
      timeMs: "01:12:54.955",
      weirdDatetime: "2010/01/02_01h_12min_54sec",
    },
    {
      date: "2010-01-03",
      datetime: "2010-01-03 02:25:01",
      datetimeWithMs: "2010-01-03 02:25:01.111",
      time: "02:25:01",
      timeMs: "02:25:01.111",
      weirdDatetime: "2010/01/03_02h_25min_54sec",
    },
    {
      date: "2010-01-04",
      datetime: "2010-01-04 23:25:15",
      datetimeWithMs: "2010-01-04 12:01:15.123",
      time: "12:01:15",
      timeMs: "12:01:15.123",
      weirdDatetime: "2010/01/04_23h_25min_15sec",
    },
  ]);
  await sdb.close();
});
test("should load a messy csv", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/activefires.csv"], {
    nullPadding: true,
  });

  const data = await table.getTop(3);

  expect(data).toStrictEqual([
    {
      agency: "bc",
      firename: " G70149",
      lat: 55.642,
      lon: -121.444,
      startdate: " 2024-04-22 20:17:00",
      hectares: 0.2,
      stage_of_control: " UC",
      timezone: " PDT",
      response_type: " FUL",
    },
    {
      agency: "nb",
      firename: " 63424",
      lat: 46.309,
      lon: -66.718,
      startdate: " 2024-04-27 16:55:19",
      hectares: 0.1,
      stage_of_control: " UC",
      timezone: " ADT",
      response_type: " FUL",
    },
    {
      agency: "conus",
      firename: " Anvil - ORRSF",
      lat: 42.7458,
      lon: -124.344,
      startdate: " ",
      hectares: 8978.85,
      stage_of_control: " 95% contained",
      timezone: " GMT",
      response_type: null,
    },
  ]);
  await sdb.close();
});
test.skipIf(process.env.CI === "true")("should load data from a fetched csv file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData([
    "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/main/test/data/files/data.csv",
  ]);

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: "1", key2: "2" },
    { key1: "3", key2: "coucou" },
    { key1: "8", key2: "10" },
    { key1: "brioche", key2: "croissant" },
  ]);
  await sdb.close();
});
test("should load data from a csv file after skypping some lines at the top", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataExtraLines.csv"], {
    skip: 2,
  });
  const data = await table.getData();
  expect(data).toStrictEqual([
    { key1: "1", key2: "2" },
    { key1: "3", key2: "coucou" },
    { key1: "8", key2: "10" },
    { key1: "brioche", key2: "croissant" },
  ]);
  await sdb.close();
});
test("should load data from a tsv file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.tsv"], {
    fileType: "dsv",
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: "1", key2: "2" },
    { key1: "3", key2: "coucou" },
    { key1: "8", key2: "10" },
    { key1: "brioche", key2: "croissant" },
  ]);
  await sdb.close();
});
test("should load data from a txt file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.txt"], {
    fileType: "dsv",
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: "1", key2: "2" },
    { key1: "3", key2: "coucou" },
    { key1: "8", key2: "10" },
    { key1: "brioche", key2: "croissant" },
  ]);
  await sdb.close();
});
test("should load data from a compressed txt file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataCsvCompressed.txt"], {
    fileType: "csv",
    compression: "gzip",
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: "1", key2: "2" },
    { key1: "3", key2: "coucou" },
    { key1: "8", key2: "10" },
    { key1: "brioche", key2: "croissant" },
  ]);
  await sdb.close();
});
test("should load data from a json file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.json"]);

  const data = await table.getData();

  expect(data).toStrictEqual([
    {
      key1: 1,
      key2: "un",
    },
    {
      key1: 2,
      key2: "deux",
    },
    {
      key1: 3,
      key2: "trois",
    },
    {
      key1: 4,
      key2: "quatre",
    },
  ]);
  await sdb.close();
});

test("should load data from a json file with a limit", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.json"], {
    limit: 2,
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    {
      key1: 1,
      key2: "un",
    },
    {
      key1: 2,
      key2: "deux",
    },
  ]);
  await sdb.close();
});

test("should load data from a parquet file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.parquet"]);

  const data = await table.getData();

  expect(data).toStrictEqual([
    {
      key1: 1,
      key2: "un",
    },
    {
      key1: 3,
      key2: "deux",
    },
    {
      key1: 8,
      key2: "trois",
    },
    {
      key1: 3,
      key2: "quatre",
    },
  ]);
  await sdb.close();
});

test("should load data from a parquet file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.parquet"], {
    limit: 2,
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    {
      key1: 1,
      key2: "un",
    },
    {
      key1: 3,
      key2: "deux",
    },
  ]);
  await sdb.close();
});

test("should load data from multiple files", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData([
    "test/data/directory/data1.csv",
    "test/data/directory/data2.csv",
    "test/data/directory/data3.csv",
  ]);

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: 1, key2: "un" },
    { key1: 2, key2: "deux" },
    { key1: 3, key2: "trois" },
    { key1: 4, key2: "quatre" },
    { key1: 5, key2: "cinq" },
    { key1: 6, key2: "six" },
    { key1: 7, key2: "sept" },
    { key1: 8, key2: "huit" },
    { key1: 9, key2: "neuf" },
    { key1: 10, key2: "dix" },
    { key1: 11, key2: "onze" },
  ]);
  await sdb.close();
});

test("should load data from multiple files and add a column with the file name.", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(
    [
      "test/data/directory/data1.csv",
      "test/data/directory/data2.csv",
      "test/data/directory/data3.csv",
    ],
    { includeFilename: true },
  );

  const data = await table.getData();

  expect(data).toStrictEqual([
    {
      key1: 1,
      key2: "un",
      filename: "test/data/directory/data1.csv",
    },
    {
      key1: 2,
      key2: "deux",
      filename: "test/data/directory/data1.csv",
    },
    {
      key1: 3,
      key2: "trois",
      filename: "test/data/directory/data1.csv",
    },
    {
      key1: 4,
      key2: "quatre",
      filename: "test/data/directory/data1.csv",
    },
    {
      key1: 5,
      key2: "cinq",
      filename: "test/data/directory/data2.csv",
    },
    {
      key1: 6,
      key2: "six",
      filename: "test/data/directory/data2.csv",
    },
    {
      key1: 7,
      key2: "sept",
      filename: "test/data/directory/data2.csv",
    },
    {
      key1: 8,
      key2: "huit",
      filename: "test/data/directory/data2.csv",
    },
    {
      key1: 9,
      key2: "neuf",
      filename: "test/data/directory/data3.csv",
    },
    {
      key1: 10,
      key2: "dix",
      filename: "test/data/directory/data3.csv",
    },
    {
      key1: 11,
      key2: "onze",
      filename: "test/data/directory/data3.csv",
    },
  ]);
  await sdb.close();
});

test("should load and unify multiple files matching a glob", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/directory/*.csv", { unifyColumns: true });

  const data = await table.getData();
  expect(data).toStrictEqual([
    { key1: 1, key2: "un", key3: null },
    { key1: 2, key2: "deux", key3: null },
    { key1: 3, key2: "trois", key3: null },
    { key1: 4, key2: "quatre", key3: null },
    { key1: 5, key2: "cinq", key3: null },
    { key1: 6, key2: "six", key3: null },
    { key1: 7, key2: "sept", key3: null },
    { key1: 8, key2: "huit", key3: null },
    { key1: 9, key2: "neuf", key3: null },
    { key1: 10, key2: "dix", key3: null },
    { key1: 11, key2: "onze", key3: null },
    { key1: 9, key2: "neuf", key3: "nine" },
    { key1: 10, key2: "dix", key3: "ten" },
    { key1: 11, key2: "onze", key3: "eleven" },
  ]);
  await sdb.close();
});

test("should load data from a json file with specific types for each column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.json"], {
    columnTypes: {
      key1: "VARCHAR",
      key2: "VARCHAR",
    },
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    {
      key1: "1",
      key2: "un",
    },
    {
      key1: "2",
      key2: "deux",
    },
    {
      key1: "3",
      key2: "trois",
    },
    {
      key1: "4",
      key2: "quatre",
    },
  ]);
  await sdb.close();
});

test.skipIf(process.env.CI === "true")("should load data from a xlsx url", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData([
    "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/main/test/data/files/populations-one-sheet.xlsx",
  ]);
  const data = await table.getData();

  expect(data).toStrictEqual([
    { Country: "Canada", "Population (million)": 38 },
    { Country: "US", "Population (million)": 332 },
    { Country: "France", "Population (million)": 68 },
  ]);
  await sdb.close();
});

test("should load data from a xlsx file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/populations-one-sheet.xlsx"]);
  const data = await table.getData();

  expect(data).toStrictEqual([
    { Country: "Canada", "Population (million)": 38 },
    { Country: "US", "Population (million)": 332 },
    { Country: "France", "Population (million)": 68 },
  ]);
  await sdb.close();
});
test("should load data from a specific sheet in an xlsx file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/populations-two-sheets.xlsx", {
    sheet: "provinces",
  });
  const data = await table.getData();

  expect(data).toStrictEqual([
    { Provinces: "Quebec", "Population (million)": 8 },
    { Provinces: "Ontario", "Population (million)": 15 },
    { Provinces: "British Columbia", "Population (million)": 5 },
  ]);
  await sdb.close();
});
test("should load data from a specific sheet in an xlsx file and all as text", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/populations-two-sheets.xlsx", {
    sheet: "provinces",
    allText: true,
  });
  const data = await table.getData();

  expect(data).toStrictEqual([
    { Provinces: "Quebec", "Population (million)": "8.0" },
    { Provinces: "Ontario", "Population (million)": "15.0" },
    { Provinces: "British Columbia", "Population (million)": "5.0" },
  ]);
  await sdb.close();
});
test("should load data from a specific sheet in an xlsx file and all as text without a header", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/populations-two-sheets.xlsx", {
    sheet: "provinces",
    allText: true,
    header: false,
  });
  const data = await table.getData();

  expect(data).toStrictEqual([
    { A1: "Provinces", B1: "Population (million)" },
    { A1: "Quebec", B1: "8.0" },
    { A1: "Ontario", B1: "15.0" },
    { A1: "British Columbia", B1: "5.0" },
  ]);
  await sdb.close();
});

test("should load only specific columns from a CSV file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.csv"], {
    columns: ["key1"],
  });

  const data = await table.getData();

  expect(data).toStrictEqual([{ key1: "1" }, { key1: "3" }, { key1: "8" }, { key1: "brioche" }]);
  await sdb.close();
});

test("should load multiple specific columns from a CSV file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.csv"], {
    columns: ["key2", "key1"],
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key2: "2", key1: "1" },
    { key2: "coucou", key1: "3" },
    { key2: "10", key1: "8" },
    { key2: "croissant", key1: "brioche" },
  ]);
  await sdb.close();
});

test("should load only specific columns from a JSON file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.json"], {
    columns: ["key2"],
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key2: "un" },
    { key2: "deux" },
    { key2: "trois" },
    { key2: "quatre" },
  ]);
  await sdb.close();
});

test("should load only specific columns from a Parquet file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.parquet"], {
    columns: ["key1"],
  });

  const data = await table.getData();

  expect(data).toStrictEqual([{ key1: 1 }, { key1: 3 }, { key1: 8 }, { key1: 3 }]);
  await sdb.close();
});

test("empty columns array should load all columns (CSV)", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/data.csv"], {
    columns: [],
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: "1", key2: "2" },
    { key1: "3", key2: "coucou" },
    { key1: "8", key2: "10" },
    { key1: "brioche", key2: "croissant" },
  ]);
  await sdb.close();
});

test("invalid column name should throw a DuckDB error", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  await assertRejects(() =>
    table
      .loadData(["test/data/files/data.csv"], {
        columns: ["nonexistent_column"],
      })
      .run(),
  );

  await sdb.close();
});

test("combining columns with Excel files should throw an error", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  assertThrows(
    () =>
      table.loadData(["test/data/files/populations-one-sheet.xlsx"], {
        columns: ["Country"],
      }),
    Error,
    "columns",
  );

  await sdb.close();
});

test("combining columns with Excel files (by fileType) should throw an error", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  assertThrows(
    () =>
      table.loadData(["test/data/files/populations-one-sheet.xlsx"], {
        fileType: "excel",
        columns: ["Country"],
      }),
    Error,
    "columns",
  );

  await sdb.close();
});

test("should skip malformed rows with ignoreErrors and parse the rest normally", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataMalformedRows.csv", {
    ignoreErrors: true,
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: 1, key2: 2 },
    { key1: 5, key2: 6 },
  ]);

  await sdb.close();
});

test("should load newline-delimited JSON with jsonFormat", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataNewlineDelimited.ndjson", {
    fileType: "json",
    jsonFormat: "newlineDelimited",
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: 1, key2: "a" },
    { key1: 2, key2: "b" },
  ]);

  await sdb.close();
});

test("should load JSON records with the records option", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/data.json", {
    records: true,
  });

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: 1, key2: "un" },
    { key1: 2, key2: "deux" },
    { key1: 3, key2: "trois" },
    { key1: 4, key2: "quatre" },
  ]);

  await sdb.close();
});

test("loadData accepts JSON and vector column types", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "sda-fixture-"));
  const file = join(temporaryDirectory, "fixture.csv");
  const sdb = new SimpleDB();
  try {
    await nodeWriteFile(file, 'details|embedding\n"{""count"":3}"|[0.25,0.5,0.75]\n');
    const table = sdb.newTable().loadData(file, {
      delim: "|",
      columnTypes: { details: "JSON", embedding: "FLOAT[3]" },
    });
    expect(await table.getTypes()).toStrictEqual({
      details: "JSON",
      embedding: "FLOAT[3]",
    });
    expect(await table.getData()).toStrictEqual([
      {
        details: '{"count":3}',
        embedding: [0.25, 0.5, 0.75],
      },
    ]);
  } finally {
    await sdb.close();
    await nodeRm(temporaryDirectory, { recursive: true });
  }
});

test("loadData rejects geometry declarations before loading, regardless of strict mode", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ value: 1 }]);
    await table.getData();
    for (const type of ["GEOMETRY", "geometry('EPSG:4326')", "  GeOmEtRy('EPSG:3857')"]) {
      for (const strict of [undefined, true, false]) {
        for (const extension of ["csv", "json", "parquet", "xlsx"]) {
          const file = `unused.${extension}`;
          const options = { columnTypes: { geom: type }, strict };
          assertThrows(() => table.loadData(file, options), Error, "Use loadGeoData() instead.");
          assertThrows(
            () => loadDataQuery(table.name, [file], options),
            Error,
            "Use loadGeoData() instead.",
          );
        }
      }
    }
    expect(await table.getData()).toStrictEqual([{ value: 1 }]);
    expect(sdb.spatialLoaded).toStrictEqual(false);
  } finally {
    await sdb.close();
  }
});
