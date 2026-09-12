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
  source: string,
  target: string,
  options: TopologicalSortOptions = {},
): SimpleTable {
  if (typeof source !== "string") {
    throw new TypeError("topologicalSort() source must be a string.");
  }
  if (typeof target !== "string") {
    throw new TypeError("topologicalSort() target must be a string.");
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
  const parameters = { source, target, options };

  const result = queueGraphResult(simpleTable, {
    method: "topologicalSort()",
    parameters,
    outputTable: options.outputTable,
    values: (schema) => {
      validateEndpoints(schema, source, target);
      return [];
    },
    buildSelect: (input, schema) =>
      topologicalSortSelect(input, schema, source, target),
    outputSchema: (schema) => ({
      node: validateEndpoints(schema, source, target).idType,
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
  ]);
  const edges = relations.graph_edges;
  const nodes = relations.graph_nodes;
  const ordering = relations.graph_topological_order;
  const result = relations.graph_topological_result;
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
    ), ${ordering}(
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
    )
    SELECT unnest(${q("__nodes")}) AS ${q("node")},
      CAST(generate_subscripts(${q("__nodes")}, 1) AS BIGINT) AS ${q("order")}
    FROM ${result}
    ORDER BY ${q("order")}`;
}
