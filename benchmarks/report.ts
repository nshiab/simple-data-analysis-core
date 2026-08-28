import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Aggregate,
  aggregateObservations,
  observationsFromCSV,
} from "./helpers.ts";

const benchmarkDir = dirname(fileURLToPath(import.meta.url));

export const benchmarkResultsStart = "<!-- benchmark-results:start -->";
export const benchmarkResultsEnd = "<!-- benchmark-results:end -->";

function percentageDifference(relativeToBaseline: number): string {
  const percentage = (relativeToBaseline - 1) * 100;
  if (Math.abs(percentage) < 0.05) return "baseline";
  return `${percentage > 0 ? "+" : ""}${percentage.toFixed(1)}%`;
}

function versionDetails(row: Aggregate): {
  library: string;
  runtime: string;
} {
  const runtimeMatch = row.version.match(/\/(deno|python|R)@([^/]+)$/);
  const libraryVersion = runtimeMatch?.index === undefined
    ? row.version
    : row.version.slice(0, runtimeMatch.index);
  let library: string;
  const duckDBMatch = libraryVersion.match(
    /^(@[^@]+)@([^/]+)\/duckdb@(.+)$/,
  );
  if (duckDBMatch !== null) {
    library = `${duckDBMatch[1]} ${duckDBMatch[2]}; DuckDB ${duckDBMatch[3]}`;
  } else {
    const separator = libraryVersion.lastIndexOf("@");
    if (separator <= 0) {
      library = row.implementation === "local"
        ? `SDA-core ${libraryVersion}`
        : libraryVersion;
    } else {
      const name = libraryVersion.slice(0, separator);
      const version = libraryVersion.slice(separator + 1);
      library = `${name === "geopandas" ? "GeoPandas" : name} ${version}`;
    }
  }
  if (runtimeMatch === null) {
    return { library, runtime: "—" };
  }
  const name = runtimeMatch[1];
  const version = runtimeMatch[2];
  const runtimeName: { [key: string]: string } = {
    deno: "Deno",
    python: "Python",
    R: "R",
  };
  return {
    library,
    runtime: `${runtimeName[name] ?? name} ${version}`,
  };
}

function table(rows: Aggregate[]): string {
  const sdaCore = rows.find((row) => row.implementation === "local");
  if (rows.length > 0 && sdaCore === undefined) {
    throw new Error("Cannot render benchmark results without SDA-core.");
  }
  const baselineDuration = sdaCore?.meanSeconds ?? 1;
  const baselineMemory = sdaCore?.meanPeakMemoryMB ?? 1;
  const orderedRows = [...rows].sort((left, right) =>
    left.meanSeconds - right.meanSeconds
  );
  const headers = [
    "Library version",
    "Runtime",
    "Mean duration",
    "Duration difference",
    "Mean peak memory",
    "Memory difference",
  ];
  const values = orderedRows.map((row) => {
    const versions = versionDetails(row);
    return [
      versions.library,
      versions.runtime,
      `${row.meanSeconds.toFixed(2)} ± ${row.stdDevSeconds.toFixed(2)} s`,
      percentageDifference(row.meanSeconds / baselineDuration),
      `${Math.round(row.meanPeakMemoryMB).toLocaleString("en-US")} MB`,
      percentageDifference(
        row.meanPeakMemoryMB / baselineMemory,
      ),
    ];
  });
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...values.map((row) => row[column].length))
  );
  const formatRow = (row: string[]): string =>
    `| ${
      row.map((cell, column) =>
        column <= 1
          ? cell.padEnd(widths[column])
          : cell.padStart(widths[column])
      ).join(" | ")
    } |`;
  const separator = widths.map((width, column) =>
    column <= 1 ? "-".repeat(width) : `${"-".repeat(width - 1)}:`
  );
  return [formatRow(headers), formatRow(separator), ...values.map(formatRow)]
    .join("\n");
}

export function renderBenchmarkResults(rows: Aggregate[]): string {
  return (["tabular", "spatial"] as const).map((benchmark) => {
    const benchmarkRows = rows.filter((row) => row.benchmark === benchmark);
    const heading = benchmark === "tabular"
      ? "Tabular workload"
      : "Spatial workload";
    return `### ${heading}\n\n${table(benchmarkRows)}`;
  }).join("\n\n");
}

export function replaceBenchmarkResults(
  readme: string,
  results: string,
): string {
  const start = readme.indexOf(benchmarkResultsStart);
  const end = readme.indexOf(benchmarkResultsEnd);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      "README benchmark result markers are missing or out of order.",
    );
  }
  const contentStart = start + benchmarkResultsStart.length;
  return `${readme.slice(0, contentStart)}\n\n${results.trim()}\n\n${
    readme.slice(end)
  }`;
}

export async function generateBenchmarkReport(
  resultsPath: string,
  readmePath = join(benchmarkDir, "..", "README.md"),
): Promise<void> {
  const observations = observationsFromCSV(
    await Deno.readTextFile(resultsPath),
  );
  const aggregates = aggregateObservations(observations);
  const readme = await Deno.readTextFile(readmePath);
  await Deno.writeTextFile(
    readmePath,
    replaceBenchmarkResults(readme, renderBenchmarkResults(aggregates)),
  );
}
