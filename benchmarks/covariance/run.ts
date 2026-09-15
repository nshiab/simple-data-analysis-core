import { dirname } from "node:path";
import { cpus, totalmem } from "node:os";

type Result = {
  rows: number;
  dimensions: number;
  covarianceMilliseconds: number;
  matrixMilliseconds: number;
  distanceMilliseconds: number;
  afterCovarianceRssBytes: number;
  sourceVectorPayloadBytes: number;
  modelMatrixBytes: number;
  refactorMatrixBytes: number;
  temporaryWhiteningBytes: number;
  nativeWhiteningPayloadBytes: number;
  nativeCenteredPayloadBytes: number;
  factorTransientPeakMatrixBytes: number;
  reciprocalCondition: number;
  finiteDistances: number;
  relativeIdentityError: number;
  duckdbVersion: string;
  peakRssBytes: number;
  elapsedMilliseconds: number;
  status: "completed" | "time-limited" | "memory-limited" | "failed";
  error?: string;
};

const fullCases = [
  { rows: 100_000, dimensions: 8 },
  { rows: 20_000, dimensions: 32 },
  { rows: 4_096, dimensions: 128 },
  { rows: 1_536, dimensions: 384 },
  { rows: 1_024, dimensions: 768 },
  { rows: 2_048, dimensions: 1_536 },
];
const quickCases = [
  { rows: 500, dimensions: 8 },
  { rows: 600, dimensions: 32 },
];
const quick = Deno.args.includes("--quick");
const outputArgument = Deno.args.find((argument) =>
  argument.startsWith("--output=")
);
const output = outputArgument?.slice("--output=".length) ??
  new URL("../.work/covariance-results.json", import.meta.url).pathname;
const timeLimitMilliseconds = 10 * 60 * 1_000;
const memoryLimitBytes = 8 * 1024 ** 3;
const worker = new URL("worker.ts", import.meta.url);

async function rss(pid: number): Promise<number | undefined> {
  try {
    const result = await new Deno.Command("ps", {
      args: ["-o", "rss=", "-p", String(pid)],
    }).output();
    if (!result.success) return undefined;
    const kibibytes = Number(new TextDecoder().decode(result.stdout).trim());
    return Number.isFinite(kibibytes) && kibibytes > 0
      ? kibibytes * 1024
      : undefined;
  } catch {
    return undefined;
  }
}

async function runCase(input: { rows: number; dimensions: number }) {
  const started = performance.now();
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      worker.pathname,
      String(input.rows),
      String(input.dimensions),
    ],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  let exited = false;
  let finished = started;
  void child.status.then(() => {
    exited = true;
    finished = performance.now();
  });
  let settled = false;
  const outputPromise = child.output().finally(() => settled = true);
  let peakRssBytes = 0;
  let limited: Result["status"] | undefined;
  while (!settled) {
    const currentRss = await rss(child.pid);
    if (currentRss === undefined) {
      if (exited || settled) break;
      try {
        child.kill("SIGKILL");
      } catch {
        // The worker may have exited while the unavailable sample was read.
      }
      await outputPromise;
      throw new Error(
        "Covariance benchmarks require process RSS access through `ps` so the 8 GiB limit can be enforced. Run with permission to execute `ps`.",
      );
    }
    peakRssBytes = Math.max(peakRssBytes, currentRss);
    if (peakRssBytes > memoryLimitBytes) limited = "memory-limited";
    if (
      limited === undefined &&
      performance.now() - started > timeLimitMilliseconds
    ) {
      limited = "time-limited";
    }
    if (limited !== undefined) {
      try {
        child.kill("SIGKILL");
      } catch {
        // The process may have completed between the sample and the signal.
      }
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const result = await outputPromise;
  const elapsedMilliseconds = finished - started;
  const stdout = new TextDecoder().decode(result.stdout).trim();
  const stderr = new TextDecoder().decode(result.stderr).trim();
  const phases: Record<string, unknown>[] = [];
  const errors: string[] = [];
  for (const line of stderr.split("\n").filter(Boolean)) {
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (typeof record.phase === "string") phases.push(record);
      else errors.push(line);
    } catch {
      errors.push(line);
    }
  }
  const error = errors.join("\n");
  if (limited !== undefined) {
    return {
      ...input,
      peakRssBytes,
      elapsedMilliseconds,
      status: limited,
      phases,
      error,
    };
  }
  if (!result.success) {
    return {
      ...input,
      peakRssBytes,
      elapsedMilliseconds,
      status: "failed",
      phases,
      error,
    };
  }
  const record = JSON.parse(stdout) as Record<string, number>;
  // OS process high-water RSS covers sub-sampling-interval native allocation
  // peaks in successful workers; sampled RSS remains the live stopping rule.
  peakRssBytes = Math.max(peakRssBytes, record.processHighWaterRssBytes);
  return {
    ...(JSON.parse(stdout) as Omit<
      Result,
      "peakRssBytes" | "elapsedMilliseconds" | "status"
    >),
    phases,
    peakRssBytes,
    elapsedMilliseconds,
    status: peakRssBytes > memoryLimitBytes
      ? "memory-limited" as const
      : "completed" as const,
  };
}

const hardware = {
  platform: `${Deno.build.os}-${Deno.build.arch}`,
  cpu: cpus()[0]?.model ?? "unavailable",
  logicalCpuCount: cpus().length,
  memoryBytes: totalmem(),
  denoVersion: Deno.version.deno,
  v8Version: Deno.version.v8,
};
if (await rss(Deno.pid) === undefined) {
  throw new Error(
    "Covariance benchmarks require process RSS access through `ps` so the 8 GiB limit can be enforced. Run with permission to execute `ps`.",
  );
}
const results = [];
await Deno.mkdir(dirname(output), { recursive: true });
for (const input of quick ? quickCases : fullCases) {
  console.error(`covariance rows=${input.rows} dimensions=${input.dimensions}`);
  const result = await runCase(input);
  results.push(result);
  // Persist each completed or limited case so a later interrupted sweep does
  // not erase earlier evidence.
  await Deno.writeTextFile(
    output,
    JSON.stringify(
      {
        hardware,
        quick,
        threads: 1,
        dataset: "deterministic trigonometric features plus basis perturbation",
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
