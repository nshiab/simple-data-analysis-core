export default function randomPointQuery(
  table: string,
  column: string,
  newColumn: string,
  nbPointsToTry: number,
) {
  return `INSTALL spatial;
LOAD spatial;
${
    newColumn === column
      ? ""
      : `ALTER TABLE "${table}" ADD COLUMN "${newColumn}" GEOMETRY;`
  }
UPDATE "${table}" AS t
SET "${newColumn}" = sub.pt
FROM (
    SELECT 
        t_inner.rowid AS rid, 
        p.pt
    FROM "${table}" AS t_inner
    LEFT JOIN LATERAL (
        SELECT pt 
        FROM (
            SELECT ST_Point(
                ST_XMin(t_inner."${column}") + (CASE WHEN (t_inner.rowid + r.id) IS NOT NULL THEN random() END) * (ST_XMax(t_inner."${column}") - ST_XMin(t_inner."${column}")),
                ST_YMin(t_inner."${column}") + (CASE WHEN (t_inner.rowid + r.id) IS NOT NULL THEN random() END) * (ST_YMax(t_inner."${column}") - ST_YMin(t_inner."${column}"))
            ) AS pt
            FROM range(${nbPointsToTry}) AS r(id)
        )
        WHERE ST_Within(pt, t_inner."${column}")
        LIMIT 1
    ) AS p ON TRUE
) AS sub
WHERE t.rowid = sub.rid;`;
}
