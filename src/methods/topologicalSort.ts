import buildWeakGraphComponentsSql from "../helpers/buildWeakGraphComponentsSql.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import getGraphEndpointColumns from "../helpers/getGraphEndpointColumns.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import { prepareGraphSql } from "../helpers/prepareGraphTraversal.ts";
import queueGraphResult from "../helpers/queueGraphResult.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

type TopologicalSortOptions = {
  outputTable?: string | boolean;
};

export default function topologicalSort(
  simpleTable: SimpleTable,
  sourceColumn: string,
  targetColumn: string,
  options: TopologicalSortOptions = {},
): SimpleTable {
  if (typeof sourceColumn !== "string") {
    throw new TypeError("topologicalSort() sourceColumn must be a string.");
  }
  if (typeof targetColumn !== "string") {
    throw new TypeError("topologicalSort() targetColumn must be a string.");
  }
  if (
    options === null || typeof options !== "object" || Array.isArray(options)
  ) {
    throw new TypeError("topologicalSort() options must be an object.");
  }
  if (
    options.outputTable !== undefined &&
    typeof options.outputTable !== "string" &&
    typeof options.outputTable !== "boolean"
  ) {
    throw new TypeError(
      "topologicalSort() options.outputTable must be a string or boolean.",
    );
  }

  options = structuredClone(options);
  const parameters = { sourceColumn, targetColumn, options };

  const result = queueGraphResult(simpleTable, {
    method: "topologicalSort()",
    parameters,
    outputTable: options.outputTable,
    values: (schema) => {
      validateEndpoints(schema, sourceColumn, targetColumn);
      return [];
    },
    buildSelect: (input, schema) =>
      topologicalSortSelect(input, schema, sourceColumn, targetColumn),
    outputSchema: (schema) => ({
      node: validateEndpoints(schema, sourceColumn, targetColumn).idType,
      componentId: "BIGINT",
      order: "BIGINT",
    }),
  });
  // Materialize the sorting computation before downstream operations: DuckDB
  // can otherwise discard even its terminal cycle check for LIMIT 0 or FALSE.
  // This barrier adds no query or separate validation traversal, and upstream
  // preparation still fuses into the sorting statement.
  queueOp(result, {
    kind: "barrier",
    method: "topologicalSort()",
    parameters,
    execute: () => Promise.resolve(),
  });
  return result;
}

function validateEndpoints(
  schema: TableSchema,
  source: string,
  target: string,
) {
  return getGraphEndpointColumns(schema, source, target, "topologicalSort()");
}

function topologicalSortSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
): string {
  const prepared = prepareGraphSql(
    input,
    schema,
    source,
    target,
    "topologicalSort()",
  );
  const relations = prepared.relationNames([
    "graph_edges",
    "graph_nodes",
    "graph_topological_order",
    "graph_topological_result",
    "graph_component_edges",
    "graph_component_labels",
    "graph_component_roots",
    "graph_ordered_nodes",
  ]);
  const edges = relations.graph_edges;
  const nodes = relations.graph_nodes;
  const ordering = relations.graph_topological_order;
  const result = relations.graph_topological_result;
  const componentEdges = relations.graph_component_edges;
  const labels = relations.graph_component_labels;
  const roots = relations.graph_component_roots;
  const orderedNodes = relations.graph_ordered_nodes;
  const q = quoteIdentifier;

  return `WITH RECURSIVE ${edges} AS (
      ${prepared.edges("outgoing")}
    ), ${nodes} AS (
      SELECT ${q("__from")} AS ${q("node")},
        ${q("__from_key")} AS ${q("__key")}
      FROM ${edges}
      UNION
      SELECT ${q("__to")} AS ${q("node")},
        ${q("__to_key")} AS ${q("__key")}
      FROM ${edges}
    ), ${componentEdges} AS (
      SELECT * FROM ${edges}
      UNION ALL
      SELECT ${q("__to")}, ${q("__from")},
        ${q("__to_key")}, ${q("__from_key")}
      FROM ${edges}
    ), ${buildWeakGraphComponentsSql(componentEdges, nodes, labels, roots)},
    ${ordering}(
      ${q("node")}, ${q("__key")}, ${q("order")}, ${q("__ordered")}
    ) AS (
      SELECT ${q("eligible")}.${q("node")},
        ${q("eligible")}.${q("__key")}, CAST(1 AS BIGINT),
        list_value(${q("eligible")}.${q("__key")})
      FROM (
        SELECT ${q("candidate")}.${q("node")},
          ${q("candidate")}.${q("__key")}
        FROM ${nodes} AS ${q("candidate")}
        WHERE NOT EXISTS (
          SELECT 1 FROM ${edges} AS ${q("edge")}
          WHERE ${q("edge")}.${q("__to_key")} =
            ${q("candidate")}.${q("__key")}
        )
        ORDER BY ${q("candidate")}.${q("__key")}
        LIMIT 1
      ) AS ${q("eligible")}
      UNION ALL
      SELECT ${q("eligible")}.${q("node")},
        ${q("eligible")}.${q("__key")},
        ${q("ordered")}.${q("order")} + 1,
        list_append(
          ${q("ordered")}.${q("__ordered")},
          ${q("eligible")}.${q("__key")}
        )
      FROM ${ordering} AS ${q("ordered")}
      CROSS JOIN LATERAL (
        SELECT ${q("candidate")}.${q("node")},
          ${q("candidate")}.${q("__key")}
        FROM ${nodes} AS ${q("candidate")}
        WHERE NOT list_contains(
          ${q("ordered")}.${q("__ordered")},
          ${q("candidate")}.${q("__key")}
        )
          AND NOT EXISTS (
            SELECT 1 FROM ${edges} AS ${q("edge")}
            WHERE ${q("edge")}.${q("__to_key")} =
                ${q("candidate")}.${q("__key")}
              AND NOT list_contains(
                ${q("ordered")}.${q("__ordered")},
                ${q("edge")}.${q("__from_key")}
              )
          )
        ORDER BY ${q("candidate")}.${q("__key")}
        LIMIT 1
      ) AS ${q("eligible")}
    ), ${result} AS (
      SELECT CASE WHEN count(*) < (SELECT count(*) FROM ${nodes})
        THEN error(
          'topologicalSort() cannot order the graph because it contains a directed cycle.'
        )
        ELSE list(${q("node")} ORDER BY ${q("order")})
      END AS ${q("__nodes")}
      FROM ${ordering}
    ), ${orderedNodes} AS (
      SELECT unnest(${q("__nodes")}) AS ${q("node")},
        generate_subscripts(${q("__nodes")}, 1) AS ${q("__order")}
      FROM ${result}
    )
    SELECT ${q("ordered")}.${q("node")}, ${q("roots")}.${q("componentId")},
      row_number() OVER (
        PARTITION BY ${q("roots")}.${q("componentId")}
        ORDER BY ${q("ordered")}.${q("__order")}
      ) AS ${q("order")}
    FROM ${orderedNodes} AS ${q("ordered")}
    INNER JOIN ${labels} AS ${q("labels")}
      ON ${prepared.key(`${q("ordered")}.${q("node")}`)} =
        ${q("labels")}.${q("__node_key")}
    INNER JOIN ${roots} AS ${q("roots")}
      ON ${q("labels")}.${q("__root_key")} = ${q("roots")}.${q("__root_key")}
    ORDER BY ${q("componentId")}, ${q("order")}`;
}
