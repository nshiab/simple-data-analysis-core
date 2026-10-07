import type SimpleTable from "../class/SimpleTable.ts";
import buildGraphTemporalCostStateSql from "../helpers/buildGraphTemporalCostStateSql.ts";
import prepareGraphMetricOptions, {
  type PreparedGraphMetricOptions,
} from "../helpers/prepareGraphMetricOptions.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import type { GraphId } from "../helpers/prepareGraphStarts.ts";
import {
  type PreparedGraphRouteEndpoints,
  prepareGraphRouteEndpoints,
  prepareGraphRouteSql,
  validateGraphRouteInputs,
} from "../helpers/prepareGraphRouteSql.ts";
import graphRouteResultSchema from "../helpers/graphRouteResultSchema.ts";
import graphRouteResultSelect from "../helpers/graphRouteResultSelect.ts";
import prepareGraphTemporalSql, {
  type GraphTemporalOptions,
  type PreparedGraphTemporalOptions,
  prepareGraphTemporalOptions,
} from "../helpers/prepareGraphTemporalSql.ts";
import type { GraphDirection } from "../helpers/prepareGraphTraversal.ts";
import queueGraphResult from "../helpers/queueGraphResult.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import validateGraphTemporalEvents from "../helpers/validateGraphTemporalEvents.ts";

type ShortestPathOptions = GraphTemporalOptions & {
  direction?: GraphDirection;
  outputTable?: string | boolean;
  weight?: string;
  elapsedTime?: boolean;
  minimize?: "steps" | "weight" | "elapsedTime";
};

export default function shortestPath(
  simpleTable: SimpleTable,
  sourceColumn: string,
  targetColumn: string,
  edgeId: string,
  start: GraphId,
  end: GraphId,
  options: ShortestPathOptions = {},
): SimpleTable {
  if (typeof sourceColumn !== "string") {
    throw new TypeError("shortestPath() sourceColumn must be a string.");
  }
  if (typeof targetColumn !== "string") {
    throw new TypeError("shortestPath() targetColumn must be a string.");
  }
  if (typeof edgeId !== "string") {
    throw new TypeError("shortestPath() edgeId must be a string.");
  }
  if (
    options === null || typeof options !== "object" || Array.isArray(options)
  ) {
    throw new TypeError("shortestPath() options must be an object.");
  }
  if (
    options.direction !== undefined &&
    !["outgoing", "incoming", "both"].includes(options.direction)
  ) {
    throw new TypeError(
      'shortestPath() options.direction must be "outgoing", "incoming", or "both".',
    );
  }
  if (options.weight !== undefined && typeof options.weight !== "string") {
    throw new TypeError("shortestPath() options.weight must be a string.");
  }
  if (
    options.outputTable !== undefined &&
    typeof options.outputTable !== "string" &&
    typeof options.outputTable !== "boolean"
  ) {
    throw new TypeError(
      "shortestPath() options.outputTable must be a string or boolean.",
    );
  }

  const metrics = prepareGraphMetricOptions(options, "shortestPath()", true);
  const endpoints = prepareGraphRouteEndpoints(start, end, "shortestPath()");
  const direction = options.direction ?? "outgoing";
  const temporalOptions = prepareGraphTemporalOptions(
    options,
    direction,
    "shortestPath()",
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
    method: "shortestPath()",
    parameters,
    outputTable: options.outputTable,
    preflight: temporalOptions === undefined
      ? undefined
      : (input) =>
        validateGraphTemporalEvents(
          input,
          temporalOptions,
          "shortestPath()",
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
        "shortestPath()",
        options.weight !== undefined,
      );
      const temporal = temporalOptions === undefined
        ? undefined
        : prepareGraphTemporalSql(schema, temporalOptions, "shortestPath()");
      return temporal === undefined
        ? endpoints.values.values
        : [temporal.gapParameter, ...endpoints.values.values];
    },
    buildSelect: (input, schema) =>
      shortestPathSelect(
        input,
        schema,
        sourceColumn,
        targetColumn,
        edgeId,
        endpoints,
        direction,
        options.weight,
        temporalOptions,
        metrics,
      ),
    outputSchema: (schema) => {
      const validated = validateGraphRouteInputs(
        schema,
        sourceColumn,
        targetColumn,
        edgeId,
        endpoints,
        options.weight,
        "shortestPath()",
        options.weight !== undefined,
      );
      if (temporalOptions !== undefined) {
        prepareGraphTemporalSql(schema, temporalOptions, "shortestPath()");
      }
      return graphRouteResultSchema(
        schema,
        validated.distanceType,
        "shortestPath()",
        metrics.elapsedTime,
        options.weight !== undefined,
      );
    },
  });
}

function shortestPathSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  edgeId: string,
  routeEndpoints: PreparedGraphRouteEndpoints,
  direction: GraphDirection,
  weight: string | undefined,
  temporalOptions: PreparedGraphTemporalOptions | undefined,
  metrics: PreparedGraphMetricOptions,
): string {
  const route = prepareGraphRouteSql(
    input,
    schema,
    source,
    target,
    edgeId,
    routeEndpoints,
    weight,
    "shortestPath()",
    weight !== undefined,
  );
  const prepared = route.traversal;
  if (temporalOptions !== undefined) {
    const temporal = prepareGraphTemporalSql(
      schema,
      temporalOptions,
      "shortestPath()",
    );
    return temporalShortestPathSelect(
      route,
      direction as Exclude<GraphDirection, "both">,
      temporal,
      metrics,
      weight !== undefined,
    );
  }
  const distanceType = route.distanceType;
  // Exact shortest routes have optimal prefixes. Floating addition can erase
  // a prefix-cost difference later, so retain all simple prefixes up to the
  // best complete cost before selecting the full-route ties.
  const floating = metrics.minimize === "weight" &&
    (route.weightType === "FLOAT" || route.weightType === "DOUBLE");
  const metricType = metrics.minimize === "steps" ? "BIGINT" : distanceType;

  const relations = prepared.relationNames([
    "graph_route_endpoints",
    "graph_edges",
    "graph_nodes",
    "graph_to_end",
    "graph_distances",
    "graph_best_total",
    "graph_routes",
    "graph_shortest_routes",
    "graph_ranked_routes",
  ]);
  const endpointRelation = relations.graph_route_endpoints;
  const edgesRelation = relations.graph_edges;
  const nodesRelation = relations.graph_nodes;
  const toEndRelation = relations.graph_to_end;
  const distancesRelation = relations.graph_distances;
  const bestTotalRelation = relations.graph_best_total;
  const routesRelation = relations.graph_routes;
  const shortestRelation = relations.graph_shortest_routes;
  const rankedRelation = relations.graph_ranked_routes;

  const q = quoteIdentifier;
  const edgeFromKey = `${q("edges")}.${q("__from_key")}`;
  const edgeToKey = `${q("edges")}.${q("__to_key")}`;
  const edgeTo = `${q("edges")}.${q("__to")}`;
  const edgeCost = `${q("edges")}.${q("__weight")}`;
  const edgeMetric = metrics.minimize === "steps"
    ? "CAST(1 AS BIGINT)"
    : edgeCost;
  const routeDistance = `${q("routes")}.${q("distance")}`;
  const candidateDistance =
    `CAST(${routeDistance} + ${edgeCost} AS ${distanceType})`;
  const routeMetric = metrics.minimize === "steps"
    ? `len(${q("routes")}.${q("steps")})`
    : routeDistance;
  const candidateMetric = metrics.minimize === "steps"
    ? `${routeMetric} + 1`
    : candidateDistance;
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
    ), ${distancesRelation}(
      ${q("node")}, ${q("__node_key")}, ${q("distance")}
    ) USING KEY(${q("__node_key")}) AS (
      SELECT ${q("start")}, ${q("__start_key")},
        CAST(0 AS ${metricType})
      FROM ${endpointRelation}
      INNER JOIN ${toEndRelation}
        ON ${q("__start_key")} = ${q("__key")}
      UNION
      SELECT ${edgeTo}, ${edgeToKey},
        MIN(CAST(${q("reached")}.${
    q("distance")
  } + ${edgeMetric} AS ${metricType}))
      FROM ${distancesRelation} AS ${q("reached")}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${q("reached")}.${q("__node_key")} = ${edgeFromKey}
      INNER JOIN ${toEndRelation} AS ${q("can_reach_end")}
        ON ${edgeToKey} = ${q("can_reach_end")}.${q("__key")}
      LEFT JOIN recurring.${distancesRelation} AS ${q("best")}
        ON ${edgeToKey} = ${q("best")}.${q("__node_key")}
      GROUP BY ${edgeTo}, ${edgeToKey}, ${q("best")}.${q("distance")}
      HAVING ${q("best")}.${q("distance")} IS NULL
        OR MIN(CAST(${q("reached")}.${
    q("distance")
  } + ${edgeMetric} AS ${metricType})) < ${q("best")}.${q("distance")}
    ), ${bestTotalRelation} AS (
      SELECT ${q("distances")}.${q("distance")}
      FROM ${distancesRelation} AS ${q("distances")}
      INNER JOIN ${endpointRelation}
        ON ${q("distances")}.${q("__node_key")} = ${q("__end_key")}
    ), ${routesRelation}(
      ${q("node")}, ${q("__node_key")}, ${q("__visited")},
      ${q("__edge_keys")}, ${q("steps")}, ${q("distance")}
    ) AS (
      SELECT ${q("start")}, ${q("__start_key")},
        [${q("__start_key")}], CAST([] AS ${route.keyType}[]),
        CAST([] AS ${route.stepType}[]), CAST(0 AS ${distanceType})
      FROM ${endpointRelation}
      INNER JOIN ${bestTotalRelation} ON TRUE
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
      INNER JOIN ${bestTotalRelation} AS ${q("best_total")}
        ON TRUE
      ${
    floating ? "" : `INNER JOIN ${distancesRelation} AS ${q("best_prefix")}
        ON ${edgeToKey} = ${q("best_prefix")}.${q("__node_key")}`
  }
      CROSS JOIN ${endpointRelation}
      WHERE ${q("routes")}.${q("__node_key")} <> ${q("__end_key")}
        AND NOT list_contains(${q("routes")}.${q("__visited")}, ${edgeToKey})
        AND ${
    floating
      ? `${candidateMetric} <= ${q("best_total")}.${q("distance")}`
      : `${candidateMetric} = ${q("best_prefix")}.${q("distance")}`
  }
    ), ${shortestRelation} AS (
      SELECT ${q("__edge_keys")}, ${q("steps")}
      FROM ${routesRelation} AS ${q("routes")}
      CROSS JOIN ${endpointRelation}
      CROSS JOIN ${bestTotalRelation} AS ${q("best_total")}
      WHERE ${q("__node_key")} = ${q("__end_key")}
        AND ${routeMetric} = ${q("best_total")}.${q("distance")}
    ), ${rankedRelation} AS (
      SELECT CAST(row_number() OVER (ORDER BY ${
    q("__edge_keys")
  }) - 1 AS BIGINT) AS ${q("pathId")},
        ${q("steps")}
      FROM ${shortestRelation}
    )
    ${
    graphRouteResultSelect(
      rankedRelation,
      route.input,
      route.edgeIdColumn,
      false,
      false,
      weight !== undefined,
    )
  }`;
}

function temporalShortestPathSelect(
  route: ReturnType<typeof prepareGraphRouteSql>,
  direction: Exclude<GraphDirection, "both">,
  temporal: ReturnType<typeof prepareGraphTemporalSql>,
  metrics: PreparedGraphMetricOptions,
  includeTotal: boolean,
): string {
  const prepared = route.traversal;
  const q = quoteIdentifier;
  const startsSelect = `SELECT ${q("start")},
        ${prepared.key(q("start"))} AS ${q("__key")}
      FROM (SELECT ${route.endpointValue} AS ${q("start")}) AS ${q("values")}`;
  // Non-negative weights and no maximum gap let cycles be removed from walks.
  // Their optimum bounds simple routes; retain separate histories for all ties.
  const costs = metrics.minimize === "elapsedTime"
    ? buildElapsedShortestPathCostSql(route, startsSelect, direction, temporal)
    : buildGraphTemporalCostStateSql(
      prepared,
      startsSelect,
      direction,
      temporal,
      route.distanceType,
      route.edgeWeight,
      [
        `${route.typedEdgeId} AS ${q("__edge_id")}`,
        `${route.edgeKey} AS ${q("__edge_key")}`,
      ],
      metrics.minimize === "steps" ? "steps" : "weight",
    );
  const relations = prepared.relationNames([
    "graph_route_endpoints",
    "graph_nodes",
    "graph_to_end",
    "graph_best_total",
    "graph_routes",
    "graph_shortest_routes",
    "graph_ranked_routes",
  ]);
  const endpointRelation = relations.graph_route_endpoints;
  const nodesRelation = relations.graph_nodes;
  const toEndRelation = relations.graph_to_end;
  const bestTotalRelation = relations.graph_best_total;
  const routesRelation = relations.graph_routes;
  const shortestRelation = relations.graph_shortest_routes;
  const rankedRelation = relations.graph_ranked_routes;
  const edgesRelation = costs.edgesRelation;
  const edgeFromKey = `${q("edges")}.${q("__from_key")}`;
  const edgeToKey = `${q("edges")}.${q("__to_key")}`;
  const edgeTo = `${q("edges")}.${q("__to")}`;
  const edgeCost = `${q("edges")}.${q("__weight")}`;
  const edgeKey = `${q("edges")}.${q("__edge_key")}`;
  const routeDistance = `${q("routes")}.${q("distance")}`;
  const candidateDistance =
    `CAST(${routeDistance} + ${edgeCost} AS ${route.distanceType})`;
  const gap = `${q("settings")}.${q("__gap")}`;
  const firstAnchor = temporal.journeyAnchor("edges", direction);
  const routeAnchor = `${q("routes")}.${q("__journey_anchor")}`;
  const firstElapsed = temporal.journeyElapsed("edges", firstAnchor, direction);
  const candidateElapsed = temporal.journeyElapsed(
    "edges",
    routeAnchor,
    direction,
  );
  const firstMetric = metrics.minimize === "steps"
    ? "1"
    : metrics.minimize === "elapsedTime"
    ? firstElapsed
    : edgeCost;
  const routeMetric = metrics.minimize === "steps"
    ? `len(${q("routes")}.${q("steps")})`
    : metrics.minimize === "elapsedTime"
    ? `${q("routes")}.${q("__elapsed")}`
    : routeDistance;
  const candidateMetric = metrics.minimize === "steps"
    ? `${routeMetric} + 1`
    : metrics.minimize === "elapsedTime"
    ? candidateElapsed
    : candidateDistance;
  const step = (distance: string, elapsed: string) =>
    `struct_pack(
          ${q("edgeId")} := ${q("edges")}.${q("__edge_id")},
          ${q("source")} := ${q("edges")}.${q("__from")},
          ${q("target")} := ${edgeTo},
          ${q("weight")} := ${edgeCost},
          ${q("distance")} := ${distance}${
      metrics.elapsedTime
        ? `, ${q("elapsedTimeMs")} := ${temporal.elapsedMilliseconds(elapsed)}`
        : ""
    }
        )`;

  return `${costs.withClause}, ${endpointRelation}(
      ${q("start")}, ${q("end")}, ${q("__start_key")}, ${q("__end_key")}
    ) AS (
      SELECT ${q("starts")}.${q("start")}, ${q("values")}.${q("end")},
        ${q("starts")}.${q("__key")},
        ${prepared.key(`${q("values")}.${q("end")}`)}
      FROM ${costs.startsRelation} AS ${q("starts")}
      CROSS JOIN (SELECT ${route.endpointValue} AS ${q("end")}) AS ${
    q("values")
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
    ), ${bestTotalRelation} AS (
      SELECT MIN(${q("costs")}.${
    q(metrics.minimize === "steps" ? "steps" : "distance")
  }) AS ${q("distance")}
      FROM ${costs.costRelation} AS ${q("costs")}
      INNER JOIN ${endpointRelation}
        ON ${q("costs")}.${q("__node_key")} = ${q("__end_key")}
    ), ${routesRelation}(
      ${q("node")}, ${q("__node_key")}, ${q("__visited")},
      ${q("__edge_keys")}, ${q("steps")}, ${q("distance")},
      ${q("__event_id")}, ${q("__event_start")}, ${q("__event_end")}${
    metrics.elapsedTime ? `, ${q("__journey_anchor")}, ${q("__elapsed")}` : ""
  }
    ) AS (
      SELECT ${edgeTo}, ${edgeToKey},
        [${q("__start_key")}, ${edgeToKey}], [${edgeKey}],
        [${step(edgeCost, firstElapsed)}], ${edgeCost},
        ${q("edges")}.${q("__event_id")},
        ${q("edges")}.${q("__event_start")},
        ${q("edges")}.${q("__event_end")}${
    metrics.elapsedTime ? `, ${firstAnchor}, ${firstElapsed}` : ""
  }
      FROM ${endpointRelation}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${q("__start_key")} = ${edgeFromKey}
      INNER JOIN ${toEndRelation} AS ${q("can_reach_end")}
        ON ${edgeToKey} = ${q("can_reach_end")}.${q("__key")}
      INNER JOIN ${bestTotalRelation} AS ${q("best_total")}
        ON ${firstMetric} <= ${q("best_total")}.${q("distance")}
      WHERE ${q("__start_key")} <> ${edgeToKey}
      UNION ALL
      SELECT ${edgeTo}, ${edgeToKey},
        list_append(${q("routes")}.${q("__visited")}, ${edgeToKey}),
        list_append(${q("routes")}.${q("__edge_keys")}, ${edgeKey}),
        list_append(${q("routes")}.${q("steps")}, ${
    step(candidateDistance, candidateElapsed)
  }),
        ${candidateDistance}, ${q("edges")}.${q("__event_id")},
        ${q("edges")}.${q("__event_start")},
        ${q("edges")}.${q("__event_end")}${
    metrics.elapsedTime ? `, ${routeAnchor}, ${candidateElapsed}` : ""
  }
      FROM ${routesRelation} AS ${q("routes")}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${q("routes")}.${q("__node_key")} = ${edgeFromKey}
      INNER JOIN ${toEndRelation} AS ${q("can_reach_end")}
        ON ${edgeToKey} = ${q("can_reach_end")}.${q("__key")}
      INNER JOIN ${bestTotalRelation} AS ${q("best_total")}
        ON ${candidateMetric} <= ${q("best_total")}.${q("distance")}
      CROSS JOIN ${endpointRelation}
      CROSS JOIN ${costs.settingsRelation} AS ${q("settings")}
      WHERE ${q("routes")}.${q("__node_key")} <> ${q("__end_key")}
        AND NOT list_contains(${q("routes")}.${q("__visited")}, ${edgeToKey})
        AND ${temporal.transition("routes", "edges", direction, gap)}
    ), ${shortestRelation} AS (
      SELECT ${q("__edge_keys")}, ${q("steps")}
      FROM ${routesRelation} AS ${q("routes")}
      CROSS JOIN ${endpointRelation}
      CROSS JOIN ${bestTotalRelation} AS ${q("best_total")}
      WHERE ${q("__node_key")} = ${q("__end_key")}
        AND ${routeMetric} = ${q("best_total")}.${q("distance")}
    ), ${rankedRelation} AS (
      SELECT CAST(row_number() OVER (ORDER BY ${
    q("__edge_keys")
  }) - 1 AS BIGINT)
          AS ${q("pathId")}, ${q("steps")}
      FROM ${shortestRelation}
    )
    ${
    graphRouteResultSelect(
      rankedRelation,
      route.input,
      route.edgeIdColumn,
      false,
      metrics.elapsedTime,
      includeTotal,
    )
  }`;
}

// At the same physical event a later departure (or earlier incoming arrival)
// dominates every future elapsed duration. Keyed improvements find the optimum
// without enumerating route histories; reconstruction still retains all ties.
function buildElapsedShortestPathCostSql(
  route: ReturnType<typeof prepareGraphRouteSql>,
  startsSelect: string,
  direction: Exclude<GraphDirection, "both">,
  temporal: ReturnType<typeof prepareGraphTemporalSql>,
): ReturnType<typeof buildGraphTemporalCostStateSql> {
  const prepared = route.traversal;
  const q = quoteIdentifier;
  const relations = prepared.relationNames([
    "graph_starts",
    "graph_temporal_settings",
    "graph_event_rows",
    "graph_edges",
    "graph_cost_states",
  ]);
  const startsRelation = relations.graph_starts;
  const settingsRelation = relations.graph_temporal_settings;
  const eventRowsRelation = relations.graph_event_rows;
  const edgesRelation = relations.graph_edges;
  const costRelation = relations.graph_cost_states;
  const start = `${q("starts")}.${q("start")}`;
  const startKey = `${q("starts")}.${q("__key")}`;
  const reachedStart = `${q("reached")}.${q("start")}`;
  const reachedStartKey = `${q("reached")}.${q("__start_key")}`;
  const reachedNodeKey = `${q("reached")}.${q("__node_key")}`;
  const edgeTo = `${q("edges")}.${q("__to")}`;
  const edgeToKey = `${q("edges")}.${q("__to_key")}`;
  const edgeFromKey = `${q("edges")}.${q("__from_key")}`;
  const eventId = `${q("edges")}.${q("__event_id")}`;
  const eventStart = `${q("edges")}.${q("__event_start")}`;
  const eventEnd = `${q("edges")}.${q("__event_end")}`;
  const bestDistance = `${q("best")}.${q("distance")}`;
  const gap = `${q("settings")}.${q("__gap")}`;
  const firstAnchor = temporal.journeyAnchor("edges", direction);
  const reachedAnchor = `${q("reached")}.${q("__journey_anchor")}`;
  const firstElapsed = temporal.journeyElapsed("edges", firstAnchor, direction);
  const candidateDistance = temporal.journeyElapsed(
    "edges",
    reachedAnchor,
    direction,
  );
  const bestAnchor = `${
    direction === "outgoing" ? "MAX" : "MIN"
  }(${reachedAnchor})`;

  return {
    costRelation,
    edgesRelation,
    settingsRelation,
    startsRelation,
    withClause: `WITH RECURSIVE ${settingsRelation} AS MATERIALIZED (
      SELECT CAST(? AS HUGEINT) AS ${q("__gap")}
    ), ${eventRowsRelation} AS MATERIALIZED (
      ${
      prepared.edges(direction, [
        `${route.edgeWeight} AS ${q("__weight")}`,
        `${route.typedEdgeId} AS ${q("__edge_id")}`,
        `${route.edgeKey} AS ${q("__edge_key")}`,
        ...temporal.eventSelections("edges"),
      ])
    }
    ), ${edgesRelation} AS MATERIALIZED (
      SELECT *
      FROM ${eventRowsRelation} AS ${q("events")}
      WHERE ${temporal.eventValidity("events")}
    ), ${startsRelation} AS MATERIALIZED (
      ${startsSelect}
    ), ${costRelation}(
      ${q("start")}, ${q("node")},
      ${q("__start_key")}, ${q("__node_key")},
      ${q("__event_id")}, ${q("__event_start")}, ${q("__event_end")},
      ${q("distance")}, ${q("__journey_anchor")}
    ) USING KEY(${q("__start_key")}, ${q("__event_id")}) AS (
      SELECT ${start}, ${edgeTo}, ${startKey}, ${edgeToKey},
        ${eventId}, ${eventStart}, ${eventEnd}, ${firstElapsed}, ${firstAnchor}
      FROM ${startsRelation} AS ${q("starts")}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${startKey} = ${edgeFromKey}
      UNION
      SELECT ${reachedStart}, ${edgeTo}, ${reachedStartKey}, ${edgeToKey},
        ${eventId}, ${eventStart}, ${eventEnd},
        MIN(${candidateDistance}) AS ${q("distance")}, ${bestAnchor}
      FROM ${costRelation} AS ${q("reached")}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${reachedNodeKey} = ${edgeFromKey}
      CROSS JOIN ${settingsRelation} AS ${q("settings")}
      LEFT JOIN recurring.${costRelation} AS ${q("best")}
        ON ${reachedStartKey} = ${q("best")}.${q("__start_key")}
        AND ${eventId} = ${q("best")}.${q("__event_id")}
      WHERE ${temporal.transition("reached", "edges", direction, gap)}
      GROUP BY ${reachedStart}, ${edgeTo}, ${reachedStartKey}, ${edgeToKey},
        ${eventId}, ${eventStart}, ${eventEnd}, ${bestDistance}
      HAVING ${bestDistance} IS NULL OR
        MIN(${candidateDistance}) < ${bestDistance}
    )`,
  };
}
