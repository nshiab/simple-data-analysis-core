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

type CommonNeighborsOptions = {
  direction?: GraphDirection;
  outputTable?: string | boolean;
};

export default function commonNeighbors(
  simpleTable: SimpleTable,
  source: string,
  target: string,
  nodeA: GraphId,
  nodeB: GraphId,
  options: CommonNeighborsOptions = {},
): SimpleTable {
  if (typeof source !== "string") {
    throw new TypeError("commonNeighbors() source must be a string.");
  }
  if (typeof target !== "string") {
    throw new TypeError("commonNeighbors() target must be a string.");
  }
  if (
    options === null || typeof options !== "object" || Array.isArray(options)
  ) {
    throw new TypeError("commonNeighbors() options must be an object.");
  }
  if (
    options.direction !== undefined &&
    !["outgoing", "incoming", "both"].includes(options.direction)
  ) {
    throw new TypeError(
      'commonNeighbors() options.direction must be "outgoing", "incoming", or "both".',
    );
  }
  if (
    options.outputTable !== undefined &&
    typeof options.outputTable !== "string" &&
    typeof options.outputTable !== "boolean"
  ) {
    throw new TypeError(
      "commonNeighbors() options.outputTable must be a string or boolean.",
    );
  }

  const nodes = prepareNodes(nodeA, nodeB);
  options = structuredClone(options);
  const direction = options.direction ?? "outgoing";
  const parameters = { source, target, nodeA, nodeB, options };

  return queueGraphResult(simpleTable, {
    method: "commonNeighbors()",
    parameters,
    outputTable: options.outputTable,
    values: (schema) => {
      validateNodes(schema, source, target, nodes);
      return nodes.values;
    },
    buildSelect: (input, schema) =>
      commonNeighborsSelect(
        input,
        schema,
        source,
        target,
        nodes,
        direction,
      ),
    outputSchema: (schema) => ({
      node: validateNodes(schema, source, target, nodes).idType,
    }),
  });
}

function prepareNodes(nodeA: GraphId, nodeB: GraphId): PreparedGraphStarts {
  if (Array.isArray(nodeA)) {
    throw new TypeError("commonNeighbors() nodeA must be one node ID.");
  }
  if (Array.isArray(nodeB)) {
    throw new TypeError("commonNeighbors() nodeB must be one node ID.");
  }
  const first = prepareGraphStarts(nodeA, "commonNeighbors()", "nodeA", true);
  const second = prepareGraphStarts(nodeB, "commonNeighbors()", "nodeB", true);
  if (first.family !== second.family) {
    throw new TypeError(
      "commonNeighbors() nodeA and nodeB must both be string IDs or both be numeric IDs.",
    );
  }
  if (first.values[0] === second.values[0]) {
    throw new TypeError(
      "commonNeighbors() nodeA and nodeB must be different.",
    );
  }
  return {
    family: first.family,
    numericValues: [...first.numericValues, ...second.numericValues],
    values: [first.values[0], second.values[0]],
  };
}

function validateNodes(
  schema: TableSchema,
  source: string,
  target: string,
  nodes: PreparedGraphStarts,
) {
  return validateGraphStarts(
    schema,
    source,
    target,
    nodes,
    "commonNeighbors()",
    "nodeA and nodeB",
  );
}

function commonNeighborsSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  nodes: PreparedGraphStarts,
  direction: GraphDirection,
): string {
  const prepared = prepareGraphTraversal(
    input,
    schema,
    source,
    target,
    nodes,
    "commonNeighbors()",
    "nodeA and nodeB",
  );
  const relations = prepared.relationNames([
    "graph_requested_nodes",
    "graph_edges",
    "graph_neighbor_memberships",
    "graph_common_neighbors",
  ]);
  const requested = relations.graph_requested_nodes;
  const edges = relations.graph_edges;
  const memberships = relations.graph_neighbor_memberships;
  const common = relations.graph_common_neighbors;
  const q = quoteIdentifier;

  return `WITH ${requested}(${q("node")}) AS (
      VALUES ${prepared.startValues}
    ), ${edges} AS (
      ${prepared.edges(direction)}
    ), ${memberships} AS (
      SELECT ${q("requested")}.${q("node")} AS ${q("requested_node")},
        ${q("edges")}.${q("__from_key")} AS ${q("__requested_key")},
        ${q("edges")}.${q("__to")} AS ${q("node")},
        ${q("edges")}.${q("__to_key")} AS ${q("__node_key")}
      FROM ${edges} AS ${q("edges")}
      INNER JOIN ${requested} AS ${q("requested")}
        ON ${q("edges")}.${q("__from_key")} =
          ${prepared.key(`${q("requested")}.${q("node")}`)}
    ), ${common} AS (
      SELECT MIN(${q("node")}) AS ${q("node")}, ${q("__node_key")}
      FROM ${memberships}
      GROUP BY ${q("__node_key")}
      HAVING COUNT(DISTINCT ${q("__requested_key")}) = 2
    )
    SELECT ${q("node")}
    FROM ${common}
    ORDER BY ${q("__node_key")}`;
}
