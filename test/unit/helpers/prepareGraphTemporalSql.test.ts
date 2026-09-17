import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { DuckDBInstance } from "@duckdb/node-api";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import prepareGraphTemporalSql, {
  prepareGraphTemporalOptions,
} from "../../../src/helpers/prepareGraphTemporalSql.ts";

Deno.test("prepareGraphTemporalOptions distinguishes static calls from explicit settings", () => {
  assertEquals(
    prepareGraphTemporalOptions({}, "both", "reachable()"),
    undefined,
  );
  assertEquals(
    prepareGraphTemporalOptions(
      { minGapMs: undefined, strictOrdering: undefined },
      "both",
      "reachable()",
    ),
    undefined,
  );
  assertThrows(
    () => prepareGraphTemporalOptions({ minGapMs: 0 }, "outgoing", "paths()"),
    TypeError,
    "options.minGapMs and options.strictOrdering require",
  );
  assertThrows(
    () =>
      prepareGraphTemporalOptions(
        { strictOrdering: false },
        "outgoing",
        "paths()",
      ),
    TypeError,
    "options.minGapMs and options.strictOrdering require",
  );
});

Deno.test("prepareGraphTemporalOptions validates direction, option types, and gap boundaries", () => {
  assertThrows(
    () =>
      prepareGraphTemporalOptions(
        { startTimeColumn: "time" },
        "both",
        "reachable()",
      ),
    TypeError,
    'options.direction cannot be "both"',
  );
  for (const minGapMs of [-1, 0.001, 0.5, Infinity, Number.NaN]) {
    assertThrows(
      () =>
        prepareGraphTemporalOptions(
          { startTimeColumn: "time", minGapMs },
          "outgoing",
          "reachable()",
        ),
      TypeError,
      "finite, non-negative integer",
    );
  }
  assertThrows(
    () =>
      prepareGraphTemporalOptions(
        { startTimeColumn: "time", minGapMs: Number.MAX_SAFE_INTEGER + 2 },
        "outgoing",
        "reachable()",
      ),
    TypeError,
    "must not exceed Number.MAX_SAFE_INTEGER",
  );
  assertEquals(
    prepareGraphTemporalOptions(
      {
        endTimeColumn: "arrives",
        minGapMs: 1,
        startTimeColumn: "departs",
        strictOrdering: false,
      },
      "incoming",
      "paths()",
    ),
    {
      endTimeColumn: "arrives",
      gapMicroseconds: 1000n,
      startTimeColumn: "departs",
      strictOrdering: false,
    },
  );
  assertEquals(
    prepareGraphTemporalOptions(
      { startTimeColumn: "time", minGapMs: Number.MAX_SAFE_INTEGER },
      "outgoing",
      "reachable()",
    )?.gapMicroseconds,
    9007199254740991000n,
  );
  assertEquals(
    prepareGraphTemporalOptions(
      { startTimeColumn: "time", minGapMs: -0 },
      "outgoing",
      "reachable()",
    )?.gapMicroseconds,
    0n,
  );
});

Deno.test("prepareGraphTemporalOptions rejects invalid non-gap values", () => {
  assertThrows(
    () =>
      prepareGraphTemporalOptions(
        { startTimeColumn: 1 as unknown as string },
        "outgoing",
        "paths()",
      ),
    TypeError,
    "options.startTimeColumn must be a string",
  );
  assertThrows(
    () =>
      prepareGraphTemporalOptions(
        { endTimeColumn: true as unknown as string },
        "outgoing",
        "paths()",
      ),
    TypeError,
    "options.endTimeColumn must be a string",
  );
  assertThrows(
    () =>
      prepareGraphTemporalOptions(
        {
          startTimeColumn: "time",
          strictOrdering: 0 as unknown as boolean,
        },
        "outgoing",
        "paths()",
      ),
    TypeError,
    "options.strictOrdering must be a boolean",
  );
  assertThrows(
    () =>
      prepareGraphTemporalOptions(
        { startTimeColumn: "time", minGapMs: "0" as unknown as number },
        "outgoing",
        "paths()",
      ),
    TypeError,
    "options.minGapMs must be a number",
  );
});

Deno.test("prepareGraphTemporalSql resolves fallback columns and validates DuckDB temporal types", () => {
  const startOnly = prepareGraphTemporalSql(
    { Departure: "TIMESTAMP_MS" },
    prepareGraphTemporalOptions(
      { startTimeColumn: "departure" },
      "outgoing",
      "paths()",
    )!,
    "paths()",
  );
  assertEquals(startOnly.startTimeColumn, "Departure");
  assertEquals(startOnly.endTimeColumn, undefined);
  assertEquals(startOnly.gapUnit, "microsecond");
  assertStringIncludes(startOnly.eventSelections("edges")[2], '"Departure"');

  const endOnly = prepareGraphTemporalSql(
    { arrival: "TIMESTAMP_NS" },
    prepareGraphTemporalOptions(
      { endTimeColumn: "arrival", minGapMs: 1 },
      "incoming",
      "paths()",
    )!,
    "paths()",
  );
  assertEquals(endOnly.gapUnit, "nanosecond");
  assertEquals(endOnly.gapParameter, "1000000");
  assertStringIncludes(endOnly.eventSelections()[1], '"arrival"');

  for (
    const type of [
      "DATE",
      "TIMESTAMP",
      "TIMESTAMP_S",
      "TIMESTAMP_MS",
      "TIMESTAMP_NS",
      "TIMESTAMP WITH TIME ZONE",
    ]
  ) {
    prepareGraphTemporalSql(
      { time: type },
      prepareGraphTemporalOptions(
        { startTimeColumn: "time" },
        "outgoing",
        "reachable()",
      )!,
      "reachable()",
    );
  }
  assertThrows(
    () =>
      prepareGraphTemporalSql(
        { value: "TIME" },
        prepareGraphTemporalOptions(
          { startTimeColumn: "value" },
          "outgoing",
          "reachable()",
        )!,
        "reachable()",
      ),
    TypeError,
    "requires DATE or TIMESTAMP chronological columns",
  );
  assertThrows(
    () =>
      prepareGraphTemporalSql(
        { starts: "TIMESTAMP", ends: "TIMESTAMP WITH TIME ZONE" },
        prepareGraphTemporalOptions(
          { startTimeColumn: "starts", endTimeColumn: "ends" },
          "outgoing",
          "reachable()",
        )!,
        "reachable()",
      ),
    TypeError,
    "cannot mix time-zone-aware and time-zone-naive",
  );
  assertThrows(
    () =>
      prepareGraphTemporalSql(
        { actual: "TIMESTAMP" },
        prepareGraphTemporalOptions(
          { startTimeColumn: "missing" },
          "outgoing",
          "reachable()",
        )!,
        "reachable()",
      ),
    Error,
    'column "missing" does not exist',
  );
});

Deno.test("prepared transition SQL preserves nanoseconds, strictness, and inclusive gaps", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE temporal_edges AS SELECT * FROM (VALUES
      ('previous', TIMESTAMP_NS '2025-01-01 00:00:00.000000000'),
      ('below', TIMESTAMP_NS '2025-01-01 00:00:00.000999999'),
      ('exact', TIMESTAMP_NS '2025-01-01 00:00:00.001000000'),
      ('above', TIMESTAMP_NS '2025-01-01 00:00:00.001000001')
    ) AS t(id, time)`);
    const options = prepareGraphTemporalOptions(
      { startTimeColumn: "time", minGapMs: 1 },
      "outgoing",
      "reachable()",
    )!;
    const prepared = prepareGraphTemporalSql(
      { id: "VARCHAR", time: "TIMESTAMP_NS" },
      options,
      "reachable()",
    );
    const rows = await sdb.customQuery(
      transitionQuery(prepared, "outgoing", ["below", "exact", "above"]),
      { returnData: true },
    );
    assertEquals(rows, [{ id: "above" }, { id: "exact" }]);

    const strict = prepareGraphTemporalSql(
      { time: "TIMESTAMP_NS" },
      prepareGraphTemporalOptions(
        { startTimeColumn: "time" },
        "outgoing",
        "reachable()",
      )!,
      "reachable()",
    );
    assertEquals(
      await sdb.customQuery(
        `SELECT ${
          strict.transition(
            "earlier",
            "later",
            "outgoing",
            strict.gapParameter,
          )
        } AS valid
        FROM (SELECT TIMESTAMP_NS '2025-01-01' AS __event_start,
          TIMESTAMP_NS '2025-01-01' AS __event_end) earlier,
        (SELECT TIMESTAMP_NS '2025-01-01 00:00:00.000000001' AS __event_start,
          TIMESTAMP_NS '2025-01-01 00:00:00.000000001' AS __event_end) later`,
        { returnData: true },
      ),
      [{ valid: true }],
    );

    const nonStrict = prepareGraphTemporalSql(
      { time: "TIMESTAMP_NS" },
      prepareGraphTemporalOptions(
        { startTimeColumn: "time", strictOrdering: false },
        "outgoing",
        "reachable()",
      )!,
      "reachable()",
    );
    assertEquals(
      await sdb.customQuery(
        `SELECT ${
          nonStrict.transition(
            "earlier",
            "later",
            "outgoing",
            nonStrict.gapParameter,
          )
        } AS valid
        FROM (SELECT TIMESTAMP_NS '2025-01-01' AS __event_start,
          TIMESTAMP_NS '2025-01-01' AS __event_end) earlier,
        (SELECT TIMESTAMP_NS '2025-01-01' AS __event_start,
          TIMESTAMP_NS '2025-01-01' AS __event_end) later`,
        { returnData: true },
      ),
      [{ valid: true }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("prepared transition SQL compares mixed naive precisions without narrowing", async () => {
  const sdb = new SimpleDB();
  try {
    const prepared = prepareGraphTemporalSql(
      { starts: "TIMESTAMP_NS", ends: "TIMESTAMP" },
      prepareGraphTemporalOptions(
        { startTimeColumn: "starts", endTimeColumn: "ends" },
        "outgoing",
        "reachable()",
      )!,
      "reachable()",
    );
    const rows = await sdb.customQuery(
      `SELECT ${
        prepared.transition(
          "earlier",
          "later",
          "outgoing",
          prepared.gapParameter,
        )
      } AS valid
      FROM (SELECT TIMESTAMP_NS '2025-01-01' AS __event_start,
        TIMESTAMP '2025-01-01' AS __event_end) earlier,
      (SELECT TIMESTAMP_NS '2025-01-01 00:00:00.000000001' AS __event_start,
        TIMESTAMP '2025-01-01 00:00:00.000001' AS __event_end) later`,
      { returnData: true },
    );
    assertEquals(rows, [{ valid: true }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("prepared transition SQL enforces physical chronology for incoming search", async () => {
  const sdb = new SimpleDB();
  try {
    const prepared = prepareGraphTemporalSql(
      { departure: "TIMESTAMP", arrival: "TIMESTAMP" },
      prepareGraphTemporalOptions(
        {
          startTimeColumn: "departure",
          endTimeColumn: "arrival",
          minGapMs: 60 * 60 * 1000,
        },
        "incoming",
        "paths()",
      )!,
      "paths()",
    );
    const result = await sdb.customQuery(
      `SELECT ${
        prepared.transition(
          "current",
          "candidate",
          "incoming",
          prepared.gapParameter,
        )
      } AS valid
      FROM (SELECT TIMESTAMP '2025-01-01 10:00' AS __event_start,
        TIMESTAMP '2025-01-01 11:00' AS __event_end) current,
      (SELECT TIMESTAMP '2025-01-01 08:00' AS __event_start,
        TIMESTAMP '2025-01-01 09:00' AS __event_end) candidate`,
      { returnData: true },
    );
    assertEquals(result, [{ valid: true }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("prepared validity SQL excludes null, infinite, and end-before-start events inline", async () => {
  const sdb = new SimpleDB();
  try {
    const prepared = prepareGraphTemporalSql(
      { starts: "TIMESTAMP", ends: "TIMESTAMP" },
      prepareGraphTemporalOptions(
        { startTimeColumn: "starts", endTimeColumn: "ends" },
        "outgoing",
        "paths()",
      )!,
      "paths()",
    );
    const rows = await sdb.customQuery(
      `WITH projected AS (
        SELECT id, ${prepared.eventSelections("edges").join(", ")}
        FROM (VALUES
          ('valid', TIMESTAMP '2025-01-01', TIMESTAMP '2025-01-02'),
          ('null', NULL, TIMESTAMP '2025-01-02'),
          ('infinite', TIMESTAMP '2025-01-01', TIMESTAMP 'infinity'),
          ('backward', TIMESTAMP '2025-01-02', TIMESTAMP '2025-01-01')
        ) AS edges(id, starts, ends)
      )
      SELECT id FROM projected AS event
      WHERE ${prepared.eventValidity("event")}
      ORDER BY id`,
      { returnData: true },
    );
    assertEquals(rows, [{ id: "valid" }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("prepared temporal units support DATE values beyond the TIMESTAMP range", async () => {
  const sdb = new SimpleDB();
  try {
    const prepared = prepareGraphTemporalSql(
      { time: "DATE" },
      prepareGraphTemporalOptions(
        { startTimeColumn: "time", minGapMs: Number.MAX_SAFE_INTEGER },
        "outgoing",
        "reachable()",
      )!,
      "reachable()",
    );
    const rows = await sdb.customQuery(
      `SELECT ${
        prepared.transition(
          "earlier",
          "later",
          "outgoing",
          prepared.gapParameter,
        )
      } AS valid
      FROM (SELECT DATE '1000000-01-01' AS __event_start,
        DATE '1000000-01-01' AS __event_end) earlier,
      (SELECT DATE '1300000-01-01' AS __event_start,
        DATE '1300000-01-01' AS __event_end) later`,
      { returnData: true },
    );
    assertEquals(rows, [{ valid: true }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("event ordinals retain incoming physical row order for internal identity", async () => {
  const sdb = new SimpleDB();
  try {
    const prepared = prepareGraphTemporalSql(
      { time: "TIMESTAMP" },
      prepareGraphTemporalOptions(
        { startTimeColumn: "time" },
        "incoming",
        "reachable()",
      )!,
      "reachable()",
    );
    const rows = await sdb.customQuery(
      `SELECT id, __event_id
      FROM (SELECT id, ${prepared.eventSelections("edges").join(", ")}
        FROM (VALUES
          ('third', TIMESTAMP '2025-01-03'),
          ('first', TIMESTAMP '2025-01-01'),
          ('second', TIMESTAMP '2025-01-02')
        ) AS edges(id, time))
      ORDER BY __event_id`,
      { returnData: true },
    );
    assertEquals(rows, [
      { id: "third", __event_id: 1 },
      { id: "first", __event_id: 2 },
      { id: "second", __event_id: 3 },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("prepared TIMESTAMPTZ comparisons use absolute UTC instants", async () => {
  const sdb = new SimpleDB();
  try {
    const prepared = prepareGraphTemporalSql(
      { time: "TIMESTAMP WITH TIME ZONE" },
      prepareGraphTemporalOptions(
        { startTimeColumn: "time" },
        "outgoing",
        "reachable()",
      )!,
      "reachable()",
    );
    const rows = await sdb.customQuery(
      `SELECT ${
        prepared.transition(
          "earlier",
          "later",
          "outgoing",
          prepared.gapParameter,
        )
      } AS valid
      FROM (SELECT TIMESTAMPTZ '2025-01-01 10:00:00+02' AS __event_start,
        TIMESTAMPTZ '2025-01-01 10:00:00+02' AS __event_end) earlier,
      (SELECT TIMESTAMPTZ '2025-01-01 08:00:00+00' AS __event_start,
        TIMESTAMPTZ '2025-01-01 08:00:00+00' AS __event_end) later`,
      { returnData: true },
    );
    assertEquals(rows, [{ valid: false }]);
  } finally {
    await sdb.close();
  }
});

function transitionQuery(
  prepared: ReturnType<typeof prepareGraphTemporalSql>,
  direction: "incoming" | "outgoing",
  candidates: string[],
): string {
  return `WITH projected AS (
      SELECT id, ${prepared.eventSelections("edges").join(", ")}
      FROM temporal_edges AS edges
    )
    SELECT candidate.id
    FROM projected AS previous
    CROSS JOIN projected AS candidate
    WHERE previous.id = 'previous'
      AND candidate.id IN (${candidates.map((id) => `'${id}'`).join(", ")})
      AND ${
    prepared.transition(
      "previous",
      "candidate",
      direction,
      prepared.gapParameter,
    )
  }
    ORDER BY candidate.id`;
}

Deno.test("mixed DATE and nanosecond events retain wide dates and reject reversed events", async () => {
  const sdb = new SimpleDB();
  try {
    const prepared = prepareGraphTemporalSql(
      { starts: "TIMESTAMP_NS", ends: "DATE" },
      prepareGraphTemporalOptions(
        { startTimeColumn: "starts", endTimeColumn: "ends" },
        "outgoing",
        "paths()",
      )!,
      "paths()",
    );
    assertEquals(
      await sdb.customQuery(
        `WITH events AS (
          SELECT id, ${prepared.eventSelections("input").join(", ")}
          FROM (VALUES
            ('wide', TIMESTAMP_NS '2025-01-01', DATE '1000000-01-01'),
            ('reversed', TIMESTAMP_NS '2025-01-01 00:00:00.000000001', DATE '2025-01-01'),
            ('infinite', TIMESTAMP_NS 'infinity', DATE '1000000-01-01')
          ) input(id, starts, ends)
        ) SELECT id FROM events WHERE ${prepared.eventValidity()} ORDER BY id`,
        { returnData: true },
      ),
      [{ id: "wide" }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("prepared gap binds exact large integers without JavaScript rounding", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    const prepared = prepareGraphTemporalSql(
      { time: "TIMESTAMP_NS" },
      prepareGraphTemporalOptions(
        { startTimeColumn: "time", minGapMs: Number.MAX_SAFE_INTEGER },
        "outgoing",
        "reachable()",
      )!,
      "reachable()",
    );
    const result = await connection.runAndReadAll(
      "SELECT CAST(CAST($1 AS HUGEINT) AS VARCHAR) AS gap",
      [prepared.gapParameter],
    );
    assertEquals(result.getRowObjects(), [{ gap: "9007199254740991000000" }]);
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});
