import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function pad(
  simpleTable: SimpleTable,
  columns: string | string[],
  length: number,
  options: { side?: "left" | "right"; character?: string } = {},
) {
  // The overflow pre-validation queries the data, so pad can't be expressed
  // as a single SELECT over its input: it executes as a barrier.
  columns = Array.isArray(columns) ? [...columns] : columns;
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "pad()",
    parameters: { columns, length, options },
    execute: () => executePad(simpleTable, columns, length, options),
  });
}

async function executePad(
  simpleTable: SimpleTable,
  columns: string | string[],
  length: number,
  options: { side?: "left" | "right"; character?: string },
) {
  const columnList = stringToArray(columns);

  // Validate all columns are string type
  const allTypes = await simpleTable.getTypes();
  for (const column of columnList) {
    if (allTypes[column] !== "VARCHAR") {
      throw new Error(
        `The column ${quoteIdentifier(column)} is of type ${
          allTypes[column]
        }. The pad() method only works with string (VARCHAR) columns. Please convert the column to string first with the .convert() method.`,
      );
    }
  }

  // Pre-validation: check for strings exceeding the target length, for all
  // columns in one scan.
  const overflowResult = await queryDB(
    simpleTable,
    `SELECT ${
      columnList
        .map(
          (column) =>
            `COUNT(*) FILTER (WHERE LENGTH(${
              quoteIdentifier(column)
            }) > ${length}) AS ${quoteIdentifier(column)}`,
        )
        .join(", ")
    } FROM ${quoteIdentifier(simpleTable.name)};`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "pad()",
      parameters: { columns, length, options },
      returnData: true,
    }),
  );
  for (const column of columnList) {
    const overflowCount = Number(overflowResult![0][column]);
    if (overflowCount > 0) {
      throw new Error(
        `The column ${
          quoteIdentifier(column)
        } has ${overflowCount} string(s) exceeding the target length of ${length}. The pad() method does not truncate. Shorten the strings first or use a larger target length.`,
      );
    }
  }

  const padded = padQuery(simpleTable.name, columnList, length, options);
  await queryDB(
    simpleTable,
    padded.query,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "pad()",
      parameters: { columns, length, options },
      values: padded.values,
    }),
  );
}

function padQuery(
  table: string,
  columns: string[],
  length: number,
  options: { side?: "left" | "right"; character?: string },
): { query: string; values: string[] } {
  const side = options.side ?? "left";
  const character = options.character ?? "0";

  const func = side === "left" ? "LPAD" : "RPAD";

  // All columns are padded in a single UPDATE, so the table is rewritten
  // once instead of once per column.
  const query = `UPDATE ${quoteIdentifier(table)} SET ${
    columns
      .map(
        (column) =>
          `${quoteIdentifier(column)} = ${func}(${
            quoteIdentifier(column)
          }, ${length}, ?)`,
      )
      .join(", ")
  };`;
  return { query, values: columns.map(() => character) };
}
