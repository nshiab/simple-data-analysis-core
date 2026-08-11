import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import extractTypes from "../helpers/extractTypes.ts";

export default async function getTypes(simpleTable: SimpleTable) {
  if (simpleTable.sdb.dataTransport === "file") {
    await queryDB(
      simpleTable,
      `DESCRIBE ${quoteIdentifier(simpleTable.name)}`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "getTypes()",
        parameters: {},
      }),
    );
    const metadata = await simpleTable.connection.run(
      `SELECT * FROM ${quoteIdentifier(simpleTable.name)} LIMIT 0`,
    );
    const columnNames = metadata.deduplicatedColumnNames();
    const columnTypes = metadata.columnTypes();
    return Object.fromEntries(columnNames.map((columnName, index) => [
      columnName,
      columnTypes[index].alias ?? columnTypes[index].toString(),
    ]));
  }

  const types = await queryDB(
    simpleTable,
    `DESCRIBE ${quoteIdentifier(simpleTable.name)}`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getTypes()",
      parameters: {},
    }),
  );

  const typesObj = extractTypes(types);

  return typesObj;
}
