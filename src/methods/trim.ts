import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import stringToArray from "../helpers/stringToArray.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";

export default function trim(
  simpleTable: SimpleTable,
  columns: "all" | string | string[],
  options: {
    character?: string;
    side?: "left" | "right" | "both";
  } = {},
) {
  const cols = columns === "all" ? null : stringToArray(columns);
  const resolveColumns = (schema: TableSchema) =>
    cols ??
      Object.keys(schema).filter((column) => schema[column] === "VARCHAR");
  const side = options.side ?? "both";
  const fn = side === "left"
    ? "LTRIM"
    : side === "right"
    ? "RTRIM"
    : side === "both"
    ? "TRIM"
    : null;
  if (fn === null) {
    throw new Error(
      `trim() options.side must be "left", "right", or "both". Received ${
        JSON.stringify(options.side)
      }.`,
    );
  }
  const character = options.character;
  const specialCharacter = typeof character === "string" ? ", ?" : "";

  queueOp(simpleTable, {
    kind: "fusable",
    method: "trim()",
    parameters: { columns, options },
    values: typeof character === "string"
      ? (schema) => resolveColumns(schema).map(() => character)
      : undefined,
    needsSchema: columns === "all",
    buildSelect: (input, schema) => {
      const selectedColumns = resolveColumns(schema);
      if (columns === "all" && selectedColumns.length === 0) {
        return `SELECT * FROM ${input}`;
      }
      return `SELECT * REPLACE (${
        selectedColumns
          .map((c) =>
            `${fn}(${quoteIdentifier(c)}${specialCharacter}) AS ${
              quoteIdentifier(c)
            }`
          )
          .join(", ")
      }) FROM ${input}`;
    },
  });
}
