import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import resolveOutputTable from "../helpers/resolveOutputTable.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function selectRows(
  simpleTable: SimpleTable,
  count: number | string,
  options: { offset?: number; outputTable?: string | boolean } = {},
): SimpleTable {
  options = { ...options };
  options.outputTable = resolveOutputTable(simpleTable, options.outputTable);

  const limitAndOffset = `LIMIT ${count}${
    typeof options.offset === "number" ? ` OFFSET ${options.offset}` : ""
  }`;

  if (typeof options.outputTable === "string") {
    // The output table instance is created at call time so it can be
    // returned synchronously and chained on right away.
    const outputTable = simpleTable.sdb.newTable(options.outputTable);
    queueOp(outputTable, {
      kind: "fusable",
      method: "selectRows()",
      parameters: { count, options },
      needsSchema: false,
      // The output table reads simpleTable by name rather than through its
      // own (nonexistent) chain, so simpleTable's pending work must close
      // and execute before this SELECT runs, as it would at this call
      // position.
      rawSQL: [`${quoteIdentifier(simpleTable.name)}`],
      buildSelect: () =>
        `SELECT * FROM ${quoteIdentifier(simpleTable.name)} ${limitAndOffset}`,
    });
    return outputTable;
  }

  queueOp(simpleTable, {
    kind: "fusable",
    method: "selectRows()",
    parameters: { count, options },
    needsSchema: false,
    preservesSchema: true,
    buildSelect: (input) => `SELECT * FROM ${input} ${limitAndOffset}`,
  });
  return simpleTable;
}
