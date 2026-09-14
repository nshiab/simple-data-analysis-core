import { DuckDBInstance } from "@duckdb/node-api";
import { resourceUsage } from "node:process";
import prototypeUmap, {
  initializeLayout,
  optimizeLayout,
  prepareInput,
  type PrototypeOptions,
  resolveOptions,
  scalar,
} from "./prototypeUmap.ts";

// One fresh process per observation. Parent enforces an additional hard timeout.
type Job = {
  name: string;
  rows?: number;
  dimensions?: number;
  input?: string;
  graph?: string;
  output: string;
  timeoutSeconds?: number;
  options?: PrototypeOptions;
};
const job = JSON.parse(Deno.args[0]) as Job;
const db = await DuckDBInstance.create(":memory:");
const connection = await db.connect();
const stages: Record<string, number> = {};
let completedEpochs = 0;
const onEpoch = (epoch: number) => {
  completedEpochs = epoch;
  if (epoch % 25 === 0) {
    console.log(JSON.stringify({ event: "epoch", completedEpochs }));
  }
};
const memory: Record<
  string,
  { duckdbBytes: number; spilledBytes: number; processPeakRssBytes: number }
> = {};
const started = performance.now();
const deadline = setTimeout(
  () => connection.interrupt(),
  (job.timeoutSeconds ?? 120) * 1000,
);
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
// Deno 2.9.6 reports native getrusage units: bytes on macOS, KiB on Linux.
const peakRss = () =>
  resourceUsage().maxRSS * (Deno.build.os === "darwin" ? 1 : 1024);
try {
  await connection.run(
    "SET threads=1; SET memory_limit='1GB'; SET max_temp_directory_size='2GB'",
  );
  await Deno.mkdir(job.output, { recursive: true });
  if (job.input) {
    await connection.run(
      `CREATE TABLE input AS SELECT * FROM read_parquet(${literal(job.input)})`,
    );
  } else {
    const { rows = 1000, dimensions = 128 } = job;
    if (
      !Number.isSafeInteger(rows) || rows < 3 ||
      !Number.isSafeInteger(dimensions) || dimensions < 1
    ) {
      throw new Error(
        "rows and dimensions must be positive integers, with at least 3 rows.",
      );
    }
    // Ten separated, noisy groups in a high-dimensional space. Benchmark data
    // are generated inside DuckDB and never materialized in TypeScript.
    await connection.run(`CREATE TABLE input AS
      SELECT i AS id, i%10 AS label,
        list_transform(range(${dimensions}), d ->
          sin((i%10)*17+d*3)*3+(hash(i,d)%1000000)::DOUBLE/1e6)::FLOAT[${dimensions}] AS vector
      FROM range(${rows}) t(i)`);
  }
  const prepared = performance.now();
  const onStage = async (stage: string, milliseconds: number) => {
    stages[stage] = milliseconds;
    const snapshot = (await connection.runAndReadAll(
      "SELECT sum(memory_usage_bytes),sum(temporary_storage_bytes) FROM duckdb_memory()",
    )).getRowsJS()[0];
    memory[stage] = {
      duckdbBytes: Number(snapshot[0]),
      spilledBytes: Number(snapshot[1]),
      processPeakRssBytes: peakRss(),
    };
    console.log(
      JSON.stringify({
        event: "stage",
        stage,
        milliseconds,
        memory: memory[stage],
      }),
    );
  };
  let result;
  if (job.graph) {
    const settings = resolveOptions(job.options);
    const input = await prepareInput(connection, settings);
    await connection.run(
      `CREATE TEMP TABLE umap_graph AS SELECT * FROM read_csv(${
        literal(job.graph)
      }, header=true)`,
    );
    await initializeLayout(connection, settings.seed);
    const start = performance.now();
    await optimizeLayout(connection, input.count, settings, onEpoch);
    await onStage("layout", performance.now() - start);
    result = {
      ...input,
      settings,
      plan: "Reference graph supplied; SQL layout only.",
    };
  } else {
    result = await prototypeUmap(connection, job.options, onStage, onEpoch);
  }
  const elapsed = performance.now() - prepared;
  const graphEdges = await scalar(
    connection,
    "SELECT count(*) FROM umap_graph",
  );
  const sparseBytes = graphEdges * (4 + 4 + 8);
  const lastBatchGradientRows = await scalar(
    connection,
    "SELECT count(*) FROM umap_gradients",
  );
  for (const table of ["layout", "initial", "graph"]) {
    await connection.run(
      `COPY (SELECT * FROM umap_${table} ORDER BY ${
        table === "graph" ? "source,target" : "vertex"
      })
      TO ${literal(`${job.output}/${table}.csv`)} (HEADER)`,
    );
  }
  // Include scales for diagnosing graph errors; optimizer-only jobs have none.
  if (!job.graph) {
    await connection.run(
      `COPY (SELECT source,rho,sigma FROM umap_scales ORDER BY source)
      TO ${literal(`${job.output}/scales.csv`)} (HEADER)`,
    );
  }
  await Deno.writeTextFile(`${job.output}/plan.txt`, result.plan);
  const version = String(
    (await connection.runAndReadAll("SELECT version()")).getRowsJS()[0][0],
  );
  console.log(JSON.stringify({
    event: "result",
    name: job.name,
    status: "ok",
    completedEpochs,
    ...result,
    plan: undefined,
    graphEdges,
    lastBatchGradientRows,
    memory,
    sparseGraphPayloadBytes: sparseBytes,
    stages,
    milliseconds: elapsed,
    processMilliseconds: performance.now() - started,
    peakRssBytes: peakRss(),
    duckdb: version,
  }));
} catch (error) {
  console.log(JSON.stringify({
    event: "result",
    name: job.name,
    status: "failed",
    completedEpochs,
    stages,
    memory,
    processMilliseconds: performance.now() - started,
    peakRssBytes: peakRss(),
    error: error instanceof Error ? error.message : String(error),
  }));
  Deno.exitCode = 1;
} finally {
  clearTimeout(deadline);
  connection.closeSync();
  db.closeSync();
}
