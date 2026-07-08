import parseValue from "../helpers/parseValue.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function replaceNulls(
  simpleTable: SimpleTable,
  columns: "all" | string | string[],
  value: number | string | Date | boolean,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "replaceNulls()",
    // The schema resolves "all" to the column list and gives each column's
    // type: v1 replaced nulls with an UPDATE, which assignment-casts the
    // value to the column's type (e.g. 0 into a VARCHAR column becomes '0').
    // COALESCE can't mix types, so the value is cast to the column's type to
    // reproduce that.
    needsSchema: true,
    preservesSchema: true,
    parameters: { columns, value },
    buildSelect: (input, schema) => {
      const columnList = columns === "all"
        ? Object.keys(schema)
        : stringToArray(columns);
      const valueParsed = parseValue(value);
      return `SELECT * REPLACE (${
        columnList
          .map((column) =>
            `COALESCE("${column}", CAST(${valueParsed} AS ${
              schema[column]
            })) AS "${column}"`
          )
          .join(", ")
      }) FROM ${input}`;
    },
  });
}
