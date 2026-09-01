import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function pad(
  simpleTable: SimpleTable,
  columns: string | string[],
  length: number,
  options: { side?: "left" | "right"; character?: string } = {},
) {
  if (!Number.isFinite(length) || !Number.isInteger(length) || length < 0) {
    throw new Error(
      "pad() length must be a finite integer greater than or equal to 0.",
    );
  }

  columns = Array.isArray(columns) ? [...columns] : columns;
  options = structuredClone(options);
  const columnList = stringToArray(columns);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "pad()",
    parameters: { columns, length, options },
    needsSchema: true,
    preservesSchema: true,
    values: padValues(columnList, length, options),
    buildSelect: (input, schema) =>
      padSelect(input, schema, columnList, length, options),
  });
}

function padSelect(
  input: string,
  schema: TableSchema,
  columns: string[],
  length: number,
  options: { side?: "left" | "right"; character?: string },
): string {
  for (const column of columns) {
    if (schema[column] !== "VARCHAR") {
      throw new Error(
        `The column ${quoteIdentifier(column)} is of type ${
          schema[column]
        }. The pad() method only works with string (VARCHAR) columns. Please convert the column to string first with the .convert() method.`,
      );
    }
  }

  const usedNames = new Set(Object.keys(schema));
  const overflowAliases = columns.map((_, index) => {
    let alias = `__sda_pad_overflow_${index}`;
    while (usedNames.has(alias)) {
      alias += "_";
    }
    usedNames.add(alias);
    return alias;
  });
  const func = options.side === "right" ? "RPAD" : "LPAD";
  const counts = columns.map((column, index) =>
    `COUNT(*) FILTER (WHERE LENGTH(${
      quoteIdentifier(column)
    }) > ${length}) OVER () AS ${quoteIdentifier(overflowAliases[index])}`
  ).join(", ");
  const replacements = columns.map((column, index) => {
    const alias = quoteIdentifier(overflowAliases[index]);
    return `CASE WHEN ${alias} > 0 THEN error(CONCAT(?, CAST(${alias} AS VARCHAR), ?)) ELSE ${func}(${
      quoteIdentifier(column)
    }, ${length}, ?) END AS ${quoteIdentifier(column)}`;
  }).join(", ");
  const excluded = overflowAliases.map(quoteIdentifier).join(", ");
  return `SELECT * EXCLUDE (${excluded}) REPLACE (${replacements})
FROM (
  SELECT *, ${counts} FROM ${input}
) AS ${quoteIdentifier("__sda_pad_source")}`;
}

function padValues(
  columns: string[],
  length: number,
  options: { character?: string },
): string[] {
  const character = options.character ?? "0";
  return columns.flatMap((column) => [
    `The column ${quoteIdentifier(column)} has `,
    ` string(s) exceeding the target length of ${length}. The pad() method does not truncate. Shorten the strings first or use a larger target length.`,
    character,
  ]);
}
