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
        `The column "${column}" is of type ${
          allTypes[column]
        }. The pad() method only works with string (VARCHAR) columns. Please convert the column to string first with the .convert() method.`,
      );
    }
  }

  // Pre-validation: check for strings exceeding target length
  for (const column of columnList) {
    const overflowResult = await queryDB(
      simpleTable,
      `SELECT COUNT(*) AS cnt FROM "${simpleTable.name}" WHERE LENGTH("${column}") > ${length};`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "pad()",
        parameters: { columns, length, options },
        returnData: true,
      }),
    );
    const overflowCount = Number(overflowResult![0].cnt);
    if (overflowCount > 0) {
      throw new Error(
        `The column "${column}" has ${overflowCount} string(s) exceeding the target length of ${length}. The pad() method does not truncate. Shorten the strings first or use a larger target length.`,
      );
    }
  }

  await queryDB(
    simpleTable,
    padQuery(simpleTable.name, columnList, length, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "pad()",
      parameters: { columns, length, options },
    }),
  );
}

function padQuery(
  table: string,
  columns: string[],
  length: number,
  options: { side?: "left" | "right"; character?: string },
) {
  const side = options.side ?? "left";
  const character = options.character ?? "0";

  // Escape single quotes and wrap in single quotes for SQL
  const escapedCharacter = character.replace(/'/g, "''");
  const paddedCharacter = `'${escapedCharacter}'`;
  const func = side === "left" ? "LPAD" : "RPAD";

  let query = "";
  for (const column of columns) {
    query +=
      `\nUPDATE "${table}" SET "${column}" = ${func}("${column}", ${length}, ${paddedCharacter});`;
  }

  return query;
}
