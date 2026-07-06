import ensureSpatial from "../helpers/ensureSpatial.ts";
import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import removeColumnsNow from "../helpers/removeColumnsNow.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function simplify(
  simpleTable: SimpleTable,
  tolerance: number,
  options: { column?: string; simplifyBoundary?: boolean } = {},
) {
  // The coverage simplification aggregates over a rowid-based row number,
  // which only exists on the materialized table: it executes as a barrier.
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
    : await findGeoColumn(simpleTable);

  // The temporary row number is created directly (not with the sync
  // addRowNumber builder, which would queue for the next flush).
  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT *, (ROW_NUMBER() OVER(ORDER BY rowid) - 1) AS "rowNumberForSimplify" FROM "${simpleTable.name}" ORDER BY rowid`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "simplify()",
      parameters: { column, tolerance },
    }),
  );

  const geoType = await simpleTable.getProjection(column);

  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * REPLACE(ST_CoverageSimplify(ARRAY_AGG("${column}"), ${tolerance}${
      options.simplifyBoundary === false ? ", FAlSE" : ""
    })::${geoType} AS "${column}") FROM "${simpleTable.name}" GROUP BY ALL;`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "simplify()",
      parameters: { column, tolerance },
    }),
  );

  await removeColumnsNow(simpleTable, ["rowNumberForSimplify"], "simplify()");
}
