import { resourceUsage } from "node:process";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import type SimpleTable from "../../../src/class/SimpleTable.ts";

const job = JSON.parse(Deno.args[0]) as {
  name: string;
  input?: string;
  rows?: number;
  dimensions?: number;
  output: string;
  reference: string;
  timeoutSeconds: number;
  options?: Parameters<SimpleTable["umap"]>[1];
};
const literal = (s: string) => `'${s.replaceAll("'", "''")}'`;
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
const peakRss = () =>
  resourceUsage().maxRSS * (Deno.build.os === "darwin" ? 1 : 1024);
const sdb = new SimpleDB({
  memoryLimit: "1GB",
  tempDir: `${job.output}/spill`,
});
const started = performance.now();
const controller = new AbortController();
const timer = setTimeout(
  () => controller.abort(new Error("Benchmark deadline reached.")),
  job.timeoutSeconds * 1000,
);
try {
  await Deno.mkdir(job.output, { recursive: true });
  await sdb.customQuery("SET threads=1; SET max_temp_directory_size='2GB'");
  const connection = sdb.connection!;
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
      throw new Error("Invalid data shape.");
    }
    await connection.run(`CREATE TABLE input AS SELECT i AS id,i%10 AS label,
      list_transform(range(${dimensions}),d -> sin((i%10)*17+d*3)*3+(hash(i,d)%1000000)::DOUBLE/1e6)::FLOAT[${dimensions}] AS vector FROM range(${rows}) t(i)`);
  }
  const table = sdb.newTable("input");
  const types = await table.getTypes();
  const signatureSQL = `SELECT count(*),bit_xor(hash(${
    Object.keys(types).map(quote).join(",")
  })) FROM input`;
  const before = (await connection.runAndReadAll(signatureSQL)).getRowsJS()[0];
  const count = Number(before[0]);
  const start = performance.now();
  await table.umap("vector", {
    idColumn: "id",
    ...job.options,
    signal: controller.signal,
  }).run();
  const milliseconds = performance.now() - start,
    operationPeakRssBytes = peakRss();
  const after = (await connection.runAndReadAll(signatureSQL)).getRowsJS()[0];
  if (before.some((value, i) => value !== after[i])) {
    throw new Error("Source rows changed.");
  }
  const coordinates =
    `SELECT (row_number() OVER (ORDER BY id)-1)::INTEGER AS vertex,umapX AS x,umapY AS y FROM input ORDER BY id`;
  const maxDifference = Number(
    (await connection.runAndReadAll(`
    SELECT max(greatest(abs(a.x-b.x),abs(a.y-b.y))) FROM (${coordinates}) a
    JOIN read_csv_auto(${literal(job.reference)}) b USING(vertex)`))
      .getRowsJS()[0][0],
  );
  if (maxDifference !== 0) {
    throw new Error(
      `Coordinates differ from validated hybrid by ${maxDifference}.`,
    );
  }
  const invalid = Number(
    (await connection.runAndReadAll(
      "SELECT count(*) FROM input WHERE NOT isfinite(umapX) OR NOT isfinite(umapY) OR umapX IS NULL OR umapY IS NULL",
    )).getRowsJS()[0][0],
  );
  if (invalid) throw new Error("Invalid coordinates.");
  await connection.run(
    `COPY (${coordinates}) TO ${literal(`${job.output}/layout.csv`)} (HEADER)`,
  );
  console.log(
    JSON.stringify({
      event: "result",
      name: job.name,
      approach: "hybrid-public",
      status: "ok",
      count,
      settings: job.options ?? {},
      milliseconds,
      operationPeakRssBytes,
      maxDifference,
      processMilliseconds: performance.now() - started,
      peakRssBytes: peakRss(),
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      event: "result",
      name: job.name,
      approach: "hybrid-public",
      status: "failed",
      processMilliseconds: performance.now() - started,
      peakRssBytes: peakRss(),
      error: String(error),
    }),
  );
  Deno.exitCode = 1;
} finally {
  clearTimeout(timer);
  await sdb.close();
}
