import buildChronologicalGraphComponentsSql from "../helpers/buildChronologicalGraphComponentsSql.ts";
import buildWeakGraphComponentsSql from "../helpers/buildWeakGraphComponentsSql.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import getGraphEndpointColumns from "../helpers/getGraphEndpointColumns.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import prepareGraphTemporalSql, {
  type GraphTemporalOptions,
  type PreparedGraphTemporalOptions,
  prepareGraphTemporalOptions,
} from "../helpers/prepareGraphTemporalSql.ts";
import { prepareGraphSql } from "../helpers/prepareGraphTraversal.ts";
import queueGraphResult from "../helpers/queueGraphResult.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import validateGraphTemporalEvents from "../helpers/validateGraphTemporalEvents.ts";

type ConnectedComponentsOptions = GraphTemporalOptions & {
  mode?: "weak" | "strong";
  outputTable?: string | boolean;
};

export default function connectedComponents(
  simpleTable: SimpleTable,
  sourceColumn: string,
  targetColumn: string,
  options: ConnectedComponentsOptions = {},
): SimpleTable {
  if (typeof sourceColumn !== "string") {
    throw new TypeError("connectedComponents() sourceColumn must be a string.");
  }
  if (typeof targetColumn !== "string") {
    throw new TypeError("connectedComponents() targetColumn must be a string.");
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

  const temporalOptions = prepareGraphTemporalOptions(
    options,
    undefined,
    "connectedComponents()",
  );
  if (temporalOptions !== undefined && options.mode !== "strong") {
    throw new TypeError(
      'connectedComponents() chronological options require options.mode to be explicitly set to "strong".',
    );
  }
  options = structuredClone(options);
  const mode = options.mode ?? "weak";
  const parameters = { sourceColumn, targetColumn, options };

  return queueGraphResult(simpleTable, {
    method: "connectedComponents()",
    parameters,
    outputTable: options.outputTable,
    preflight: temporalOptions === undefined
      ? undefined
      : (input) =>
        validateGraphTemporalEvents(
          input,
          temporalOptions,
          "connectedComponents()",
          parameters,
        ),
    values: (schema) => {
      const temporal = validateInputs(
        schema,
        sourceColumn,
        targetColumn,
        temporalOptions,
      ).temporal;
      return temporal === undefined ? [] : [temporal.gapParameter];
    },
    buildSelect: (input, schema) =>
      connectedComponentsSelect(
        input,
        schema,
        sourceColumn,
        targetColumn,
        mode,
        temporalOptions,
      ),
    outputSchema: (schema) => ({
      componentId: "BIGINT",
      node: validateInputs(
        schema,
        sourceColumn,
        targetColumn,
        temporalOptions,
      ).endpoints.idType,
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

function validateInputs(
  schema: TableSchema,
  source: string,
  target: string,
  temporalOptions: PreparedGraphTemporalOptions | undefined,
) {
  const endpoints = validateEndpoints(schema, source, target);
  const temporal = temporalOptions === undefined
    ? undefined
    : prepareGraphTemporalSql(schema, temporalOptions, "connectedComponents()");
  return { endpoints, temporal };
}

function connectedComponentsSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  mode: "weak" | "strong",
  temporalOptions: PreparedGraphTemporalOptions | undefined,
): string {
  const prepared = prepareGraphSql(
    input,
    schema,
    source,
    target,
    "connectedComponents()",
  );
  if (temporalOptions !== undefined) {
    return buildChronologicalGraphComponentsSql(
      prepared,
      prepareGraphTemporalSql(
        schema,
        temporalOptions,
        "connectedComponents()",
      ),
    );
  }
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
    return `WITH RECURSIVE ${common}, ${
      buildWeakGraphComponentsSql(edges, nodes, labels, roots)
    }
    SELECT ${q("roots")}.${q("componentId")}, ${q("labels")}.${q("node")}
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
    SELECT ${q("roots")}.${q("componentId")}, ${q("members")}.${q("node")}
    FROM ${members} AS ${q("members")}
    INNER JOIN ${roots} AS ${q("roots")}
      ON ${q("members")}.${q("__root_key")} =
        ${q("roots")}.${q("__root_key")}
    ORDER BY ${q("members")}.${q("__key")}`;
}
