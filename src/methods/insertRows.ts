import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import { executePreparedArray, prepareArray } from "./loadArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import toDuckDBValue from "../helpers/toDuckDBValue.ts";

export default function insertRows(
  simpleTable: SimpleTable,
  rows: { [key: string]: unknown }[],
) {
  const prepared = prepareArray(rows);
  const statement = insertRowsStatement(simpleTable.name, rows);
  // Whether the rows are inserted or loaded depends on the table existing,
  // so insertRows can't be expressed as a single SELECT over its input: it
  // executes as a barrier.
  queueOp(simpleTable, {
    kind: "barrier",
    method: "insertRows()",
    parameters: { rows: `${rows.length} rows` },
    execute: async () => {
      if (await simpleTable.sdb.hasTable(simpleTable.name)) {
        await queryDB(
          simpleTable,
          statement.query,
          mergeOptions(simpleTable, {
            table: simpleTable.name,
            method: "insertRows()",
            parameters: { rows: `${rows.length} rows` },
            values: statement.values,
          }),
        );
      } else {
        await executePreparedArray(simpleTable, prepared);
      }
    },
  });
}

function insertRowsStatement(
  table: string,
  rows: { [key: string]: unknown }[],
): { query: string; values: import("@duckdb/node-api").DuckDBValue[] } {
  const columns = Object.keys(rows[0]);
  const values = rows.flatMap((row) =>
    columns.map((column) => toDuckDBValue(row[column]))
  );

  let query = `INSERT INTO ${quoteIdentifier(table)} (${
    columns.map(quoteIdentifier).join(", ")
  })
        VALUES`;

  for (const _row of rows) {
    query += `\n(${columns.map(() => "?").join(", ")}),`;
  }

  return { query: query.slice(0, query.length - 1), values };
}
