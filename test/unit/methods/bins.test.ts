import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should reject a non-positive interval at call time", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");

  assertThrows(
    () => table.bins("value", 0, "binStart", "binEnd"),
    Error,
    "bins() interval must be a finite number greater than 0.",
  );

  await sdb.close();
});

Deno.test("should add numeric bin boundaries and an interval of 10", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/dataRank.csv");
  table.convert({ Mark: "number" });
  table.bins("Mark", 10, "binStart", "binEnd");
  const data = await table.getData();

  assertEquals(data, [
    { Name: "Lily", Subject: "Maths", Mark: 65, binStart: 60, binEnd: 70 },
    { Name: "Lily", Subject: "Science", Mark: 80, binStart: 80, binEnd: 90 },
    { Name: "Lily", Subject: "English", Mark: 70, binStart: 70, binEnd: 80 },
    { Name: "Isabella", Subject: "Maths", Mark: 50, binStart: 50, binEnd: 60 },
    {
      Name: "Isabella",
      Subject: "Science",
      Mark: 70,
      binStart: 70,
      binEnd: 80,
    },
    {
      Name: "Isabella",
      Subject: "English",
      Mark: 90,
      binStart: 90,
      binEnd: 100,
    },
    { Name: "Olivia", Subject: "Maths", Mark: 55, binStart: 50, binEnd: 60 },
    { Name: "Olivia", Subject: "Science", Mark: 60, binStart: 60, binEnd: 70 },
    { Name: "Olivia", Subject: "English", Mark: 89, binStart: 80, binEnd: 90 },
  ]);

  await sdb.close();
});

Deno.test("should add numeric bin boundaries and an interval of 10 and 45 as start value", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/dataRank.csv");
  table.convert({ Mark: "number" });
  table.bins("Mark", 10, "binStart", "binEnd", {
    startValue: 45,
  });
  const data = await table.getData();

  assertEquals(data, [
    { Name: "Lily", Subject: "Maths", Mark: 65, binStart: 65, binEnd: 75 },
    { Name: "Lily", Subject: "Science", Mark: 80, binStart: 75, binEnd: 85 },
    { Name: "Lily", Subject: "English", Mark: 70, binStart: 65, binEnd: 75 },
    { Name: "Isabella", Subject: "Maths", Mark: 50, binStart: 45, binEnd: 55 },
    {
      Name: "Isabella",
      Subject: "Science",
      Mark: 70,
      binStart: 65,
      binEnd: 75,
    },
    {
      Name: "Isabella",
      Subject: "English",
      Mark: 90,
      binStart: 85,
      binEnd: 95,
    },
    { Name: "Olivia", Subject: "Maths", Mark: 55, binStart: 55, binEnd: 65 },
    { Name: "Olivia", Subject: "Science", Mark: 60, binStart: 55, binEnd: 65 },
    { Name: "Olivia", Subject: "English", Mark: 89, binStart: 85, binEnd: 95 },
  ]);

  await sdb.close();
});

Deno.test("should throw when startValue is greater than the minimum value", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/dataRank.csv");
  table.convert({ Mark: "number" });
  table.bins("Mark", 10, "binStart", "binEnd", {
    // The minimum Mark in dataRank.csv is 50.
    startValue: 55,
  });

  await assertRejects(() => table.getData());

  await sdb.close();
});

Deno.test("should throw when the new column name already exists, instead of silently renaming it", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/dataRank.csv");
  table.convert({ Mark: "number" });

  await assertRejects(
    () => table.bins("Mark", 10, "Mark", "binEnd").run(),
    Error,
    'the column "Mark" already exists',
  );

  await sdb.close();
});

Deno.test("should add numeric bin boundaries and an interval of 0.5", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/dataRank.csv");
  table.convert({ Mark: "number" });
  table.bins("Mark", 0.5, "binStart", "binEnd");
  const data = await table.getData();

  assertEquals(data, [
    { Name: "Lily", Subject: "Maths", Mark: 65, binStart: 65, binEnd: 65.5 },
    { Name: "Lily", Subject: "Science", Mark: 80, binStart: 80, binEnd: 80.5 },
    { Name: "Lily", Subject: "English", Mark: 70, binStart: 70, binEnd: 70.5 },
    {
      Name: "Isabella",
      Subject: "Maths",
      Mark: 50,
      binStart: 50,
      binEnd: 50.5,
    },
    {
      Name: "Isabella",
      Subject: "Science",
      Mark: 70,
      binStart: 70,
      binEnd: 70.5,
    },
    {
      Name: "Isabella",
      Subject: "English",
      Mark: 90,
      binStart: 90,
      binEnd: 90.5,
    },
    { Name: "Olivia", Subject: "Maths", Mark: 55, binStart: 55, binEnd: 55.5 },
    {
      Name: "Olivia",
      Subject: "Science",
      Mark: 60,
      binStart: 60,
      binEnd: 60.5,
    },
    {
      Name: "Olivia",
      Subject: "English",
      Mark: 89,
      binStart: 89,
      binEnd: 89.5,
    },
  ]);

  await sdb.close();
});

Deno.test("bins covers continuous values, exact boundaries, negatives, and nulls", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      { value: -1 },
      { value: -0.51 },
      { value: -0.5 },
      { value: -0.01 },
      { value: 0 },
      { value: 0.49 },
      { value: 0.5 },
      { value: null },
    ]);
    const options = { startValue: -1 };
    assertEquals(table.bins("value", 0.5, "start", "end", options), table);
    options.startValue = 100;
    assertEquals(await table.getData(), [
      { value: -1, start: -1, end: -0.5 },
      { value: -0.51, start: -1, end: -0.5 },
      { value: -0.5, start: -0.5, end: 0 },
      { value: -0.01, start: -0.5, end: 0 },
      { value: 0, start: 0, end: 0.5 },
      { value: 0.49, start: 0, end: 0.5 },
      { value: 0.5, start: 0.5, end: 1 },
      { value: null, start: null, end: null },
    ]);
    const types = await table.getTypes();
    assertEquals(types.start, "DOUBLE");
    assertEquals(types.end, "DOUBLE");
  } finally {
    await sdb.close();
  }
});

Deno.test("bins assigns decimal boundaries without gaps from repeated addition", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      { value: 0.1 },
      { value: 0.299 },
      { value: 0.3 },
      { value: 0.6 },
    ]).bins("value", 0.1, "start", "end", { startValue: 0 });
    assertEquals(await table.getData(), [
      { value: 0.1, start: 0.1, end: 0.2 },
      { value: 0.299, start: 0.2, end: 0.3 },
      { value: 0.3, start: 0.3, end: 0.4 },
      { value: 0.6, start: 0.6, end: 0.7 },
    ]);
    const hundredths = sdb.newTable().loadArray([
      { value: 0.03 },
      { value: 0.059 },
      { value: 0.06 },
    ]).bins("value", 0.01, "start", "end");
    assertEquals(await hundredths.getData(), [
      { value: 0.03, start: 0.03, end: 0.04 },
      { value: 0.059, start: 0.05, end: 0.06 },
      { value: 0.06, start: 0.06, end: 0.07 },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("bins supports numeric operations on quoted output columns in a chain", async () => {
  const sdb = new SimpleDB();
  try {
    const data = await sdb.newTable().loadArray([
      { value: 5 },
      { value: 15 },
      { value: 24.9 },
    ])
      .filter("value >= 15")
      .bins("value", 10, 'bin "start"', "bin end")
      .addColumn("width", "number", '"bin end" - "bin ""start"""')
      .getData();
    assertEquals(data, [
      { value: 15, 'bin "start"': 15, "bin end": 25, width: 10 },
      { value: 24.9, 'bin "start"': 15, "bin end": 25, width: 10 },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("bins rejects missing or duplicate output names and non-finite configuration", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    assertThrows(
      // @ts-expect-error Both output names are required, including for JavaScript callers.
      () => table.bins("value", 10, "start"),
      Error,
      "requires start and end",
    );
    for (const names of [["bin", "bin"], ["Bin", "bin"]]) {
      assertThrows(
        () => table.bins("value", 10, names[0], names[1]),
        Error,
        "must be distinct",
      );
    }
    for (const interval of [0, -1, NaN, Infinity, -Infinity]) {
      assertThrows(
        () => table.bins("value", interval, "start", "end"),
        Error,
        "interval must be",
      );
    }
    for (const startValue of [NaN, Infinity, -Infinity]) {
      assertThrows(
        () => table.bins("value", 10, "start", "end", { startValue }),
        Error,
        "startValue must be",
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("bins rejects collisions for either output column", async () => {
  const sdb = new SimpleDB();
  try {
    for (
      const [start, end] of [["value", "end"], ["start", "value"], [
        "VALUE",
        "end",
      ]]
    ) {
      const table = sdb.newTable().loadArray([{ value: 1 }]);
      await assertRejects(
        () => table.bins("value", 10, start, end).run(),
        Error,
        "already exists",
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("bins computes ends beyond the 32-bit integer range", async () => {
  const sdb = new SimpleDB();
  try {
    const data = await sdb.newTable().loadArray([{ value: 2147483645 }])
      .bins("value", 10, "start", "end").getData();
    assertEquals(data, [{
      value: 2147483645,
      start: 2147483645,
      end: 2147483655,
    }]);
  } finally {
    await sdb.close();
  }
});
