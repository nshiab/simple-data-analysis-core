import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { resourceUsage } from "node:process";
import {
  buildFuzzyGraph,
  buildNeighbors,
  optimizeLayout,
  prepareInput,
  type PrototypeOptions,
  resolveOptions,
  scalar,
} from "../prototypeUmap.ts";
import {
  graphOf,
  initialCoordinates,
  initializeFromGraph,
  initializeFull,
  modelFor,
  setInitialCoordinates,
  SparseMatrix,
  validateVectors,
} from "./library.ts";

type Job = {
  name: string;
  approach: "duckdb" | "hybrid" | "typescript";
  input?: string;
  rows?: number;
  dimensions?: number;
  output: string;
  timeoutSeconds: number;
  options?: PrototypeOptions;
};
const job = JSON.parse(Deno.args[0]) as Job;
const stages: Record<string, number> = {};
const peaks: Record<string, number> = {};
const peakRss = () =>
  resourceUsage().maxRSS * (Deno.build.os === "darwin" ? 1 : 1024);
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const processStart = performance.now();
let completedEpochs = 0;
let activeStage = "input";
const enter = (stage: string) => {
  activeStage = stage;
  console.log(JSON.stringify({ event: "start", stage }));
  return performance.now();
};
const record = (stage: string, milliseconds: number) => {
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
};
const db = await DuckDBInstance.create(":memory:");
const connection = await db.connect();
const interrupt = setTimeout(
  () => connection.interrupt(),
  job.timeoutSeconds * 1000,
);

async function coordinatesTable(
  connection: DuckDBConnection,
  name: string,
  coordinates: number[][],
) {
  // Internal names only; appender avoids interpolating numeric data into SQL.
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE ${name} (vertex INTEGER,x DOUBLE,y DOUBLE)`,
  );
  const appender = await connection.createAppender(name);
  try {
    coordinates.forEach((point, i) => {
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        throw new Error("Non-finite output coordinate.");
      }
      appender.appendInteger(i);
      appender.appendDouble(point[0]);
      appender.appendDouble(point[1]);
      appender.endRow();
    });
  } finally {
    appender.closeSync();
  }
}

try {
  await Deno.mkdir(job.output, { recursive: true });
  await connection.run(
    "SET threads=1; SET memory_limit='1GB'; SET max_temp_directory_size='2GB'",
  );
  let start = enter("input");
  if (job.input) {
    await connection.run(
      `CREATE TABLE input AS SELECT * FROM read_parquet(${literal(job.input)})`,
    );
  } else {
    const { rows = 1000, dimensions = 128 } = job;
    if (
      !Number.isSafeInteger(rows) || rows < 3 ||
      !Number.isSafeInteger(dimensions) || dimensions < 1
    ) throw new Error("Invalid generated data shape.");
    await connection.run(`CREATE TABLE input AS SELECT i AS id,i%10 AS label,
      list_transform(range(${dimensions}), d -> sin((i%10)*17+d*3)*3+
        (hash(i,d)%1000000)::DOUBLE/1e6)::FLOAT[${dimensions}] AS vector FROM range(${rows}) t(i)`);
  }
  record("input", performance.now() - start);
  // Measured operation starts with a table already in SDA/DuckDB, and ends with
  // the projection added back to that table. Both transfer directions count.
  const operationStart = performance.now();
  start = enter("identity");
  const count = await scalar(connection, "SELECT count(*) FROM input");
  if (
    await scalar(connection, "SELECT count(DISTINCT id) FROM input") !== count
  ) throw new Error("Input ids must be unique and non-null.");
  await connection.run(
    "CREATE TEMP TABLE umap_ids AS SELECT (row_number() OVER(ORDER BY id)-1)::INTEGER AS vertex,id FROM input",
  );
  const settings = resolveOptions({
    search: count <= 1000 ? "exact" : "hnsw",
    learningRate: job.approach === "duckdb" ? 0.1 : 1,
    ...job.options,
  });
  settings.neighbors = Math.min(settings.neighbors, count - 1);
  record("identity", performance.now() - start);
  let dimensions = job.dimensions ?? 0;
  let graph: SparseMatrix | undefined;
  let plan: string | undefined;
  let model: ReturnType<typeof modelFor> | undefined;
  if (job.approach !== "typescript") {
    start = enter("validation");
    const input = await prepareInput(connection, settings);
    dimensions = input.dimensions;
    record("validation", performance.now() - start);
    start = enter("neighbors");
    plan = await buildNeighbors(connection, input, settings);
    record("neighbors", performance.now() - start);
    start = enter("fuzzyGraph");
    await buildFuzzyGraph(connection, settings.neighbors);
    record("fuzzyGraph", performance.now() - start);
    if (job.approach === "hybrid") {
      start = enter("graphTransfer");
      const result = await connection.run(
        "SELECT source,target,weight FROM umap_graph ORDER BY source,target",
      );
      const sources: number[] = [],
        targets: number[] = [],
        weights: number[] = [];
      for await (const rows of result.yieldRowsJs()) {
        for (const row of rows) {
          sources.push(Number(row[0]));
          targets.push(Number(row[1]));
          weights.push(Number(row[2]));
        }
      }
      graph = new SparseMatrix(sources, targets, weights, [count, count]);
      record("graphTransfer", performance.now() - start);
      start = enter("initialization");
      model = modelFor(settings);
      initializeFromGraph(model, graph);
      record("initialization", performance.now() - start);
    }
  } else {
    start = enter("vectorTransfer");
    // No high-dimensional numerical operations are executed in DuckDB here.
    // Use the library's native number[][] representation rather than silently
    // benchmarking a typed-array rewrite that users could not install.
    const result = await connection.stream(
      "SELECT vector FROM input ORDER BY id",
    );
    const vectors: number[][] = [];
    for await (const rows of result.yieldRowsJs()) {
      for (const row of rows) {
        if (!Array.isArray(row[0])) {
          throw new Error("Expected an array vector.");
        }
        vectors.push(row[0] as number[]);
      }
    }
    record("vectorTransfer", performance.now() - start);
    start = enter("validation");
    dimensions = validateVectors(vectors, settings.metric);
    record("validation", performance.now() - start);
    start = enter("typescriptInitialization");
    model = modelFor(settings);
    initializeFull(model, vectors, record, enter);
    graph = graphOf(model);
    record(
      "initialization",
      performance.now() - start - stages.neighbors - stages.fuzzyGraph,
    );
  }
  start = enter("initialCoordinates");
  const initial = initialCoordinates(count, settings.seed);
  if (model) setInitialCoordinates(model, initial, settings.seed);
  else await coordinatesTable(connection, "umap_layout", initial);
  record("initialCoordinates", performance.now() - start);
  start = enter("layout");
  if (model) {
    for (let epoch = 0; epoch < settings.epochs; epoch++) {
      completedEpochs = model.step();
      if (epoch % 25 === 0) {
        if (performance.now() - processStart > job.timeoutSeconds * 1000) {
          throw new Error("Layout deadline reached.");
        }
        console.log(JSON.stringify({ event: "epoch", completedEpochs }));
      }
    }
  } else {
    await optimizeLayout(connection, count, settings, (epoch) => {
      completedEpochs = epoch;
    });
  }
  record("layout", performance.now() - start);
  start = enter("writeback");
  if (model) {
    await coordinatesTable(connection, "umap_layout", model.getEmbedding());
  }
  await connection.run(
    `CREATE TEMP TABLE umap_result AS SELECT i.*,l.x AS umap_x,l.y AS umap_y
    FROM input i JOIN umap_ids m USING(id) JOIN umap_layout l USING(vertex)`,
  );
  record("writeback", performance.now() - start);
  const milliseconds = performance.now() - operationStart;
  const operationPeakRssBytes = peakRss();
  // Validation/export below are outside the operation timer, and outside the
  // reported operation peak. Only small quality datasets export the full graph.
  enter("verification");
  if (
    await scalar(
      connection,
      "SELECT count(*) FROM umap_result WHERE isfinite(umap_x) AND isfinite(umap_y)",
    ) !== count
  ) throw new Error("Invalid result row count or coordinates.");
  if (
    await scalar(
      connection,
      `SELECT count(*) FROM (
    (SELECT id,vector FROM input EXCEPT ALL SELECT id,vector FROM umap_result)
    UNION ALL (SELECT id,vector FROM umap_result EXCEPT ALL SELECT id,vector FROM input))`,
    )
  ) throw new Error("Source row identity or vectors changed.");
  await coordinatesTable(connection, "umap_initial", initial);
  for (const name of ["layout", "initial"]) {
    await connection.run(
      `COPY (SELECT * FROM umap_${name} ORDER BY vertex) TO ${
        literal(`${job.output}/${name}.csv`)
      } (HEADER)`,
    );
  }
  if (count <= 2000) {
    if (graph && job.approach === "typescript") {
      const rows = graph.getAll(true).filter((entry) => entry.value > 0);
      await Deno.writeTextFile(
        `${job.output}/graph.csv`,
        "source,target,weight\n" + rows.map((entry) =>
          `${entry.row},${entry.col},${entry.value}`
        ).join("\n") + "\n",
      );
    } else {
      await connection.run(
        `COPY (SELECT * FROM umap_graph ORDER BY source,target) TO ${
          literal(`${job.output}/graph.csv`)
        } (HEADER)`,
      );
    }
  }
  if (plan) await Deno.writeTextFile(`${job.output}/plan.txt`, plan);
  if (count === 10000 && job.approach === "duckdb" && job.name.endsWith("-1")) {
    await connection.run(
      `COPY input TO ${
        literal(`${job.output}/input.parquet`)
      } (FORMAT PARQUET)`,
    );
  }
  console.log(JSON.stringify({
    event: "result",
    name: job.name,
    approach: job.approach,
    status: "ok",
    count,
    dimensions,
    settings,
    neighborAlgorithm: job.approach === "typescript"
      ? "nn-descent"
      : settings.search,
    stages,
    peaks,
    milliseconds,
    operationPeakRssBytes,
    completedEpochs,
    processMilliseconds: performance.now() - processStart,
    peakRssBytes: peakRss(),
    duckdb: "1.5.5",
    umapJs: job.approach === "duckdb" ? null : "1.4.0",
  }));
} catch (error) {
  console.log(
    JSON.stringify({
      event: "result",
      name: job.name,
      approach: job.approach,
      status: "failed",
      activeStage,
      stages,
      peaks,
      completedEpochs,
      processMilliseconds: performance.now() - processStart,
      peakRssBytes: peakRss(),
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  Deno.exitCode = 1;
} finally {
  clearTimeout(interrupt);
  connection.closeSync();
  db.closeSync();
}
