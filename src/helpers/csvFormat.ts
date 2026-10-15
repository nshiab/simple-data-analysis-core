import stringifyUnknown from "./stringifyUnknown.ts";
/*
 * Formatting subset of d3-dsv 3.0.1: https://github.com/d3/d3-dsv
 * Copyright 2013-2021 Mike Bostock
 *
 * Permission to use, copy, modify, and/or distribute this software for any purpose
 * with or without fee is hereby granted, provided that the above copyright notice
 * and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
 * OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
 * TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
 * THIS SOFTWARE.
 */

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function formatDate(date: Date): string {
  if (Number.isNaN(date.getTime())) return "Invalid Date";
  const year = date.getUTCFullYear();
  const formattedYear =
    year < 0 ? `-${pad(-year, 6)}` : year > 9999 ? `+${pad(year, 6)}` : pad(year, 4);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const milliseconds = date.getUTCMilliseconds();
  const day = `${formattedYear}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
  const time = `${pad(hours, 2)}:${pad(minutes, 2)}`;
  return (
    day +
    (milliseconds
      ? `T${time}:${pad(seconds, 2)}.${pad(milliseconds, 3)}Z`
      : seconds
        ? `T${time}:${pad(seconds, 2)}Z`
        : minutes || hours
          ? `T${time}Z`
          : "")
  );
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return formatDate(value);
  const text = stringifyUnknown(value, "default");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export default function csvFormat(
  rows: Record<string, unknown>[],
  columns?: string[] | null,
): string {
  if (columns == null) {
    const seen = new Set<string>();
    columns = [];
    for (const row of rows) {
      for (const column in row) {
        if (!seen.has(column)) {
          seen.add(column);
          columns.push(column);
        }
      }
    }
  }
  const fields = columns;
  return [
    fields.map(formatValue).join(","),
    ...rows.map((row) => fields.map((column) => formatValue(row[column])).join(",")),
  ].join("\n");
}
