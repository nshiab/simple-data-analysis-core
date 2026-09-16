import foldIdentifier from "./foldIdentifier.ts";
import type { TableSchema } from "./pendingOps.ts";
import type { GraphDirection } from "./prepareGraphTraversal.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

export type GraphTemporalOptions = {
  endTimeColumn?: string;
  minGapMs?: number;
  startTimeColumn?: string;
  strictOrdering?: boolean;
};

export type PreparedGraphTemporalOptions = {
  endTimeColumn?: string;
  gapMicroseconds: bigint;
  startTimeColumn?: string;
  strictOrdering: boolean;
};

export type PreparedGraphTemporalSql = {
  endTimeColumn?: string;
  eventSelections: (tableAlias?: string) => string[];
  eventValidity: (tableAlias?: string) => string;
  gapParameter: string;
  gapUnit: "microsecond" | "nanosecond";
  startTimeColumn?: string;
  transition: (
    currentAlias: string,
    candidateAlias: string,
    direction: Exclude<GraphDirection, "both">,
    gapExpression: string,
  ) => string;
};

const temporalTypes = new Set([
  "DATE",
  "TIMESTAMP",
  "TIMESTAMP_S",
  "TIMESTAMP_MS",
  "TIMESTAMP_NS",
  "TIMESTAMP WITH TIME ZONE",
]);

/** Validates chronological options before a graph operation is queued. */
export function prepareGraphTemporalOptions(
  options: GraphTemporalOptions,
  direction: GraphDirection | undefined,
  method: string,
): PreparedGraphTemporalOptions | undefined {
  const startTimeColumn = options.startTimeColumn;
  const endTimeColumn = options.endTimeColumn;
  if (
    startTimeColumn !== undefined && typeof startTimeColumn !== "string"
  ) {
    throw new TypeError(
      `${method} options.startTimeColumn must be a string.`,
    );
  }
  if (endTimeColumn !== undefined && typeof endTimeColumn !== "string") {
    throw new TypeError(`${method} options.endTimeColumn must be a string.`);
  }
  if (
    options.strictOrdering !== undefined &&
    typeof options.strictOrdering !== "boolean"
  ) {
    throw new TypeError(
      `${method} options.strictOrdering must be a boolean.`,
    );
  }
  if (
    options.minGapMs !== undefined && typeof options.minGapMs !== "number"
  ) {
    throw new TypeError(`${method} options.minGapMs must be a number.`);
  }

  const hasTimeColumn = startTimeColumn !== undefined ||
    endTimeColumn !== undefined;
  const hasTemporalSetting = options.minGapMs !== undefined ||
    options.strictOrdering !== undefined;
  if (!hasTimeColumn) {
    if (hasTemporalSetting) {
      throw new TypeError(
        `${method} options.minGapMs and options.strictOrdering require options.startTimeColumn or options.endTimeColumn.`,
      );
    }
    return undefined;
  }
  if (direction === "both") {
    throw new TypeError(
      `${method} options.direction cannot be "both" when chronological options are supplied.`,
    );
  }

  const minGapMs = options.minGapMs ?? 0;
  if (!Number.isFinite(minGapMs) || minGapMs < 0) {
    throw new TypeError(
      `${method} options.minGapMs must be a finite, non-negative number.`,
    );
  }
  if (minGapMs > Number.MAX_SAFE_INTEGER) {
    throw new TypeError(
      `${method} options.minGapMs must not exceed Number.MAX_SAFE_INTEGER.`,
    );
  }
  const gapMicroseconds = scaleDecimalNumber(minGapMs, 3);
  if (gapMicroseconds === undefined) {
    throw new TypeError(
      `${method} options.minGapMs must resolve to a whole number of microseconds.`,
    );
  }

  return {
    endTimeColumn,
    gapMicroseconds,
    startTimeColumn,
    strictOrdering: options.strictOrdering ?? true,
  };
}

/** Prepares native-precision event and transition SQL from a queued schema. */
export default function prepareGraphTemporalSql(
  schema: TableSchema,
  options: PreparedGraphTemporalOptions,
  method: string,
): PreparedGraphTemporalSql {
  const start = options.startTimeColumn === undefined
    ? undefined
    : getTemporalColumn(schema, options.startTimeColumn, method);
  const end = options.endTimeColumn === undefined
    ? undefined
    : getTemporalColumn(schema, options.endTimeColumn, method);
  if (start?.zoned !== undefined && end?.zoned !== undefined) {
    if (start.zoned !== end.zoned) {
      throw new TypeError(
        `${method} cannot mix time-zone-aware and time-zone-naive chronological columns. Convert both columns to the same timestamp domain first.`,
      );
    }
  }

  const startColumn = start?.column ?? end!.column;
  const endColumn = end?.column ?? start!.column;
  const startType = start?.type ?? end!.type;
  const endType = end?.type ?? start!.type;
  const gapUnit = start?.type === "TIMESTAMP_NS" ||
      end?.type === "TIMESTAMP_NS"
    ? "nanosecond"
    : "microsecond";
  const gap = gapUnit === "nanosecond"
    ? options.gapMicroseconds * 1000n
    : options.gapMicroseconds;
  const q = quoteIdentifier;
  const reference = (alias: string | undefined, column: string) =>
    `${alias === undefined ? "" : `${q(alias)}.`}${q(column)}`;
  const eventReference = (alias: string | undefined, name: string) =>
    `${alias === undefined ? "" : `${q(alias)}.`}${q(name)}`;

  return {
    startTimeColumn: start?.column,
    endTimeColumn: end?.column,
    gapParameter: gap.toString(),
    gapUnit,
    eventSelections: (alias) => [
      `row_number() OVER () AS ${q("__event_id")}`,
      `${reference(alias, startColumn)} AS ${q("__event_start")}`,
      `${reference(alias, endColumn)} AS ${q("__event_end")}`,
    ],
    eventValidity: (alias) => {
      const eventStart = eventReference(alias, "__event_start");
      const eventEnd = eventReference(alias, "__event_end");
      return `${eventStart} IS NOT NULL
        AND ${eventEnd} IS NOT NULL
        AND isfinite(${eventStart})
        AND isfinite(${eventEnd})
        AND ${temporalUnits(eventEnd, endType, gapUnit)} >= ${
        temporalUnits(eventStart, startType, gapUnit)
      }`;
    },
    transition: (currentAlias, candidateAlias, direction, gapExpression) => {
      const currentStart = eventReference(currentAlias, "__event_start");
      const currentEnd = eventReference(currentAlias, "__event_end");
      const candidateStart = eventReference(candidateAlias, "__event_start");
      const candidateEnd = eventReference(candidateAlias, "__event_end");
      const earlierEnd = direction === "outgoing" ? currentEnd : candidateEnd;
      const laterStart = direction === "outgoing"
        ? candidateStart
        : currentStart;
      const elapsed = `${temporalUnits(laterStart, startType, gapUnit)} - ${
        temporalUnits(earlierEnd, endType, gapUnit)
      }`;
      const ordering = options.strictOrdering
        ? `
        AND ${elapsed} > 0`
        : "";
      return `${elapsed} >= ${gapExpression}${ordering}`;
    },
  };
}

function temporalUnits(
  expression: string,
  type: string,
  unit: "microsecond" | "nanosecond",
): string {
  const scale = unit === "nanosecond" ? 1000n : 1n;
  if (type === "DATE") {
    return `(CAST(date_diff('day', DATE '1970-01-01', ${expression}) AS HUGEINT) * ${
      86_400_000_000n * scale
    })`;
  }
  if (type === "TIMESTAMP_NS") {
    return `CAST(epoch_ns(${expression}) AS HUGEINT)`;
  }
  return `(CAST(epoch_us(${expression}) AS HUGEINT) * ${scale})`;
}

function getTemporalColumn(
  schema: TableSchema,
  requested: string,
  method: string,
): { column: string; type: string; zoned: boolean } {
  const folded = foldIdentifier(requested);
  const column = Object.keys(schema).find((name) =>
    foldIdentifier(name) === folded
  );
  if (column === undefined) {
    throw new Error(
      `${method} the column ${
        quoteIdentifier(requested)
      } does not exist. Check for typos, or load the data first.`,
    );
  }
  const type = normalizeTemporalType(schema[column]);
  if (!temporalTypes.has(type)) {
    throw new TypeError(
      `${method} requires DATE or TIMESTAMP chronological columns, but column ${
        quoteIdentifier(column)
      } has type ${schema[column].toUpperCase()}.`,
    );
  }
  return {
    column,
    type,
    zoned: type === "TIMESTAMP WITH TIME ZONE",
  };
}

function normalizeTemporalType(type: string): string {
  const normalized = type.toUpperCase();
  if (normalized === "TIMESTAMPTZ") return "TIMESTAMP WITH TIME ZONE";
  if (normalized === "TIMESTAMP WITHOUT TIME ZONE") return "TIMESTAMP";
  return normalized;
}

function scaleDecimalNumber(
  value: number,
  decimalPlaces: number,
): bigint | undefined {
  const [coefficient, exponentText] = value.toString().toLowerCase().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = BigInt(`${whole}${fraction}`);
  const exponent = Number(exponentText ?? 0) - fraction.length + decimalPlaces;
  if (exponent >= 0) return digits * 10n ** BigInt(exponent);
  const divisor = 10n ** BigInt(-exponent);
  return digits % divisor === 0n ? digits / divisor : undefined;
}
