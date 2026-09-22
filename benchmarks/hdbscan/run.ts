import { cpus, totalmem } from "node:os";
import { dirname } from "node:path";

type Case = {
  rows: number;
  dimensions: number;
  metric: "euclidean" | "cosine";
  approximate: boolean;
  payload: "narrow" | "wide";
  minClusterSize: number;
  minSamples: number;
};
type Status =
  | "completed"
  | "time-limited"
  | "memory-limited"
  | "measurement-failed"
  | "failed";
type Result = Case & {
  publicMethodMilliseconds?: number;
  processHighWaterRssBytes?: number;
  peakRssBytes: number | null;
  elapsedMilliseconds: number;
  status: Status;
  phases: Record<string, unknown>[];
  error?: string;
  [key: string]: unknown;
};

const fullCases: Case[] = [
  {
    rows: 100_000,
    dimensions: 4,
    metric: "euclidean",
    approximate: true,
    payload: "narrow",
    minClusterSize: 25,
    minSamples: 15,
  },
  {
    rows: 100_000,
    dimensions: 128,
    metric: "cosine",
    approximate: true,
    payload: "narrow",
    minClusterSize: 25,
    minSamples: 15,
  },
  {
    rows: 100_000,
    dimensions: 128,
    metric: "euclidean",
    approximate: true,
    payload: "wide",
    minClusterSize: 25,
    minSamples: 15,
  },
  {
    rows: 100_000,
    dimensions: 4,
    metric: "euclidean",
    approximate: false,
    payload: "narrow",
    minClusterSize: 25,
    minSamples: 15,
  },
];
const quickCases: Case[] = [
  {
    rows: 128,
    dimensions: 4,
    metric: "euclidean",
    approximate: false,
    payload: "narrow",
    minClusterSize: 8,
    minSamples: 5,
  },
  {
    rows: 500,
    dimensions: 16,
    metric: "cosine",
    approximate: true,
    payload: "wide",
    minClusterSize: 12,
    minSamples: 8,
  },
];
const quick = Deno.args.includes("--quick");
const approximateOnly = Deno.args.includes("--approximate-only");
const repeatArgument = Deno.args.find((value) => value.startsWith("--repeat="));
const repetitions = Number(repeatArgument?.slice("--repeat=".length) ?? 1);
if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
  throw new Error("--repeat must be a positive integer.");
}
const outputArgument = Deno.args.find((value) => value.startsWith("--output="));
const output = outputArgument?.slice("--output=".length) ??
  new URL("../.work/hdbscan-results.json", import.meta.url).pathname;
const timeLimitMilliseconds = 10 * 60 * 1_000;
const memoryLimitBytes = 8 * 1024 ** 3;
const worker = new URL("worker.ts", import.meta.url);
const watchdog = new URL(
  "../hdbscan-feasibility/run_bounded.py",
  import.meta.url,
);

async function runCase(input: Case): Promise<Result> {
  const args = [
    "run",
    "-A",
    worker.pathname,
    "--rows",
    String(input.rows),
    "--dimensions",
    String(input.dimensions),
    "--metric",
    input.metric,
    "--approximate",
    String(input.approximate),
    "--payload",
    input.payload,
    "--min-cluster-size",
    String(input.minClusterSize),
    "--min-samples",
    String(input.minSamples),
  ];
  const boundedOutput = await new Deno.Command("python3", {
    args: [
      watchdog.pathname,
      "--timeout-seconds",
      String(timeLimitMilliseconds / 1_000),
      "--max-rss-bytes",
      String(memoryLimitBytes),
      "--",
      Deno.execPath(),
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const wrapperStderr = new TextDecoder().decode(boundedOutput.stderr).trim();
  const wrapperStdout = new TextDecoder().decode(boundedOutput.stdout).trim();
  if (!wrapperStdout) {
    throw new Error(
      `HDBSCAN watchdog produced no result.${
        wrapperStderr ? ` ${wrapperStderr}` : ""
      }`,
    );
  }
  const bounded = JSON.parse(wrapperStdout) as {
    status: Status;
    elapsedSeconds: number;
    peakRssBytes: number | null;
    rssSamples: number;
    measurementError: string | null;
    exitCode: number;
    stdout: string;
    stderr: string;
  };
  const phases: Record<string, unknown>[] = [];
  const errors: string[] = [];
  for (const line of bounded.stderr.split("\n").filter(Boolean)) {
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (typeof record.phase === "string") phases.push(record);
      else errors.push(line);
    } catch {
      errors.push(line);
    }
  }
  const elapsedMilliseconds = bounded.elapsedSeconds * 1_000;
  let peakRssBytes = bounded.peakRssBytes;
  if (bounded.status !== "completed") {
    return {
      ...input,
      peakRssBytes,
      elapsedMilliseconds,
      status: bounded.status,
      phases,
      error: [bounded.measurementError, ...errors].filter(Boolean).join("\n"),
      rssSamples: bounded.rssSamples,
      workerExitCode: bounded.exitCode,
    };
  }
  const record = JSON.parse(bounded.stdout) as Record<string, unknown>;
  const processHighWaterRssBytes =
    typeof record.processHighWaterRssBytes === "number"
      ? record.processHighWaterRssBytes
      : 0;
  peakRssBytes = Math.max(peakRssBytes ?? 0, processHighWaterRssBytes);
  return {
    ...input,
    ...record,
    peakRssBytes,
    elapsedMilliseconds,
    status: peakRssBytes > memoryLimitBytes ? "memory-limited" : "completed",
    phases,
    rssSamples: bounded.rssSamples,
  } as Result;
}

const hardware = {
  platform: `${Deno.build.os}-${Deno.build.arch}`,
  cpu: cpus()[0]?.model ?? "unavailable",
  logicalCpuCount: cpus().length,
  memoryBytes: totalmem(),
  denoVersion: Deno.version.deno,
  v8Version: Deno.version.v8,
};
const results: Result[] = [];
await Deno.mkdir(dirname(output), { recursive: true });
const cases = (quick ? quickCases : fullCases).filter((input) =>
  !approximateOnly || input.approximate
);
const sources = [
  "buildApproximateMutualReachabilityMst",
  "buildSparseMutualReachabilityMst",
  "buildVectorNeighbors",
  "vectorDistanceExpression",
  "stabilizeCosineVectors",
  "clusterHdbscan",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(sources.map(async (name) => {
    const bytes = await Deno.readFile(
      new URL(`../../src/helpers/${name}.ts`, import.meta.url),
    );
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return [
      name,
      Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    ];
  })),
);
for (const input of Array.from({ length: repetitions }, () => cases).flat()) {
  console.error(
    `hdbscan rows=${input.rows} dimensions=${input.dimensions} metric=${input.metric} approximate=${input.approximate} payload=${input.payload}`,
  );
  const result = await runCase(input);
  results.push(result);
  await Deno.writeTextFile(
    output,
    JSON.stringify(
      {
        hardware,
        quick,
        approximateOnly,
        repetitions,
        measuredAt: new Date().toISOString(),
        sourceHashes,
        threads: 8,
        scope:
          "public hdbscan() from numeric feature preparation through graph construction, hierarchy, scoring, and atomic publication",
        dataset: "deterministic eight-group trigonometric vectors",
        approximateConstants: {
          candidateNeighbors: "min(n-1,max(minSamples,64))",
          rerankingCandidates: "min(n,2*k+1)",
          hnsw: {
            efConstruction: 256,
            efSearch: "max(512,2*k)",
            M: 32,
            constructionThreads: 1,
            cosineRetrieval:
              "L2 on DOUBLE-normalized then FLOAT-cast unit vectors",
          },
          repair:
            "all members; min(dimensions,8) coordinate and 16 deterministic random projection sweeps",
        },
        timeLimitMilliseconds,
        memoryLimitBytes,
        rssSamplingMilliseconds: 250,
        results,
      },
      null,
      2,
    ) + "\n",
  );
  console.error(JSON.stringify(result));
}
console.log(output);
