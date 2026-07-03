/**
 * Benchmark runner reproducing the scenario from
 * https://github.com/nshiab/simple-data-analysis-benchmarks
 * against the local core source, so each roadmap phase (issue #78)
 * can be compared against the Phase 0 baseline.
 *
 * Expects the data files from the benchmarks repo. By default it looks for
 * them in a sibling checkout (../simple-data-analysis-benchmarks/data), but
 * you can pass another directory as the first argument. The second argument
 * is a label appended to the result file names, so runs from different
 * phases don't overwrite each other:
 *
 * ```bash
 * deno run -A benchmarks/bench.ts [dataDir] [label]
 * ```
 *
 * Results are written to benchmarks/results/ and a summary is printed.
 */

import SimpleDB from "../src/class/SimpleDB.ts";

const dataDir = Deno.args[0] ?? "../simple-data-analysis-benchmarks/data";
const label = Deno.args[1] ??
  new Date().toISOString().slice(0, 16).replaceAll(":", "-");
const outputDir = "benchmarks/output";
const resultsDir = "benchmarks/results";
const iterations = 10;

await Deno.mkdir(outputDir, { recursive: true });
await Deno.mkdir(resultsDir, { recursive: true });

const versionDb = new SimpleDB();
const duckDbVersion =
  (await versionDb.customQuery("SELECT version() AS version;", {
    returnDataFrom: "query",
  }) as { version: string }[])[0].version;
await versionDb.done();

const { name: coreName, version: coreVersion } = JSON.parse(
  await Deno.readTextFile(
    new URL("../deno.json", import.meta.url),
  ),
) as { name: string; version: string };

const runtime = `deno@${Deno.version.deno}`;
const version = `${coreName.replace("@nshiab/", "")}@${coreVersion}`;

console.log("Runtime:", runtime);
console.log("Core:", version);
console.log("DuckDB:", duckDbVersion);
console.log("Iterations:", iterations);

async function benchmark(file: string, jsRoundTrip: boolean) {
  const results: {
    version: string;
    runtime: string;
    file: string;
    iteration: number;
    importing: number;
    cleaning: number;
    modifying: number;
    writing: number;
    gettingData: number | null;
    updatingWithJS: number | null;
    summarizing: number;
    totalDuration: number;
  }[] = [];

  for (let i = 0; i < iterations; i++) {
    console.log("Iteration", i);
    const startTotal = Date.now();
    const sdb = new SimpleDB();
    const table = sdb.newTable();

    // Loading
    const startImporting = Date.now();
    await table.loadData(`${dataDir}/${file}`, { allText: true });
    const importing = (Date.now() - startImporting) / 1000;

    // Cleaning
    const startCleaning = Date.now();
    await table.selectColumns(["time", "station", "station_name", "tas"]);
    await table.removeMissing({ columns: "tas" });
    await table.convert({ tas: "double", time: "date" });
    const cleaning = (Date.now() - startCleaning) / 1000;

    // Modifying
    const startModifying = Date.now();
    await table.addColumn("decade", "integer", `FLOOR(YEAR(time) / 10)*10`);
    const modifying = (Date.now() - startModifying) / 1000;

    // Writing clean data
    const startWriting = Date.now();
    await table.writeData(
      `${outputDir}/${runtime}-${version}-${file.split(".")[0]}.csv`,
    );
    const writing = (Date.now() - startWriting) / 1000;

    // Getting data as JS objects (full read path: DuckDB -> JS)
    // and updating with JS (read path + loadArray write-back).
    // Skipped for the big file: getData() on 21M rows currently crashes
    // with a V8 out-of-memory error (see BASELINE.md).
    let gettingData: number | null = null;
    let updatingWithJS: number | null = null;
    if (jsRoundTrip) {
      const startGettingData = Date.now();
      await table.getData();
      gettingData = (Date.now() - startGettingData) / 1000;

      const startUpdatingWithJS = Date.now();
      await table.updateWithJS((rows) => rows.map((d) => ({ ...d })));
      updatingWithJS = (Date.now() - startUpdatingWithJS) / 1000;
    }

    // Summarizing
    const startSummarizing = Date.now();
    await table.summarize({
      values: "tas",
      categories: ["station", "station_name", "decade"],
      summaries: "mean",
    });
    const summarizing = (Date.now() - startSummarizing) / 1000;

    const totalDuration = (Date.now() - startTotal) / 1000;
    console.log("Total duration", totalDuration, "sec");

    results.push({
      version,
      runtime,
      file,
      iteration: i,
      importing,
      cleaning,
      modifying,
      writing,
      gettingData,
      updatingWithJS,
      summarizing,
      totalDuration,
    });

    // Writing the final data to ensure it works as expected
    await table.writeData(
      `${outputDir}/${runtime}-${version}-${file.split(".")[0]}-summarized.csv`,
    );

    await sdb.done();
  }

  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray(results);
  await table.writeData(
    `${resultsDir}/${runtime}-${version}-${file.split(".")[0]}-${label}.csv`,
  );
  await sdb.done();

  // Summary: mean and standard deviation per step
  const steps = [
    "importing",
    "cleaning",
    "modifying",
    "writing",
    "gettingData",
    "updatingWithJS",
    "summarizing",
    "totalDuration",
  ] as const;
  console.log(`\nSummary for ${file} (${iterations} iterations, seconds):`);
  for (const step of steps) {
    const values = results.map((r) => r[step]).filter((v) => v !== null);
    if (values.length === 0) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
    );
    console.log(
      `${step}: mean ${mean.toFixed(3)}, stdDev ${stdDev.toFixed(3)}`,
    );
  }
}

console.log("\nahccd-sample.csv");
await benchmark("ahccd-sample.csv", true);

console.log("\nahccd.csv");
await benchmark("ahccd.csv", false);
