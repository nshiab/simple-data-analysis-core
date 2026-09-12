import type SimpleTable from "../class/SimpleTable.ts";
import getGraphEndpointColumns from "../helpers/getGraphEndpointColumns.ts";
import getGraphWeightColumn from "../helpers/getGraphWeightColumn.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import { prepareGraphSql } from "../helpers/prepareGraphTraversal.ts";
import queueGraphResult from "../helpers/queueGraphResult.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

type DegreeOptions = {
  count?: "edges" | "neighbors";
  weight?: string;
  outputTable?: string | boolean;
};

export default function degree(
  simpleTable: SimpleTable,
  source: string,
  target: string,
  options: DegreeOptions = {},
): SimpleTable {
  if (typeof source !== "string") {
    throw new TypeError("degree() source must be a string.");
  }
  if (typeof target !== "string") {
    throw new TypeError("degree() target must be a string.");
  }
  if (
    options === null || typeof options !== "object" || Array.isArray(options)
  ) {
    throw new TypeError("degree() options must be an object.");
  }
  if (
    options.count !== undefined &&
    !["edges", "neighbors"].includes(options.count)
  ) {
    throw new TypeError(
      'degree() options.count must be "edges" or "neighbors".',
    );
  }
  if (options.weight !== undefined && typeof options.weight !== "string") {
    throw new TypeError("degree() options.weight must be a string.");
  }
  if (
    options.outputTable !== undefined &&
    typeof options.outputTable !== "string" &&
    typeof options.outputTable !== "boolean"
  ) {
    throw new TypeError(
      "degree() options.outputTable must be a string or boolean.",
    );
  }
  if (options.weight !== undefined && options.count === "neighbors") {
    throw new TypeError(
      'degree() options.weight cannot be combined with count: "neighbors" because weighted sums operate on edges, not distinct neighbors.',
    );
  }

  options = structuredClone(options);
  const count = options.count ?? "edges";
  const weight = options.weight;
  const parameters = { source, target, options };

  return queueGraphResult(simpleTable, {
    method: "degree()",
    parameters,
    outputTable: options.outputTable,
    values: (schema) => {
      validateInputs(schema, source, target, weight);
      return [];
    },
    buildSelect: (input, schema) =>
      degreeSelect(input, schema, source, target, count, weight),
    outputSchema: (schema) => {
      const validated = validateInputs(schema, source, target, weight);
      return {
        node: validated.idType,
        incoming: validated.degreeType,
        outgoing: validated.degreeType,
      };
    },
  });
}

function validateInputs(
  schema: TableSchema,
  source: string,
  target: string,
  weight: string | undefined,
) {
  const endpoints = getGraphEndpointColumns(schema, source, target, "degree()");
  const degreeType = weight === undefined
    ? "BIGINT"
    : sumType(getGraphWeightColumn(schema, weight, "degree()").distanceType);
  return { idType: endpoints.idType, degreeType };
}

function sumType(type: string): string {
  // DuckDB SUM widens FLOAT to DOUBLE; retain that aggregate precision.
  return type === "FLOAT" ? "DOUBLE" : type;
}

function degreeSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  count: "edges" | "neighbors",
  weight: string | undefined,
): string {
  const prepared = prepareGraphSql(input, schema, source, target, "degree()");
  const weightColumn = weight === undefined
    ? undefined
    : getGraphWeightColumn(schema, weight, "degree()");
  const degreeType = sumType(weightColumn?.distanceType ?? "BIGINT");
  const relations = prepared.relationNames([
    "graph_edges",
    "graph_node_candidates",
    "graph_nodes",
    "graph_incoming",
    "graph_outgoing",
  ]);
  const edges = relations.graph_edges;
  const candidates = relations.graph_node_candidates;
  const nodes = relations.graph_nodes;
  const incoming = relations.graph_incoming;
  const outgoing = relations.graph_outgoing;
  const q = quoteIdentifier;
  const edgeWeight = weightColumn === undefined
    ? undefined
    : `CAST(${q("edges")}.${q(weightColumn.column)} AS ${degreeType}) AS ${
      q("__weight")
    }`;
  const aggregate = (
    direction: "incoming" | "outgoing",
  ) => {
    const neighborKey = direction === "incoming" ? "__from_key" : "__to_key";
    if (edgeWeight !== undefined) {
      return `CAST(SUM(${q("__weight")}) AS ${degreeType})`;
    }
    return count === "neighbors"
      ? `COUNT(DISTINCT ${q(neighborKey)})`
      : "COUNT(*)";
  };
  const zero = `CAST(0 AS ${degreeType})`;

  return `WITH ${edges} AS (
      ${
    prepared.edges("outgoing", edgeWeight === undefined ? [] : [edgeWeight])
  }
    ), ${candidates} AS (
      SELECT ${q("__from")} AS ${q("node")},
        ${q("__from_key")} AS ${q("__key")}
      FROM ${edges}
      UNION ALL
      SELECT ${q("__to")} AS ${q("node")},
        ${q("__to_key")} AS ${q("__key")}
      FROM ${edges}
    ), ${nodes} AS (
      SELECT MIN(${q("node")}) AS ${q("node")}, ${q("__key")}
      FROM ${candidates}
      GROUP BY ${q("__key")}
    ), ${incoming} AS (
      SELECT ${q("__to_key")} AS ${q("__key")},
        ${aggregate("incoming")} AS ${q("incoming")}
      FROM ${edges}
      GROUP BY ${q("__to_key")}
    ), ${outgoing} AS (
      SELECT ${q("__from_key")} AS ${q("__key")},
        ${aggregate("outgoing")} AS ${q("outgoing")}
      FROM ${edges}
      GROUP BY ${q("__from_key")}
    )
    SELECT ${q("nodes")}.${q("node")},
      COALESCE(${q("incoming")}.${q("incoming")}, ${zero}) AS ${q("incoming")},
      COALESCE(${q("outgoing")}.${q("outgoing")}, ${zero}) AS ${q("outgoing")}
    FROM ${nodes} AS ${q("nodes")}
    LEFT JOIN ${incoming} AS ${q("incoming")}
      ON ${q("nodes")}.${q("__key")} = ${q("incoming")}.${q("__key")}
    LEFT JOIN ${outgoing} AS ${q("outgoing")}
      ON ${q("nodes")}.${q("__key")} = ${q("outgoing")}.${q("__key")}
    ORDER BY ${q("nodes")}.${q("__key")}`;
}
