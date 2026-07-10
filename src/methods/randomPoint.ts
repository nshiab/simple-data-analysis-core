import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function randomPoint(
  simpleTable: SimpleTable,
  newColumn: string,
  tries: number,
  options: { column?: string; strict?: boolean } = {},
) {
  // This validation doesn't need the database, so it stays at call time.
  if (typeof tries !== "number" || tries < 0) {
    throw new Error(
      "tries must be a number greater than or equal to 0",
    );
  }

  // The generated points are checked against the data afterwards, so
  // randomPoint can't be expressed as a single SELECT over its input: it
  // executes as a barrier.
  queueOp(simpleTable, {
    kind: "barrier",
    method: "randomPoint()",
    parameters: { newColumn, tries, options },
    execute: () => executeRandomPoint(simpleTable, newColumn, tries, options),
  });
}

async function executeRandomPoint(
  simpleTable: SimpleTable,
  newColumn: string,
  tries: number,
  options: { column?: string; strict?: boolean },
): Promise<void> {
  const column = typeof options.column === "string"
    ? options.column
    : await findGeoColumn(simpleTable);

  const geoType = await simpleTable.getProjection(column);

  await queryDB(
    simpleTable,
    randomPointQuery(
      simpleTable.name,
      column,
      newColumn,
      tries,
      geoType,
    ),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "randomPoint()",
      parameters: { column, newColumn, tries, options, geoType },
    }),
  );

  const nbNulls = await simpleTable.getNbRows({
    conditions: `"${newColumn}" IS NULL`,
  });
  if (nbNulls > 0 && options.strict !== false) {
    throw new Error(
      `${nbNulls} points could not be generated. Consider increasing tries or set options.strict to false.`,
    );
  }
}

function randomPointQuery(
  table: string,
  column: string,
  newColumn: string,
  tries: number,
  geoType: string,
) {
  const addColumn = newColumn === column
    ? ""
    : `ALTER TABLE "${table}" ADD COLUMN "${newColumn}" ${geoType};`;

  // Recursive CTE approach: each iteration only carries forward the rows that
  // have NOT yet found a valid interior point, so DuckDB stops per-row as soon
  // as ST_Within is satisfied — giving O(1) behaviour for easy polygons instead
  // of the O(N) materialisation that occurs with LATERAL + range() + WHERE.
  //
  // Zero-tries contract: `WHERE 1 <= ${tries}` in the base case
  // produces no rows when tries is 0, so the LEFT JOIN returns NULL for
  // every row and the UPDATE sets the column to NULL — no special-case branch
  // needed and the normal UPDATE code path is always exercised.
  //
  // Volatility guard: `CASE WHEN (rid + n) IS NOT NULL THEN random() END`
  // prevents the planner from constant-folding random() across iterations while
  // still evaluating to random() for every non-null row.
  return `INSTALL spatial;
LOAD spatial;
${addColumn}
WITH RECURSIVE
base AS (
    SELECT
        rowid AS rid,
        "${column}" AS geom,
        ST_XMin("${column}") AS xmin,
        ST_XMax("${column}") - ST_XMin("${column}") AS xdiff,
        ST_YMin("${column}") AS ymin,
        ST_YMax("${column}") - ST_YMin("${column}") AS ydiff
    FROM "${table}"
),
attempts(rid, geom, xmin, xdiff, ymin, ydiff, pt, n) AS (
    SELECT
        rid, geom, xmin, xdiff, ymin, ydiff,
        ST_Point(
            xmin + CASE WHEN rid IS NOT NULL THEN random() END * xdiff,
            ymin + CASE WHEN rid IS NOT NULL THEN random() END * ydiff
        ),
        1
    FROM base
    WHERE 1 <= ${tries}
    UNION ALL
    SELECT
        rid, geom, xmin, xdiff, ymin, ydiff,
        ST_Point(
            xmin + CASE WHEN (rid + n) IS NOT NULL THEN random() END * xdiff,
            ymin + CASE WHEN (rid + n) IS NOT NULL THEN random() END * ydiff
        ),
        n + 1
    FROM attempts
    WHERE NOT ST_Within(pt, geom) AND n < ${tries}
)
UPDATE "${table}" AS t
SET "${newColumn}" = v.pt::${geoType}
FROM (
    SELECT b.rid, vp.pt
    FROM (SELECT rowid AS rid FROM "${table}") b
    LEFT JOIN (
        SELECT rid, pt
        FROM attempts
        WHERE ST_Within(pt, geom)
        QUALIFY ROW_NUMBER() OVER (PARTITION BY rid ORDER BY n) = 1
    ) vp ON b.rid = vp.rid
) v
WHERE t.rowid = v.rid;`;
}
