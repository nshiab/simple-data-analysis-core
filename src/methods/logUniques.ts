import type SimpleTable from "../class/SimpleTable.ts";
import logData from "../helpers/logData.ts";

export default async function logUniques(
  simpleTable: SimpleTable,
  column: string | string[],
  options: { stringify?: boolean } = {},
) {
  if (typeof column === "string") {
    const values = await simpleTable.getUniques(column);
    console.log(`\nTable ${simpleTable.name} — unique values in ${column}:`);
    console.log(options.stringify ? JSON.stringify(values, null, 2) : values);
  } else {
    const values = await simpleTable.getUniques(column);
    console.log(`\nTable ${simpleTable.name} — unique combinations in ${column.join(", ")}:`);
    if (options.stringify) {
      console.log(JSON.stringify(values, null, 2));
    } else {
      logData(null, values, simpleTable.charsToLog);
    }
  }
}
