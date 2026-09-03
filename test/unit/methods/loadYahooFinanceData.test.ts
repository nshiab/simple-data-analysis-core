import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

const originalFetch = globalThis.fetch;

function yahooResponse(
  timestamps: number[],
  values: Array<number | null>,
): Response {
  return Response.json({
    chart: {
      error: null,
      result: [{
        timestamp: timestamps,
        indicators: {
          adjclose: [{ adjclose: values }],
          quote: [{ close: values }],
        },
      }],
    },
  });
}

Deno.test("loadYahooFinanceData is chainable, inclusive, and uses internal request headers", async () => {
  let requestedUrl: URL | undefined;
  let requestedHeaders: Headers | undefined;
  globalThis.fetch = (input, init) => {
    requestedUrl = new URL(input instanceof Request ? input.url : input);
    requestedHeaders = new Headers(init?.headers);
    return Promise.resolve(yahooResponse(
      [
        Date.parse("2025-03-13T13:30:00Z") / 1000,
        Date.parse("2025-03-14T13:30:00Z") / 1000,
        Date.parse("2025-03-15T13:30:00Z") / 1000,
      ],
      [100, null, 102],
    ));
  };

  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("yahooInclusive");
    const returned = table
      .loadYahooFinanceData(
        "^GSPTSE",
        new Date("2025-03-13T00:00:00Z"),
        new Date("2025-03-14T00:00:00Z"),
        "adjclose",
        "1d",
      )
      .filter("value >= 100");

    assertEquals(returned, table);
    assertEquals(table.pendingOps.map((operation) => operation.method), [
      "loadYahooFinanceData()",
      "filter()",
    ]);
    assertEquals(await table.getData(), [
      { timestamp: Date.parse("2025-03-13T13:30:00Z"), value: 100 },
    ]);
    assertEquals(
      requestedUrl?.searchParams.get("period2"),
      String(Date.parse("2025-03-15T00:00:00Z") / 1000),
    );
    assertEquals(requestedUrl?.searchParams.get("symbol"), "^GSPTSE");
    assertStringIncludes(requestedHeaders?.get("User-Agent") ?? "", "Chrome");
  } finally {
    globalThis.fetch = originalFetch;
    await sdb.close();
  }
});

Deno.test("loadYahooFinanceData advances the inclusive end by the interval", async () => {
  const period2Values: string[] = [];
  globalThis.fetch = (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    period2Values.push(url.searchParams.get("period2") ?? "");
    const period1 = Number(url.searchParams.get("period1"));
    return Promise.resolve(yahooResponse([period1], [100]));
  };

  const sdb = new SimpleDB();
  try {
    const start = new Date("2025-03-14T12:00:00Z");
    sdb.newTable("yahooDaily")
      .loadYahooFinanceData("AAPL", start, start, "close", "1d");
    sdb.newTable("yahooHourly")
      .loadYahooFinanceData("AAPL", start, start, "close", "1h");
    sdb.newTable("yahooMinute")
      .loadYahooFinanceData("AAPL", start, start, "close", "1m");
    await sdb.run();

    const startSeconds = start.getTime() / 1000;
    assertEquals(period2Values, [
      String(startSeconds + 86_400),
      String(startSeconds + 3_600),
      String(startSeconds + 60),
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    await sdb.close();
  }
});

Deno.test("loadYahooFinanceData validates arguments at call time", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("yahooValidation");
  try {
    assertThrows(
      () =>
        table.loadYahooFinanceData(
          "AAPL",
          new Date("2025-03-15"),
          new Date("2025-03-14"),
          "close",
          "1d",
        ),
      RangeError,
      "endDate must be equal to or later than startDate",
    );
    assertThrows(
      () =>
        table.loadYahooFinanceData(
          "",
          new Date("2025-03-14"),
          new Date("2025-03-15"),
          "close",
          "1d",
        ),
      TypeError,
      "symbol must be a non-empty string",
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("loadYahooFinanceData reports upstream failures as SDA errors", async () => {
  globalThis.fetch = () =>
    Promise.resolve(
      new Response("Too Many Requests", {
        status: 429,
        statusText: "Too Many Requests",
      }),
    );

  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("yahooFailure");
    table.loadYahooFinanceData(
      "AAPL",
      new Date("2025-03-13"),
      new Date("2025-03-14"),
      "close",
      "1d",
    );
    const error = await assertRejects(
      () => table.run(),
      Error,
      "Yahoo may have changed, rate-limited, or disabled this undocumented endpoint",
    );
    assertStringIncludes(error.message, "SDA method: loadYahooFinanceData()");
  } finally {
    globalThis.fetch = originalFetch;
    await sdb.close();
  }
});

Deno.test({
  name: "loadYahooFinanceData loads live Yahoo Finance data locally",
  ignore: Deno.env.get("CI") === "true",
  async fn() {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("yahooLive").loadYahooFinanceData(
        "^GSPTSE",
        new Date("2025-03-13"),
        new Date("2025-03-14"),
        "adjclose",
        "1d",
      );

      assertEquals(await table.getRowCount() > 0, true);
      assertEquals(
        (await table.getData()).every(({ value }) =>
          typeof value === "number" && Number.isFinite(value)
        ),
        true,
      );
    } finally {
      await sdb.close();
    }
  },
});
