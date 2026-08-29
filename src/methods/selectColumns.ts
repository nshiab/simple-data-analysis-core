import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import stringToArray from "../helpers/stringToArray.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function selectColumns(
  simpleTable: SimpleTable,
  columns: string | string[],
) {
  columns = Array.isArray(columns) ? [...columns] : columns;
  const selectedColumns = stringToArray(columns);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "selectColumns()",
    parameters: { columns },
    needsSchema: false,
    outputSchema: (types) =>
      Object.fromEntries(
        selectedColumns
          .filter((column) => types[column] !== undefined)
          .map((column) => [column, types[column]]),
      ),
    buildSelect: (input) =>
      `SELECT ${
        selectedColumns
          .map((d) => `${quoteIdentifier(d)}`)
          .join(", ")
      } FROM ${input}`,
  });
}
