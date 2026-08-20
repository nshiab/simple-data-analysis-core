import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should extract a single date part into a column with the part name", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ publishedAt: "2024-04-07 13:14:15.678" }]);
  table.convert({ publishedAt: "datetime" });

  const result = table.extractDatePart("publishedAt", "year");

  assertEquals(result, table);
  assertEquals(table.pendingOps.at(-1)?.kind, "fusable");
  assertEquals(await table.getData(), [{
    publishedAt: new Date("2024-04-07T13:14:15.678Z"),
    year: 2024,
  }]);
  await sdb.close();
});

Deno.test("should extract all supported parts with custom column names", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { publishedAt: "2024-04-07 13:14:15.678" },
    { publishedAt: null },
  ]);
  table.convert({ publishedAt: "datetime" });
  table.extractDatePart("publishedAt", {
    publicationYear: "year",
    publicationQuarter: "quarter",
    publicationMonth: "month",
    publicationWeek: "week",
    publicationDay: "day",
    publicationDayOfWeek: "dayOfWeek",
    publicationDayOfYear: "dayOfYear",
    publicationHour: "hour",
    publicationMinute: "minute",
    publicationSecond: "second",
  });

  assertEquals(await table.getData(), [
    {
      publishedAt: new Date("2024-04-07T13:14:15.678Z"),
      publicationYear: 2024,
      publicationQuarter: 2,
      publicationMonth: 4,
      publicationWeek: 14,
      publicationDay: 7,
      publicationDayOfWeek: 0,
      publicationDayOfYear: 98,
      publicationHour: 13,
      publicationMinute: 14,
      publicationSecond: 15,
    },
    {
      publishedAt: null,
      publicationYear: null,
      publicationQuarter: null,
      publicationMonth: null,
      publicationWeek: null,
      publicationDay: null,
      publicationDayOfWeek: null,
      publicationDayOfYear: null,
      publicationHour: null,
      publicationMinute: null,
      publicationSecond: null,
    },
  ]);
  await sdb.close();
});

Deno.test("should use documented weekday, ISO week, and day-of-year numbering", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { date: "2021-01-01" },
    { date: "2021-01-02" },
    { date: "2021-01-03" },
    { date: "2021-01-04" },
  ]);
  table.convert({ date: "date" });
  table.extractDatePart("date", {
    week: "week",
    dayOfWeek: "dayOfWeek",
    dayOfYear: "dayOfYear",
  });

  assertEquals(await table.getData(), [
    {
      date: new Date("2021-01-01T00:00:00.000Z"),
      week: 53,
      dayOfWeek: 5,
      dayOfYear: 1,
    },
    {
      date: new Date("2021-01-02T00:00:00.000Z"),
      week: 53,
      dayOfWeek: 6,
      dayOfYear: 2,
    },
    {
      date: new Date("2021-01-03T00:00:00.000Z"),
      week: 53,
      dayOfWeek: 0,
      dayOfYear: 3,
    },
    {
      date: new Date("2021-01-04T00:00:00.000Z"),
      week: 1,
      dayOfWeek: 1,
      dayOfYear: 4,
    },
  ]);
  await sdb.close();
});

Deno.test("should support applicable parts and nulls for every documented temporal type", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    {
      calendarDate: "2024-04-07",
      clockTime: "13:14:15",
      timestamp: "2024-04-07 13:14:15",
      zonedTimestamp: "2024-04-07 13:14:15+00",
    },
    {
      calendarDate: null,
      clockTime: null,
      timestamp: null,
      zonedTimestamp: null,
    },
  ]);
  table.convert({
    calendarDate: "date",
    clockTime: "time",
    timestamp: "datetime",
    zonedTimestamp: "datetimeTz",
  });
  table.extractDatePart("calendarDate", { dateYear: "year" });
  table.extractDatePart("clockTime", { timeHour: "hour" });
  table.extractDatePart("timestamp", { timestampMinute: "minute" });
  table.extractDatePart("zonedTimestamp", { zonedSecond: "second" });

  assertEquals(await table.getTypes(), {
    calendarDate: "DATE",
    clockTime: "TIME",
    timestamp: "TIMESTAMP",
    zonedTimestamp: "TIMESTAMP WITH TIME ZONE",
    dateYear: "BIGINT",
    timeHour: "BIGINT",
    timestampMinute: "BIGINT",
    zonedSecond: "BIGINT",
  });
  assertEquals(await table.getData(), [
    {
      calendarDate: new Date("2024-04-07T00:00:00.000Z"),
      clockTime: "13:14:15",
      timestamp: new Date("2024-04-07T13:14:15.000Z"),
      zonedTimestamp: "2024-04-07 13:14:15+00",
      dateYear: 2024,
      timeHour: 13,
      timestampMinute: 14,
      zonedSecond: 15,
    },
    {
      calendarDate: null,
      clockTime: null,
      timestamp: null,
      zonedTimestamp: null,
      dateYear: null,
      timeHour: null,
      timestampMinute: null,
      zonedSecond: null,
    },
  ]);
  await sdb.close();
});

Deno.test("should reject a date part that does not apply to a time column", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ clockTime: "13:14:15" }]);
  table.convert({ clockTime: "time" });
  table.extractDatePart("clockTime", "year");

  await assertRejects(
    () => table.run(),
    Error,
    "No function matches the given name and argument types 'year(TIME)'",
  );
  await sdb.close();
});

Deno.test("should extract components from date and time columns", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{
    publicationDate: "2024-04-07",
    publicationTime: "13:14:15",
  }]);
  table.convert({
    publicationDate: "date",
    publicationTime: "time",
  });
  table.extractDatePart("publicationDate", { dateMonth: "month" });
  table.extractDatePart("publicationTime", { timeHour: "hour" });

  assertEquals(await table.getData(), [{
    publicationDate: new Date("2024-04-07T00:00:00.000Z"),
    publicationTime: "13:14:15",
    dateMonth: 4,
    timeHour: 13,
  }]);
  await sdb.close();
});

Deno.test("should snapshot a mapped parts argument when queued", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ publishedAt: "2024-04-07" }]);
  table.convert({ publishedAt: "date" });
  const parts: { [newColumn: string]: "year" | "month" } = {
    publicationYear: "year",
  };

  table.extractDatePart("publishedAt", parts);
  parts.publicationMonth = "month";

  assertEquals(await table.getData(), [{
    publishedAt: new Date("2024-04-07T00:00:00.000Z"),
    publicationYear: 2024,
  }]);
  await sdb.close();
});

Deno.test("should reject an empty parts mapping", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();

  assertThrows(
    () => table.extractDatePart("publishedAt", {}),
    Error,
    "requires at least one date part",
  );
  await sdb.close();
});

Deno.test("should reject an existing output column", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{
    publishedAt: "2024-04-07",
    publicationYear: 1999,
  }]);
  table.convert({ publishedAt: "date" });
  table.extractDatePart("publishedAt", { publicationYear: "year" });

  await assertRejects(
    () => table.run(),
    Error,
    'the column "publicationYear" already exists',
  );
  await sdb.close();
});
