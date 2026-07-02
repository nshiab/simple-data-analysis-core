import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function perimeter(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { unit?: "m" | "km"; column?: string } = {},
) {
  const column = typeof options.column === "string"
    ? options.column
    : await findGeoColumn(simpleTable);

  await queryDB(
    simpleTable,
    `ALTER TABLE "${simpleTable.name}" ADD "${newColumn}" DOUBLE; UPDATE "${simpleTable.name}" SET "${newColumn}" =  ST_Perimeter_Spheroid("${column}") ${
      options.unit === "km" ? "/ 1000" : ""
    };`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "perimeter()",
      parameters: { column, newColumn, options },
    }),
  );
}
