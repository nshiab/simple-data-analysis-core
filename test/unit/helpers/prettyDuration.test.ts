import { test, expect } from "vite-plus/test";

import prettyDuration from "../../../src/helpers/prettyDuration.ts";

test("prettyDuration - should return a string with a number of ms", () => {
  const duration = prettyDuration(new Date("2024-01-01T17:00:00Z"), {
    end: new Date("2024-01-01T17:00:00.015Z"),
    log: true,
  });
  expect(duration).toStrictEqual("15 ms");
});

test("prettyDuration - should return a string with a number of seconds", () => {
  const duration = prettyDuration(new Date("2024-01-01T17:00:00Z"), {
    end: new Date("2024-01-01T17:00:15Z"),
  });
  expect(duration).toStrictEqual("15 sec, 0 ms");
});

test("prettyDuration - should return a string with a number of seconds and minutes", () => {
  const duration = prettyDuration(new Date("2024-01-01T17:00:00Z"), {
    end: new Date("2024-01-01T17:03:15Z"),
  });
  expect(duration).toStrictEqual("3 min, 15 sec, 0 ms");
});

test("prettyDuration - should return a string with a number of seconds, minutes, and hours", () => {
  const duration = prettyDuration(new Date("2024-01-01T17:00:00Z"), {
    end: new Date("2024-01-01T23:03:15Z"),
  });
  expect(duration).toStrictEqual("6 h, 3 min, 15 sec, 0 ms");
});

test("prettyDuration - should return a string with seconds, minutes, hours, and days (singular)", () => {
  const duration = prettyDuration(new Date("2024-01-01T17:00:00Z"), {
    end: new Date("2024-01-02T23:03:15Z"),
  });
  expect(duration).toStrictEqual("1 day, 6 h, 3 min, 15 sec, 0 ms");
});

test("prettyDuration - should return a string with seconds, minutes, hours, and days (plural)", () => {
  const duration = prettyDuration(new Date("2024-01-01T17:00:00Z"), {
    end: new Date("2024-01-23T23:03:15Z"),
  });
  expect(duration).toStrictEqual("22 days, 6 h, 3 min, 15 sec, 0 ms");
});

test("prettyDuration - should return a string with seconds, minutes, hours, days, and months (singular)", () => {
  const duration = prettyDuration(new Date("2024-01-01T17:00:00Z"), {
    end: new Date("2024-02-02T23:03:15Z"),
  });
  expect(duration).toStrictEqual("1 month, 2 days, 6 h, 3 min, 15 sec, 0 ms");
});

test("prettyDuration - should return a string with seconds, minutes, hours, days, and months (plural)", () => {
  const duration = prettyDuration(new Date("2024-01-01T17:00:00Z"), {
    end: new Date("2024-06-23T23:03:15Z"),
  });
  expect(duration).toStrictEqual("5 months, 24 days, 6 h, 3 min, 15 sec, 0 ms");
});

test("prettyDuration - should return a string with seconds, minutes, hours, days, months, and years (singular)", () => {
  const duration = prettyDuration(new Date("2024-01-01T17:00:00Z"), {
    end: new Date("2025-02-02T23:03:15Z"),
  });
  expect(duration).toStrictEqual("1 year, 1 month, 8 days, 6 h, 3 min, 15 sec, 0 ms");
});

test("prettyDuration - should return a string with seconds, minutes, hours, days, months, and years (plural)", () => {
  const duration = prettyDuration(new Date("2024-01-01T17:00:00Z"), {
    end: new Date("2034-06-23T23:03:15Z"),
  });
  expect(duration).toStrictEqual("10 years, 5 months, 16 days, 6 h, 3 min, 15 sec, 0 ms");
});

test("prettyDuration - should add a prefix to the formatted string", () => {
  const duration = prettyDuration(new Date("2024-01-01T17:00:00Z"), {
    end: new Date("2024-01-23T23:03:15Z"),
    prefix: "Total duration: ",
  });
  expect(duration).toStrictEqual("Total duration: 22 days, 6 h, 3 min, 15 sec, 0 ms");
});

test("prettyDuration - should add a suffix to the formatted string", () => {
  const duration = prettyDuration(new Date("2024-01-01T17:00:00Z"), {
    end: new Date("2024-01-23T23:03:15Z"),
    suffix: " (test)",
  });
  expect(duration).toStrictEqual("22 days, 6 h, 3 min, 15 sec, 0 ms (test)");
});

test("prettyDuration - should add both prefix and suffix to the formatted string", () => {
  const duration = prettyDuration(new Date("2024-01-01T17:00:00Z"), {
    end: new Date("2024-01-23T23:03:15Z"),
    prefix: "Total duration: ",
    suffix: " (test)",
  });
  expect(duration).toStrictEqual("Total duration: 22 days, 6 h, 3 min, 15 sec, 0 ms (test)");
});
