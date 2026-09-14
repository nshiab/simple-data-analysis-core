import { DuckDBInstance } from "@duckdb/node-api";
import { resourceUsage } from "node:process";
import prototypeHybridUmap, {
  writeUmapCoordinates,
} from "./prototypeHybridUmap.ts";
import { scalar } from "../prototypeUmap.ts";

const job = JSON.parse(Deno.args[0]) as {
  name: string;
  input?: string;
  rows?: number;
  dimensions?: number;
  output: string;
  timeoutSeconds: number;
  options?: Parameters<typeof prototypeHybridUmap>[1];
};
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const stages: Record<string, number> = {}, peaks: Record<string, number> = {};
const peakRss = () =>
  resourceUsage().maxRSS * (Deno.build.os === "darwin" ? 1 : 1024);
const db = await DuckDBInstance.create(":memory:");
const connection = await db.connect();
const started = performance.now();
const controller = new AbortController();
const timer = setTimeout(
  () => controller.abort(new Error("Benchmark deadline reached.")),
  job.timeoutSeconds * 1000,
);
let completedEpochs = 0;
try {
  await Deno.mkdir(job.output, { recursive: true });
  await connection.run(
    "SET threads=1; SET memory_limit='1GB'; SET max_temp_directory_size='2GB'",
  );
  if (job.input) {
    await connection.run(
      `CREATE TABLE input AS SELECT * FROM read_parquet(${literal(job.input)})`,
    );
  } else {
    const { rows = 1000, dimensions = 128 } = job;
    if (
      !Number.isSafeInteger(rows) || rows < 3 ||
      !Number.isSafeInteger(dimensions) || dimensions < 1
    ) throw new Error("Invalid data shape.");
    await connection.run(`CREATE TABLE input AS SELECT i AS id,i%10 AS label,
      list_transform(range(${dimensions}),d -> sin((i%10)*17+d*3)*3+(hash(i,d)%1000000)::DOUBLE/1e6)::FLOAT[${dimensions}] AS vector FROM range(${rows}) t(i)`);
  }
  stages.input = performance.now() - started;
  const count = await scalar(connection, "SELECT count(*) FROM input");
  const start = performance.now();
  const result = await prototypeHybridUmap(connection, {
    search: count <= 1000 ? "exact" : "hnsw",
    ...job.options,
    signal: controller.signal,
  }, (stage, milliseconds) => {
    stages[stage] = milliseconds;
    peaks[stage] = peakRss();
    console.log(
      JSON.stringify({
        event: "stage",
        stage,
        milliseconds,
        peakRssBytes: peaks[stage],
      }),
    );
  }, (epoch) => {
    completedEpochs = epoch;
  });
  const milliseconds = performance.now() - start,
    operationPeakRssBytes = peakRss();
  if (
    await scalar(
      connection,
      "SELECT count(*) FROM umap_result WHERE isfinite(umap_x) AND isfinite(umap_y)",
    ) !== count
  ) throw new Error("Invalid output coordinates.");
  if (
    await scalar(
      connection,
      `SELECT count(*) FROM (
    (SELECT id,vector FROM input EXCEPT ALL SELECT id,vector FROM umap_result)
    UNION ALL (SELECT id,vector FROM umap_result EXCEPT ALL SELECT id,vector FROM input))`,
    )
  ) throw new Error("Source rows changed.");
  await writeUmapCoordinates(connection, "umap_initial", result.initial);
  for (const name of ["layout", "initial"]) {
    await connection.run(
      `COPY (SELECT * FROM umap_${name} ORDER BY vertex) TO ${
        literal(`${job.output}/${name}.csv`)
      } (HEADER)`,
    );
  }
  if (count <= 2000) {
    for (const name of ["graph", "scales"]) {
      await connection.run(
        `COPY (SELECT ${
          name === "scales" ? "source,rho,sigma" : "*"
        } FROM umap_${name} ORDER BY ${
          name === "scales" ? "source" : "source,target"
        }) TO ${literal(`${job.output}/${name}.csv`)} (HEADER)`,
      );
    }
  }
  await Deno.writeTextFile(`${job.output}/plan.txt`, result.plan);
  console.log(
    JSON.stringify({
      event: "result",
      name: job.name,
      approach: "hybrid-owned",
      status: "ok",
      count,
      dimensions: result.dimensions,
      settings: result.settings,
      stages,
      peaks,
      milliseconds,
      operationPeakRssBytes,
      completedEpochs,
      processMilliseconds: performance.now() - started,
      peakRssBytes: peakRss(),
      duckdb: "1.5.5",
      umapJs: null,
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      event: "result",
      name: job.name,
      approach: "hybrid-owned",
      status: "failed",
      stages,
      peaks,
      completedEpochs,
      processMilliseconds: performance.now() - started,
      peakRssBytes: peakRss(),
      error: String(error),
    }),
  );
  Deno.exitCode = 1;
} finally {
  clearTimeout(timer);
  connection.closeSync();
  db.closeSync();
}
