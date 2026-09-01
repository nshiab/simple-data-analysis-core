import type SimpleTable from "../class/SimpleTable.ts";

/**
 * Resolves `outputTable: true` into an auto-generated table name
 * ("table0", "table1", ...), incrementing the database's shared counter so
 * concurrent auto-named tables never collide. A string, `false`, or
 * `undefined` value passes through unchanged.
 */
export default function resolveOutputTable(
  simpleTable: SimpleTable,
  outputTable: string | boolean | undefined,
): string | boolean | undefined {
  if (outputTable === true) {
    const name = `table${simpleTable.sdb.tableIncrement}`;
    simpleTable.sdb.tableIncrement += 1;
    return name;
  }
  return outputTable;
}
