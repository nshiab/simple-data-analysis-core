import type SimpleDB from "../class/SimpleDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

/**
 * Throws when a method receives a table owned by another database connection.
 *
 * @param simpleDB - The database on which the method will execute.
 * @param tables - The tables that must belong to `simpleDB`.
 * @param method - The SDA method name used in the error message.
 */
export default function assertSameDatabase(
  simpleDB: SimpleDB,
  tables: SimpleTable[],
  method: string,
): void {
  const foreignTables = tables.filter((table) => table.sdb !== simpleDB);
  if (foreignTables.length > 0) {
    throw new Error(
      `${method} all tables must belong to the same SimpleDB instance. The following table${
        foreignTables.length === 1 ? " belongs" : "s belong"
      } to another database: ${
        foreignTables.map((table) => JSON.stringify(table.name)).join(", ")
      }.`,
    );
  }
}
