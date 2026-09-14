import type SimpleTable from "../class/SimpleTable.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queryDB from "../helpers/queryDB.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import buildUmapGraph, { scalar } from "../helpers/buildUmapGraph.ts";
import fitUmapCurve from "../helpers/fitUmapCurve.ts";
import optimizeUmapLayout from "../helpers/optimizeUmapLayout.ts";
import { initialUmapCoordinates } from "../helpers/umapRandom.ts";

type Options = NonNullable<Parameters<SimpleTable["umap"]>[1]>;

export default function umap(
  table: SimpleTable,
  column: string,
  options: Options = {},
) {
  // Signals are live cancellation handles, not cloneable operation settings.
  const { signal, ...configuration } = options;
  const settings = structuredClone(configuration);
  queueOp(table, {
    kind: "barrier",
    method: "umap()",
    parameters: { column, options: settings },
    execute: () => execute(table, column, { ...settings, signal }),
  });
}

async function execute(table: SimpleTable, column: string, options: Options) {
  const {
    xColumn = "umapX",
    yColumn = "umapY",
    idColumn,
    neighbors = 15,
    metric = "euclidean",
    search = "auto",
    epochs = 200,
    seed = 42,
    minDistance = 0.1,
    learningRate = 1,
    negativeSamples = 5,
    signal,
  } = options;
  signal?.throwIfAborted();
  for (
    const [key, value] of Object.entries({ neighbors, epochs, negativeSamples })
  ) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${key} must be a positive safe integer.`);
    }
  }
  if (neighbors < 2) throw new Error("neighbors must be at least 2.");
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("seed must be an unsigned 32-bit integer.");
  }
  if (!Number.isFinite(learningRate) || learningRate <= 0) {
    throw new Error("learningRate must be finite and positive.");
  }
  fitUmapCurve(minDistance);
  if (!["euclidean", "cosine"].includes(metric)) {
    throw new Error("metric must be euclidean or cosine.");
  }
  if (!["auto", "exact", "hnsw"].includes(search)) {
    throw new Error("search must be auto, exact or hnsw.");
  }
  const types = await table.getTypes();
  const columns = Object.keys(types);
  const resolve = (name: string) => {
    const found = columns.find((c) => c.toLowerCase() === name.toLowerCase());
    if (found === undefined) throw new Error(`Column ${name} does not exist.`);
    return found;
  };
  const vector = resolve(column);
  const id = idColumn === undefined ? undefined : resolve(idColumn);
  if (
    !xColumn.length || !yColumn.length || xColumn.includes("\0") ||
    yColumn.includes("\0") || xColumn.toLowerCase() === yColumn.toLowerCase() ||
    columns.some((c) =>
      [xColumn.toLowerCase(), yColumn.toLowerCase()].includes(c.toLowerCase())
    )
  ) {
    throw new Error(
      "UMAP output columns must be distinct, nonempty new column names.",
    );
  }
  if (
    !/^(FLOAT|DOUBLE|TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|DECIMAL\(\d+,\d+\))\[\d*\]$/
      .test(types[vector])
  ) {
    throw new Error(
      "UMAP requires a one-dimensional numeric LIST or ARRAY column.",
    );
  }

  const connection = table.connection!;
  const [sourceOid, sourceTemporary] = (await connection.runAndReadAll(
    `SELECT table_oid,temporary FROM duckdb_tables()
      WHERE lower(table_name)=lower($1) AND schema_name=current_schema()
        AND database_name IN (current_database(),'temp')
      ORDER BY temporary DESC LIMIT 1`,
    [table.name],
  )).getRowsJS()[0] ?? [];
  if (typeof sourceOid !== "number" && typeof sourceOid !== "bigint") {
    throw new Error("UMAP requires a materialized source table.");
  }
  const q = quoteIdentifier;
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const name = (part: string) => `__sda_umap_${suffix}_${part}`;
  const ordinal = q(name("ordinal"));
  const source = q(table.name), snapshot = q(name("snapshot"));
  const layoutName = name("layout"), layout = q(layoutName);
  const names = {
    rows: q(name("rows")),
    knn: q(name("knn")),
    search: q(name("search")),
    hnsw: q(name("hnsw")),
    candidates: q(name("candidates")),
    scales: q(name("scales")),
    directed: q(name("directed")),
    graph: q(name("graph")),
  };
  const scratch = [
    snapshot,
    layout,
    ...Object.entries(names)
      .filter(([key]) => key !== "hnsw").map(([, value]) => value),
  ];
  const interrupt = () => connection.interrupt();
  signal?.addEventListener("abort", interrupt, { once: true });
  try {
    signal?.throwIfAborted();
    // Retain payloads in native DuckDB types. A private ordinal distinguishes
    // duplicate rows and is independent of any user column named rowid.
    await connection.run(`CREATE TEMP TABLE ${snapshot} AS
      SELECT *, row_number() OVER () - 1 AS ${ordinal} FROM ${source}`);
    const count = await scalar(connection, `SELECT count(*) FROM ${snapshot}`);
    if (count < 3 || count > 0x7fffffff) {
      throw new Error("UMAP requires between 3 and 2147483647 rows.");
    }
    if (
      id !== undefined &&
      await scalar(
          connection,
          `SELECT count(DISTINCT ${q(id)}) FROM ${snapshot} WHERE ${
            q(id)
          } IS NOT NULL`,
        ) !== count
    ) {
      throw new Error("UMAP idColumn must be unique and non-null.");
    }
    if (
      await scalar(
        connection,
        `SELECT count(*) FROM ${snapshot}
      WHERE ${q(vector)} IS NULL OR len(${q(vector)})=0
        OR list_count(${q(vector)}) != len(${q(vector)})
        OR NOT list_bool_and(list_transform(${
          q(vector)
        }, x -> isfinite(x::DOUBLE)))`,
      )
    ) {
      throw new Error(
        "Vectors must be nonempty, non-null and contain finite numbers only.",
      );
    }
    if (
      await scalar(
        connection,
        `SELECT count(DISTINCT len(${q(vector)})) FROM ${snapshot}`,
      ) !== 1
    ) {
      throw new Error("Vectors must have equal dimensions.");
    }
    const dimensions = await scalar(
      connection,
      `SELECT len(${q(vector)}) FROM ${snapshot} LIMIT 1`,
    );
    await connection.run(`CREATE TEMP TABLE ${names.rows} AS
      SELECT (row_number() OVER (ORDER BY ${
      id === undefined ? ordinal : q(id)
    })-1)::INTEGER AS vertex,
        ${ordinal} AS ordinal, ${
      q(vector)
    }::DOUBLE[${dimensions}] AS vec FROM ${snapshot}`);
    if (
      await scalar(
        connection,
        `SELECT count(*) FROM ${names.rows}
      WHERE NOT isfinite(array_inner_product(vec,vec)) OR array_inner_product(vec,vec)>1e300
      ${metric === "cosine" ? "OR array_inner_product(vec,vec)=0" : ""}`,
      )
    ) {
      throw new Error(
        "Vector norms overflow, or cosine distance received a zero vector.",
      );
    }
    signal?.throwIfAborted();
    const graph = await buildUmapGraph(
      connection,
      {
        count,
        dimensions,
        neighbors: Math.min(neighbors, count - 1),
      },
      {
        metric,
        search: search === "auto" ? (count <= 1000 ? "exact" : "hnsw") : search,
      },
      names,
      signal,
    );
    // Release index and vector scratch before allocating optimizer state.
    for (
      const relation of [
        names.search,
        names.candidates,
        names.knn,
        names.directed,
        names.scales,
        names.graph,
      ]
    ) {
      await connection.run(`DROP TABLE IF EXISTS ${relation}`);
    }
    await connection.run(`ALTER TABLE ${names.rows} DROP COLUMN vec`);
    const coordinates = await optimizeUmapLayout(
      graph,
      initialUmapCoordinates(count, seed),
      { epochs, seed, minDistance, learningRate, negativeSamples, signal },
    );
    await connection.run(
      `CREATE TEMP TABLE ${layout} (vertex INTEGER,x DOUBLE,y DOUBLE)`,
    );
    const appender = await connection.createAppender(layoutName);
    try {
      for (let vertex = 0; vertex < count; vertex++) {
        appender.appendInteger(vertex);
        appender.appendDouble(coordinates[2 * vertex]);
        appender.appendDouble(coordinates[2 * vertex + 1]);
        appender.endRow();
      }
    } finally {
      appender.closeSync();
    }
    signal?.throwIfAborted();
    // Publish in one statement: failed fits never add partial columns. Existing
    // native indexes must be restored because CREATE OR REPLACE drops them.
    const indexes = (await connection.runAndReadAll(
      "SELECT sql FROM duckdb_indexes() WHERE table_oid=$1",
      [sourceOid],
    )).getRowsJS().map((row) => String(row[0]));
    await connection.run("BEGIN TRANSACTION");
    try {
      await queryDB(
        table,
        `CREATE OR REPLACE ${sourceTemporary ? "TEMP " : ""}TABLE ${source} AS
        SELECT ${columns.map((c) => `s.${q(c)}`).join(",")}, l.x AS ${
          q(xColumn)
        }, l.y AS ${q(yColumn)}
        FROM ${snapshot} s JOIN ${names.rows} r ON s.${ordinal}=r.ordinal
        JOIN ${layout} l ON r.vertex=l.vertex ORDER BY s.${ordinal}`,
        mergeOptions(table, {
          table: table.name,
          method: "umap()",
          parameters: { column, options: { ...options, signal: undefined } },
          noClean: true,
        }),
      );
      for (const sql of indexes) await connection.run(sql);
      signal?.throwIfAborted();
      await connection.run("COMMIT");
    } catch (error) {
      await connection.run("ROLLBACK");
      throw error;
    }
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener("abort", interrupt);
    for (const relation of scratch) {
      await connection.run(`DROP TABLE IF EXISTS ${relation}`);
    }
  }
}
