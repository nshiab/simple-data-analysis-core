import type SimpleTable from "../class/SimpleTable.ts";
import SDAError from "../class/SDAError.ts";
import queueOp from "../helpers/queueOp.ts";
import { executePreparedArray, prepareArray } from "./loadArray.ts";

const INTERVAL_SECONDS = {
  "1d": 24 * 60 * 60,
  "1h": 60 * 60,
  "1m": 60,
} as const;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type YahooVariable =
  | "open"
  | "high"
  | "low"
  | "close"
  | "adjclose"
  | "volume";

type YahooInterval = keyof typeof INTERVAL_SECONDS;

type YahooFinanceResponse = {
  chart?: {
    error?: { description?: string } | null;
    result?:
      | Array<{
        timestamp?: number[];
        indicators?: {
          adjclose?: Array<{ adjclose?: Array<number | null> }>;
          quote?: Array<Partial<Record<YahooVariable, Array<number | null>>>>;
        };
      }>
      | null;
  };
};

export default function loadYahooFinanceData(
  table: SimpleTable,
  symbol: string,
  startDate: Date,
  endDate: Date,
  variable: YahooVariable,
  interval: YahooInterval,
): void {
  assertArguments(symbol, startDate, endDate, variable, interval);
  startDate = new Date(startDate);
  endDate = new Date(endDate);
  const parameters = { symbol, startDate, endDate, variable, interval };

  queueOp(table, {
    kind: "barrier",
    method: "loadYahooFinanceData()",
    parameters,
    execute: () =>
      executeLoadYahooFinanceData(
        table,
        symbol,
        startDate,
        endDate,
        variable,
        interval,
        parameters,
      ),
  });
}

async function executeLoadYahooFinanceData(
  table: SimpleTable,
  symbol: string,
  startDate: Date,
  endDate: Date,
  variable: YahooVariable,
  interval: YahooInterval,
  parameters: { [key: string]: unknown },
): Promise<void> {
  try {
    const rows = await getYahooFinanceData(
      symbol,
      startDate,
      endDate,
      variable,
      interval,
    );
    await executePreparedArray(table, prepareArray(rows));
  } catch (error) {
    if (error instanceof SDAError) {
      throw error;
    }
    throw new SDAError({
      method: "loadYahooFinanceData()",
      parameters,
      query: "",
      cause: error,
    });
  }
}

async function getYahooFinanceData(
  symbol: string,
  startDate: Date,
  endDate: Date,
  variable: YahooVariable,
  interval: YahooInterval,
): Promise<{ timestamp: number; value: number }[]> {
  const period1 = Math.floor(startDate.getTime() / 1000);
  // Yahoo treats period2 as exclusive. Advancing it by one interval keeps the
  // public range inclusive without exposing that upstream detail to callers.
  const period2 = Math.floor(endDate.getTime() / 1000) +
    INTERVAL_SECONDS[interval];
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${
      encodeURIComponent(symbol)
    }`,
  );
  url.search = new URLSearchParams({
    events: "capitalGain|div|split",
    formatted: "true",
    includeAdjustedClose: "true",
    interval,
    period1: String(period1),
    period2: String(period2),
    symbol,
    userYfid: "true",
    lang: "en-CA",
    region: "CA",
  }).toString();

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 500).trim();
    throw new Error(
      `Failed to fetch Yahoo Finance data: ${response.status} ${response.statusText}${
        text.length > 0 ? `. ${text}` : ""
      }. Yahoo may have changed, rate-limited, or disabled this undocumented endpoint.`,
    );
  }

  const data = await response.json() as YahooFinanceResponse;
  if (data.chart?.error) {
    throw new Error(
      data.chart.error.description ??
        "Yahoo Finance returned an unknown error.",
    );
  }

  const result = data.chart?.result?.[0];
  const timestamps = result?.timestamp;
  if (!result || !timestamps?.length) {
    throw new Error("No Yahoo Finance data found.");
  }

  const values = variable === "adjclose"
    ? result.indicators?.adjclose?.[0]?.adjclose
    : result.indicators?.quote?.[0]?.[variable];
  if (!values) {
    throw new Error(`${variable} data is not available for ${symbol}.`);
  }

  const exclusiveEndTime = period2 * 1000;
  const rows: { timestamp: number; value: number }[] = [];
  for (let index = 0; index < timestamps.length; index++) {
    const timestamp = timestamps[index] * 1000;
    const value = values[index];
    if (
      timestamp >= period1 * 1000 && timestamp < exclusiveEndTime &&
      typeof value === "number" && Number.isFinite(value)
    ) {
      rows.push({ timestamp, value });
    }
  }

  if (rows.length === 0) {
    throw new Error(`No ${variable} data found for ${symbol}.`);
  }
  return rows;
}

function assertArguments(
  symbol: string,
  startDate: Date,
  endDate: Date,
  variable: YahooVariable,
  interval: YahooInterval,
): void {
  if (typeof symbol !== "string" || symbol.trim().length === 0) {
    throw new TypeError(
      "loadYahooFinanceData() symbol must be a non-empty string.",
    );
  }
  if (
    !(startDate instanceof Date) || !(endDate instanceof Date) ||
    !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())
  ) {
    throw new RangeError(
      "loadYahooFinanceData() startDate and endDate must be valid dates.",
    );
  }
  if (endDate.getTime() < startDate.getTime()) {
    throw new RangeError(
      "loadYahooFinanceData() endDate must be equal to or later than startDate.",
    );
  }
  if (
    variable !== "open" && variable !== "high" && variable !== "low" &&
    variable !== "close" && variable !== "adjclose" && variable !== "volume"
  ) {
    throw new Error(
      'loadYahooFinanceData() variable must be "open", "high", "low", "close", "adjclose", or "volume".',
    );
  }
  if (interval !== "1d" && interval !== "1h" && interval !== "1m") {
    throw new Error(
      'loadYahooFinanceData() interval must be "1d", "1h", or "1m".',
    );
  }
}
