import foldIdentifier from "./foldIdentifier.ts";
import getGraphEndpointColumns, {
  type GraphEndpointColumns,
} from "./getGraphEndpointColumns.ts";
import type { TableSchema } from "./pendingOps.ts";
import type { PreparedGraphStarts } from "./prepareGraphStarts.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

export type GraphDirection = "outgoing" | "incoming" | "both";

export type PreparedGraphTraversal = {
  edges: (direction: GraphDirection, selections?: string[]) => string;
  endpoints: GraphEndpointColumns;
  key: (expression: string) => string;
  relationNames: (names: string[]) => Record<string, string>;
  startValues: string;
};

export type PreparedGraphSql = Omit<PreparedGraphTraversal, "startValues">;

/** Prepares exact-ID SQL shared by graph traversal methods. */
export default function prepareGraphTraversal(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  starts: PreparedGraphStarts,
  method: string,
): PreparedGraphTraversal {
  const endpoints = validateGraphStarts(
    schema,
    source,
    target,
    starts,
    method,
  );
  return {
    ...prepareGraphSqlFromEndpoints(input, endpoints),
    startValues: starts.values.map(() => `(TRY_CAST(? AS ${endpoints.idType}))`)
      .join(", "),
  };
}

/** Prepares exact-ID edge SQL for graph methods without starting nodes. */
export function prepareGraphSql(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  method: string,
): PreparedGraphSql {
  return prepareGraphSqlFromEndpoints(
    input,
    getGraphEndpointColumns(schema, source, target, method),
  );
}

function prepareGraphSqlFromEndpoints(
  input: string,
  endpoints: GraphEndpointColumns,
): PreparedGraphSql {
  const sourceColumn = quoteIdentifier(endpoints.source);
  const targetColumn = quoteIdentifier(endpoints.target);
  const idType = endpoints.idType;
  const cast = (expression: string) => `CAST(${expression} AS ${idType})`;
  const key = endpoints.family === "string"
    ? (expression: string) => `ENCODE(${cast(expression)})`
    : cast;
  const edge = (from: string, to: string, selections: string[]) =>
    `SELECT ${cast(from)} AS ${quoteIdentifier("__from")},
        ${cast(to)} AS ${quoteIdentifier("__to")},
        ${key(from)} AS ${quoteIdentifier("__from_key")},
        ${key(to)} AS ${quoteIdentifier("__to_key")}${
      selections.length === 0
        ? ""
        : `,\n        ${selections.join(",\n        ")}`
    }
      FROM ${input} AS ${quoteIdentifier("edges")}`;
  const sourceReference = `${quoteIdentifier("edges")}.${sourceColumn}`;
  const targetReference = `${quoteIdentifier("edges")}.${targetColumn}`;
  return {
    endpoints,
    key,
    edges: (direction, selections = []) =>
      direction === "outgoing"
        ? edge(sourceReference, targetReference, selections)
        : direction === "incoming"
        ? edge(targetReference, sourceReference, selections)
        : `${edge(sourceReference, targetReference, selections)}\nUNION ALL\n${
          edge(targetReference, sourceReference, selections)
        }`,
    relationNames: (names) => uniqueRelationNames(input, names),
  };
}

/** Validates supplied starts against resolved endpoint ID types. */
export function validateGraphStarts(
  schema: TableSchema,
  source: string,
  target: string,
  starts: PreparedGraphStarts,
  method: string,
): GraphEndpointColumns {
  const endpoints = getGraphEndpointColumns(schema, source, target, method);
  if (endpoints.family !== starts.family) {
    throw new TypeError(
      `${method} start contains ${starts.family} IDs, but endpoint columns ${
        quoteIdentifier(endpoints.source)
      } and ${
        quoteIdentifier(endpoints.target)
      } contain ${endpoints.family} IDs.`,
    );
  }
  if (endpoints.floating) {
    for (const value of starts.numericValues) {
      const converted = endpoints.idType === "FLOAT"
        ? Math.fround(Number(value))
        : Number(value);
      if (!Number.isFinite(converted) || BigInt(converted) !== value) {
        throw new TypeError(
          `${method} start contains ${value}n, which ${endpoints.idType} cannot represent exactly.`,
        );
      }
    }
  }
  return endpoints;
}

function uniqueRelationNames(
  input: string,
  requestedNames: string[],
): Record<string, string> {
  const used = new Set([foldIdentifier(input)]);
  const names: Record<string, string> = {};
  for (const requested of requestedNames) {
    let candidate = requested;
    let suffix = 1;
    while (used.has(foldIdentifier(quoteIdentifier(candidate)))) {
      candidate = `${requested}_${suffix}`;
      suffix++;
    }
    const quoted = quoteIdentifier(candidate);
    used.add(foldIdentifier(quoted));
    names[requested] = quoted;
  }
  return names;
}
