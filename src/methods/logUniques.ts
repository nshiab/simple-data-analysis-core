import type SimpleTable from "../class/SimpleTable.ts";
import log from "./log.ts";
import getUniquesQuery from "./getUniquesQuery.ts";

export default async function logUniques(
  simpleTable: SimpleTable,
  column: string | string[],
  options:
    | "all"
    | number
    | {
        stringify?: boolean;
        count?: number | "all";
        types?: boolean;
        conditions?: string;
      } = {},
) {
  if (typeof column === "string") {
    if (
      typeof options !== "object" ||
      "count" in options ||
      "types" in options ||
      "conditions" in options
    ) {
      throw new Error("logUniques() table logging options require an array of column names.");
    }
    const values = await simpleTable.getUniques(column);
    console.log(`\nTable ${simpleTable.name} — unique values in ${column}:`);
    console.log(
      "stringify" in options && options.stringify ? JSON.stringify(values, null, 2) : values,
    );
  } else {
    if (typeof options === "object" && "stringify" in options) {
      throw new Error("logUniques() stringify is only supported with a single column name.");
    }
    await log(simpleTable, options, {
      query: getUniquesQuery(simpleTable, column),
      title: `\nTable ${simpleTable.name} — unique combinations in ${column.join(", ")}:`,
    });
  }
}
