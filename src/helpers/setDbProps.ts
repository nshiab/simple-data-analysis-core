import { existsSync, readFileSync } from "node:fs";
import type SimpleDB from "../class/SimpleDB.ts";

export default async function setDbProps(
  simpleDB: SimpleDB,
  allIndexesFile: string,
) {
  for (const table of await simpleDB.getTableNames()) {
    simpleDB.newTable(table);
  }

  for (const table of await simpleDB.getTables()) {
    const types = await table.getTypes();
    if (
      Object.values(types).some((type) =>
        type.toLowerCase().includes("geometry")
      )
    ) {
      await simpleDB.customQuery(`INSTALL SPATIAL; LOAD SPATIAL;`);
    }
  }

  if (existsSync(allIndexesFile)) {
    const indexes = JSON.parse(readFileSync(allIndexesFile, "utf-8"));
    for (const table of simpleDB.tables) {
      if (indexes[table.name]) {
        table.indexes = indexes[table.name];
      }
    }
  }

  simpleDB.tableIncrement = Math.round(Math.random() * 1000000);
}
