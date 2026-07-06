import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function cloneTable(
  simpleTable: SimpleTable,
  nameOrOptions: string | {
    outputTable?: string;
    conditions?: string;
    columns?: string | string[];
    nbRows?: number;
    offset?: number;
  } = {},
): SimpleTable {
  const columns = typeof nameOrOptions === "object" && nameOrOptions.columns
    ? stringToArray(nameOrOptions.columns)
    : [];

  // The cloned table instance is created at call time so it can be returned
  // synchronously and chained on right away. Delegating to sdb.newTable()
  // makes subclasses using tableClass work correctly.
  let clonedTable: SimpleTable;
  const options = typeof nameOrOptions === "string"
    ? { outputTable: nameOrOptions }
    : nameOrOptions;
  if (typeof options.outputTable === "string") {
    clonedTable = simpleTable.sdb.newTable(options.outputTable);
  } else {
    clonedTable = simpleTable.sdb.newTable(undefined);
  }

  queueOp(clonedTable, {
    kind: "barrier",
    method: "cloneTable()",
    parameters: { options },
    execute: async () => {
      await queryDB(
        simpleTable,
        cloneQuery(simpleTable.name, clonedTable.name, columns, options),
        mergeOptions(simpleTable, {
          table: clonedTable.name,
          method: "cloneTable()",
          parameters: { options },
        }),
      );
      clonedTable.connection = clonedTable.sdb.connection;
    },
  });

  return clonedTable;
}

function cloneQuery(
  table: string,
  newTable: string,
  columns: string[],
  options: {
    conditions?: string;
    nbRows?: number;
    offset?: number;
  } = {},
) {
  const selectClause = columns.length > 0
    ? columns.map((col) => `"${col}"`).join(", ")
    : "*";

  return `CREATE OR REPLACE TABLE "${newTable}" AS SELECT ${selectClause} FROM "${table}"${
    options.conditions ? ` WHERE ${options.conditions}` : ""
  }${typeof options.nbRows === "number" ? ` LIMIT ${options.nbRows}` : ""}${
    typeof options.offset === "number" ? ` OFFSET ${options.offset}` : ""
  }`;
}
