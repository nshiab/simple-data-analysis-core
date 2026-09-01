import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import ensureSpatial from "../helpers/ensureSpatial.ts";
import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function simplify(
  simpleTable: SimpleTable,
  tolerance: number,
  options: { column?: string; simplifyBoundary?: boolean } = {},
) {
  // The coverage simplification groups by rowid, which only exists on the
  // materialized table: it executes as a barrier.
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "simplify()",
    parameters: { tolerance, options },
    execute: () => executeSimplify(simpleTable, tolerance, options),
  });
}

async function executeSimplify(
  simpleTable: SimpleTable,
  tolerance: number,
  options: { column?: string; simplifyBoundary?: boolean },
): Promise<void> {
  await ensureSpatial(simpleTable);

  const column = typeof options.column === "string"
    ? options.column
    : await findGeoColumn(simpleTable, "simplify()");

  const geoType = await simpleTable.getProjection(column);

  // Each row is its own coverage group: grouping by rowid directly avoids
  // materializing a temporary row-number column. rowid is not part of
  // SELECT *, so the other columns are listed explicitly in the GROUP BY.
  const groupBy = [
    "rowid",
    ...(await simpleTable.getColumns())
      .filter((d) => d !== column)
      .map((d) => `${quoteIdentifier(d)}`),
  ].join(", ");

  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE ${
      quoteIdentifier(simpleTable.name)
    } AS SELECT * REPLACE(ST_CoverageSimplify(ARRAY_AGG(${
      quoteIdentifier(column)
    }), ${tolerance}${
      options.simplifyBoundary === false ? ", FAlSE" : ""
    })::${geoType} AS ${quoteIdentifier(column)}) FROM ${
      quoteIdentifier(simpleTable.name)
    } GROUP BY ${groupBy};`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "simplify()",
      parameters: { column, tolerance },
    }),
  );
}
