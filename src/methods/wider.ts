import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function wider(
  simpleTable: SimpleTable,
  namesFrom: string,
  valuesFrom: string,
) {
  // DuckDB rewrites PIVOT into multiple statements internally, so it can't
  // be part of a fused chain: it executes as a barrier.
  queueOp(simpleTable, {
    kind: "barrier",
    method: "wider()",
    parameters: { namesFrom, valuesFrom },
    execute: async () => {
      await queryDB(
        simpleTable,
        `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * FROM (PIVOT "${simpleTable.name}" ON "${namesFrom}" USING sum("${valuesFrom}"));`,
        mergeOptions(simpleTable, {
          table: simpleTable.name,
          method: "wider()",
          parameters: { namesFrom, valuesFrom },
        }),
      );
    },
  });
}
