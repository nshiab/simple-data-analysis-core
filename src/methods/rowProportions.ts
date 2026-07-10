import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function rowProportions(
  simpleTable: SimpleTable,
  columns: string[],
  options: {
    suffix?: string;
    decimals?: number;
  } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "rowProportions()",
    parameters: { columns, options },
    needsSchema: false,
    buildSelect: (input) => {
      let query = `SELECT *,`;

      for (const col of columns) {
        const tempQuery = `"${col}" / (${
          columns.map((d) => `"${d}"`).join(" + ")
        })`;
        if (typeof options.decimals === "number") {
          query += ` ROUND(${tempQuery}, ${options.decimals})`;
        } else {
          query += ` ${tempQuery}`;
        }
        query += ` AS "${col}${options.suffix ?? "Perc"}",`;
      }

      query += `FROM ${input}`;

      return query;
    },
  });
}
