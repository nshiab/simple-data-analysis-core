/**
 * Normalizes a string or array of strings to a new array.
 * Existing arrays are copied so callers can change the result independently.
 *
 * @example
 * ```ts
 * import { stringToArray } from "@nshiab/simple-data-analysis-core/helpers";
 * console.log(stringToArray("name")); // ["name"]
 * console.log(stringToArray(["name", "age"])); // ["name", "age"]
 * ```
 *
 * @param argument - One string or an array of strings.
 *
 * @returns A new array containing the supplied strings.
 */
export default function stringToArray(argument: string | string[]): string[] {
  if (Array.isArray(argument)) {
    return [...argument];
  } else if (typeof argument === "string") {
    return [argument];
  } else {
    throw new Error(`argument should be a string or an array of strings.`);
  }
}
