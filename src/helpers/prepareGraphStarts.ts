export type GraphId = string | number | bigint;

export type PreparedGraphStarts = {
  family: "string" | "numeric";
  numericValues: bigint[];
  values: string[];
};

/** Validates and snapshots scalar-or-array graph starting IDs. */
export default function prepareGraphStarts(
  start: GraphId | GraphId[],
  method: string,
): PreparedGraphStarts {
  const starts = Array.isArray(start) ? [...start] : [start];
  if (starts.length === 0) {
    throw new TypeError(`${method} start must not be an empty array.`);
  }

  let family: "string" | "numeric" | undefined;
  const values: string[] = [];
  const numericValues: bigint[] = [];
  const seen = new Set<string>();
  const duplicates: GraphId[] = [];

  for (const value of starts) {
    const valueFamily = typeof value === "string"
      ? "string"
      : typeof value === "number" || typeof value === "bigint"
      ? "numeric"
      : undefined;
    if (valueFamily === undefined) {
      throw new TypeError(
        `${method} start must be a string, a whole number, or an array of those values.`,
      );
    }
    if (family !== undefined && family !== valueFamily) {
      throw new TypeError(
        `${method} start must not mix string and numeric IDs.`,
      );
    }
    family = valueFamily;

    let encoded: string;
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) {
        throw new TypeError(
          `${method} start contains ${value}, which is not a safe whole number. Use a bigint for exact integer IDs outside JavaScript's safe integer range.`,
        );
      }
      encoded = BigInt(value).toString();
      numericValues.push(BigInt(value));
    } else if (typeof value === "bigint") {
      encoded = value.toString();
      numericValues.push(value);
    } else {
      encoded = value;
    }

    const key = `${valueFamily}:${encoded}`;
    if (seen.has(key)) {
      if (!duplicates.some((duplicate) => graphIdsEqual(duplicate, value))) {
        duplicates.push(value);
      }
    } else {
      seen.add(key);
      values.push(encoded);
    }
  }

  if (duplicates.length > 0) {
    throw new TypeError(
      `${method} start contains duplicate IDs: ${
        duplicates.map(formatGraphId).join(", ")
      }.`,
    );
  }

  return { family: family!, numericValues, values };
}

function graphIdsEqual(left: GraphId, right: GraphId): boolean {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }
  return BigInt(left) === BigInt(right);
}

function formatGraphId(value: GraphId): string {
  if (typeof value === "string") return JSON.stringify(value);
  return typeof value === "bigint" ? `${value}n` : String(value);
}
