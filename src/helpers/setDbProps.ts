import type SimpleDB from "../class/SimpleDB.ts";
import type { IndexDefinition } from "./indexDefinitions.ts";
import { markTableChanged } from "./tableGeneration.ts";

export default async function setDbProps(
  simpleDB: SimpleDB,
  indexes: { [table: string]: IndexDefinition[] },
) {
  for (const table of await simpleDB.getTableNames()) {
    markTableChanged(simpleDB.newTable(table));
  }

  for (const table of simpleDB.getTables()) {
    const types = await table.getTypes();
    if (
      Object.values(types).some((type) =>
        type.toLowerCase().includes("geometry")
      )
    ) {
      await simpleDB.customQuery(`INSTALL SPATIAL; LOAD SPATIAL;`);
    }
  }

  for (const table of simpleDB.getTables()) {
    if (indexes[table.name]) {
      table.indexes = structuredClone(indexes[table.name]);
    }
  }

  simpleDB.tableIncrement = Math.round(Math.random() * 1000000);
}
