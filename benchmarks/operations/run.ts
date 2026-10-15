import { mkdir, writeFile } from "node:fs/promises";
import pkg from "../../package.json" with { type: "json" };
import execute from "../execute.ts";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { parsePeakMemoryMB, rotateValues } from "../helpers.ts";
import { type Environment, type Observation, writeReport } from "./report.ts";
import { workloads } from "./workloads.ts";

let iterations = 3;
let rows: number | undefined;
for (const argument of process.argv.slice(2)) {
  const match = argument.match(/^--(iterations|rows)=(\d+)$/);
  if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) < 1) {
    throw new Error(
      `Expected --iterations=<positive integer> or --rows=<positive integer>; received ${argument}`,
    );
  }
  if (match[1] === "iterations") iterations = Number(match[2]);
  else rows = Number(match[2]);
}
if (process.platform !== "darwin") {
  throw new Error(
    "Operation benchmarks require macOS /usr/bin/time -l for peak RSS, like the existing benchmark command.",
  );
}
const root = new URL("../../", import.meta.url);
const environment: Environment = {
  date: new Date().toISOString().slice(0, 10),
  cpu: cpus()[0]?.model ?? "unknown CPU",
  os: process.platform,
  arch: process.arch,
  node: process.versions.node,
  core: pkg.version,
  duckdb: "",
  nodeAPI: pkg.dependencies["@duckdb/node-api"],
};
const observations: Observation[] = [];
const implementations: ("core" | "duckdb")[] = ["core", "duckdb"];
const output = new URL("benchmarks/.work/operations.json", root);
await mkdir(new URL("benchmarks/.work/", root), { recursive: true });
for (const workload of workloads) {
  for (let iteration = 1; iteration <= iterations; iteration++) {
    for (const implementation of rotateValues(implementations, iteration - 1)) {
      console.log(`${workload.name}: ${implementation} (${iteration}/${iterations})`);
      const child = await execute(
        "/usr/bin/time",
        [
          "-l",
          process.execPath,
          fileURLToPath(new URL("worker.ts", import.meta.url)),
          implementation,
          workload.name,
          String(rows ?? workload.rows),
        ],
        { cwd: fileURLToPath(root) },
      );
      const stderr = child.stderr;
      if (!child.success) throw new Error(stderr);
      const peakMemoryMB = parsePeakMemoryMB(stderr);
      if (peakMemoryMB === null) throw new Error(`Missing peak RSS: ${stderr}`);
      const sample: unknown = JSON.parse(child.stdout);
      if (
        typeof sample !== "object" ||
        sample === null ||
        !("milliseconds" in sample) ||
        typeof sample.milliseconds !== "number" ||
        !("duckdbVersion" in sample) ||
        typeof sample.duckdbVersion !== "string"
      ) {
        throw new Error("Invalid benchmark worker result");
      }
      if (environment.duckdb && environment.duckdb !== sample.duckdbVersion) {
        throw new Error("DuckDB versions differ between implementations");
      }
      environment.duckdb = sample.duckdbVersion;
      observations.push({
        workload: workload.name,
        implementation,
        rows: rows ?? workload.rows,
        iteration,
        milliseconds: sample.milliseconds,
        peakMemoryMB,
      });
      await writeFile(output, JSON.stringify({ environment, observations }, null, 2) + "\n");
    }
  }
}
const readme = new URL("README.md", root);
await writeReport(readme, observations);
console.log(`Updated Core README operation tables. Raw observations: ${fileURLToPath(output)}`);
