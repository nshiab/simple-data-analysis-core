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
SET "${newColumn}" = (
    SELECT pt FROM (
        SELECT ST_Point(
            ST_XMin(t."${column}") + random() * (ST_XMax(t."${column}") - ST_XMin(t."${column}")),
            ST_YMin(t."${column}") + random() * (ST_YMax(t."${column}") - ST_YMin(t."${column}"))
        ) AS pt
        FROM range(${nbPointsToTry})
    ) WHERE ST_Within(pt, t."${column}")
    LIMIT 1
);`;
}
