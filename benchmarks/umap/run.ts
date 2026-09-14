import { cpus, totalmem } from "node:os";
import { fileURLToPath } from "node:url";

// Supply a JSON array of jobs. Each job gets a fresh process, native peak RSS,
// partial stage results, a soft SQL interrupt, and an independent hard deadline.
const [manifest] = Deno.args;
if (!manifest) throw new Error("Usage: deno task umap-benchmark <jobs.json>");
const jobs = JSON.parse(await Deno.readTextFile(manifest)) as {
  name: string;
  output: string;
  timeoutSeconds?: number;
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
  memoryLimit: "1GB",
  tempLimit: "2GB",
};
for (const job of jobs) {
  console.log(`Running ${job.name}`);
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      fileURLToPath(new URL("worker.ts", import.meta.url)),
      JSON.stringify(job),
    ],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    try {
      child.kill("SIGKILL");
    } catch { /* Already exited. */ }
  }, ((job.timeoutSeconds ?? 120) + 5) * 1000);
  const output = await child.output();
  clearTimeout(timer);
  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);
  const events = stdout.trim().split("\n").filter(Boolean).map((line) =>
    JSON.parse(line) as { event: string; [key: string]: unknown }
  );
  const result = events.findLast((event) => event.event === "result") ?? {
    status: killed ? "timeout" : "failed",
    error: stderr,
  };
  const observation = {
    job,
    exitCode: output.code,
    killed,
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
