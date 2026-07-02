import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function isClosedGeo(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { column?: string } = {},
) {
  const column = typeof options.column === "string"
    ? options.column
    : await findGeoColumn(simpleTable);

  await queryDB(
    simpleTable,
    `ALTER TABLE "${simpleTable.name}" ADD COLUMN "${newColumn}" BOOLEAN; UPDATE "${simpleTable.name}" SET "${newColumn}" = ST_IsClosed("${column}")`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "isClosedGeo()",
      parameters: { column, newColumn },
    }),
  );
}
