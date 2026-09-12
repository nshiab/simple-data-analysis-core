import getGraphEndpointColumns from "../helpers/getGraphEndpointColumns.ts";
import foldIdentifier from "../helpers/foldIdentifier.ts";
import prepareGraphStarts, {
  type GraphId,
  type PreparedGraphStarts,
} from "../helpers/prepareGraphStarts.ts";
import queueGraphResult from "../helpers/queueGraphResult.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";

type NeighborsOptions = {
  direction?: "outgoing" | "incoming" | "both";
  outputTable?: string | boolean;
};

export default function neighbors(
  simpleTable: SimpleTable,
  source: string,
  target: string,
  start: GraphId | GraphId[],
  options: NeighborsOptions = {},
): SimpleTable {
  if (typeof source !== "string") {
    throw new TypeError("neighbors() source must be a string.");
  }
  if (typeof target !== "string") {
    throw new TypeError("neighbors() target must be a string.");
  }
  if (
    options === null || typeof options !== "object" || Array.isArray(options)
  ) {
    throw new TypeError("neighbors() options must be an object.");
  }
  if (
    options.direction !== undefined &&
    !["outgoing", "incoming", "both"].includes(options.direction)
  ) {
    throw new TypeError(
      'neighbors() options.direction must be "outgoing", "incoming", or "both".',
    );
  }
  if (
    options.outputTable !== undefined &&
    typeof options.outputTable !== "string" &&
    typeof options.outputTable !== "boolean"
  ) {
    throw new TypeError(
      "neighbors() options.outputTable must be a string or boolean.",
    );
  }

  const preparedStarts = prepareGraphStarts(start, "neighbors()");
  options = structuredClone(options);
  const direction = options.direction ?? "outgoing";
  const parameters = {
    source,
    target,
    start: structuredClone(start),
    options,
  };

  return queueGraphResult(simpleTable, {
    method: "neighbors()",
    parameters,
    outputTable: options.outputTable,
    values: (schema) => {
      validateStarts(schema, source, target, preparedStarts);
      return preparedStarts.values;
    },
    buildSelect: (input, schema) =>
      neighborsSelect(
        input,
        schema,
        source,
        target,
        preparedStarts,
        direction,
      ),
    outputSchema: (schema) => {
      const endpoints = validateStarts(
        schema,
        source,
        target,
        preparedStarts,
      );
      return { start: endpoints.idType, node: endpoints.idType };
    },
  });
}

function validateStarts(
  schema: TableSchema,
  source: string,
  target: string,
  starts: PreparedGraphStarts,
) {
  const endpoints = getGraphEndpointColumns(
    schema,
    source,
    target,
    "neighbors()",
  );
  if (endpoints.family !== starts.family) {
    throw new TypeError(
      `neighbors() start contains ${starts.family} IDs, but endpoint columns ${
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
          `neighbors() start contains ${value}n, which ${endpoints.idType} cannot represent exactly.`,
        );
      }
    }
  }
  return endpoints;
}

function neighborsSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  starts: PreparedGraphStarts,
  direction: "outgoing" | "incoming" | "both",
): string {
  const endpoints = validateStarts(schema, source, target, starts);
  const sourceColumn = quoteIdentifier(endpoints.source);
  const targetColumn = quoteIdentifier(endpoints.target);
  // A standalone operation reads the physical input directly. Internal CTEs
  // must not shadow that relation, including case-insensitive SQL names.
  const relation = (name: string) =>
    quoteIdentifier(
      foldIdentifier(input) === quoteIdentifier(name) ? `${name}_1` : name,
    );
  const startsRelation = relation("graph_starts");
  const matchesRelation = relation("neighbor_matches");
  const idType = endpoints.idType;
  const cast = (expression: string) => `CAST(${expression} AS ${idType})`;
  const key = endpoints.family === "string"
    ? (expression: string) => `ENCODE(${cast(expression)})`
    : cast;
  const values = starts.values.map(() => `(TRY_CAST(? AS ${idType}))`).join(
    ", ",
  );
  const branch = (from: string, to: string) =>
    `SELECT ${cast(from)} AS ${quoteIdentifier("start")}, ${cast(to)} AS ${
      quoteIdentifier("node")
    }, ${key(from)} AS ${quoteIdentifier("__start_key")}, ${key(to)} AS ${
      quoteIdentifier("__node_key")
    }
      FROM ${input} AS ${quoteIdentifier("edges")}
      INNER JOIN ${startsRelation} AS ${quoteIdentifier("starts")}
        ON ${key(from)} = ${
      key(
        `${quoteIdentifier("starts")}.${quoteIdentifier("start")}`,
      )
    }`;
  const outgoing = branch(
    `${quoteIdentifier("edges")}.${sourceColumn}`,
    `${quoteIdentifier("edges")}.${targetColumn}`,
  );
  const incoming = branch(
    `${quoteIdentifier("edges")}.${targetColumn}`,
    `${quoteIdentifier("edges")}.${sourceColumn}`,
  );
  const matches = direction === "outgoing"
    ? outgoing
    : direction === "incoming"
    ? incoming
    : `${outgoing}\nUNION ALL\n${incoming}`;

  return `WITH ${startsRelation}(${quoteIdentifier("start")}) AS (
      VALUES ${values}
    ), ${matchesRelation} AS (
      ${matches}
    )
    SELECT ${quoteIdentifier("start")}, ${quoteIdentifier("node")}
    FROM (
      SELECT DISTINCT ${quoteIdentifier("start")}, ${
    quoteIdentifier("node")
  }, ${quoteIdentifier("__start_key")}, ${quoteIdentifier("__node_key")}
      FROM ${matchesRelation}
    ) AS ${quoteIdentifier("distinct_neighbors")}
    ORDER BY ${quoteIdentifier("__start_key")}, ${
    quoteIdentifier("__node_key")
  }`;
}
