import type SimpleTable from "../class/SimpleTable.ts";
import getGraphEdgeIdColumn from "../helpers/getGraphEdgeIdColumn.ts";
import getGraphEndpointColumns from "../helpers/getGraphEndpointColumns.ts";
import getGraphWeightColumn from "../helpers/getGraphWeightColumn.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import { graphRouteResultSelect } from "../helpers/prepareGraphRoute.ts";
import {
  type GraphDirection,
  prepareGraphSql,
} from "../helpers/prepareGraphTraversal.ts";
import queueGraphResult from "../helpers/queueGraphResult.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

type FindCyclesOptions = {
  outputTable?: string | boolean;
  weight?: string;
};

export default function findCycles(
  simpleTable: SimpleTable,
  source: string,
  target: string,
  edgeId: string,
  direction: GraphDirection,
  options: FindCyclesOptions = {},
): SimpleTable {
  if (typeof source !== "string") {
    throw new TypeError("findCycles() source must be a string.");
  }
  if (typeof target !== "string") {
    throw new TypeError("findCycles() target must be a string.");
  }
  if (typeof edgeId !== "string") {
    throw new TypeError("findCycles() edgeId must be a string.");
  }
  if (
    direction !== "outgoing" && direction !== "incoming" &&
    direction !== "both"
  ) {
    throw new TypeError(
      'findCycles() direction must be "outgoing", "incoming", or "both".',
    );
  }
  if (
    options === null || typeof options !== "object" || Array.isArray(options)
  ) {
    throw new TypeError("findCycles() options must be an object.");
  }
  if (options.weight !== undefined && typeof options.weight !== "string") {
    throw new TypeError("findCycles() options.weight must be a string.");
  }
  if (
    options.outputTable !== undefined &&
    typeof options.outputTable !== "string" &&
    typeof options.outputTable !== "boolean"
  ) {
    throw new TypeError(
      "findCycles() options.outputTable must be a string or boolean.",
    );
  }

  options = structuredClone(options);
  const parameters = { source, target, edgeId, direction, options };

  return queueGraphResult(simpleTable, {
    method: "findCycles()",
    parameters,
    outputTable: options.outputTable,
    values: (schema) => {
      validateFindCyclesInputs(
        schema,
        source,
        target,
        edgeId,
        options.weight,
      );
      return [];
    },
    buildSelect: (input, schema) =>
      findCyclesSelect(
        input,
        schema,
        source,
        target,
        edgeId,
        direction,
        options.weight,
      ),
    outputSchema: (schema) => {
      const validated = validateFindCyclesInputs(
        schema,
        source,
        target,
        edgeId,
        options.weight,
      );
      return {
        pathId: "BIGINT",
        step: "BIGINT",
        edgeId: validated.edgeIdType,
        source: validated.nodeIdType,
        target: validated.nodeIdType,
        weight: validated.distanceType,
        distance: validated.distanceType,
      };
    },
  });
}

function validateFindCyclesInputs(
  schema: TableSchema,
  source: string,
  target: string,
  edgeId: string,
  weight: string | undefined,
) {
  const endpoints = getGraphEndpointColumns(
    schema,
    source,
    target,
    "findCycles()",
  );
  const edgeIdColumn = getGraphEdgeIdColumn(schema, edgeId, "findCycles()");
  const weightColumn = weight === undefined
    ? undefined
    : getGraphWeightColumn(schema, weight, "findCycles()");
  return {
    distanceType: weightColumn?.distanceType ?? "BIGINT",
    edgeIdType: edgeIdColumn.idType,
    nodeIdType: endpoints.idType,
  };
}

function findCyclesSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  edgeId: string,
  direction: GraphDirection,
  weight: string | undefined,
): string {
  const prepared = prepareGraphSql(
    input,
    schema,
    source,
    target,
    "findCycles()",
  );
  const edgeIdColumn = getGraphEdgeIdColumn(schema, edgeId, "findCycles()");
  const weightColumn = weight === undefined
    ? undefined
    : getGraphWeightColumn(schema, weight, "findCycles()");
  const distanceType = weightColumn?.distanceType ?? "BIGINT";
  const q = quoteIdentifier;
  const edgeIdReference = `${q("edges")}.${q(edgeIdColumn.column)}`;
  const typedEdgeId = `CAST(${edgeIdReference} AS ${edgeIdColumn.idType})`;
  const edgeKey = edgeIdColumn.family === "string"
    ? `ENCODE(${typedEdgeId})`
    : typedEdgeId;
  const edgeWeight = weightColumn === undefined
    ? `CAST(1 AS ${distanceType})`
    : `CAST(${q("edges")}.${q(weightColumn.column)} AS ${distanceType})`;
  const stepType = `STRUCT(${q("edgeId")} ${edgeIdColumn.idType}, ${
    q("source")
  } ${prepared.endpoints.idType}, ${
    q("target")
  } ${prepared.endpoints.idType}, ${q("weight")} ${distanceType}, ${
    q("distance")
  } ${distanceType})`;

  const relations = prepared.relationNames([
    "graph_edges",
    "graph_cycle_walks",
    "graph_complete_cycles",
    "graph_ranked_cycles",
  ]);
  const edgesRelation = relations.graph_edges;
  const walksRelation = relations.graph_cycle_walks;
  const completeRelation = relations.graph_complete_cycles;
  const rankedRelation = relations.graph_ranked_cycles;
  const edgeFrom = `${q("edges")}.${q("__from")}`;
  const edgeTo = `${q("edges")}.${q("__to")}`;
  const edgeFromKey = `${q("edges")}.${q("__from_key")}`;
  const edgeToKey = `${q("edges")}.${q("__to_key")}`;
  const edgeIdentity = `${q("edges")}.${q("__edge_id")}`;
  const edgeIdentityKey = `${q("edges")}.${q("__edge_key")}`;
  const edgeCost = `${q("edges")}.${q("__weight")}`;
  const walkDistance = `${q("walks")}.${q("distance")}`;
  const candidateDistance =
    `CAST(${walkDistance} + ${edgeCost} AS ${distanceType})`;

  return `WITH RECURSIVE ${edgesRelation} AS (
      ${
    prepared.edges(direction, [
      `${typedEdgeId} AS ${q("__edge_id")}`,
      `${edgeKey} AS ${q("__edge_key")}`,
      `${edgeWeight} AS ${q("__weight")}`,
    ])
  }
    ), ${walksRelation}(
      ${q("start")}, ${q("__start_key")}, ${q("node")},
      ${q("__node_key")}, ${q("__visited")}, ${q("__edge_keys")},
      ${q("steps")}, ${q("distance")}, ${q("closed")}
    ) AS (
      SELECT ${edgeFrom}, ${edgeFromKey}, ${edgeTo}, ${edgeToKey},
        CASE WHEN ${edgeFromKey} = ${edgeToKey}
          THEN [${edgeFromKey}]
          ELSE [${edgeFromKey}, ${edgeToKey}]
        END,
        [${edgeIdentityKey}],
        [struct_pack(
          ${q("edgeId")} := ${edgeIdentity},
          ${q("source")} := ${edgeFrom},
          ${q("target")} := ${edgeTo},
          ${q("weight")} := ${edgeCost},
          ${q("distance")} := ${edgeCost}
        )]::${stepType}[],
        ${edgeCost}, ${edgeFromKey} = ${edgeToKey}
      FROM ${edgesRelation} AS ${q("edges")}
      WHERE ${edgeToKey} >= ${edgeFromKey}
      UNION ALL
      SELECT ${q("walks")}.${q("start")},
        ${q("walks")}.${q("__start_key")}, ${edgeTo}, ${edgeToKey},
        list_append(${q("walks")}.${q("__visited")}, ${edgeToKey}),
        list_append(${q("walks")}.${q("__edge_keys")}, ${edgeIdentityKey}),
        list_append(${q("walks")}.${q("steps")}, struct_pack(
          ${q("edgeId")} := ${edgeIdentity},
          ${q("source")} := ${edgeFrom},
          ${q("target")} := ${edgeTo},
          ${q("weight")} := ${edgeCost},
          ${q("distance")} := ${candidateDistance}
        )), ${candidateDistance},
        ${edgeToKey} = ${q("walks")}.${q("__start_key")}
      FROM ${walksRelation} AS ${q("walks")}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${q("walks")}.${q("__node_key")} = ${edgeFromKey}
      WHERE NOT ${q("walks")}.${q("closed")}
        AND NOT list_contains(
          ${q("walks")}.${q("__edge_keys")}, ${edgeIdentityKey}
        )
        AND (
          ${edgeToKey} = ${q("walks")}.${q("__start_key")}
          OR (
            ${edgeToKey} >= ${q("walks")}.${q("__start_key")}
            AND NOT list_contains(
              ${q("walks")}.${q("__visited")}, ${edgeToKey}
            )
          )
        )
    ), ${completeRelation} AS (
      SELECT DISTINCT ${q("__edge_keys")}, ${q("steps")}
      FROM ${walksRelation}
      WHERE ${q("closed")}${
    direction === "both"
      ? `
        AND ${q("__edge_keys")} <= list_reverse(${q("__edge_keys")})`
      : ""
  }
    ), ${rankedRelation} AS (
      SELECT CAST(row_number() OVER (ORDER BY ${q("__edge_keys")}) - 1
          AS BIGINT) AS ${q("pathId")},
        ${q("steps")}
      FROM ${completeRelation}
    )
    ${graphRouteResultSelect(rankedRelation)}`;
}
