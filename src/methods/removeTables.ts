import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import SimpleTable from "../class/SimpleTable.ts";
import type SimpleDB from "../class/SimpleDB.ts";

export default async function removeTables(
  simpleDB: SimpleDB,
  tables: SimpleTable | string | (SimpleTable | string)[],
) {
  const tablesToBeRemoved = tables === "all"
    ? [...simpleDB.tables]
    : Array.isArray(tables)
    ? tables
    : [tables];

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
