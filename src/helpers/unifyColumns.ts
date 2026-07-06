import mergeOptions from "./mergeOptions.ts";
import queryDB from "./queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

/**
 * Adds the columns missing from each table (filled with NULL) so all tables
 * share the same columns. Runs immediately, without queueing, so it's safe
 * inside a barrier's execute, which runs during a flush.
 */
export default async function unifyColumns(
  allTables: SimpleTable[],
  allTypes: { [key: string]: string },
) {
  const columnsAdded: {
    [key: string]: string[];
  } = {};

  for (const column in allTypes) {
    for (const table of allTables) {
      if (!(await table.hasColumn(column))) {
        await queryDB(
          table,
          `ALTER TABLE "${table.name}" ADD "${column}" ${allTypes[column]};`,
          mergeOptions(table, {
            table: table.name,
            method: "insertTables()",
            parameters: { column, type: allTypes[column] },
          }),
        );
        if (!columnsAdded[table.name]) {
          columnsAdded[table.name] = [];
        }
        columnsAdded[table.name].push(column);
      }
    }
  }

  return columnsAdded;
}
