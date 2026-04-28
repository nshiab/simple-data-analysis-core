/**
 * Rounds a number based on specified criteria: a fixed number of decimal places or to a specific number of significant digits.
 *
 * @param number - The number to be rounded.
 * @param options - An object containing options for rounding.
 * @param options.decimals - The number of decimal places to keep when rounding.
 * @param options.significantDigits - The number of significant digits to retain.
 * @returns The rounded number.
 * @throws {Error} If more than one rounding option is provided.
 *
 * @example
 * ```ts
 * // Round to one decimal place.
 * const result = round(1234.567, { decimals: 1 });
 * console.log(result); // 1234.6
 * ```
 * @example
 * ```ts
 * // Round to 3 significant digits.
 * const result = round(0.004622, { significantDigits: 3 });
 * console.log(result); // 0.00462
 * ```
 */
function round(
  number: number,
  options: {
    decimals?: number;
    significantDigits?: number;
  } = {},
): number {
  if (
    typeof options.decimals === "number" &&
    typeof options.significantDigits === "number"
  ) {
    throw new Error(
      "You can't use options decimals and significantDigits together. Pick one.",
    );
  }

  if (typeof options.decimals === "number") {
    return parseFloat(number.toFixed(options.decimals));
  } else if (typeof options.significantDigits === "number") {
    return parseFloat(number.toPrecision(options.significantDigits));
  } else {
    return Math.round(number);
  }
}

/**
 * Formats a number with thousands separators, decimals, abbreviations, and more.
 *
 * @param number - The number to be formatted.
 * @param options - An object containing various formatting options.
 * @param options.decimals - The number of decimal places to round to.
 * @param options.significantDigits - The number of significant digits to round to.
 * @param options.abbreviation - If `true`, the number will be abbreviated (e.g., 1,200,000 becomes "1.2M").
 * @param options.prefix - A string to prepend before the formatted number.
 * @param options.suffix - A string to append after the formatted number.
 *
 * @returns The formatted number as a string.
 *
 * @example
 * ```ts
 * // Basic usage: Format a number with thousands separator.
 * const num1 = formatNumber(1234567.89);
 * console.log(num1); // "1,234,567.89"
 * ```
 * @example
 * ```ts
 * // With significant digits and suffix.
 * const num2 = formatNumber(66.666, { significantDigits: 3, suffix: "%" });
 * console.log(num2); // "66.7%"
 * ```
 * @example
 * ```ts
 * // Abbreviation.
 * const num3 = formatNumber(12000, { abbreviation: true });
 * console.log(num3); // "12K"
 * ```
 * @example
 * ```ts
 * // With decimal places.
 * const num4 = formatNumber(123.456, { decimals: 1 });
 * console.log(num4); // "123.5"
 * ```
 */
export default function formatNumber(
  number: number,
  options: {
    decimals?: number;
    significantDigits?: number;
    abbreviation?: boolean;
    prefix?: string;
    suffix?: string;
  } = {},
): string {
  if (typeof number !== "number") {
    throw new Error("Not a number");
  }

  const mergedOptions: {
    decimals?: number;
    significantDigits?: number;
    abbreviation?: boolean;
    prefix: string;
    suffix: string;
  } = {
    prefix: "",
    suffix: "",
    ...options,
  };

  // Handle abbreviation (K/M/B/T)
  let abbreviation = "";
  if (mergedOptions.abbreviation && number !== 0) {
    const abbreviations = ["", "K", "M", "B", "T"];
    const index = Math.floor(
      Math.log10(Math.abs(number)) / 3,
    );
    abbreviation = abbreviations[index] ?? "";
    number = number / Math.pow(10, index * 3);
  }

  // Round if needed
  if (
    typeof mergedOptions.decimals === "number" ||
    typeof mergedOptions.significantDigits === "number"
  ) {
    number = round(number, {
      decimals: mergedOptions.decimals,
      significantDigits: mergedOptions.significantDigits,
    });
  }

  // Format with thousands separator
  const regex = /\B(?=(\d{3})+(?!\d))/g;
  const [integers, decimals] = number.toString().split(".");

  const formattedIntegers = integers.replace(regex, ",");
  const formattedNumber = decimals
    ? `${formattedIntegers}.${decimals}`
    : formattedIntegers;

  // Handle dollar sign prefix placement (after minus sign for negative numbers)
  if (mergedOptions.prefix === "$") {
    if (formattedNumber.startsWith("-")) {
      return `-${mergedOptions.prefix}${
        formattedNumber.slice(1)
      }${abbreviation}${mergedOptions.suffix}`;
    } else if (formattedNumber.startsWith("+")) {
      return `+${mergedOptions.prefix}${
        formattedNumber.slice(1)
      }${abbreviation}${mergedOptions.suffix}`;
    } else {
      return `${mergedOptions.prefix}${formattedNumber}${abbreviation}${mergedOptions.suffix}`;
    }
  }

  return `${mergedOptions.prefix}${formattedNumber}${abbreviation}${mergedOptions.suffix}`;
}
