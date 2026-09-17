import { assertEquals } from "@std/assert";
import CurrentSimpleDB from "../../src/class/SimpleDB.ts";
import { type GraphWorkloadName, graphWorkloadQuery } from "./workloads.ts";

const pinnedBaseline = "be11e360ffedebc62192b2bc07ffa0b64a9e4197";
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
type GraphTable = {
  run(): Promise<unknown>;
  getData(): Promise<Record<string, unknown>[]>;
  getTypes(): Promise<Record<string, string>>;
  neighbors(...args: unknown[]): GraphTable;
  reachable(...args: unknown[]): GraphTable;
  distances(...args: unknown[]): GraphTable;
  shortestPath(...args: unknown[]): GraphTable;
  paths(...args: unknown[]): GraphTable;
  connectedComponents(...args: unknown[]): GraphTable;
  degree(...args: unknown[]): GraphTable;
  commonNeighbors(...args: unknown[]): GraphTable;
  findCycles(...args: unknown[]): GraphTable;
  topologicalSort(...args: unknown[]): GraphTable;
};
type GraphDatabase = {
  newTable(name?: string): GraphTable;
  customQuery(
    query: string,
    options?: { returnData?: boolean },
  ): Promise<Record<string, unknown>[] | void>;
  close(): Promise<void>;
};
type GraphDatabaseConstructor = new () => GraphDatabase;
type Profile = {
  query_name: string;
  latency: number;
};
type BaselineObservation = {
  method: Method;
  variant: Variant;
  shape: string;
  nodes: number;
  iteration: number;
  rows: number;
  profilePath: string;
};
type BaselineObservations = {
  iterations: number;
  observations: BaselineObservation[];
};
type Measurement = {
  data: Record<string, unknown>[];
  milliseconds: number;
  query: string;
  queryMilliseconds: number;
  types: Record<string, string>;
};

const settings = new Map<string, string>();
for (const argument of Deno.args) {
  const match = /^--([a-z-]+)=(.+)$/.exec(argument);
  if (match === null) {
    throw new Error(`Expected --name=value, received ${argument}`);
  }
  if (
    !["baseline-root", "baseline-observations", "iterations"].includes(match[1])
  ) {
    throw new Error(`Unknown option --${match[1]}`);
  }
  settings.set(match[1], match[2]);
}
const baselineRoot = settings.get("baseline-root");
const baselineObservationsPath = settings.get("baseline-observations");
if (baselineRoot === undefined || baselineObservationsPath === undefined) {
  throw new Error(
    "Supply --baseline-root and --baseline-observations for the pinned baseline.",
  );
}
const iterations = Number(settings.get("iterations") ?? 5);
if (!Number.isSafeInteger(iterations) || iterations < 3) {
  throw new Error("--iterations must be a safe integer of at least 3.");
}

// Verify the archive before importing it: a label in the report cannot establish
// which implementation ran. Git hashes include the complete source bytes.
const baselineDirectory = await Deno.realPath(baselineRoot);
const tree = await new Deno.Command("git", {
  args: [
    "ls-tree",
    "-r",
    pinnedBaseline,
    "--",
    "src",
    "deno.json",
    "deno.lock",
  ],
}).output();
if (!tree.success) throw new Error("Cannot read the pinned baseline Git tree.");
const files = new TextDecoder().decode(tree.stdout).trim().split("\n").map(
  (line) => {
    const match = /^100644 blob ([a-f0-9]+)\t(.+)$/.exec(line);
    if (match === null) throw new Error(`Unexpected baseline entry: ${line}`);
    return { hash: match[1], path: match[2] };
  },
);
const hashes = await new Deno.Command("git", {
  args: [
    "hash-object",
    "--",
    ...files.map(({ path }) => `${baselineDirectory}/${path}`),
  ],
}).output();
if (!hashes.success) {
  throw new Error("Cannot hash the extracted baseline files.");
}
assertEquals(
  new TextDecoder().decode(hashes.stdout).trim().split("\n"),
  files.map(({ hash }) => hash),
  "Extracted baseline source/configuration differs from the pinned commit.",
);
const baselineModuleUrl = new URL("file:///");
baselineModuleUrl.pathname = `${baselineDirectory}/src/class/SimpleDB.ts`;
const CurrentDatabase = CurrentSimpleDB as unknown as GraphDatabaseConstructor;
const baseline = JSON.parse(
  await Deno.readTextFile(baselineObservationsPath),
) as BaselineObservations;
if (baseline.iterations !== 1 || baseline.observations.length !== 57) {
  throw new Error(
    "The authoritative baseline must contain 57 cases from one iteration.",
  );
}

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

// A length check alone would accept duplicated cases and silently miss others.
const expectedCases = methods.flatMap((method) =>
  variants(method).flatMap((variant) =>
    [
      ["deep-chain", 128],
      ["branching", 127],
      [method === "topologicalSort" ? "dense-dag" : "dense", 7],
    ].map(([shape, nodes]) => `${method}/${variant}/${shape}/${nodes}/0`)
  )
).sort();
assertEquals(
  baseline.observations.map(({ method, variant, shape, nodes, iteration }) =>
    `${method}/${variant}/${shape}/${nodes}/${iteration}`
  ).sort(),
  expectedCases,
  "Baseline observations must contain every approved case exactly once.",
);
const BaselineSimpleDB = (await import(baselineModuleUrl.href))
  .default as unknown as GraphDatabaseConstructor;

function invoke(
  source: GraphTable,
  method: Method,
  variant: Variant,
  end: number,
  outputTable: string,
): GraphTable {
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
      return source.findCycles("source", "target", "edgeId", {
        ...weighted,
        direction: variant === "incoming" || variant === "both"
          ? variant
          : "outgoing",
      });
    case "topologicalSort":
      return source.topologicalSort("source", "target", options);
  }
}

function median(values: number[]): number {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measure(
  Database: GraphDatabaseConstructor,
  method: Method,
  variant: Variant,
  shape: GraphWorkloadName,
  nodes: number,
  profilePath: string,
): Promise<Measurement> {
  const sdb = new Database();
  try {
    await sdb.customQuery("SET threads=1; SET memory_limit='1GB'");
    const fixture = graphWorkloadQuery(shape, nodes);
    const denseDag = method === "topologicalSort" && shape === "dense";
    await sdb.customQuery(
      `CREATE TABLE graph_input AS ${
        denseDag ? `SELECT * FROM (${fixture}) WHERE source < target` : fixture
      }`,
    );
    const source = sdb.newTable("graph_input");
    await invoke(source, method, variant, nodes - 1, "warm_result").run();
    await sdb.customQuery("SET enable_profiling='json'");
    await sdb.customQuery(
      `SET profiling_output='${profilePath.replaceAll("'", "''")}'`,
    );
    const started = performance.now();
    const result = invoke(
      source,
      method,
      variant,
      nodes - 1,
      "measured_result",
    );
    await result.run();
    const milliseconds = performance.now() - started;
    const profile = JSON.parse(await Deno.readTextFile(profilePath)) as Profile;
    await sdb.customQuery("SET enable_profiling='no_output'");
    return {
      data: await result.getData(),
      milliseconds,
      query: profile.query_name,
      queryMilliseconds: profile.latency * 1000,
      types: await result.getTypes(),
    };
  } finally {
    await sdb.close();
  }
}

const workDirectory = "benchmarks/.work/graphs/static-baseline-comparison";
await Deno.mkdir(workDirectory, { recursive: true });
const observationsPath = await Deno.realPath(baselineObservationsPath);
const observationsDirectory = observationsPath.slice(
  0,
  observationsPath.lastIndexOf("/"),
);
const report: Record<string, unknown>[] = [];

for (const observation of baseline.observations) {
  const shape = observation.shape === "dense-dag"
    ? "dense"
    : observation.shape as GraphWorkloadName;
  if (!methods.includes(observation.method)) {
    throw new Error(`Unknown baseline method ${observation.method}`);
  }
  if (!variants(observation.method).includes(observation.variant)) {
    throw new Error(
      `Unknown baseline variant ${observation.method}/${observation.variant}`,
    );
  }
  const profileName = observation.profilePath.split("/").at(-1)!;
  const pinnedProfile = JSON.parse(
    await Deno.readTextFile(`${observationsDirectory}/${profileName}`),
  ) as Profile;
  const currentTimes: number[] = [];
  const currentQueryTimes: number[] = [];
  const baselineTimes: number[] = [];
  const baselineQueryTimes: number[] = [];
  let firstBaseline: Measurement | undefined;

  for (let iteration = 0; iteration < iterations; iteration++) {
    const order = iteration % 2 === 0
      ? ["baseline", "current"] as const
      : ["current", "baseline"] as const;
    for (const version of order) {
      const measurement = await measure(
        version === "baseline" ? BaselineSimpleDB : CurrentDatabase,
        observation.method,
        observation.variant,
        shape,
        observation.nodes,
        `${workDirectory}/${observation.method}-${observation.variant}-${observation.shape}-${version}-${iteration}.json`,
      );
      firstBaseline ??= measurement; // The first iteration runs baseline first.
      const context =
        `${observation.method}/${observation.variant}/${observation.shape}/${version}/${iteration}`;
      assertEquals(
        measurement.data,
        firstBaseline.data,
        `${context}: ordered values`,
      );
      assertEquals(
        measurement.types,
        firstBaseline.types,
        `${context}: output types`,
      );
      assertEquals(
        measurement.data.length,
        observation.rows,
        `${context}: pinned row count`,
      );
      assertEquals(
        measurement.query,
        pinnedProfile.query_name,
        `${context}: full pinned SQL`,
      );
      if (version === "baseline") {
        baselineTimes.push(measurement.milliseconds);
        baselineQueryTimes.push(measurement.queryMilliseconds);
      } else {
        currentTimes.push(measurement.milliseconds);
        currentQueryTimes.push(measurement.queryMilliseconds);
      }
    }
  }
  const baselineMedian = median(baselineTimes);
  const currentMedian = median(currentTimes);
  const comparison = {
    method: observation.method,
    variant: observation.variant,
    shape: observation.shape,
    nodes: observation.nodes,
    rows: observation.rows,
    dataExact: true,
    typesExact: true,
    baselineSqlMatchesPinned: true,
    currentSqlMatchesPinned: true,
    checkedMeasurements: iterations * 2,
    baselineMedianMilliseconds: baselineMedian,
    currentMedianMilliseconds: currentMedian,
    operationMedianRatio: currentMedian / baselineMedian,
    baselineQueryMedianMilliseconds: median(baselineQueryTimes),
    currentQueryMedianMilliseconds: median(currentQueryTimes),
  };
  report.push(comparison);
  console.log(JSON.stringify(comparison));
}

await Deno.writeTextFile(
  `${workDirectory}/comparison.json`,
  `${
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        pinnedBaseline,
        iterations,
        interleaving: "alternating baseline/current first",
        cases: report,
      },
      null,
      2,
    )
  }\n`,
);
console.log(
  `Compared ${report.length} static cases exactly against ${pinnedBaseline}.`,
);
