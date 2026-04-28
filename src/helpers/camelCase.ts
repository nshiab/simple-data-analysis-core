import capitalize from "./capitalize.ts";

/**
 * Converts a string into camelCase. This is useful for creating variable
 * names or object keys from human-readable text.
 *
 * @param input - The string to convert to camelCase. It can contain spaces,
 *   punctuation, and mixed casing.
 *
 * @returns The camelCased version of the input string.
 *
 * @example
 * ```ts
 * // Basic conversion
 * const result1 = camelCase("hello world");
 * console.log(result1); // "helloWorld"
 * ```
 * @example
 * ```ts
 * // With punctuation and mixed case
 * const result2 = camelCase("  --Some@Thing is- happening--  ");
 * console.log(result2); // "someThingIsHappening"
 * ```
 * @example
 * ```ts
 * // With a single word
 * const result3 = camelCase("Journalism");
 * console.log(result3); // "journalism"
 * ```
 */
export default function camelCase(input: string): string {
  const words = input
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((d) => d !== "");

  const camelCaseString = words
    .map((word, index) => {
      word = word.toLowerCase();
      if (index > 0) {
        word = capitalize(word);
      }
      return word;
    })
    .join("");

  return camelCaseString;
}
