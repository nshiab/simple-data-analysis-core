import getIdenticalColumns from "../helpers/getIdenticalColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function crossJoin(
  simpleTable: SimpleTable,
  rightTable: SimpleTable,
  options: {
    outputTable?: string | boolean;
  } = {},
) {
  const identicalColumns = getIdenticalColumns(
    await simpleTable.getColumns(),
    await rightTable.getColumns(),
  );
  if (identicalColumns.length > 0) {
    throw new Error(
      `The tables have columns with identical names. Rename or remove ${
        identicalColumns.map((d) => `"${d}"`).join(", ")
      } in one of the two tables before doing the cross join.`,
    );
  }

  if (options.outputTable === true) {
    options.outputTable = `table${simpleTable.sdb.tableIncrement}`;
    simpleTable.sdb.tableIncrement += 1;
  }
  await queryDB(
    simpleTable,
    crossJoinQuery(simpleTable.name, rightTable.name, options),
    mergeOptions(simpleTable, {
      table: typeof options.outputTable === "string"
        ? options.outputTable
        : simpleTable.name,
      method: "crossJoin()",
      parameters: { rightTable, options },
    }),
  );

  if (typeof options.outputTable === "string") {
    return simpleTable.sdb.newTable(options.outputTable);
  } else {
    return simpleTable;
  }
}

function crossJoinQuery(
  table: string,
  rightTable: string,
  options: {
    outputTable?: string | boolean;
  } = {},
) {
  return `CREATE OR REPLACE TABLE "${
    options.outputTable ?? table
  }" AS SELECT "${table}".*, "${rightTable}".* FROM "${table}" CROSS JOIN "${rightTable}";`;
}
