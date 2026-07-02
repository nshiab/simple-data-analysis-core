import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import unnestQuery from "../helpers/unnestQuery.ts";

export default async function unnest(
  simpleTable: SimpleTable,
  column: string,
  separator: string,
) {
  await queryDB(
    simpleTable,
    unnestQuery(simpleTable.name, column, separator),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "unnest()",
      parameters: { column, separator },
    }),
  );
}
