import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
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

type ReachableOptions = {
  direction?: GraphDirection;
  includeStart?: boolean;
  outputTable?: string | boolean;
};

export default function reachable(
  simpleTable: SimpleTable,
  source: string,
  target: string,
  start: GraphId | GraphId[],
  options: ReachableOptions = {},
): SimpleTable {
  if (typeof source !== "string") {
    throw new TypeError("reachable() source must be a string.");
  }
  if (typeof target !== "string") {
    throw new TypeError("reachable() target must be a string.");
  }
  if (
    options === null || typeof options !== "object" || Array.isArray(options)
  ) {
    throw new TypeError("reachable() options must be an object.");
  }
  if (
    options.direction !== undefined &&
    !["outgoing", "incoming", "both"].includes(options.direction)
  ) {
    throw new TypeError(
      'reachable() options.direction must be "outgoing", "incoming", or "both".',
    );
  }
  if (
    options.includeStart !== undefined &&
    typeof options.includeStart !== "boolean"
  ) {
    throw new TypeError("reachable() options.includeStart must be a boolean.");
  }
  if (
    options.outputTable !== undefined &&
    typeof options.outputTable !== "string" &&
    typeof options.outputTable !== "boolean"
  ) {
    throw new TypeError(
      "reachable() options.outputTable must be a string or boolean.",
    );
  }

  const preparedStarts = prepareGraphStarts(start, "reachable()");
  options = structuredClone(options);
  const direction = options.direction ?? "outgoing";
  const includeStart = options.includeStart ?? true;
  const parameters = {
    source,
    target,
    start: structuredClone(start),
    options,
  };

  return queueGraphResult(simpleTable, {
    method: "reachable()",
    parameters,
    outputTable: options.outputTable,
    values: (schema) => {
      validateStarts(schema, source, target, preparedStarts);
      return preparedStarts.values;
    },
    buildSelect: (input, schema) =>
      reachableSelect(
        input,
        schema,
        source,
        target,
        preparedStarts,
        direction,
        includeStart,
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
    "reachable()",
  );
}

function reachableSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  starts: PreparedGraphStarts,
  direction: GraphDirection,
  includeStart: boolean,
): string {
  const prepared = prepareGraphTraversal(
    input,
    schema,
    source,
    target,
    starts,
    "reachable()",
  );
  const relations = prepared.relationNames([
    "graph_start_values",
    "graph_starts",
    "graph_edges",
    "graph_nodes",
    "graph_reachable",
  ]);
  const startValuesRelation = relations.graph_start_values;
  const startsRelation = relations.graph_starts;
  const edgesRelation = relations.graph_edges;
  const nodesRelation = relations.graph_nodes;
  const reachableRelation = relations.graph_reachable;
  const start = `${quoteIdentifier("starts")}.${quoteIdentifier("start")}`;
  const startKey = `${quoteIdentifier("starts")}.${quoteIdentifier("__key")}`;
  const nodeKey = `${quoteIdentifier("nodes")}.${quoteIdentifier("__key")}`;
  const reachedStart = `${quoteIdentifier("reached")}.${
    quoteIdentifier("start")
  }`;
  const reachedStartKey = `${quoteIdentifier("reached")}.${
    quoteIdentifier("__start_key")
  }`;
  const edgeTo = `${quoteIdentifier("edges")}.${quoteIdentifier("__to")}`;
  const edgeToKey = `${quoteIdentifier("edges")}.${
    quoteIdentifier("__to_key")
  }`;
  const edgeFromKey = `${quoteIdentifier("edges")}.${
    quoteIdentifier("__from_key")
  }`;
  const reachedNodeKey = `${quoteIdentifier("reached")}.${
    quoteIdentifier("__node_key")
  }`;

  return `WITH RECURSIVE ${startValuesRelation}(${
    quoteIdentifier("start")
  }) AS (
      VALUES ${prepared.startValues}
    ), ${startsRelation} AS (
      SELECT ${quoteIdentifier("start")},
        ${prepared.key(quoteIdentifier("start"))} AS ${quoteIdentifier("__key")}
      FROM ${startValuesRelation}
    ), ${edgesRelation} AS (
      ${prepared.edges(direction)}
    ), ${nodesRelation} AS (
      SELECT ${quoteIdentifier("__from")} AS ${quoteIdentifier("node")},
        ${quoteIdentifier("__from_key")} AS ${quoteIdentifier("__key")}
      FROM ${edgesRelation}
      UNION
      SELECT ${quoteIdentifier("__to")} AS ${quoteIdentifier("node")},
        ${quoteIdentifier("__to_key")} AS ${quoteIdentifier("__key")}
      FROM ${edgesRelation}
    ), ${reachableRelation}(
      ${quoteIdentifier("start")}, ${quoteIdentifier("node")},
      ${quoteIdentifier("__start_key")}, ${quoteIdentifier("__node_key")}
    ) AS (
      SELECT ${start}, ${start}, ${startKey}, ${startKey}
      FROM ${startsRelation} AS ${quoteIdentifier("starts")}
      INNER JOIN ${nodesRelation} AS ${quoteIdentifier("nodes")}
        ON ${startKey} = ${nodeKey}
      UNION
      SELECT ${reachedStart}, ${edgeTo}, ${reachedStartKey}, ${edgeToKey}
      FROM ${reachableRelation} AS ${quoteIdentifier("reached")}
      INNER JOIN ${edgesRelation} AS ${quoteIdentifier("edges")}
        ON ${reachedNodeKey} = ${edgeFromKey}
    )
    SELECT ${quoteIdentifier("start")}, ${quoteIdentifier("node")}
    FROM ${reachableRelation}
    ${
    includeStart
      ? ""
      : `WHERE ${quoteIdentifier("__start_key")} <> ${
        quoteIdentifier("__node_key")
      }`
  }
    ORDER BY ${quoteIdentifier("__start_key")}, ${
    quoteIdentifier("__node_key")
  }`;
}
