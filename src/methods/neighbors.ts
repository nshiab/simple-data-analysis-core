import prepareGraphStarts, {
  type GraphId,
  type PreparedGraphStarts,
} from "../helpers/prepareGraphStarts.ts";
import prepareGraphTraversal, {
  type GraphDirection,
  validateGraphStarts,
} from "../helpers/prepareGraphTraversal.ts";
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
  return validateGraphStarts(
    schema,
    source,
    target,
    starts,
    "neighbors()",
  );
}

function neighborsSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  starts: PreparedGraphStarts,
  direction: GraphDirection,
): string {
  const prepared = prepareGraphTraversal(
    input,
    schema,
    source,
    target,
    starts,
    "neighbors()",
  );
  const relations = prepared.relationNames([
    "graph_starts",
    "graph_edges",
    "neighbor_matches",
  ]);
  const startsRelation = relations.graph_starts;
  const edgesRelation = relations.graph_edges;
  const matchesRelation = relations.neighbor_matches;

  return `WITH ${startsRelation}(${quoteIdentifier("start")}) AS (
      VALUES ${prepared.startValues}
    ), ${edgesRelation} AS (
      ${prepared.edges(direction)}
    ), ${matchesRelation} AS (
      SELECT ${quoteIdentifier("starts")}.${quoteIdentifier("start")},
        ${quoteIdentifier("edges")}.${quoteIdentifier("__to")} AS ${
    quoteIdentifier("node")
  },
        ${quoteIdentifier("edges")}.${quoteIdentifier("__from_key")} AS ${
    quoteIdentifier("__start_key")
  },
        ${quoteIdentifier("edges")}.${quoteIdentifier("__to_key")} AS ${
    quoteIdentifier("__node_key")
  }
      FROM ${edgesRelation} AS ${quoteIdentifier("edges")}
      INNER JOIN ${startsRelation} AS ${quoteIdentifier("starts")}
        ON ${quoteIdentifier("edges")}.${quoteIdentifier("__from_key")} =
          ${
    prepared.key(
      `${quoteIdentifier("starts")}.${quoteIdentifier("start")}`,
    )
  }
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
