const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Formats a `Date` object into a human-readable string using only the format
 * strings actually used in the project.
 *
 * @param date - The `Date` object to format.
 * @param format - The format string to use. Only `"Month DD, YYYY, at HH:MM period"` and `"Month DD"` are supported.
 * @param options - Optional settings.
 * @param options.utc - If `true`, format the date in UTC instead of local time. Defaults to `false`.
 * @returns The formatted date string.
 *
 * @example
 * ```ts
 * // Format a date with time (local time).
 * const date = new Date("2023-01-01T01:35:00");
 * const formatted = formatDate(date, "Month DD, YYYY, at HH:MM period");
 * console.log(formatted); // "January 1, 2023, at 1:35 a.m."
 * ```
 * @example
 * ```ts
 * // Format a date as month and day only (UTC).
 * const formatted = formatDate(new Date("2023-01-01"), "Month DD", { utc: true });
 * console.log(formatted); // "January 1"
 * ```
 * @example
 * ```ts
 * // Minutes of ":00" are omitted.
 * const formatted = formatDate(new Date("2023-01-01T01:00:00"), "Month DD, YYYY, at HH:MM period", { utc: true });
 * console.log(formatted); // "January 1, 2023, at 1 a.m."
 * ```
 */
export default function formatDate(
  date: Date,
  format: "Month DD, YYYY, at HH:MM period" | "Month DD",
  options: { utc?: boolean } = {},
): string {
  const getFullYear = options.utc ? date.getUTCFullYear : date.getFullYear;
  const getMonth = options.utc ? date.getUTCMonth : date.getMonth;
  const getDate = options.utc ? date.getUTCDate : date.getDate;
  const getHours = options.utc ? date.getUTCHours : date.getHours;
  const getMinutes = options.utc ? date.getUTCMinutes : date.getMinutes;

  const year = getFullYear.call(date);
  const month = MONTHS[getMonth.call(date)];
  const day = getDate.call(date);
  const hours = getHours.call(date);
  const minutes = getMinutes.call(date);

  const period = hours >= 12 ? "p.m." : "a.m.";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");

  if (format === "Month DD, YYYY, at HH:MM period") {
    const time = minutes === 0
      ? `${displayHours} ${period}`
      : `${displayHours}:${displayMinutes} ${period}`;
    return `${month} ${day}, ${year}, at ${time}`;
  } else if (format === "Month DD") {
    return `${month} ${day}`;
  }

  return "";
}
