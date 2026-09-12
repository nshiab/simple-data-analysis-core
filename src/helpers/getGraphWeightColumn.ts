import foldIdentifier from "./foldIdentifier.ts";
import type { TableSchema } from "./pendingOps.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

type GraphWeightColumn = {
  column: string;
  distanceType: string;
  type: string;
};

const integerTypes = new Set([
  "TINYINT",
  "SMALLINT",
  "INTEGER",
  "BIGINT",
  "UTINYINT",
  "USMALLINT",
  "UINTEGER",
  "UBIGINT",
]);
const wideIntegerTypes = new Set(["HUGEINT", "UHUGEINT", "BIGNUM"]);

/** Resolves a numeric graph weight and a precision-preserving sum type. */
export default function getGraphWeightColumn(
  schema: TableSchema,
  requestedWeight: string,
  method: string,
): GraphWeightColumn {
  const folded = foldIdentifier(requestedWeight);
  const column = Object.keys(schema).find((name) =>
    foldIdentifier(name) === folded
  );
  if (column === undefined) {
    throw new Error(
      `${method} the column ${
        quoteIdentifier(requestedWeight)
      } does not exist. Check for typos, or load the data first.`,
    );
  }

  const type = schema[column].toUpperCase().replace(/^REAL$/, "FLOAT");
  if (integerTypes.has(type)) {
    return { column, type, distanceType: "HUGEINT" };
  }
  if (wideIntegerTypes.has(type)) {
    return { column, type, distanceType: "BIGNUM" };
  }
  if (type === "FLOAT" || type === "DOUBLE") {
    return { column, type, distanceType: type };
  }

  const decimal = /^DECIMAL\((\d+),(\d+)\)$/.exec(type);
  if (decimal !== null) {
    return {
      column,
      type,
      distanceType: `DECIMAL(38,${Number(decimal[2])})`,
    };
  }

  throw new TypeError(
    `${method} requires a numeric weight column, but column ${
      quoteIdentifier(column)
    } has type ${type}.`,
  );
}
