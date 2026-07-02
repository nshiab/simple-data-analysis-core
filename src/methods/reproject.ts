import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function reproject(
  simpleTable: SimpleTable,
  to: string,
  options: { column?: string } = {},
) {
  const cleanedTo = to.replace("WGS84", "EPSG:4326");
  const targetGeoType = `GEOMETRY${
    cleanedTo !== "null" ? `('${cleanedTo}')` : ""
  }`;

  const column = typeof options.column === "string"
    ? options.column
    : await findGeoColumn(simpleTable);

  await queryDB(
    simpleTable,
    `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * REPLACE (ST_Transform("${column}", '${cleanedTo}')::${targetGeoType} AS "${column}") FROM "${simpleTable.name}"`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "reproject()",
      parameters: { column, to },
    }),
  );
}
