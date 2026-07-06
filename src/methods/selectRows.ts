import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function selectRows(
  simpleTable: SimpleTable,
  count: number | string,
  options: { offset?: number; outputTable?: string | boolean } = {},
): SimpleTable {
  if (options.outputTable === true) {
    options.outputTable = `table${simpleTable.sdb.tableIncrement}`;
    simpleTable.sdb.tableIncrement += 1;
  }

  const limitAndOffset = `LIMIT ${count}${
    typeof options.offset === "number" ? ` OFFSET ${options.offset}` : ""
  }`;

  if (typeof options.outputTable === "string") {
    // The output table instance is created at call time so it can be
    // returned synchronously and chained on right away.
    const outputTable = simpleTable.sdb.newTable(options.outputTable);
    queueOp(outputTable, {
      kind: "barrier",
      method: "selectRows()",
      parameters: { count, options },
      execute: async () => {
        await queryDB(
          simpleTable,
          `CREATE OR REPLACE TABLE "${outputTable.name}" AS SELECT * FROM "${simpleTable.name}" ${limitAndOffset};`,
          mergeOptions(simpleTable, {
            table: outputTable.name,
            method: "selectRows",
            parameters: { count, options },
          }),
        );
      },
    });
    return outputTable;
  }

  queueOp(simpleTable, {
    kind: "fusable",
    method: "selectRows()",
    parameters: { count, options },
    needsSchema: false,
    buildSelect: (input) => `SELECT * FROM ${input} ${limitAndOffset}`,
  });
  return simpleTable;
}
