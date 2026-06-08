export default function boundingBoxQuery(
  table: string,
  column: string,
  options: {
    decimals?: number;
  } = {},
) {
  const xMin = typeof options.decimals === "number"
    ? `ROUND(ST_XMin("${column}"), ${options.decimals})`
    : `ST_XMin("${column}")`;
  const xMax = typeof options.decimals === "number"
    ? `ROUND(ST_XMax("${column}"), ${options.decimals})`
    : `ST_XMax("${column}")`;
  const yMin = typeof options.decimals === "number"
    ? `ROUND(ST_YMin("${column}"), ${options.decimals})`
    : `ST_YMin("${column}")`;
  const yMax = typeof options.decimals === "number"
    ? `ROUND(ST_YMax("${column}"), ${options.decimals})`
    : `ST_YMax("${column}")`;

  return `CREATE OR REPLACE TABLE "${table}" AS
    SELECT *,
    ${xMin} AS minLon,
    ${yMin} AS minLat,
    ${xMax} AS maxLon,
    ${yMax} AS maxLat
    FROM "${table}"`;
}
