import { dirname } from "node:path";

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
  distanceSqlUtf8Bytes: number;
  distanceSqlUtf16Bytes: number;
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

async function commandText(command: string, args: string[]) {
  try {
    const result = await new Deno.Command(command, { args }).output();
    return result.success
      ? new TextDecoder().decode(result.stdout).trim()
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

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
  let settled = false;
  const outputPromise = child.output().finally(() => settled = true);
  const started = performance.now();
  let peakRssBytes = 0;
  let limited: Result["status"] | undefined;
  while (!settled) {
    const currentRss = await rss(child.pid);
    if (currentRss === undefined) {
      try {
        child.kill("SIGTERM");
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
    if (performance.now() - started > timeLimitMilliseconds) {
      limited = "time-limited";
    }
    if (limited !== undefined) {
      try {
        child.kill("SIGTERM");
      } catch {
        // The process may have completed between the sample and the signal.
      }
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const result = await outputPromise;
  const elapsedMilliseconds = performance.now() - started;
  const stdout = new TextDecoder().decode(result.stdout).trim();
  const stderr = new TextDecoder().decode(result.stderr).trim();
  if (limited !== undefined) {
    return {
      ...input,
      peakRssBytes,
      elapsedMilliseconds,
      status: limited,
      error: stderr,
    };
  }
  if (!result.success) {
    return {
      ...input,
      peakRssBytes,
      elapsedMilliseconds,
      status: "failed",
      error: stderr,
    };
  }
  return {
    ...(JSON.parse(stdout) as Omit<
      Result,
      "peakRssBytes" | "elapsedMilliseconds" | "status"
    >),
    peakRssBytes,
    elapsedMilliseconds,
    status: "completed" as const,
  };
}

const hardware = {
  platform: `${Deno.build.os}-${Deno.build.arch}`,
  cpu: await commandText("sysctl", ["-n", "machdep.cpu.brand_string"]),
  memoryBytes: Number(await commandText("sysctl", ["-n", "hw.memsize"])) ||
    "unavailable",
  denoVersion: Deno.version.deno,
  v8Version: Deno.version.v8,
};
if (await rss(Deno.pid) === undefined) {
  throw new Error(
    "Covariance benchmarks require process RSS access through `ps` so the 8 GiB limit can be enforced. Run with permission to execute `ps`.",
  );
}
const results = [];
for (const input of quick ? quickCases : fullCases) {
  console.error(`covariance rows=${input.rows} dimensions=${input.dimensions}`);
  results.push(await runCase(input));
}
await Deno.mkdir(dirname(output), { recursive: true });
await Deno.writeTextFile(
  output,
  JSON.stringify({ hardware, quick, results }, null, 2) + "\n",
);
console.log(output);
