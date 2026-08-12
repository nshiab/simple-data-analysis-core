import { SimpleDB } from "@nshiab/simple-data-analysis-core";

// We start a SimpleDB instance.
const sdb = new SimpleDB();

// We create a new table.
const provinces = sdb.newTable("provinces");
// We fetch the provinces' boundaries. It's a geoJSON.
// Like all transformation methods, this queues the work: it will
// run when an observer method (like log below) is awaited.
provinces.loadGeoData(
  "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/main/test/geodata/files/CanadianProvincesAndTerritories.json",
);

// Uncomment this line if you want to see the table.
// await provinces.log()

// We create a new table.
const fires = sdb.newTable("fires");
// We fetch the wildfires data (a CSV), then create point geometries
// from the lat and lon columns in the new column geom.
fires
  .loadData(
    "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/main/test/geodata/files/firesCanada2023.csv",
  )
  .points("lat", "lon", "geom");

// We match fires with provinces
// and we output the results into a new table.
// By default, joinGeo will automatically look
// for columns storing geometries in the tables,
// do a left join, and put the results
// in the left table.
const firesInsideProvinces = fires
  .joinGeo(provinces, "inside", {
    outputTable: "firesInsideProvinces",
  })
  // We remove fires that could not be matched.
  .removeMissing()
  // We summarize to count the number of fires
  // and sum up the area burnt in each province.
  .summarize({
    values: "hectares",
    categories: "nameEnglish",
    summaries: ["count", "sum"],
    decimals: 0,
  })
  // We rename columns.
  .renameColumns({
    count: "fireCount",
    sum: "burntArea",
  })
  // We want the province with
  // the greatest burnt area first.
  .sort({ burntArea: "desc" });

// We log the results. Awaiting this observer method executes
// everything queued above, fusing consecutive steps into as few
// queries as possible. By default, the method logs the first
// 10 rows, but we can specify the number of rows to log.
await firesInsideProvinces.log(12);

// We close everything.
await sdb.close();
