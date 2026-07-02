import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import SimpleTable from "../class/SimpleTable.ts";
import type SimpleDB from "../class/SimpleDB.ts";

export default async function selectTables(
  simpleDB: SimpleDB,
  tables: SimpleTable | string | (SimpleTable | string)[],
) {
  const tablesToBeSelected = (Array.isArray(tables) ? tables : [tables]).map((
    t,
  ) => t instanceof SimpleTable ? t.name : t);

  for (const table of tablesToBeSelected) {
    if (!(await simpleDB.hasTable(table))) {
      throw new Error(`Table ${table} not found.`);
    }
  }

  const tablesToBeRemoved = simpleDB.tables.filter((t) =>
    !tablesToBeSelected.includes(t.name)
  );

  await queryDB(
    simpleDB,
    tablesToBeRemoved.map((d) =>
      `DROP TABLE "${d instanceof SimpleTable ? d.name : d}";`
    ).join("\n"),
    mergeOptions(simpleDB, {
      table: null,
      method: "removeTable()",
      parameters: {},
    }),
  );

  const tablesNamesToBeRemoved = tablesToBeRemoved.map((t) =>
    t instanceof SimpleTable ? t.name : t
  );
  simpleDB.tables = simpleDB.tables.filter((t) =>
    !tablesNamesToBeRemoved.includes(t.name)
  );
}
