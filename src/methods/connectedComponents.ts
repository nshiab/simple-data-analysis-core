import type SimpleTable from "../class/SimpleTable.ts";
import getGraphEndpointColumns from "../helpers/getGraphEndpointColumns.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import { prepareGraphSql } from "../helpers/prepareGraphTraversal.ts";
import queueGraphResult from "../helpers/queueGraphResult.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

type ConnectedComponentsOptions = {
  mode?: "weak" | "strong";
  outputTable?: string | boolean;
};

export default function connectedComponents(
  simpleTable: SimpleTable,
  source: string,
  target: string,
  options: ConnectedComponentsOptions = {},
): SimpleTable {
  if (typeof source !== "string") {
    throw new TypeError("connectedComponents() source must be a string.");
  }
  if (typeof target !== "string") {
    throw new TypeError("connectedComponents() target must be a string.");
  }
  if (
    options === null || typeof options !== "object" || Array.isArray(options)
  ) {
    throw new TypeError("connectedComponents() options must be an object.");
  }
  if (
    options.mode !== undefined &&
    !["weak", "strong"].includes(options.mode)
  ) {
    throw new TypeError(
      'connectedComponents() options.mode must be "weak" or "strong".',
    );
  }
  if (
    options.outputTable !== undefined &&
    typeof options.outputTable !== "string" &&
    typeof options.outputTable !== "boolean"
  ) {
    throw new TypeError(
      "connectedComponents() options.outputTable must be a string or boolean.",
    );
  }

  options = structuredClone(options);
  const mode = options.mode ?? "weak";
  const parameters = { source, target, options };

  return queueGraphResult(simpleTable, {
    method: "connectedComponents()",
    parameters,
    outputTable: options.outputTable,
    values: (schema) => {
      validateEndpoints(schema, source, target);
      return [];
    },
    buildSelect: (input, schema) =>
      connectedComponentsSelect(input, schema, source, target, mode),
    outputSchema: (schema) => ({
      node: validateEndpoints(schema, source, target).idType,
      componentId: "BIGINT",
    }),
  });
}

function validateEndpoints(
  schema: TableSchema,
  source: string,
  target: string,
) {
  return getGraphEndpointColumns(
    schema,
    source,
    target,
    "connectedComponents()",
  );
}

function connectedComponentsSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  mode: "weak" | "strong",
): string {
  const prepared = prepareGraphSql(
    input,
    schema,
    source,
    target,
    "connectedComponents()",
  );
  const relationNames = mode === "weak"
    ? [
      "graph_edges",
      "graph_nodes",
      "graph_component_labels",
      "graph_component_roots",
    ]
    : [
      "graph_edges",
      "graph_nodes",
      "graph_reachable",
      "graph_component_members",
      "graph_component_roots",
    ];
  const relations = prepared.relationNames(relationNames);
  const edges = relations.graph_edges;
  const nodes = relations.graph_nodes;
  const roots = relations.graph_component_roots;
  const q = quoteIdentifier;

  const common = `${edges} AS (
      ${prepared.edges(mode === "weak" ? "both" : "outgoing")}
    ), ${nodes} AS (
      SELECT ${q("__from")} AS ${q("node")},
        ${q("__from_key")} AS ${q("__key")}
      FROM ${edges}
      UNION
      SELECT ${q("__to")} AS ${q("node")},
        ${q("__to_key")} AS ${q("__key")}
      FROM ${edges}
    )`;

  if (mode === "weak") {
    const labels = relations.graph_component_labels;
    return `WITH RECURSIVE ${common}, ${labels}(
      ${q("node")}, ${q("__node_key")}, ${q("__root_key")}
    ) USING KEY(${q("__node_key")}) AS (
      SELECT ${q("node")}, ${q("__key")}, ${q("__key")}
      FROM ${nodes}
      UNION
      SELECT ${q("edges")}.${q("__to")},
        ${q("edges")}.${q("__to_key")},
        MIN(${q("reached")}.${q("__root_key")})
      FROM ${labels} AS ${q("reached")}
      INNER JOIN ${edges} AS ${q("edges")}
        ON ${q("reached")}.${q("__node_key")} =
          ${q("edges")}.${q("__from_key")}
      INNER JOIN recurring.${labels} AS ${q("best")}
        ON ${q("edges")}.${q("__to_key")} =
          ${q("best")}.${q("__node_key")}
      GROUP BY ${q("edges")}.${q("__to")},
        ${q("edges")}.${q("__to_key")}, ${q("best")}.${q("__root_key")}
      HAVING MIN(${q("reached")}.${q("__root_key")}) <
        ${q("best")}.${q("__root_key")}
    ), ${roots} AS (
      SELECT ${q("__root_key")},
        CAST(row_number() OVER (ORDER BY ${q("__root_key")}) - 1 AS BIGINT)
          AS ${q("componentId")}
      FROM (SELECT DISTINCT ${q("__root_key")} FROM ${labels})
        AS ${q("distinct_roots")}
    )
    SELECT ${q("labels")}.${q("node")}, ${q("roots")}.${q("componentId")}
    FROM ${labels} AS ${q("labels")}
    INNER JOIN ${roots} AS ${q("roots")}
      ON ${q("labels")}.${q("__root_key")} =
        ${q("roots")}.${q("__root_key")}
    ORDER BY ${q("labels")}.${q("__node_key")}`;
  }

  const reachable = relations.graph_reachable;
  const members = relations.graph_component_members;
  return `WITH RECURSIVE ${common}, ${reachable}(
      ${q("__start_key")}, ${q("__node_key")}
    ) AS (
      SELECT ${q("__key")}, ${q("__key")} FROM ${nodes}
      UNION
      SELECT ${q("reached")}.${q("__start_key")},
        ${q("edges")}.${q("__to_key")}
      FROM ${reachable} AS ${q("reached")}
      INNER JOIN ${edges} AS ${q("edges")}
        ON ${q("reached")}.${q("__node_key")} =
          ${q("edges")}.${q("__from_key")}
    ), ${members} AS (
      SELECT ${q("nodes")}.${q("node")}, ${q("nodes")}.${q("__key")},
        MIN(${q("forward")}.${q("__start_key")}) AS ${q("__root_key")}
      FROM ${nodes} AS ${q("nodes")}
      INNER JOIN ${reachable} AS ${q("forward")}
        ON ${q("nodes")}.${q("__key")} =
          ${q("forward")}.${q("__node_key")}
      INNER JOIN ${reachable} AS ${q("reverse")}
        ON ${q("forward")}.${q("__start_key")} =
          ${q("reverse")}.${q("__node_key")}
        AND ${q("nodes")}.${q("__key")} =
          ${q("reverse")}.${q("__start_key")}
      GROUP BY ${q("nodes")}.${q("node")}, ${q("nodes")}.${q("__key")}
    ), ${roots} AS (
      SELECT ${q("__root_key")},
        CAST(row_number() OVER (ORDER BY ${q("__root_key")}) - 1 AS BIGINT)
          AS ${q("componentId")}
      FROM (SELECT DISTINCT ${q("__root_key")} FROM ${members})
        AS ${q("distinct_roots")}
    )
    SELECT ${q("members")}.${q("node")}, ${q("roots")}.${q("componentId")}
    FROM ${members} AS ${q("members")}
    INNER JOIN ${roots} AS ${q("roots")}
      ON ${q("members")}.${q("__root_key")} =
        ${q("roots")}.${q("__root_key")}
    ORDER BY ${q("members")}.${q("__key")}`;
}
