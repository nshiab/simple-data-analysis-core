import getIdenticalColumns from "../helpers/getIdenticalColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function crossJoin(
  simpleTable: SimpleTable,
  rightTable: SimpleTable,
  options: {
    outputTable?: string | boolean;
  } = {},
): SimpleTable {
  if (options.outputTable === true) {
    options.outputTable = `table${simpleTable.sdb.tableIncrement}`;
    simpleTable.sdb.tableIncrement += 1;
  }

  // The output table instance is created at call time so it can be returned
  // synchronously and chained on right away.
  const outputTable = typeof options.outputTable === "string"
    ? simpleTable.sdb.newTable(options.outputTable)
    : simpleTable;

  queueOp(outputTable, {
    kind: "barrier",
    method: "crossJoin()",
    parameters: { rightTable: rightTable.name, options },
    execute: () => executeCrossJoin(simpleTable, rightTable, outputTable),
  });

  return outputTable;
}

async function executeCrossJoin(
  simpleTable: SimpleTable,
  rightTable: SimpleTable,
  outputTable: SimpleTable,
): Promise<void> {
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

  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${outputTable.name}" AS SELECT "${simpleTable.name}".*, "${rightTable.name}".* FROM "${simpleTable.name}" CROSS JOIN "${rightTable.name}";`,
    mergeOptions(simpleTable, {
      table: outputTable.name,
      method: "crossJoin()",
      parameters: { rightTable: rightTable.name },
    }),
  );
}
