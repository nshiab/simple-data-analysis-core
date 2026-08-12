import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import ensureSpatial from "../helpers/ensureSpatial.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import removeColumnsNow from "../helpers/removeColumnsNow.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import unifyColumns from "../helpers/unifyColumns.ts";
import assertSameDatabase from "../helpers/assertSameDatabase.ts";

export default function insertTables(
  simpleTable: SimpleTable,
  tables: SimpleTable | SimpleTable[],
  options: { unifyColumns?: boolean } = {},
) {
  const array = Array.isArray(tables) ? [...tables] : [tables];
  assertSameDatabase(simpleTable.sdb, array, "insertTables()");
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
    const thisColumns = (await simpleTable.getColumns()).sort();
    const thisColumnSet = new Set(thisColumns);
    for (const table of array) {
      const tableColumns = (await table.getColumns()).sort();
      const tableColumnSet = new Set(tableColumns);
      const missingFromTable = thisColumns.filter((column) =>
        !tableColumnSet.has(column)
      );
      const missingFromSimpleTable = tableColumns.filter((column) =>
        !thisColumnSet.has(column)
      );
      if (missingFromTable.length > 0 || missingFromSimpleTable.length > 0) {
        const differences: string[] = [];
        if (missingFromTable.length > 0) {
          differences.push(
            `${missingFromTable.length} column${
              missingFromTable.length === 1 ? "" : "s"
            } missing from ${quoteIdentifier(table.name)}: ${
              missingFromTable.map(quoteIdentifier).join(", ")
            }.`,
          );
        }
        if (missingFromSimpleTable.length > 0) {
          differences.push(
            `${missingFromSimpleTable.length} column${
              missingFromSimpleTable.length === 1 ? "" : "s"
            } missing from ${quoteIdentifier(simpleTable.name)}: ${
              missingFromSimpleTable.map(quoteIdentifier).join(", ")
            }.`,
          );
        }
        throw new Error(
          `Tables ${quoteIdentifier(simpleTable.name)} and ${
            quoteIdentifier(table.name)
          } do not have the same columns.\n${
            differences.join("\n")
          }\nPass { unifyColumns: true } to fill missing columns with NULL values.`,
        );
      }
    }
  }
  const allTables = [simpleTable, ...array];
  const allTypes: { [key: string]: string } = {};
  const typeSourceTables: { [key: string]: SimpleTable } = {};
  for (const table of allTables) {
    const types = await table.getTypes();
    for (const key in types) {
      if (!allTypes[key]) {
        allTypes[key] = types[key];
        typeSourceTables[key] = table;
      } else {
        if (allTypes[key] !== types[key]) {
          const sourceTable = typeSourceTables[key];
          throw new Error(
            `Column ${quoteIdentifier(key)} has different types:\n${
              quoteIdentifier(sourceTable.name)
            }: ${allTypes[key]}\n${quoteIdentifier(table.name)}: ${
              types[key]
            }\nConvert ${
              quoteIdentifier(key)
            } to the same type in both tables before inserting.`,
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
