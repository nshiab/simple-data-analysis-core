import type SimpleTable from "../class/SimpleTable.ts";
import getGraphEdgeIdColumn from "../helpers/getGraphEdgeIdColumn.ts";
import getGraphWeightColumn from "../helpers/getGraphWeightColumn.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import graphRouteResultSchema from "../helpers/graphRouteResultSchema.ts";
import graphRouteResultSelect from "../helpers/graphRouteResultSelect.ts";
import prepareGraphTemporalSql, {
  type GraphTemporalOptions,
  type PreparedGraphTemporalOptions,
  prepareGraphTemporalOptions,
} from "../helpers/prepareGraphTemporalSql.ts";
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
import validateGraphTemporalEvents from "../helpers/validateGraphTemporalEvents.ts";
import validateGraphRouteResultSchema from "../helpers/validateGraphRouteResultSchema.ts";

type FindCyclesOptions = GraphTemporalOptions & {
  direction?: GraphDirection;
  outputTable?: string | boolean;
  weight?: string;
};

export default function findCycles(
  simpleTable: SimpleTable,
  sourceColumn: string,
  targetColumn: string,
  edgeId: string,
  startNodes: GraphId | GraphId[],
  options: FindCyclesOptions = {},
): SimpleTable {
  if (typeof sourceColumn !== "string") {
    throw new TypeError("findCycles() sourceColumn must be a string.");
  }
  if (typeof targetColumn !== "string") {
    throw new TypeError("findCycles() targetColumn must be a string.");
  }
  if (typeof edgeId !== "string") {
    throw new TypeError("findCycles() edgeId must be a string.");
  }
  const preparedStarts = prepareGraphStarts(
    startNodes,
    "findCycles()",
    "startNodes",
  );
  if (
    options === null || typeof options !== "object" || Array.isArray(options)
  ) {
    throw new TypeError("findCycles() options must be an object.");
  }
  if (
    options.direction !== undefined &&
    !["outgoing", "incoming", "both"].includes(options.direction)
  ) {
    throw new TypeError(
      'findCycles() options.direction must be "outgoing", "incoming", or "both".',
    );
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

  const direction = options.direction ?? "outgoing";
  const temporalOptions = prepareGraphTemporalOptions(
    options,
    direction,
    "findCycles()",
  );
  options = structuredClone(options);
  const parameters = {
    sourceColumn,
    targetColumn,
    edgeId,
    startNodes: structuredClone(startNodes),
    options,
  };

  return queueGraphResult(simpleTable, {
    method: "findCycles()",
    parameters,
    outputTable: options.outputTable,
    preflight: temporalOptions === undefined
      ? undefined
      : (input) =>
        validateGraphTemporalEvents(
          input,
          temporalOptions,
          "findCycles()",
          parameters,
        ),
    values: (schema) => {
      validateFindCyclesInputs(
        schema,
        sourceColumn,
        targetColumn,
        edgeId,
        preparedStarts,
        options.weight,
      );
      const temporal = temporalOptions === undefined
        ? undefined
        : prepareGraphTemporalSql(schema, temporalOptions, "findCycles()");
      return temporal === undefined
        ? preparedStarts.values
        : [temporal.gapParameter, ...preparedStarts.values];
    },
    buildSelect: (input, schema) =>
      findCyclesSelect(
        input,
        schema,
        sourceColumn,
        targetColumn,
        edgeId,
        preparedStarts,
        direction,
        options.weight,
        temporalOptions,
      ),
    outputSchema: (schema) => {
      const validated = validateFindCyclesInputs(
        schema,
        sourceColumn,
        targetColumn,
        edgeId,
        preparedStarts,
        options.weight,
      );
      if (temporalOptions !== undefined) {
        prepareGraphTemporalSql(schema, temporalOptions, "findCycles()");
      }
      return graphRouteResultSchema(
        schema,
        validated.distanceType,
        "findCycles()",
      );
    },
  });
}

function validateFindCyclesInputs(
  schema: TableSchema,
  source: string,
  target: string,
  edgeId: string,
  starts: PreparedGraphStarts,
  weight: string | undefined,
) {
  const endpoints = validateGraphStarts(
    schema,
    source,
    target,
    starts,
    "findCycles()",
    "startNodes",
  );
  const edgeIdColumn = getGraphEdgeIdColumn(schema, edgeId, "findCycles()");
  const weightColumn = weight === undefined
    ? undefined
    : getGraphWeightColumn(schema, weight, "findCycles()");
  validateGraphRouteResultSchema(schema, "findCycles()");
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
  starts: PreparedGraphStarts,
  direction: GraphDirection,
  weight: string | undefined,
  temporalOptions: PreparedGraphTemporalOptions | undefined,
): string {
  const prepared = prepareGraphTraversal(
    input,
    schema,
    source,
    target,
    starts,
    "findCycles()",
    "startNodes",
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

  if (temporalOptions !== undefined) {
    const temporal = prepareGraphTemporalSql(
      schema,
      temporalOptions,
      "findCycles()",
    );
    return temporalFindCyclesSelect(
      prepared,
      direction as Exclude<GraphDirection, "both">,
      temporal,
      typedEdgeId,
      edgeKey,
      edgeWeight,
      distanceType,
      stepType,
      input,
      edgeIdColumn,
    );
  }

  const relations = prepared.relationNames([
    "graph_start_values",
    "graph_starts",
    "graph_edges",
    "graph_cycle_walks",
    "graph_complete_cycles",
    "graph_ranked_cycles",
  ]);
  const startValuesRelation = relations.graph_start_values;
  const startsRelation = relations.graph_starts;
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

  return `WITH RECURSIVE ${startValuesRelation}(${q("start")}) AS (
      VALUES ${prepared.startValues}
    ), ${startsRelation} AS (
      SELECT ${q("start")},
        ${prepared.key(q("start"))} AS ${q("__start_key")}
      FROM ${startValuesRelation}
    ), ${edgesRelation} AS (
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
      SELECT ${q("starts")}.${q("start")},
        ${q("starts")}.${q("__start_key")}, ${edgeTo}, ${edgeToKey},
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
      INNER JOIN ${startsRelation} AS ${q("starts")}
        ON ${q("starts")}.${q("__start_key")} = ${edgeFromKey}
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
          OR NOT list_contains(
            ${q("walks")}.${q("__visited")}, ${edgeToKey}
          )
        )
    ), ${completeRelation} AS (
      SELECT DISTINCT ${q("__start_key")}, ${q("__edge_keys")},
        ${q("steps")}
      FROM ${walksRelation}
      WHERE ${q("closed")}${
    direction === "both"
      ? `
        AND ${q("__edge_keys")} <= list_reverse(${q("__edge_keys")})`
      : ""
  }
    ), ${rankedRelation} AS (
      SELECT CAST(row_number() OVER (
          ORDER BY ${q("__start_key")}, ${q("__edge_keys")}) - 1
          AS BIGINT) AS ${q("pathId")},
        ${q("steps")}
      FROM ${completeRelation}
    )
    ${
    graphRouteResultSelect(
      rankedRelation,
      input,
      edgeIdColumn,
    )
  }`;
}

function temporalFindCyclesSelect(
  prepared: ReturnType<typeof prepareGraphTraversal>,
  direction: Exclude<GraphDirection, "both">,
  temporal: ReturnType<typeof prepareGraphTemporalSql>,
  typedEdgeId: string,
  edgeKey: string,
  edgeWeight: string,
  distanceType: string,
  stepType: string,
  input: string,
  edgeIdColumn: ReturnType<typeof getGraphEdgeIdColumn>,
): string {
  const q = quoteIdentifier;
  const relations = prepared.relationNames([
    "graph_start_values",
    "graph_starts",
    "graph_temporal_settings",
    "graph_event_rows",
    "graph_edges",
    "graph_cycle_walks",
    "graph_complete_cycles",
    "graph_ranked_cycles",
  ]);
  const startValuesRelation = relations.graph_start_values;
  const startsRelation = relations.graph_starts;
  const settingsRelation = relations.graph_temporal_settings;
  const eventRowsRelation = relations.graph_event_rows;
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
  const gap = `${q("settings")}.${q("__gap")}`;
  const step = (distance: string) =>
    `struct_pack(
          ${q("edgeId")} := ${edgeIdentity},
          ${q("source")} := ${edgeFrom},
          ${q("target")} := ${edgeTo},
          ${q("weight")} := ${edgeCost},
          ${q("distance")} := ${distance}
        )`;

  return `WITH RECURSIVE ${settingsRelation} AS MATERIALIZED (
      SELECT CAST(? AS HUGEINT) AS ${q("__gap")}
    ), ${startValuesRelation}(${q("start")}) AS (
      VALUES ${prepared.startValues}
    ), ${startsRelation} AS (
      SELECT ${q("start")},
        ${prepared.key(q("start"))} AS ${q("__start_key")}
      FROM ${startValuesRelation}
    ), ${eventRowsRelation} AS MATERIALIZED (
      ${
    prepared.edges(direction, [
      `${typedEdgeId} AS ${q("__edge_id")}`,
      `${edgeKey} AS ${q("__edge_key")}`,
      `${edgeWeight} AS ${q("__weight")}`,
      ...temporal.eventSelections("edges"),
    ])
  }
    ), ${edgesRelation} AS MATERIALIZED (
      SELECT *
      FROM ${eventRowsRelation} AS ${q("events")}
      WHERE ${temporal.eventValidity("events")}
    ), ${walksRelation}(
      ${q("start")}, ${q("__start_key")}, ${q("node")},
      ${q("__node_key")}, ${q("__visited")}, ${q("__event_ids")},
      ${q("__edge_keys")}, ${q("steps")}, ${q("distance")},
      ${q("closed")}, ${q("__event_id")}, ${q("__event_start")},
      ${q("__event_end")}
    ) AS (
      SELECT ${q("starts")}.${q("start")},
        ${q("starts")}.${q("__start_key")}, ${edgeTo}, ${edgeToKey},
        CASE WHEN ${edgeFromKey} = ${edgeToKey}
          THEN [${edgeFromKey}]
          ELSE [${edgeFromKey}, ${edgeToKey}]
        END,
        [${q("edges")}.${q("__event_id")}], [${edgeIdentityKey}],
        [${step(edgeCost)}]::${stepType}[], ${edgeCost},
        ${edgeFromKey} = ${edgeToKey},
        ${q("edges")}.${q("__event_id")},
        ${q("edges")}.${q("__event_start")},
        ${q("edges")}.${q("__event_end")}
      FROM ${edgesRelation} AS ${q("edges")}
      INNER JOIN ${startsRelation} AS ${q("starts")}
        ON ${q("starts")}.${q("__start_key")} = ${edgeFromKey}
      UNION ALL
      SELECT ${q("walks")}.${q("start")},
        ${q("walks")}.${q("__start_key")}, ${edgeTo}, ${edgeToKey},
        list_append(${q("walks")}.${q("__visited")}, ${edgeToKey}),
        list_append(${q("walks")}.${q("__event_ids")},
          ${q("edges")}.${q("__event_id")}),
        list_append(${q("walks")}.${q("__edge_keys")}, ${edgeIdentityKey}),
        list_append(${q("walks")}.${q("steps")}, ${step(candidateDistance)}),
        ${candidateDistance},
        ${edgeToKey} = ${q("walks")}.${q("__start_key")},
        ${q("edges")}.${q("__event_id")},
        ${q("edges")}.${q("__event_start")},
        ${q("edges")}.${q("__event_end")}
      FROM ${walksRelation} AS ${q("walks")}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${q("walks")}.${q("__node_key")} = ${edgeFromKey}
      CROSS JOIN ${settingsRelation} AS ${q("settings")}
      WHERE NOT ${q("walks")}.${q("closed")}
        AND NOT list_contains(${q("walks")}.${q("__event_ids")},
          ${q("edges")}.${q("__event_id")})
        AND (
          ${edgeToKey} = ${q("walks")}.${q("__start_key")}
          OR NOT list_contains(${q("walks")}.${q("__visited")}, ${edgeToKey})
        )
        AND ${temporal.transition("walks", "edges", direction, gap)}
    ), ${completeRelation} AS (
      SELECT DISTINCT ${q("__start_key")}, ${q("__edge_keys")},
        ${q("steps")}
      FROM ${walksRelation}
      WHERE ${q("closed")}
    ), ${rankedRelation} AS (
      SELECT CAST(row_number() OVER (
          ORDER BY ${q("__start_key")}, ${q("__edge_keys")}) - 1
          AS BIGINT) AS ${q("pathId")}, ${q("steps")}
      FROM ${completeRelation}
    )
    ${
    graphRouteResultSelect(
      rankedRelation,
      input,
      edgeIdColumn,
    )
  }`;
}
