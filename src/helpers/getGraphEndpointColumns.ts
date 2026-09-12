import foldIdentifier from "./foldIdentifier.ts";
import quoteIdentifier from "./quoteIdentifier.ts";
import type { TableSchema } from "./pendingOps.ts";

export type GraphEndpointColumns = {
  source: string;
  target: string;
  idType: string;
  family: "string" | "numeric";
  floating: boolean;
};

type IntegerType = {
  signed: boolean;
  bits: 8 | 16 | 32 | 64 | 128;
  digits: number;
};

const integerTypes: Record<string, IntegerType> = {
  TINYINT: { signed: true, bits: 8, digits: 3 },
  SMALLINT: { signed: true, bits: 16, digits: 5 },
  INTEGER: { signed: true, bits: 32, digits: 10 },
  BIGINT: { signed: true, bits: 64, digits: 19 },
  HUGEINT: { signed: true, bits: 128, digits: 39 },
  UTINYINT: { signed: false, bits: 8, digits: 3 },
  USMALLINT: { signed: false, bits: 16, digits: 5 },
  UINTEGER: { signed: false, bits: 32, digits: 10 },
  UBIGINT: { signed: false, bits: 64, digits: 20 },
  UHUGEINT: { signed: false, bits: 128, digits: 39 },
};

/** Resolves and validates a graph's endpoint columns from an existing schema. */
export default function getGraphEndpointColumns(
  schema: TableSchema,
  requestedSource: string,
  requestedTarget: string,
  method: string,
): GraphEndpointColumns {
  const source = findColumn(schema, requestedSource);
  const target = findColumn(schema, requestedTarget);
  const missing = [
    source === undefined ? requestedSource : undefined,
    target === undefined ? requestedTarget : undefined,
  ].filter((column): column is string => column !== undefined);
  if (missing.length > 0) {
    const plural = missing.length > 1;
    throw new Error(
      `${method} the column${plural ? "s" : ""} ${
        missing.map(quoteIdentifier).join(", ")
      } ${
        plural ? "do" : "does"
      } not exist. Check for typos, or load the data first.`,
    );
  }

  const sourceType = normalizeType(schema[source!]);
  const targetType = normalizeType(schema[target!]);
  const sourceKind = typeKind(sourceType);
  const targetKind = typeKind(targetType);
  if (sourceKind === undefined || targetKind === undefined) {
    const unsupported = sourceKind === undefined
      ? { column: source!, type: sourceType }
      : { column: target!, type: targetType };
    throw new TypeError(
      `${method} requires string or numeric endpoint IDs, but column ${
        quoteIdentifier(unsupported.column)
      } has type ${unsupported.type}.`,
    );
  }
  if (sourceKind.family !== targetKind.family) {
    throw new TypeError(
      `${method} requires compatible source and target ID types, but ${
        quoteIdentifier(source!)
      } has type ${sourceType} and ${
        quoteIdentifier(target!)
      } has type ${targetType}.`,
    );
  }

  if (sourceKind.family === "string") {
    return {
      source: source!,
      target: target!,
      idType: "VARCHAR",
      family: "string",
      floating: false,
    };
  }

  const idType = compatibleNumericType(sourceType, targetType);
  if (idType === undefined) {
    throw new TypeError(
      `${method} cannot combine endpoint types ${sourceType} and ${targetType} without losing ID precision. Convert both columns to one compatible exact numeric type first.`,
    );
  }
  return {
    source: source!,
    target: target!,
    idType,
    family: "numeric",
    floating: isFloating(sourceType) || isFloating(targetType),
  };
}

function findColumn(
  schema: TableSchema,
  requested: string,
): string | undefined {
  const folded = foldIdentifier(requested);
  return Object.keys(schema).find((column) =>
    foldIdentifier(column) === folded
  );
}

function normalizeType(type: string): string {
  return type.toUpperCase().replace(/^REAL$/, "FLOAT");
}

function typeKind(type: string):
  | { family: "string" }
  | { family: "numeric" }
  | undefined {
  if (type === "VARCHAR") return { family: "string" };
  if (
    integerTypes[type] !== undefined || isDecimal(type) || isFloating(type) ||
    type === "BIGNUM"
  ) {
    return { family: "numeric" };
  }
  return undefined;
}

function compatibleNumericType(
  left: string,
  right: string,
): string | undefined {
  if (left === right) return left;
  if (isFloating(left) || isFloating(right)) {
    return isFloating(left) && isFloating(right) ? "DOUBLE" : undefined;
  }
  if (left === "BIGNUM" || right === "BIGNUM") {
    const other = left === "BIGNUM" ? right : left;
    return integerTypes[other] !== undefined || decimalScale(other) === 0
      ? "BIGNUM"
      : undefined;
  }

  const leftInteger = integerTypes[left];
  const rightInteger = integerTypes[right];
  if (leftInteger !== undefined && rightInteger !== undefined) {
    return commonIntegerType(leftInteger, rightInteger);
  }

  const leftDecimal = parseDecimal(left);
  const rightDecimal = parseDecimal(right);
  if (leftDecimal === undefined && rightDecimal === undefined) return undefined;
  const scale = Math.max(leftDecimal?.scale ?? 0, rightDecimal?.scale ?? 0);
  const integerDigits = Math.max(
    leftDecimal === undefined
      ? leftInteger!.digits
      : leftDecimal.precision - leftDecimal.scale,
    rightDecimal === undefined
      ? rightInteger!.digits
      : rightDecimal.precision - rightDecimal.scale,
  );
  const precision = integerDigits + scale;
  return precision <= 38 ? `DECIMAL(${precision},${scale})` : undefined;
}

function commonIntegerType(
  left: IntegerType,
  right: IntegerType,
): string | undefined {
  if (left.signed === right.signed) {
    const bits = Math.max(left.bits, right.bits);
    return integerTypeName(left.signed, bits);
  }
  const signed = left.signed ? left : right;
  const unsigned = left.signed ? right : left;
  const requiredBits = Math.max(signed.bits, nextBits(unsigned.bits));
  return requiredBits > 128 ? undefined : integerTypeName(true, requiredBits);
}

function nextBits(bits: number): number {
  if (bits <= 8) return 16;
  if (bits <= 16) return 32;
  if (bits <= 32) return 64;
  if (bits <= 64) return 128;
  return 256;
}

function integerTypeName(signed: boolean, bits: number): string | undefined {
  const names = signed
    ? {
      8: "TINYINT",
      16: "SMALLINT",
      32: "INTEGER",
      64: "BIGINT",
      128: "HUGEINT",
    }
    : {
      8: "UTINYINT",
      16: "USMALLINT",
      32: "UINTEGER",
      64: "UBIGINT",
      128: "UHUGEINT",
    };
  return names[bits as keyof typeof names];
}

function isFloating(type: string): boolean {
  return type === "FLOAT" || type === "DOUBLE";
}

function isDecimal(type: string): boolean {
  return /^DECIMAL\(\d+,\d+\)$/.test(type);
}

function parseDecimal(
  type: string,
): { precision: number; scale: number } | undefined {
  const match = /^DECIMAL\((\d+),(\d+)\)$/.exec(type);
  return match === null
    ? undefined
    : { precision: Number(match[1]), scale: Number(match[2]) };
}

function decimalScale(type: string): number | undefined {
  return parseDecimal(type)?.scale;
}
