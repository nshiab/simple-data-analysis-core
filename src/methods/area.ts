import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function area(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { unit?: "m2" | "km2"; column?: string } = {},
) {
  const column = typeof options.column === "string"
    ? options.column
    : await findGeoColumn(simpleTable);

  await queryDB(
    simpleTable,
    `ALTER TABLE "${simpleTable.name}" ADD "${newColumn}" DOUBLE; UPDATE "${simpleTable.name}" SET "${newColumn}" =  ST_Area_Spheroid("${column}") ${
      options.unit === "km2" ? "/ 1000000" : ""
    };`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "area()",
      parameters: { column, newColumn, options },
    }),
  );
}
