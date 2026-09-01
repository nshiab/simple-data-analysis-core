import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function concatenate(
  simpleTable: SimpleTable,
  columns: string[],
  newColumn: string,
  options: {
    separator?: string;
  } = {},
) {
  columns = [...columns];
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "concatenate()",
    parameters: { columns, newColumn, options },
    needsSchema: true,
    values: typeof options.separator === "string"
      ? [options.separator]
      : undefined,
    buildSelect: (input, types) => {
      assertNewColumns(types, [newColumn], "concatenate()");
      const expression = typeof options.separator === "string"
        ? `CONCAT_WS(?, ${
          columns
            .map((d) => `${quoteIdentifier(d)}`)
            .join(", ")
        })`
        : `CONCAT(${columns.map((d) => `${quoteIdentifier(d)}`).join(", ")})`;
      return `SELECT *, CAST(${expression} AS VARCHAR) AS ${
        quoteIdentifier(newColumn)
      } FROM ${input}`;
    },
  });
}
