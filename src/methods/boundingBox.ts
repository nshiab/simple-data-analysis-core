import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function boundingBox(
  simpleTable: SimpleTable,
  options: {
    column?: string;
    decimals?: number;
  } = {},
) {
  const column = options.column ?? (await findGeoColumn(simpleTable));

  await queryDB(
    simpleTable,
    boundingBoxQuery(simpleTable.name, column, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "boundingBox()",
      parameters: { column, options },
    }),
  );
}

function boundingBoxQuery(
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
