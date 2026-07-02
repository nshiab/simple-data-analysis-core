import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function latLon(
  simpleTable: SimpleTable,
  column: string,
  columnLat: string,
  columnLon: string,
) {
  await queryDB(
    simpleTable,
    `ALTER TABLE "${simpleTable.name}" ADD "${columnLat}" DOUBLE; UPDATE "${simpleTable.name}" SET "${columnLat}" = ST_Y("${column}");
             ALTER TABLE "${simpleTable.name}" ADD "${columnLon}" DOUBLE; UPDATE "${simpleTable.name}" SET "${columnLon}" = ST_X("${column}");`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "latLon()",
      parameters: { column, columnLon, columnLat },
    }),
  );
}
