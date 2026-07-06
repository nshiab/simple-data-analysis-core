import mergeOptions from "./mergeOptions.ts";
import queryDB from "./queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

/**
 * Drops columns immediately, without queueing. For use inside a barrier's
 * execute, which runs during a flush: a sync builder method called there
 * would queue an operation for the next flush instead of running now.
 */
export default async function removeColumnsNow(
  simpleTable: SimpleTable,
  columns: string[],
  method: string,
): Promise<void> {
  await queryDB(
    simpleTable,
    columns.map((d) => `ALTER TABLE "${simpleTable.name}" DROP "${d}";`).join(
      "\n",
    ),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method,
      parameters: { columns },
    }),
  );
}
