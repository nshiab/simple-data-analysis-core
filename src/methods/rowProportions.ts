import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function rowProportions(
  simpleTable: SimpleTable,
  columns: string[],
  options: {
    suffix?: string;
    base?: number;
    decimals?: number;
  } = {},
) {
  if (
    options.base !== undefined &&
    (!Number.isFinite(options.base) || options.base <= 0)
  ) {
    throw new Error(
      "rowProportions() options.base must be a finite number greater than 0.",
    );
  }
  columns = [...columns];
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "rowProportions()",
    parameters: { columns, options },
    needsSchema: true,
    buildSelect: (input, schema) => {
      const suffix = options.suffix ?? "Perc";
      assertNewColumns(
        schema,
        columns.map((col) => `${col}${suffix}`),
        "rowProportions()",
      );

      let query = `SELECT *,`;

      for (const col of columns) {
        const tempQuery = `${quoteIdentifier(col)} / (${
          columns.map((d) => `${quoteIdentifier(d)}`).join(" + ")
        }) * ${options.base ?? 1}`;
        if (typeof options.decimals === "number") {
          query += ` ROUND(${tempQuery}, ${options.decimals})`;
        } else {
          query += ` ${tempQuery}`;
        }
        query += ` AS ${quoteIdentifier(`${col}${suffix}`)},`;
      }

      query += `FROM ${input}`;

      return query;
    },
  });
}
