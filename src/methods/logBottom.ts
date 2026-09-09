import type SimpleTable from "../class/SimpleTable.ts";
import logData from "../helpers/logData.ts";
import getBottom from "./getBottom.ts";

export default async function logBottom(
  simpleTable: SimpleTable,
  count?: number,
  options: { originalOrder?: boolean } = {},
) {
  const rows = count ?? simpleTable.rowsToLog;
  console.log(`\nTable ${simpleTable.name} (${rows} bottom rows):`);
  const data = await getBottom(simpleTable, rows, options, "logBottom()");
  logData(
    null,
    data,
    simpleTable.charsToLog,
  );
  return;
}
