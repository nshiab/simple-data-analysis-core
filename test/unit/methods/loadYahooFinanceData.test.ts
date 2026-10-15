import { test, expect } from "vite-plus/test";
import { assertThrows, assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";

const originalFetch = globalThis.fetch;

function yahooResponse(
  timestamps: number[],
  values: {
    open?: Array<number | null>;
    high?: Array<number | null>;
    low?: Array<number | null>;
    close?: Array<number | null>;
    adjustedClose?: Array<number | null>;
    volume?: Array<number | null>;
  },
): Response {
  return Response.json({
    chart: {
      error: null,
      result: [
        {
          timestamp: timestamps,
          indicators: {
            adjclose: [{ adjclose: values.adjustedClose }],
            quote: [
              {
                open: values.open,
                high: values.high,
                low: values.low,
                close: values.close,
                volume: values.volume,
              },
            ],
          },
        },
      ],
    },
  });
}

test("loadYahooFinanceData loads a complete table and preserves missing values", async () => {
  let requestedUrl: URL | undefined;
  let requestedHeaders: Headers | undefined;
  globalThis.fetch = (input, init) => {
    requestedUrl = new URL(input instanceof Request ? input.url : input);
    requestedHeaders = new Headers(init?.headers);
    return Promise.resolve(
      yahooResponse(
        [
          Date.parse("2025-03-13T13:30:00Z") / 1000,
          Date.parse("2025-03-14T13:30:00Z") / 1000,
          Date.parse("2025-03-15T13:30:00Z") / 1000,
        ],
        {
          open: [99, 100, 101],
          high: [101, 102, 103],
          low: [98, 99, 100],
          close: [100, null, 102],
          adjustedClose: [99.5, null, 101.5],
          volume: [1_000, null, 1_200],
        },
      ),
    );
  };

  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("yahooData");
    const returned = table.loadYahooFinanceData(
      "^GSPTSE",
      new Date("2025-03-13T00:00:00Z"),
      new Date("2025-03-14T23:59:59Z"),
      "1d",
    );

    expect(returned).toStrictEqual(table);
    expect(await table.getData()).toStrictEqual([
      {
        datetime: new Date("2025-03-13T13:30:00Z"),
        open: 99,
        high: 101,
        low: 98,
        close: 100,
        adjustedClose: 99.5,
        volume: 1_000,
      },
      {
        datetime: new Date("2025-03-14T13:30:00Z"),
        open: 100,
        high: 102,
        low: 99,
        close: null,
        adjustedClose: null,
        volume: null,
      },
    ]);
    expect(await table.getTypes()).toStrictEqual({
      datetime: "TIMESTAMP",
      open: "DOUBLE",
      high: "DOUBLE",
      low: "DOUBLE",
      close: "DOUBLE",
      adjustedClose: "DOUBLE",
      volume: "DOUBLE",
    });
    expect(requestedUrl?.searchParams.get("period2")).toStrictEqual(
      String(Date.parse("2025-03-15T00:00:00Z") / 1000),
    );
    expect(requestedUrl?.searchParams.has("events")).toStrictEqual(false);
    expect(requestedHeaders?.get("User-Agent") ?? "").toContain("Chrome");
  } finally {
    globalThis.fetch = originalFetch;
    await sdb.close();
  }
});

test("loadYahooFinanceData keeps numeric types when every value is missing", async () => {
  globalThis.fetch = () =>
    Promise.resolve(yahooResponse([Date.parse("2025-03-14T13:30:00Z") / 1000], {}));

  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable("yahooMissing")
      .loadYahooFinanceData(
        "AAPL",
        new Date("2025-03-14T00:00:00Z"),
        new Date("2025-03-14T00:00:00Z"),
        "1d",
      );

    expect(await table.getRowCount()).toStrictEqual(1);
    expect(await table.getTypes()).toStrictEqual({
      datetime: "TIMESTAMP",
      open: "DOUBLE",
      high: "DOUBLE",
      low: "DOUBLE",
      close: "DOUBLE",
      adjustedClose: "DOUBLE",
      volume: "DOUBLE",
    });
  } finally {
    globalThis.fetch = originalFetch;
    await sdb.close();
  }
});

test("loadYahooFinanceData validates arguments at call time", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("yahooValidation");
  try {
    assertThrows(
      () =>
        table.loadYahooFinanceData("AAPL", new Date("2025-03-15"), new Date("2025-03-14"), "1d"),
      RangeError,
      "endDate must be equal to or later than startDate",
    );
    assertThrows(
      () => table.loadYahooFinanceData("", new Date("2025-03-14"), new Date("2025-03-15"), "1d"),
      TypeError,
      "symbol must be a non-empty string",
    );
  } finally {
    await sdb.close();
  }
});

test("loadYahooFinanceData reports upstream failures as SDA errors", async () => {
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
    table.loadYahooFinanceData("AAPL", new Date("2025-03-13"), new Date("2025-03-14"), "1d");
    const error = await assertRejects(
      () => table.run(),
      Error,
      "Yahoo may have changed, rate-limited, or disabled this undocumented endpoint",
    );
    expect(error.message).toContain("SDA method: loadYahooFinanceData()");
  } finally {
    globalThis.fetch = originalFetch;
    await sdb.close();
  }
});

test.skipIf(process.env.CI === "true")(
  "loadYahooFinanceData loads live Yahoo Finance data locally",
  async function () {
    const sdb = new SimpleDB();
    try {
      const table = sdb
        .newTable("yahooLive")
        .loadYahooFinanceData(
          "^GSPTSE",
          new Date("2025-03-13T00:00:00Z"),
          new Date("2025-03-14T00:00:00Z"),
          "1d",
        );

      expect(await table.getTypes()).toStrictEqual({
        datetime: "TIMESTAMP",
        open: "DOUBLE",
        high: "DOUBLE",
        low: "DOUBLE",
        close: "DOUBLE",
        adjustedClose: "DOUBLE",
        volume: "DOUBLE",
      });
      expect(await table.getData()).toStrictEqual([
        {
          datetime: new Date("2025-03-13T13:30:00Z"),
          open: 24_375.099609375,
          high: 24_467.599609375,
          low: 24_145.599609375,
          close: 24_203.19921875,
          adjustedClose: 24_203.19921875,
          volume: 343_747_400,
        },
        {
          datetime: new Date("2025-03-14T13:30:00Z"),
          open: 24_301.69921875,
          high: 24_565.400390625,
          low: 24_293.19921875,
          close: 24_553.400390625,
          adjustedClose: 24_553.400390625,
          volume: 262_196_500,
        },
      ]);
    } finally {
      await sdb.close();
    }
  },
);
