import { cpus, totalmem } from "node:os";
import { fileURLToPath } from "node:url";

const [manifest] = Deno.args;
if (!manifest) {
  throw new Error(
    "Usage: deno run -A benchmarks/umap/compare/run.ts <jobs.json>",
  );
}
const jobs = JSON.parse(await Deno.readTextFile(manifest)) as {
  name: string;
  output: string;
  timeoutSeconds: number;
  v8OldSpaceMiB?: number;
  worker?: "hybrid" | "public";
}[];
const results: unknown[] = [];
const environment = {
  timestamp: new Date().toISOString(),
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  memoryBytes: totalmem(),
  os: Deno.build.os,
  arch: Deno.build.arch,
  deno: Deno.version.deno,
  threads: 1,
  duckdbMemoryLimit: "1GB",
  duckdbSpillLimit: "2GB",
  v8OldSpaceMiB: 2048,
  rssGuardBytes: 4 * 1024 ** 3,
};
for (const job of jobs) {
  console.log(`Running ${job.name}`);
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      `--v8-flags=--max-old-space-size=${job.v8OldSpaceMiB ?? 2048}`,
      "-A",
      fileURLToPath(
        new URL(
          job.worker === "public"
            ? "../public/worker.ts"
            : job.worker === "hybrid"
            ? "../hybrid/worker.ts"
            : "worker.ts",
          import.meta.url,
        ),
      ),
      JSON.stringify(job),
    ],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  let stopped: string | null = null;
  let sampledPeakRssBytes = 0;
  let monitoring = false;
  let monitorError: string | null = null;
  const kill = (reason: string) => {
    stopped ??= reason;
    try {
      child.kill("SIGKILL");
    } catch { /* Already exited. */ }
  };
  const timer = setTimeout(
    () => kill("timeout"),
    (job.timeoutSeconds + 5) * 1000,
  );
  // Native resourceUsage captures peaks on successful runs. External sampling
  // supplies a bounded-RSS guard and partial evidence for killed workers.
  const monitor = setInterval(async () => {
    if (monitoring) return;
    monitoring = true;
    try {
      const result = await new Deno.Command("ps", {
        args: ["-o", "rss=", "-p", String(child.pid)],
        stdout: "piped",
        stderr: "piped",
      }).output();
      const rss = Number(new TextDecoder().decode(result.stdout).trim()) * 1024;
      if (Number.isFinite(rss)) {
        sampledPeakRssBytes = Math.max(sampledPeakRssBytes, rss);
      }
      if (rss > environment.rssGuardBytes) kill("rss-guard");
      const error = new TextDecoder().decode(result.stderr).trim();
      if (error) monitorError = error;
    } catch (error) {
      monitorError = String(error);
    } finally {
      monitoring = false;
    }
  }, 500);
  const output = await child.output();
  clearTimeout(timer);
  clearInterval(monitor);
  while (monitoring) await new Promise((resolve) => setTimeout(resolve, 10));
  const stderr = new TextDecoder().decode(output.stderr);
  const events = new TextDecoder().decode(output.stdout).trim().split("\n")
    .filter(Boolean).map((line) =>
      JSON.parse(line) as { event: string; [key: string]: unknown }
    );
  const result = events.findLast((event) => event.event === "result") ?? {
    status: stopped ?? "failed",
    activeStage: events.findLast((event) => event.event === "start")?.stage,
    error: stderr,
  };
  const observation = {
    job,
    effectiveV8OldSpaceMiB: job.v8OldSpaceMiB ?? 2048,
    exitCode: output.code,
    stopped,
    sampledPeakRssBytes,
    monitorError,
    result,
    events,
    stderr,
  };
  results.push(observation);
  await Deno.mkdir(job.output, { recursive: true });
  await Deno.writeTextFile(
    `${job.output}/observation.json`,
    JSON.stringify({ environment, ...observation }, null, 2) + "\n",
  );
  await Deno.writeTextFile(
    `${manifest}.results.json`,
    JSON.stringify({ environment, results }, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
}
