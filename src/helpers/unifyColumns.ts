import quoteIdentifier from "./quoteIdentifier.ts";
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

  // Each table's columns are fetched once, instead of one hasColumn
  // round-trip per column and table.
  const existingColumns = new Map<SimpleTable, Set<string>>();
  for (const table of allTables) {
    existingColumns.set(table, new Set(await table.getColumns()));
  }

  for (const column in allTypes) {
    for (const table of allTables) {
      if (!existingColumns.get(table)!.has(column)) {
        await queryDB(
          table,
          `ALTER TABLE ${quoteIdentifier(table.name)} ADD ${
            quoteIdentifier(column)
          } ${allTypes[column]};`,
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
