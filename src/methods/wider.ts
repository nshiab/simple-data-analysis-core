import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function wider(
  simpleTable: SimpleTable,
  namesFrom: string,
  valuesFrom: string,
  options: {
    aggregation?: "sum" | "count" | "min" | "max" | "avg" | "median" | "first";
  } = {},
) {
  const aggregation = options.aggregation ?? "sum";

  // DuckDB rewrites PIVOT into multiple statements internally, so it can't
  // be part of a fused chain: it executes as a barrier.
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "wider()",
    parameters: { namesFrom, valuesFrom, options },
    execute: async () => {
      await queryDB(
        simpleTable,
        `CREATE OR REPLACE TABLE ${
          quoteIdentifier(simpleTable.name)
        } AS SELECT * FROM (PIVOT ${quoteIdentifier(simpleTable.name)} ON ${
          quoteIdentifier(namesFrom)
        } USING ${aggregation}(${quoteIdentifier(valuesFrom)}));`,
        mergeOptions(simpleTable, {
          table: simpleTable.name,
          method: "wider()",
          parameters: { namesFrom, valuesFrom, options },
        }),
      );
    },
  });
}
