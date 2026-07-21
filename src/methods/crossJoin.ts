import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import getIdenticalColumns from "../helpers/getIdenticalColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import resolveOutputTable from "../helpers/resolveOutputTable.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function crossJoin(
  simpleTable: SimpleTable,
  rightTable: SimpleTable,
  options: {
    outputTable?: string | boolean;
  } = {},
): SimpleTable {
  options = structuredClone(options);
  options.outputTable = resolveOutputTable(simpleTable, options.outputTable);

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
        identicalColumns.map((d) => `${quoteIdentifier(d)}`).join(", ")
      } in one of the two tables before doing the cross join.`,
    );
  }

  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE ${quoteIdentifier(outputTable.name)} AS SELECT ${
      quoteIdentifier(simpleTable.name)
    }.*, ${quoteIdentifier(rightTable.name)}.* FROM ${
      quoteIdentifier(simpleTable.name)
    } CROSS JOIN ${quoteIdentifier(rightTable.name)};`,
    mergeOptions(simpleTable, {
      table: outputTable.name,
      method: "crossJoin()",
      parameters: { rightTable: rightTable.name },
    }),
  );
}
