export default function randomPointQuery(
  table: string,
  column: string,
  newColumn: string,
  nbPointsToTry: number,
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
  // Zero-tries contract: `WHERE 1 <= ${nbPointsToTry}` in the base case
  // produces no rows when nbPointsToTry is 0, so the LEFT JOIN returns NULL for
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
    WHERE 1 <= ${nbPointsToTry}
    UNION ALL
    SELECT
        rid, geom, xmin, xdiff, ymin, ydiff,
        ST_Point(
            xmin + CASE WHEN (rid + n) IS NOT NULL THEN random() END * xdiff,
            ymin + CASE WHEN (rid + n) IS NOT NULL THEN random() END * ydiff
        ),
        n + 1
    FROM attempts
    WHERE NOT ST_Within(pt, geom) AND n < ${nbPointsToTry}
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
