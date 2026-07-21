import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import ensureSpatial from "../helpers/ensureSpatial.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import removeColumnsNow from "../helpers/removeColumnsNow.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import unifyColumns from "../helpers/unifyColumns.ts";

export default function insertTables(
  simpleTable: SimpleTable,
  tables: SimpleTable | SimpleTable[],
  options: { unifyColumns?: boolean } = {},
) {
  const array = Array.isArray(tables) ? [...tables] : [tables];
  options = structuredClone(options);

  queueOp(simpleTable, {
    kind: "barrier",
    method: "insertTables()",
    parameters: {
      tables: array.map((t) => t.name),
      options,
    },
    execute: () => executeInsertTables(simpleTable, array, options),
  });
}

async function executeInsertTables(
  simpleTable: SimpleTable,
  array: SimpleTable[],
  options: { unifyColumns?: boolean },
): Promise<void> {
  if (!await simpleTable.sdb.hasTable(simpleTable.name)) {
    // The table is created directly (not with the sync setTypes builder,
    // which would queue for the next flush).
    const firstTableTypes = await array[0].getTypes();
    if (
      Object.values(firstTableTypes)
        .map((d) => d.toLowerCase())
        .some((d) => d.startsWith("geometry"))
    ) {
      await ensureSpatial(simpleTable);
    }
    await queryDB(
      simpleTable,
      `CREATE OR REPLACE TABLE ${quoteIdentifier(simpleTable.name)} (${
        Object.keys(firstTableTypes)
          .map((d) => `${quoteIdentifier(d)} ${firstTableTypes[d]}`)
          .join(", ")
      });`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "insertTables()",
        parameters: { types: firstTableTypes },
      }),
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
          `INSERT INTO ${
            quoteIdentifier(simpleTable.name)
          } BY NAME SELECT * FROM ${quoteIdentifier(tableToInsert.name)};`,
      )
      .join("\n"),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "insertTables()",
      parameters: { tables: array.map((t) => t.name) },
    }),
  );

  if (options.unifyColumns) {
    for (const table of array) {
      const cols = columnsAdded[table.name];
      if (cols) {
        await removeColumnsNow(table, cols, "insertTables()");
      }
    }
  }
}
