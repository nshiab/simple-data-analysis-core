import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { parsePeakMemoryMB, rotateValues } from "../helpers.ts";
import { type Environment, type Observation, writeReport } from "./report.ts";
import { workloads } from "./workloads.ts";

let iterations = 3;
let rows: number | undefined;
for (const argument of Deno.args) {
  const match = argument.match(/^--(iterations|rows)=(\d+)$/);
  if (
    !match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) < 1
  ) {
    throw new Error(
      `Expected --iterations=<positive integer> or --rows=<positive integer>; received ${argument}`,
    );
  }
  if (match[1] === "iterations") iterations = Number(match[2]);
  else rows = Number(match[2]);
}
if (Deno.build.os !== "darwin") {
  throw new Error(
    "Operation benchmarks require macOS /usr/bin/time -l for peak RSS, like the existing benchmark command.",
  );
}
const root = new URL("../../", import.meta.url);
const configPath = fileURLToPath(new URL("deno.json", root));
const config = JSON.parse(await Deno.readTextFile(configPath)) as {
  version: string;
  imports: Record<string, string>;
};
const environment: Environment = {
  date: new Date().toISOString().slice(0, 10),
  cpu: cpus()[0]?.model ?? "unknown CPU",
  os: Deno.build.os,
  arch: Deno.build.arch,
  deno: Deno.version.deno,
  core: config.version,
  duckdb: "",
  nodeAPI: config.imports["@duckdb/node-api"],
};
const observations: Observation[] = [];
const output = new URL("benchmarks/.work/operations.json", root);
await Deno.mkdir(new URL("benchmarks/.work/", root), { recursive: true });
for (const workload of workloads) {
  for (let iteration = 1; iteration <= iterations; iteration++) {
    for (
      const implementation of rotateValues(
        ["core", "duckdb"] as ("core" | "duckdb")[],
        iteration - 1,
      )
    ) {
      console.log(
        `${workload.name}: ${implementation} (${iteration}/${iterations})`,
      );
      const child = await new Deno.Command("/usr/bin/time", {
        args: [
          "-l",
          Deno.execPath(),
          "run",
          "-A",
          `--config=${configPath}`,
          fileURLToPath(new URL("worker.ts", import.meta.url)),
          implementation,
          workload.name,
          String(rows ?? workload.rows),
        ],
        cwd: fileURLToPath(root),
        stdout: "piped",
        stderr: "piped",
      }).output();
      const stderr = new TextDecoder().decode(child.stderr);
      if (!child.success) throw new Error(stderr);
      const peakMemoryMB = parsePeakMemoryMB(stderr);
      if (peakMemoryMB === null) throw new Error(`Missing peak RSS: ${stderr}`);
      const sample = JSON.parse(new TextDecoder().decode(child.stdout)) as {
        milliseconds: number;
        duckdbVersion: string;
      };
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
      await Deno.writeTextFile(
        output,
        JSON.stringify({ environment, observations }, null, 2) + "\n",
      );
    }
  }
}
const readme = new URL("README.md", root);
await writeReport(readme, observations);
console.log(
  `Updated Core README operation tables. Raw observations: ${
    fileURLToPath(output)
  }`,
);
