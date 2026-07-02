import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function typeGeo(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { column?: string } = {},
) {
  const column = typeof options.column === "string"
    ? options.column
    : await findGeoColumn(simpleTable);
  await queryDB(
    simpleTable,
    `ALTER TABLE "${simpleTable.name}" ADD COLUMN "${newColumn}" VARCHAR; UPDATE "${simpleTable.name}" SET "${newColumn}" = ST_GeometryType("${column}")`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "typeGeo()",
      parameters: { column, newColumn },
    }),
  );
}
