import type SimpleDB from "../class/SimpleDB.ts";
import type { IndexDefinition } from "./indexDefinitions.ts";
import { markTableChanged } from "./tableGeneration.ts";
import { registerTable } from "./tableRegistry.ts";

export default async function setDbProps(
  simpleDB: SimpleDB,
  indexes: { [table: string]: IndexDefinition[] },
) {
  for (const table of await simpleDB.getTableNames()) {
    if (!simpleDB.getTables().some((registered) => registered.name === table)) {
      const instance = new simpleDB.tableClass(table, simpleDB, {
        rowsToLog: simpleDB.rowsToLog,
        charsToLog: simpleDB.charsToLog,
        typesToLog: simpleDB.typesToLog,
      });
      registerTable(simpleDB, instance);
      markTableChanged(instance);
    }
  }

  for (const table of simpleDB.getTables()) {
    if (indexes[table.name]) {
      table.indexes = structuredClone(indexes[table.name]);
    }
  }

  while (
    simpleDB.getTables().some((table) =>
      table.name === `table${simpleDB.tableIncrement}`
    )
  ) {
    simpleDB.tableIncrement++;
  }
}
