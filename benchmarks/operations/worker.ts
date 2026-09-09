import { prepareWorkload, workloads } from "./workloads.ts";

const [implementation, name, rowsText] = Deno.args;
const workload = workloads.find((candidate) => candidate.name === name);
const rows = Number(rowsText);
if (
  !workload || !["core", "duckdb"].includes(implementation) ||
  !Number.isSafeInteger(rows) || rows < 1
) {
  throw new Error(
    "Expected implementation (core/duckdb), workload, and positive row count.",
  );
}
// Keep Core imports out of the raw DuckDB process's memory measurement.
const sdb = implementation === "core"
  ? new (await import("../../src/index.ts")).SimpleDB()
  : undefined;
if (sdb) await sdb.customQuery("SELECT 1");
const db = sdb
  ? undefined
  : await (await import("@duckdb/node-api")).DuckDBInstance.create(":memory:");
const connection = sdb?.connection ?? await db!.connect();
try {
  if (!sdb) {
    await connection.run(
      "SET TimeZone='UTC'; ATTACH OR REPLACE ':memory:' AS memory (COMPRESS)",
    );
  }
  await connection.run(
    "SET threads=1; SET memory_limit='1GB'; SET enable_external_file_cache=false",
  );
  // A warm-up and one measured operation on the same initialized connection.
  // Each process contributes exactly one sample and one process peak RSS.
  const warmup = await prepareWorkload(workload.name, rows, connection, sdb);
  await warmup.execute();
  await warmup.validate();
  const measured = await prepareWorkload(workload.name, rows, connection, sdb);
  const start = performance.now();
  await measured.execute();
  const milliseconds = performance.now() - start;
  await measured.validate();
  const version =
    (await connection.runAndReadAll("SELECT version() AS version"))
      .getRowObjectsJS()[0].version;
  console.log(JSON.stringify({ milliseconds, duckdbVersion: version }));
} finally {
  if (sdb) await sdb.close();
  else {
    connection.closeSync();
    db!.closeSync();
  }
}
