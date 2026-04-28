/**
 * Capitalizes the first letter of a given string.
 *
 * @param string - The string to be capitalized.
 *
 * @returns A new string with the first letter in uppercase.
 *
 * @example
 * ```ts
 * // Basic usage
 * const capitalized = capitalize("hello world");
 * console.log(capitalized); // "Hello world"
 * ```
 * @example
 * ```ts
 * // With an already capitalized string
 * const alreadyCapitalized = capitalize("Journalism");
 * console.log(alreadyCapitalized); // "Journalism"
 * ```
 * @example
 * ```ts
 * // With a single character
 * const singleChar = capitalize("a");
 * console.log(singleChar); // "A"
 * ```
 */
export default function capitalize(string: string): string {
  if (string.length === 0) {
    return string;
  }
  const first = string[0];
  return first.toUpperCase() + string.slice(1);
}
