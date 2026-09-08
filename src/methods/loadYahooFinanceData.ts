import type SimpleTable from "../class/SimpleTable.ts";
import SDAError from "../class/SDAError.ts";
import queueOp from "../helpers/queueOp.ts";
import { executePreparedArray, prepareArray } from "./loadArray.ts";

const INTERVAL_SECONDS = {
  "1d": 24 * 60 * 60,
  "1h": 60 * 60,
  "1m": 60,
} as const;

const COLUMN_TYPES = {
  datetime: "TIMESTAMP",
  open: "DOUBLE",
  high: "DOUBLE",
  low: "DOUBLE",
  close: "DOUBLE",
  adjustedClose: "DOUBLE",
  volume: "DOUBLE",
} as const;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type YahooInterval = keyof typeof INTERVAL_SECONDS;
type YahooQuoteVariable = "open" | "high" | "low" | "close" | "volume";
type YahooValues = Array<number | null>;

type YahooFinanceResponse = {
  chart?: {
    error?: { description?: string } | null;
    result?:
      | Array<{
        timestamp?: number[];
        indicators?: {
          adjclose?: Array<{ adjclose?: YahooValues }>;
          quote?: Array<Partial<Record<YahooQuoteVariable, YahooValues>>>;
        };
      }>
      | null;
  };
};

type YahooFinanceRow = {
  datetime: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adjustedClose: number | null;
  volume: number | null;
};

export default function loadYahooFinanceData(
  table: SimpleTable,
  symbol: string,
  startDate: Date,
  endDate: Date,
  interval: YahooInterval,
): void {
  assertArguments(symbol, startDate, endDate, interval);
  const request = {
    symbol,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    interval,
  };

  queueOp(table, {
    kind: "barrier",
    method: "loadYahooFinanceData()",
    parameters: request,
    execute: () => executeLoadYahooFinanceData(table, request),
  });
}

async function executeLoadYahooFinanceData(
  table: SimpleTable,
  request: {
    symbol: string;
    startDate: Date;
    endDate: Date;
    interval: YahooInterval;
  },
): Promise<void> {
  try {
    const rows = await getYahooFinanceData(request);
    await executePreparedArray(table, prepareArray(rows, COLUMN_TYPES));
  } catch (error) {
    if (error instanceof SDAError) {
      throw error;
    }
    throw new SDAError({
      method: "loadYahooFinanceData()",
      parameters: request,
      query: "",
      cause: error,
    });
  }
}

async function getYahooFinanceData(request: {
  symbol: string;
  startDate: Date;
  endDate: Date;
  interval: YahooInterval;
}): Promise<YahooFinanceRow[]> {
  const { symbol, startDate, endDate, interval } = request;
  const startTime = startDate.getTime();
  const exclusiveEndTime = getExclusiveEndTime(endDate, interval);
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${
      encodeURIComponent(symbol)
    }`,
  );
  url.search = new URLSearchParams({
    includeAdjustedClose: "true",
    interval,
    period1: String(Math.floor(startTime / 1000)),
    period2: String(Math.ceil(exclusiveEndTime / 1000)),
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

  const quote = result.indicators?.quote?.[0];
  const adjustedClose = result.indicators?.adjclose?.[0]?.adjclose;
  const rows: YahooFinanceRow[] = [];
  for (let index = 0; index < timestamps.length; index++) {
    const timestamp = timestamps[index] * 1000;
    if (timestamp >= startTime && timestamp < exclusiveEndTime) {
      rows.push({
        datetime: new Date(timestamp),
        open: getFiniteValue(quote?.open, index),
        high: getFiniteValue(quote?.high, index),
        low: getFiniteValue(quote?.low, index),
        close: getFiniteValue(quote?.close, index),
        adjustedClose: getFiniteValue(adjustedClose, index),
        volume: getFiniteValue(quote?.volume, index),
      });
    }
  }

  if (rows.length === 0) {
    throw new Error(`No Yahoo Finance data found for ${symbol}.`);
  }
  return rows;
}

function getFiniteValue(
  values: YahooValues | undefined,
  index: number,
): number | null {
  const value = values?.[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getExclusiveEndTime(endDate: Date, interval: YahooInterval): number {
  const end = new Date(endDate);
  if (interval === "1d") {
    end.setUTCHours(0, 0, 0, 0);
  } else if (interval === "1h") {
    end.setUTCMinutes(0, 0, 0);
  } else {
    end.setUTCSeconds(0, 0);
  }
  return end.getTime() + INTERVAL_SECONDS[interval] * 1000;
}

function assertArguments(
  symbol: string,
  startDate: Date,
  endDate: Date,
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
  if (interval !== "1d" && interval !== "1h" && interval !== "1m") {
    throw new Error(
      'loadYahooFinanceData() interval must be "1d", "1h", or "1m".',
    );
  }
}
