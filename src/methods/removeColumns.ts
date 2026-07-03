import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function removeColumns(
  simpleTable: SimpleTable,
  columns: string | string[],
) {
  const cols = stringToArray(columns);
  await queryDB(
    simpleTable,
    cols.map((d) => `ALTER TABLE "${simpleTable.name}" DROP "${d}";`).join(
      "\n",
    ),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "removeColumns()",
      parameters: { columns },
    }),
  );
}
