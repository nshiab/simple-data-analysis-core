import type SimpleTable from "../class/SimpleTable.ts";
import mergeOptions from "./mergeOptions.ts";
import queryDB from "./queryDB.ts";
import quoteIdentifier from "./quoteIdentifier.ts";
import quoteQualifiedIdentifier from "./quoteQualifiedIdentifier.ts";
import roundExpression, { isFractionalType, validateDecimals } from "./roundExpression.ts";

export default async function readRoundedExtrema(
  table: SimpleTable,
  column: string,
  decimals: number,
  method: string,
  aggregates: ("MIN" | "MAX")[],
): Promise<unknown[]> {
  validateDecimals(decimals);
  const reference = quoteQualifiedIdentifier(table.name, column);
  const expressions = aggregates.map((aggregate) => `${aggregate}(${reference})`);
  const options = mergeOptions(table, {
    table: table.name,
    method,
    parameters: { column, options: { decimals } },
    returnData: true,
  });
  // Read the type and extrema together so queued mutations cannot change the
  // input between discovering its type and reading its values.
  const rows = await queryDB(
    table,
    `SELECT ${expressions.map((expression, i) => `${expression} AS v${i}`).join(", ")},
      typeof(${expressions[0]}) AS value_type FROM ${quoteIdentifier(table.name)}`,
    options,
  );
  if (!rows?.[0]) throw new Error("The query did not return a result.");
  const row = rows[0];
  const values = expressions.map((_, i) => row[`v${i}`]);
  const type = row.value_type;
  if (
    typeof type !== "string" ||
    !isFractionalType(type) ||
    values.every((value) => value === null)
  ) {
    return values;
  }

  // Only the captured scalar values are needed from here. Keep fixed-point
  // values in their native SQL type and do not flush later table operations.
  const rounded = await table.runQuery(
    `SELECT ${values.map((_, i) => `${roundExpression(`?::${type}`, decimals)} AS v${i}`).join(", ")}`,
    table.connection!,
    true,
    {
      ...options,
      values: values.map((value) => {
        if (value === null || typeof value === "number" || typeof value === "string") return value;
        throw new Error(`Unexpected ${type} value while rounding ${method}.`);
      }),
      logSQL: table.sdb.logSQL,
      explainSQL: table.sdb.explainSQL,
    },
  );
  if (!rounded?.[0]) throw new Error("The query did not return a result.");
  return values.map((_, i) => rounded[0][`v${i}`]);
}
