import type SimpleTable from "../class/SimpleTable.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queryDB from "../helpers/queryDB.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import buildUmapGraph from "../helpers/buildUmapGraph.ts";
import prepareNumericFeatures from "../helpers/prepareNumericFeatures.ts";
import prepareUmapLayoutOptions from "../helpers/prepareUmapLayoutOptions.ts";
import readScalarNumber from "../helpers/readScalarNumber.ts";
import optimizeUmapLayout from "../helpers/optimizeUmapLayout.ts";
import initialUmapCoordinates from "../helpers/initialUmapCoordinates.ts";
import appendColumnBatches from "../helpers/appendColumnBatches.ts";
import { DOUBLE, INTEGER } from "@duckdb/node-api";

type Options = NonNullable<Parameters<SimpleTable["umap"]>[1]>;

export default function umap(
  table: SimpleTable,
  columns: string | string[],
  options: Options = {},
) {
  const selected = typeof columns === "string" ? columns : [...columns];
  const settings = structuredClone(options);
  queueOp(table, {
    kind: "barrier",
    method: "umap()",
    parameters: { columns: selected, options: settings },
    execute: () => execute(table, selected, settings),
  });
}

async function execute(
  table: SimpleTable,
  columns: string | string[],
  options: Options,
) {
  const { neighbors = 15, metric = "euclidean" } = options;
  if (!Number.isSafeInteger(neighbors) || neighbors < 2) {
    throw new Error("neighbors must be a safe integer of at least 2.");
  }
  const layoutOptions = prepareUmapLayoutOptions(options);
  if (!["euclidean", "cosine"].includes(metric)) {
    throw new Error("metric must be euclidean or cosine.");
  }
  const sourceColumns = await table.getColumns();
  if (sourceColumns.some((c) => ["umapx", "umapy"].includes(c.toLowerCase()))) {
    throw new Error(
      "UMAP output columns umapX and umapY must not already exist.",
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
  const count = await readScalarNumber(
    connection,
    `SELECT count(*) FROM ${q(table.name)}`,
  );
  if (count < 3 || count > 0x7fffffff) {
    throw new Error("UMAP requires between 3 and 2147483647 rows.");
  }
  const prepared = await prepareNumericFeatures(
    table,
    typeof columns === "string"
      ? { kind: "vector", column: columns }
      : { kind: "scalars", columns },
    { method: "umap()" },
  );
  const dimensions = prepared.dimensions;
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const name = (part: string) => `__sda_umap_${suffix}_${part}`;
  const ordinal = q(prepared.rowIdColumn);
  const source = q(table.name), snapshot = q(prepared.relation);
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
    layout,
    ...Object.entries(names)
      .filter(([key]) => key !== "hnsw").map(([, value]) => value),
  ];
  try {
    await connection.run(`CREATE TEMP TABLE ${names.rows} AS
      SELECT (row_number() OVER (ORDER BY ${ordinal})-1)::INTEGER AS vertex,
        ${ordinal} AS ordinal, ${
      q(prepared.vectorColumn)
    } AS vec FROM ${snapshot}`);
    await connection.run(
      `ALTER TABLE ${snapshot} DROP COLUMN ${q(prepared.vectorColumn)}`,
    );
    if (
      await readScalarNumber(
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
    const graph = await buildUmapGraph(
      connection,
      {
        count,
        dimensions,
        neighbors: Math.min(neighbors, count - 1),
      },
      {
        metric,
        search: count <= 1000 ? "exact" : "hnsw",
      },
      names,
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
    const coordinates = optimizeUmapLayout(
      graph,
      initialUmapCoordinates(count, layoutOptions.seed),
      layoutOptions,
    );
    await connection.run(
      `CREATE TEMP TABLE ${layout} (vertex INTEGER,x DOUBLE,y DOUBLE)`,
    );
    await appendColumnBatches(
      connection,
      layoutName,
      [INTEGER, DOUBLE, DOUBLE],
      count,
      (column, start, end) =>
        Array.from(
          { length: end - start },
          (_, row) =>
            column === 0
              ? start + row
              : coordinates[2 * (start + row) + column - 1],
        ),
    );
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
        SELECT ${
          prepared.sourceColumns.map((c) => `s.${q(c)}`).join(",")
        }, l.x AS "umapX", l.y AS "umapY"
        FROM ${snapshot} s JOIN ${names.rows} r ON s.${ordinal}=r.ordinal
        JOIN ${layout} l ON r.vertex=l.vertex ORDER BY s.${ordinal}`,
        mergeOptions(table, {
          table: table.name,
          method: "umap()",
          parameters: { columns, options },
          noClean: true,
        }),
      );
      for (const sql of indexes) await connection.run(sql);
      await connection.run("COMMIT");
    } catch (error) {
      await connection.run("ROLLBACK");
      throw error;
    }
  } finally {
    for (const relation of scratch) {
      await connection.run(`DROP TABLE IF EXISTS ${relation}`);
    }
    await prepared.cleanup();
  }
}
