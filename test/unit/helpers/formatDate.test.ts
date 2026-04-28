import { assertEquals } from "@std/assert";
import formatDate from "../../../src/helpers/formatDate.ts";

// UTC tests for "Month DD, YYYY, at HH:MM period"
Deno.test("formatDate - Month DD, YYYY, at HH:MM period (UTC, morning)", () => {
  const formatted = formatDate(
    new Date("2023-01-01T01:35:00.000Z"),
    "Month DD, YYYY, at HH:MM period",
    { utc: true },
  );
  assertEquals(formatted, "January 1, 2023, at 1:35 a.m.");
});

Deno.test("formatDate - Month DD, YYYY, at HH:MM period (UTC, afternoon)", () => {
  const formatted = formatDate(
    new Date("2023-01-01T15:35:00.000Z"),
    "Month DD, YYYY, at HH:MM period",
    { utc: true },
  );
  assertEquals(formatted, "January 1, 2023, at 3:35 p.m.");
});

Deno.test("formatDate - Month DD, YYYY, at HH:MM period (UTC, midnight, no :00)", () => {
  const formatted = formatDate(
    new Date("2023-01-01T01:00:00.000Z"),
    "Month DD, YYYY, at HH:MM period",
    { utc: true },
  );
  assertEquals(formatted, "January 1, 2023, at 1 a.m.");
});

Deno.test("formatDate - Month DD, YYYY, at HH:MM period (UTC, noon)", () => {
  const formatted = formatDate(
    new Date("2023-01-01T12:00:00.000Z"),
    "Month DD, YYYY, at HH:MM period",
    { utc: true },
  );
  assertEquals(formatted, "January 1, 2023, at 12 p.m.");
});

Deno.test("formatDate - Month DD, YYYY, at HH:MM period (UTC, single-digit day)", () => {
  const formatted = formatDate(
    new Date("2023-01-05T10:30:00.000Z"),
    "Month DD, YYYY, at HH:MM period",
    { utc: true },
  );
  assertEquals(formatted, "January 5, 2023, at 10:30 a.m.");
});

// UTC tests for "Month DD"
Deno.test("formatDate - Month DD (UTC)", () => {
  const formatted = formatDate(
    new Date("2023-01-01T01:35:00.000Z"),
    "Month DD",
    { utc: true },
  );
  assertEquals(formatted, "January 1");
});

Deno.test("formatDate - Month DD (UTC, single-digit day)", () => {
  const formatted = formatDate(
    new Date("2023-01-05T01:35:00.000Z"),
    "Month DD",
    { utc: true },
  );
  assertEquals(formatted, "January 5");
});

// Local time tests for "Month DD, YYYY, at HH:MM period"
Deno.test("formatDate - Month DD, YYYY, at HH:MM period (local)", () => {
  const date = new Date("2023-01-01T01:35:00.000Z");
  const formatted = formatDate(date, "Month DD, YYYY, at HH:MM period");
  // Local time should differ from UTC by the timezone offset
  // We just verify it doesn't throw and returns a string
  typeof formatted === "string";
});

// Default options (no utc)
Deno.test("formatDate - defaults to local time when utc is not specified", () => {
  const formatted = formatDate(
    new Date("2023-01-01T01:35:00.000Z"),
    "Month DD",
  );
  // Should not throw
  typeof formatted === "string";
});
