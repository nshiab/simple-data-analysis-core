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
    parameters: { columns, value },
    // The schema is only needed to resolve "all" to the column list.
    needsSchema: columns === "all",
    buildSelect: (input, schema) => {
      const columnList = columns === "all"
        ? Object.keys(schema)
        : stringToArray(columns);
      const valueParsed = parseValue(value);
      return `SELECT * REPLACE (${
        columnList
          .map((column) =>
            `COALESCE("${column}", ${valueParsed}) AS "${column}"`
          )
          .join(", ")
      }) FROM ${input}`;
    },
  });
}
