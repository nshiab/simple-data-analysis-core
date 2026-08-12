import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import SimpleTable from "../class/SimpleTable.ts";
import type SimpleDB from "../class/SimpleDB.ts";
import { retainRegisteredTables } from "../helpers/tableRegistry.ts";

export default async function removeTables(
  simpleDB: SimpleDB,
  tables: SimpleTable | string | (SimpleTable | string)[],
) {
  const tablesToBeRemoved = tables === "all"
    ? [...simpleDB.getTables()]
    : Array.isArray(tables)
    ? tables
    : [tables];

  await queryDB(
    simpleDB,
    tablesToBeRemoved.map((d) =>
      `DROP TABLE ${quoteIdentifier(d instanceof SimpleTable ? d.name : d)};`
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
  retainRegisteredTables(
    simpleDB,
    (table) => !tablesNamesToBeRemoved.includes(table.name),
  );
}
