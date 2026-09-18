import type SimpleTable from "../class/SimpleTable.ts";
import {
  type PreparedGraphRouteEndpoints,
  prepareGraphRouteEndpoints,
  prepareGraphRouteSql,
  validateGraphRouteInputs,
} from "../helpers/prepareGraphRouteSql.ts";
import graphRouteResultSchema from "../helpers/graphRouteResultSchema.ts";
import graphRouteResultSelect from "../helpers/graphRouteResultSelect.ts";
import type { GraphId } from "../helpers/prepareGraphStarts.ts";
import prepareGraphTemporalSql, {
  type GraphTemporalOptions,
  type PreparedGraphTemporalOptions,
  prepareGraphTemporalOptions,
} from "../helpers/prepareGraphTemporalSql.ts";
import type { GraphDirection } from "../helpers/prepareGraphTraversal.ts";
import queueGraphResult from "../helpers/queueGraphResult.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import validateGraphTemporalEvents from "../helpers/validateGraphTemporalEvents.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";

type PathsOptions = GraphTemporalOptions & {
  direction?: GraphDirection;
  outputTable?: string | boolean;
  weight?: string;
};

export default function paths(
  simpleTable: SimpleTable,
  sourceColumn: string,
  targetColumn: string,
  edgeId: string,
  start: GraphId,
  end: GraphId,
  options: PathsOptions = {},
): SimpleTable {
  if (typeof sourceColumn !== "string") {
    throw new TypeError("paths() sourceColumn must be a string.");
  }
  if (typeof targetColumn !== "string") {
    throw new TypeError("paths() targetColumn must be a string.");
  }
  if (typeof edgeId !== "string") {
    throw new TypeError("paths() edgeId must be a string.");
  }
  if (
    options === null || typeof options !== "object" || Array.isArray(options)
  ) {
    throw new TypeError("paths() options must be an object.");
  }
  if (
    options.direction !== undefined &&
    !["outgoing", "incoming", "both"].includes(options.direction)
  ) {
    throw new TypeError(
      'paths() options.direction must be "outgoing", "incoming", or "both".',
    );
  }
  if (options.weight !== undefined && typeof options.weight !== "string") {
    throw new TypeError("paths() options.weight must be a string.");
  }
  if (
    options.outputTable !== undefined &&
    typeof options.outputTable !== "string" &&
    typeof options.outputTable !== "boolean"
  ) {
    throw new TypeError(
      "paths() options.outputTable must be a string or boolean.",
    );
  }

  const endpoints = prepareGraphRouteEndpoints(start, end, "paths()");
  const direction = options.direction ?? "outgoing";
  const temporalOptions = prepareGraphTemporalOptions(
    options,
    direction,
    "paths()",
  );
  options = structuredClone(options);
  const parameters = {
    sourceColumn,
    targetColumn,
    edgeId,
    start,
    end,
    options,
  };

  return queueGraphResult(simpleTable, {
    method: "paths()",
    parameters,
    outputTable: options.outputTable,
    preflight: temporalOptions === undefined
      ? undefined
      : (input) =>
        validateGraphTemporalEvents(
          input,
          temporalOptions,
          "paths()",
          parameters,
        ),
    values: (schema) => {
      validateGraphRouteInputs(
        schema,
        sourceColumn,
        targetColumn,
        edgeId,
        endpoints,
        options.weight,
        "paths()",
      );
      const temporal = temporalOptions === undefined
        ? undefined
        : prepareGraphTemporalSql(schema, temporalOptions, "paths()");
      return temporal === undefined
        ? endpoints.values.values
        : [temporal.gapParameter, ...endpoints.values.values];
    },
    buildSelect: (input, schema) =>
      pathsSelect(
        input,
        schema,
        sourceColumn,
        targetColumn,
        edgeId,
        endpoints,
        direction,
        options.weight,
        temporalOptions,
      ),
    outputSchema: (schema) => {
      const validated = validateGraphRouteInputs(
        schema,
        sourceColumn,
        targetColumn,
        edgeId,
        endpoints,
        options.weight,
        "paths()",
      );
      if (temporalOptions !== undefined) {
        prepareGraphTemporalSql(schema, temporalOptions, "paths()");
      }
      return graphRouteResultSchema(schema, validated.distanceType, "paths()");
    },
  });
}

function pathsSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  edgeId: string,
  routeEndpoints: PreparedGraphRouteEndpoints,
  direction: GraphDirection,
  weight: string | undefined,
  temporalOptions: PreparedGraphTemporalOptions | undefined,
): string {
  const route = prepareGraphRouteSql(
    input,
    schema,
    source,
    target,
    edgeId,
    routeEndpoints,
    weight,
    "paths()",
  );
  const prepared = route.traversal;
  if (temporalOptions !== undefined) {
    const temporal = prepareGraphTemporalSql(
      schema,
      temporalOptions,
      "paths()",
    );
    return temporalPathsSelect(
      route,
      direction as Exclude<GraphDirection, "both">,
      temporal,
    );
  }
  const distanceType = route.distanceType;
  const q = quoteIdentifier;

  const relations = prepared.relationNames([
    "graph_route_endpoints",
    "graph_edges",
    "graph_nodes",
    "graph_to_end",
    "graph_routes",
    "graph_complete_routes",
    "graph_ranked_routes",
  ]);
  const endpointRelation = relations.graph_route_endpoints;
  const edgesRelation = relations.graph_edges;
  const nodesRelation = relations.graph_nodes;
  const toEndRelation = relations.graph_to_end;
  const routesRelation = relations.graph_routes;
  const completeRelation = relations.graph_complete_routes;
  const rankedRelation = relations.graph_ranked_routes;
  const edgeFromKey = `${q("edges")}.${q("__from_key")}`;
  const edgeToKey = `${q("edges")}.${q("__to_key")}`;
  const edgeTo = `${q("edges")}.${q("__to")}`;
  const edgeCost = `${q("edges")}.${q("__weight")}`;
  const candidateDistance = `CAST(${q("routes")}.${
    q("distance")
  } + ${edgeCost} AS ${distanceType})`;

  return `WITH RECURSIVE ${endpointRelation}(
      ${q("start")}, ${q("end")}, ${q("__start_key")}, ${q("__end_key")}
    ) AS (
      SELECT ${q("start")}, ${q("end")},
        ${prepared.key(q("start"))}, ${prepared.key(q("end"))}
      FROM (SELECT ${route.endpointValue} AS ${q("start")},
        ${route.endpointValue} AS ${q("end")}) AS ${q("values")}
    ), ${edgesRelation} AS (
      ${
    prepared.edges(direction, [
      `${route.typedEdgeId} AS ${q("__edge_id")}`,
      `${route.edgeKey} AS ${q("__edge_key")}`,
      `${route.edgeWeight} AS ${q("__weight")}`,
    ])
  }
    ), ${nodesRelation} AS (
      SELECT ${q("__from_key")} AS ${q("__key")} FROM ${edgesRelation}
      UNION
      SELECT ${q("__to_key")} AS ${q("__key")} FROM ${edgesRelation}
    ), ${toEndRelation}(${q("__key")}) AS (
      SELECT ${q("__end_key")}
      FROM ${endpointRelation}
      INNER JOIN ${nodesRelation}
        ON ${q("__end_key")} = ${q("__key")}
      UNION
      SELECT ${edgeFromKey}
      FROM ${toEndRelation} AS ${q("reached")}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${q("reached")}.${q("__key")} = ${edgeToKey}
    ), ${routesRelation}(
      ${q("node")}, ${q("__node_key")}, ${q("__visited")},
      ${q("__edge_keys")}, ${q("steps")}, ${q("distance")}
    ) AS (
      SELECT ${q("start")}, ${q("__start_key")},
        [${q("__start_key")}], CAST([] AS ${route.keyType}[]),
        CAST([] AS ${route.stepType}[]), CAST(0 AS ${distanceType})
      FROM ${endpointRelation}
      INNER JOIN ${toEndRelation}
        ON ${q("__start_key")} = ${q("__key")}
      UNION ALL
      SELECT ${edgeTo}, ${edgeToKey},
        list_append(${q("routes")}.${q("__visited")}, ${edgeToKey}),
        list_append(${q("routes")}.${q("__edge_keys")}, ${q("edges")}.${
    q("__edge_key")
  }),
        list_append(${q("routes")}.${q("steps")}, struct_pack(
          ${q("edgeId")} := ${q("edges")}.${q("__edge_id")},
          ${q("source")} := ${q("edges")}.${q("__from")},
          ${q("target")} := ${edgeTo},
          ${q("weight")} := ${edgeCost},
          ${q("distance")} := ${candidateDistance}
        )), ${candidateDistance}
      FROM ${routesRelation} AS ${q("routes")}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${q("routes")}.${q("__node_key")} = ${edgeFromKey}
      INNER JOIN ${toEndRelation} AS ${q("can_reach_end")}
        ON ${edgeToKey} = ${q("can_reach_end")}.${q("__key")}
      CROSS JOIN ${endpointRelation}
      WHERE ${q("routes")}.${q("__node_key")} <> ${q("__end_key")}
        AND NOT list_contains(${q("routes")}.${q("__visited")}, ${edgeToKey})
    ), ${completeRelation} AS (
      SELECT ${q("__edge_keys")}, ${q("steps")}
      FROM ${routesRelation}
      CROSS JOIN ${endpointRelation}
      WHERE ${q("__node_key")} = ${q("__end_key")}
    ), ${rankedRelation} AS (
      SELECT CAST(row_number() OVER (ORDER BY ${
    q("__edge_keys")
  }) - 1 AS BIGINT) AS ${q("pathId")},
        ${q("steps")}
      FROM ${completeRelation}
    )
    ${
    graphRouteResultSelect(
      rankedRelation,
      route.input,
      route.edgeIdColumn,
    )
  }`;
}

function temporalPathsSelect(
  route: ReturnType<typeof prepareGraphRouteSql>,
  direction: Exclude<GraphDirection, "both">,
  temporal: ReturnType<typeof prepareGraphTemporalSql>,
): string {
  const prepared = route.traversal;
  const distanceType = route.distanceType;
  const q = quoteIdentifier;
  const relations = prepared.relationNames([
    "graph_route_endpoints",
    "graph_temporal_settings",
    "graph_event_rows",
    "graph_edges",
    "graph_nodes",
    "graph_to_end",
    "graph_routes",
    "graph_complete_routes",
    "graph_ranked_routes",
  ]);
  const endpointRelation = relations.graph_route_endpoints;
  const settingsRelation = relations.graph_temporal_settings;
  const eventRowsRelation = relations.graph_event_rows;
  const edgesRelation = relations.graph_edges;
  const nodesRelation = relations.graph_nodes;
  const toEndRelation = relations.graph_to_end;
  const routesRelation = relations.graph_routes;
  const completeRelation = relations.graph_complete_routes;
  const rankedRelation = relations.graph_ranked_routes;
  const edgeFromKey = `${q("edges")}.${q("__from_key")}`;
  const edgeToKey = `${q("edges")}.${q("__to_key")}`;
  const edgeTo = `${q("edges")}.${q("__to")}`;
  const edgeCost = `${q("edges")}.${q("__weight")}`;
  const edgeKey = `${q("edges")}.${q("__edge_key")}`;
  const candidateDistance = `CAST(${q("routes")}.${
    q("distance")
  } + ${edgeCost} AS ${distanceType})`;
  const gap = `${q("settings")}.${q("__gap")}`;
  const step = (distance: string) =>
    `struct_pack(
          ${q("edgeId")} := ${q("edges")}.${q("__edge_id")},
          ${q("source")} := ${q("edges")}.${q("__from")},
          ${q("target")} := ${edgeTo},
          ${q("weight")} := ${edgeCost},
          ${q("distance")} := ${distance}
        )`;

  return `WITH RECURSIVE ${settingsRelation} AS MATERIALIZED (
      SELECT CAST(? AS HUGEINT) AS ${q("__gap")}
    ), ${endpointRelation}(
      ${q("start")}, ${q("end")}, ${q("__start_key")}, ${q("__end_key")}
    ) AS (
      SELECT ${q("start")}, ${q("end")},
        ${prepared.key(q("start"))}, ${prepared.key(q("end"))}
      FROM (SELECT ${route.endpointValue} AS ${q("start")},
        ${route.endpointValue} AS ${q("end")}) AS ${q("values")}
    ), ${eventRowsRelation} AS MATERIALIZED (
      ${
    prepared.edges(direction, [
      `${route.typedEdgeId} AS ${q("__edge_id")}`,
      `${route.edgeKey} AS ${q("__edge_key")}`,
      `${route.edgeWeight} AS ${q("__weight")}`,
      ...temporal.eventSelections("edges"),
    ])
  }
    ), ${edgesRelation} AS MATERIALIZED (
      SELECT *
      FROM ${eventRowsRelation} AS ${q("events")}
      WHERE ${temporal.eventValidity("events")}
    ), ${nodesRelation} AS (
      SELECT ${q("__from_key")} AS ${q("__key")} FROM ${edgesRelation}
      UNION
      SELECT ${q("__to_key")} AS ${q("__key")} FROM ${edgesRelation}
    ), ${toEndRelation}(${q("__key")}) AS (
      SELECT ${q("__end_key")}
      FROM ${endpointRelation}
      INNER JOIN ${nodesRelation}
        ON ${q("__end_key")} = ${q("__key")}
      UNION
      SELECT ${edgeFromKey}
      FROM ${toEndRelation} AS ${q("reached")}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${q("reached")}.${q("__key")} = ${edgeToKey}
    ), ${routesRelation}(
      ${q("node")}, ${q("__node_key")}, ${q("__visited")},
      ${q("__edge_keys")}, ${q("steps")}, ${q("distance")},
      ${q("__event_id")}, ${q("__event_start")}, ${q("__event_end")}
    ) AS (
      SELECT ${edgeTo}, ${edgeToKey},
        [${q("__start_key")}, ${edgeToKey}], [${edgeKey}],
        [${step(edgeCost)}], ${edgeCost},
        ${q("edges")}.${q("__event_id")},
        ${q("edges")}.${q("__event_start")},
        ${q("edges")}.${q("__event_end")}
      FROM ${endpointRelation}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${q("__start_key")} = ${edgeFromKey}
      INNER JOIN ${toEndRelation} AS ${q("can_reach_end")}
        ON ${edgeToKey} = ${q("can_reach_end")}.${q("__key")}
      WHERE ${q("__start_key")} <> ${edgeToKey}
      UNION ALL
      SELECT ${edgeTo}, ${edgeToKey},
        list_append(${q("routes")}.${q("__visited")}, ${edgeToKey}),
        list_append(${q("routes")}.${q("__edge_keys")}, ${edgeKey}),
        list_append(${q("routes")}.${q("steps")}, ${step(candidateDistance)}),
        ${candidateDistance}, ${q("edges")}.${q("__event_id")},
        ${q("edges")}.${q("__event_start")},
        ${q("edges")}.${q("__event_end")}
      FROM ${routesRelation} AS ${q("routes")}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${q("routes")}.${q("__node_key")} = ${edgeFromKey}
      INNER JOIN ${toEndRelation} AS ${q("can_reach_end")}
        ON ${edgeToKey} = ${q("can_reach_end")}.${q("__key")}
      CROSS JOIN ${endpointRelation}
      CROSS JOIN ${settingsRelation} AS ${q("settings")}
      WHERE ${q("routes")}.${q("__node_key")} <> ${q("__end_key")}
        AND NOT list_contains(${q("routes")}.${q("__visited")}, ${edgeToKey})
        AND ${temporal.transition("routes", "edges", direction, gap)}
    ), ${completeRelation} AS (
      SELECT ${q("__edge_keys")}, ${q("steps")}
      FROM ${routesRelation}
      CROSS JOIN ${endpointRelation}
      WHERE ${q("__node_key")} = ${q("__end_key")}
    ), ${rankedRelation} AS (
      SELECT CAST(row_number() OVER (ORDER BY ${
    q("__edge_keys")
  }) - 1 AS BIGINT)
          AS ${q("pathId")}, ${q("steps")}
      FROM ${completeRelation}
    )
    ${
    graphRouteResultSelect(
      rankedRelation,
      route.input,
      route.edgeIdColumn,
    )
  }`;
}
