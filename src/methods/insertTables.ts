import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import unifyColumns from "../helpers/unifyColumns.ts";

export default async function insertTables(
  simpleTable: SimpleTable,
  tablesToInsert: SimpleTable | SimpleTable[],
  options: { unifyColumns?: boolean } = {},
) {
  const array = Array.isArray(tablesToInsert)
    ? tablesToInsert
    : [tablesToInsert];

  if (!await simpleTable.sdb.hasTable(simpleTable.name)) {
    await simpleTable.setTypes(
      (await array[0].getTypes()) as {
        [key: string]:
          | "integer"
          | "float"
          | "number"
          | "string"
          | "date"
          | "time"
          | "datetime"
          | "datetimeTz"
          | "bigint"
          | "double"
          | "varchar"
          | "timestamp"
          | "timestamp with time zone"
          | "boolean"
          | `geometry('${string}')`
          | `GEOMETRY('${string}')`;
      },
    );
  }

  // Checking columns, types
  if (!options.unifyColumns) {
    const thisColumns = (await simpleTable.getColumns()).sort().join(",");
    for (const table of array) {
      const tableColumns = (await table.getColumns()).sort().join(",");
      if (thisColumns !== tableColumns) {
        throw new Error(
          `Tables ${simpleTable.name} and ${table.name} don't have the same columns: ${thisColumns} vs ${tableColumns}`,
        );
      }
    }
  }
  const allTables = [simpleTable, ...array];
  const allTypes: { [key: string]: string } = {};
  for (const table of allTables) {
    const types = await table.getTypes();
    for (const key in types) {
      if (!allTypes[key]) {
        allTypes[key] = types[key];
      } else {
        if (allTypes[key] !== types[key]) {
          throw new Error(
            `The column ${key} has different types in the tables.`,
          );
        }
      }
    }
  }

  let columnsAdded: {
    [key: string]: string[];
  } = {};
  if (options.unifyColumns) {
    columnsAdded = await unifyColumns(allTables, allTypes);
  }

  await queryDB(
    simpleTable,
    array
      .map(
        (tableToInsert) =>
          `INSERT INTO "${simpleTable.name}" BY NAME SELECT * FROM "${tableToInsert.name}";`,
      )
      .join("\n"),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "insertTables()",
      parameters: { tablesToInsert },
    }),
  );

  if (options.unifyColumns) {
    for (const table of array) {
      const cols = columnsAdded[table.name];
      if (cols) {
        await table.removeColumns(cols);
      }
    }
  }
}
