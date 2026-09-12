import SimpleDB from "../../src/class/SimpleDB.ts";
import type SimpleTable from "../../src/class/SimpleTable.ts";
import { graphWorkloadQuery } from "./workloads.ts";

const methods = [
  "neighbors",
  "reachable",
  "distances",
  "shortestPath",
  "paths",
  "connectedComponents",
  "degree",
  "commonNeighbors",
  "findCycles",
  "topologicalSort",
] as const;
type Method = typeof methods[number];
type Variant =
  | "default"
  | "weighted"
  | "neighbors"
  | "strong"
  | "incoming"
  | "both";
type Profile = {
  query_name: string;
  latency: number;
  cumulative_rows_scanned: number;
  system_peak_buffer_memory: number;
  system_peak_temp_dir_size: number;
};

const settings = new Map<string, string>();
for (const argument of Deno.args) {
  const match = /^--([a-z-]+)=(.+)$/.exec(argument);
  if (match === null) {
    throw new Error(`Expected --name=value, received ${argument}`);
  }
  if (
    !["iterations", "methods", "chain-nodes", "branch-nodes", "dense-nodes"]
      .includes(match[1])
  ) {
    throw new Error(`Unknown option --${match[1]}`);
  }
  settings.set(match[1], match[2]);
}
function integerSetting(
  name: string,
  fallback: number,
  minimum: number,
): number {
  const value = Number(settings.get(name) ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`--${name} must be an integer >= ${minimum}.`);
  }
  return value;
}
const iterations = integerSetting("iterations", 3, 1);
const selected = settings.has("methods")
  ? settings.get("methods")!.split(",")
  : [...methods];
for (const method of selected) {
  if (!(methods as readonly string[]).includes(method)) {
    throw new Error(`Unknown method ${method}`);
  }
}
const shapes = [
  { name: "deep-chain", nodes: integerSetting("chain-nodes", 128, 2) },
  { name: "branching", nodes: integerSetting("branch-nodes", 127, 2) },
  { name: "dense", nodes: integerSetting("dense-nodes", 7, 2) },
] as const;
const directory = "benchmarks/.work/graphs";
await Deno.mkdir(directory, { recursive: true });
const observations: Record<string, unknown>[] = [];
let duckdbVersion = "";

function variants(method: Method): Variant[] {
  if (["distances", "shortestPath", "paths"].includes(method)) {
    return ["default", "weighted"];
  }
  if (method === "connectedComponents") return ["default", "strong"];
  if (method === "degree") return ["default", "neighbors", "weighted"];
  if (method === "findCycles") {
    return ["default", "incoming", "both", "weighted"];
  }
  return ["default"];
}

function invoke(
  source: SimpleTable,
  method: Method,
  variant: Variant,
  end: number,
  outputTable: string,
): SimpleTable {
  const options = { outputTable };
  const weighted = {
    outputTable,
    weight: variant === "weighted" ? "weight" : undefined,
  };
  switch (method) {
    case "neighbors":
      return source.neighbors("source", "target", 0, options);
    case "reachable":
      return source.reachable("source", "target", 0, options);
    case "distances":
      return source.distances("source", "target", 0, weighted);
    case "shortestPath":
      return source.shortestPath(
        "source",
        "target",
        "edgeId",
        0,
        end,
        weighted,
      );
    case "paths":
      return source.paths("source", "target", "edgeId", 0, end, weighted);
    case "connectedComponents":
      return source.connectedComponents("source", "target", {
        ...options,
        mode: variant === "strong" ? "strong" : "weak",
      });
    case "degree":
      return source.degree("source", "target", {
        ...weighted,
        count: variant === "neighbors" ? "neighbors" : "edges",
      });
    case "commonNeighbors":
      return source.commonNeighbors("source", "target", 0, 1, options);
    case "findCycles":
      return source.findCycles(
        "source",
        "target",
        "edgeId",
        variant === "incoming" || variant === "both" ? variant : "outgoing",
        weighted,
      );
    case "topologicalSort":
      return source.topologicalSort("source", "target", options);
  }
}

for (const selectedMethod of selected) {
  const method = selectedMethod as Method;
  for (const variant of variants(method)) {
    for (const shape of shapes) {
      for (let iteration = 0; iteration < iterations; iteration++) {
        const sdb = new SimpleDB();
        try {
          await sdb.customQuery("SET threads=1; SET memory_limit='1GB'");
          if (duckdbVersion === "") {
            const version = await sdb.customQuery(
              "SELECT version() AS version",
              { returnData: true },
            );
            duckdbVersion = String(version?.[0].version);
          }
          const source = sdb.newTable("graph_input");
          const fixture = graphWorkloadQuery(shape.name, shape.nodes);
          const denseDag = method === "topologicalSort" &&
            shape.name === "dense";
          await sdb.customQuery(
            `CREATE TABLE graph_input AS ${
              denseDag
                ? `SELECT * FROM (${fixture}) WHERE source < target`
                : fixture
            }`,
          );
          await invoke(source, method, variant, shape.nodes - 1, "warm_result")
            .run();
          const profilePath =
            `${directory}/${method}-${variant}-${shape.name}-${iteration}.json`;
          await sdb.customQuery("SET enable_profiling='json'");
          await sdb.customQuery(`SET profiling_output='${profilePath}'`);
          const started = performance.now();
          const result = invoke(
            source,
            method,
            variant,
            shape.nodes - 1,
            "measured_result",
          );
          await result.run();
          const milliseconds = performance.now() - started;
          const profile = JSON.parse(
            await Deno.readTextFile(profilePath),
          ) as Profile;
          if (
            !profile.query_name.startsWith(
              'CREATE OR REPLACE TABLE "measured_result"',
            )
          ) {
            throw new Error(
              `Expected graph materialization profile in ${profilePath}`,
            );
          }
          await sdb.customQuery("SET enable_profiling='no_output'");
          const observation = {
            method,
            variant,
            shape: denseDag ? "dense-dag" : shape.name,
            nodes: shape.nodes,
            iteration,
            rows: await result.getRowCount(),
            milliseconds,
            enginePeakBufferBytes: profile.system_peak_buffer_memory,
            enginePeakTempBytes: profile.system_peak_temp_dir_size,
            cumulativeRowsScanned: profile.cumulative_rows_scanned,
            processRssAfter: Deno.memoryUsage().rss,
            queryMilliseconds: profile.latency * 1000,
            profilePath,
          };
          observations.push(observation);
          console.log(JSON.stringify(observation));
        } finally {
          await sdb.close();
        }
      }
    }
  }
}
await Deno.writeTextFile(
  `${directory}/observations.json`,
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      environment: {
        deno: Deno.version.deno,
        duckdb: duckdbVersion,
        os: Deno.build.os,
        arch: Deno.build.arch,
        threads: 1,
        memoryLimit: "1GB",
      },
      iterations,
      observations,
    },
    null,
    2,
  ) + "\n",
);
