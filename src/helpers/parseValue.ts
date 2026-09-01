/**
 * Converts a JavaScript value to a SQL literal. Strings are quoted with embedded
 * quotes escaped, dates become quoted ISO strings, and null, undefined, or NaN
 * become `"NULL"`. Numbers and booleans are returned unchanged.
 *
 * @param value - A string, number, boolean, Date, null, or undefined.
 * @returns A SQL literal, or the original number or boolean.
 * @throws If the value has an unsupported type.
 *
 * @example
 * ```ts
 * import { parseValue } from "@nshiab/simple-data-analysis-core/helpers";
 * console.log(parseValue("O'Brien")); // "'O''Brien'"
 * console.log(parseValue(null)); // "NULL"
 * ```
 */
export default function parseValue(value: unknown): string | boolean | number {
  if (Number.isNaN(value) || value === undefined || value === null) {
    return "NULL";
  } else if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  } else if (typeof value === "string") {
    return `'${value.replaceAll("'", "''")}'`;
  } else if (typeof value === "boolean") {
    return value;
  } else if (typeof value === "number") {
    return value;
  } else {
    throw new Error(`Unknown type ${typeof value} of ${value}.`);
  }
}
