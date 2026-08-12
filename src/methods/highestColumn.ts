import type SimpleTable from "../class/SimpleTable.ts";
import queueExtremeColumn from "./queueExtremeColumn.ts";

export default function highestColumn(
  simpleTable: SimpleTable,
  columns: string[],
  newColumn: string,
  options: {
    ties?: "strict" | "first" | "all";
  } = {},
) {
  queueExtremeColumn(simpleTable, columns, newColumn, "highest", options);
}
