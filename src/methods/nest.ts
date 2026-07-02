import mergeOptions from "../helpers/mergeOptions.ts";
import nestQuery from "../helpers/nestQuery.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function nest(
  simpleTable: SimpleTable,
  column: string,
  separator: string,
  categories: string | string[],
) {
  await queryDB(
    simpleTable,
    nestQuery(simpleTable.name, column, separator, categories),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "nest()",
      parameters: { column, separator, categories },
    }),
  );
}
