import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function selectRows(
  simpleTable: SimpleTable,
  count: number | string,
  options: { offset?: number; outputTable?: string | boolean } = {},
) {
  if (options.outputTable === true) {
    options.outputTable = `table${simpleTable.sdb.tableIncrement}`;
    simpleTable.sdb.tableIncrement += 1;
  }
  await queryDB(
    simpleTable,
    selectRowsQuery(simpleTable.name, count, options),
    mergeOptions(simpleTable, {
      table: typeof options.outputTable === "string"
        ? options.outputTable
        : simpleTable.name,
      method: "selectRows",
      parameters: { count, options },
    }),
  );

  if (typeof options.outputTable === "string") {
    return simpleTable.sdb.newTable(options.outputTable);
  } else {
    return simpleTable;
  }
}

function selectRowsQuery(
  table: string,
  count: number | string,
  options: { offset?: number; outputTable?: string | boolean } = {},
) {
  return `CREATE OR REPLACE TABLE "${
    options.outputTable ?? table
  }" AS SELECT * FROM "${table}" LIMIT ${count}${
    typeof options.offset === "number" ? ` OFFSET ${options.offset}` : ""
  };`;
}
