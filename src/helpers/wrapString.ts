import splitGraphemes from "./splitGraphemes.ts";

/**
 * Wraps a string to a specified maximum width, attempting to break at word
 * boundaries when possible. If a single word exceeds the maximum width, it
 * will be broken at a grapheme boundary, keeping combining accents with their
 * letters. This function is primarily used for preparing text to be displayed
 * in console tables. Widths count graphemes, not terminal columns for wide
 * characters or emoji.
 *
 * @example
 * ```typescript
 * const text = "This is a very long sentence that needs to be wrapped";
 * const wrapped = wrapString(text, 20);
 * console.log(wrapped);
 * // Output:
 * // This is a very long
 * // sentence that needs
 * // to be wrapped
 * ```
 *
 * @example
 * ```typescript
 * // Character-based wrapping (no word boundaries)
 * const text = "Thisisaverylongword";
 * const wrapped = wrapString(text, 10, false);
 * // Output: Thisisaver
 * //         ylongword
 * ```
 *
 * @param str - The string to wrap.
 *
 * @param maxWidth - The maximum number of graphemes in each line.
 *
 * @param wordWrap - If true, attempts to break at word boundaries. If false,
 *   breaks at grapheme boundaries. Defaults to `true`.
 *
 * @returns The wrapped string with newline characters inserted at appropriate
 *   positions.
 */
export default function wrapString(
  str: string,
  maxWidth: number,
  wordWrap = true,
): string {
  const graphemes = splitGraphemes(str);
  if (graphemes.length <= maxWidth) {
    return str;
  }

  if (!wordWrap) {
    // Simple grapheme-based wrapping
    const lines: string[] = [];
    for (let i = 0; i < graphemes.length; i += maxWidth) {
      lines.push(graphemes.slice(i, i + maxWidth).join(""));
    }
    return lines.join("\n");
  }

  // Word-aware wrapping
  const lines: string[] = [];
  let currentLine = "";
  let currentWidth = 0;

  const words = str.split(/(\s+)/); // Split but keep whitespace

  for (const word of words) {
    const wordGraphemes = splitGraphemes(word);
    const wordWidth = wordGraphemes.length;
    // If adding this word would exceed maxWidth
    if (currentWidth + wordWidth > maxWidth) {
      // If current line is not empty, save it
      if (currentLine.length > 0) {
        lines.push(currentLine.trimEnd());
        currentLine = "";
        currentWidth = 0;
      }

      // If the word itself is longer than maxWidth, break it
      if (wordWidth > maxWidth) {
        for (let i = 0; i < wordWidth; i += maxWidth) {
          const chunk = wordGraphemes.slice(i, i + maxWidth).join("");
          if (i + maxWidth < wordWidth) {
            lines.push(chunk);
          } else {
            currentLine = chunk;
            currentWidth = wordWidth - i;
          }
        }
      } else {
        currentLine = word;
        currentWidth = wordWidth;
      }
    } else {
      currentLine += word;
      currentWidth += wordWidth;
    }
  }

  // Add any remaining text
  if (currentLine.length > 0) {
    lines.push(currentLine.trimEnd());
  }

  return lines.join("\n");
}
