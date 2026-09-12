import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import type { GraphId } from "../helpers/prepareGraphStarts.ts";
import {
  graphRouteResultSelect,
  type PreparedGraphRouteEndpoints,
  prepareGraphRouteEndpoints,
  prepareGraphRouteSql,
  validateGraphRouteInputs,
} from "../helpers/prepareGraphRoute.ts";
import type { GraphDirection } from "../helpers/prepareGraphTraversal.ts";
import queueGraphResult from "../helpers/queueGraphResult.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

type ShortestPathOptions = {
  direction?: GraphDirection;
  outputTable?: string | boolean;
  weight?: string;
};

export default function shortestPath(
  simpleTable: SimpleTable,
  source: string,
  target: string,
  edgeId: string,
  start: GraphId,
  end: GraphId,
  options: ShortestPathOptions = {},
): SimpleTable {
  if (typeof source !== "string") {
    throw new TypeError("shortestPath() source must be a string.");
  }
  if (typeof target !== "string") {
    throw new TypeError("shortestPath() target must be a string.");
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

  const endpoints = prepareGraphRouteEndpoints(start, end, "shortestPath()");
  options = structuredClone(options);
  const direction = options.direction ?? "outgoing";
  const parameters = {
    source,
    target,
    edgeId,
    start,
    end,
    options,
  };

  return queueGraphResult(simpleTable, {
    method: "shortestPath()",
    parameters,
    outputTable: options.outputTable,
    values: (schema) => {
      validateGraphRouteInputs(
        schema,
        source,
        target,
        edgeId,
        endpoints,
        options.weight,
        "shortestPath()",
      );
      return endpoints.values.values;
    },
    buildSelect: (input, schema) =>
      shortestPathSelect(
        input,
        schema,
        source,
        target,
        edgeId,
        endpoints,
        direction,
        options.weight,
      ),
    outputSchema: (schema) => {
      const validated = validateGraphRouteInputs(
        schema,
        source,
        target,
        edgeId,
        endpoints,
        options.weight,
        "shortestPath()",
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

function shortestPathSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  edgeId: string,
  routeEndpoints: PreparedGraphRouteEndpoints,
  direction: GraphDirection,
  weight: string | undefined,
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
  );
  const prepared = route.traversal;
  const distanceType = route.distanceType;
  // Exact shortest routes have optimal prefixes. Floating addition can erase
  // a prefix-cost difference later, so retain all simple prefixes up to the
  // best complete cost before selecting the full-route ties.
  const floating = route.weightType === "FLOAT" ||
    route.weightType === "DOUBLE";

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
  const routeDistance = `${q("routes")}.${q("distance")}`;
  const candidateDistance =
    `CAST(${routeDistance} + ${edgeCost} AS ${distanceType})`;
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
        CAST(0 AS ${distanceType})
      FROM ${endpointRelation}
      INNER JOIN ${toEndRelation}
        ON ${q("__start_key")} = ${q("__key")}
      UNION
      SELECT ${edgeTo}, ${edgeToKey},
        MIN(CAST(${q("reached")}.${
    q("distance")
  } + ${edgeCost} AS ${distanceType}))
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
  } + ${edgeCost} AS ${distanceType})) < ${q("best")}.${q("distance")}
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
      ? `${candidateDistance} <= ${q("best_total")}.${q("distance")}`
      : `${candidateDistance} = ${q("best_prefix")}.${q("distance")}`
  }
    ), ${shortestRelation} AS (
      SELECT ${q("__edge_keys")}, ${q("steps")}
      FROM ${routesRelation}
      CROSS JOIN ${endpointRelation}
      CROSS JOIN ${bestTotalRelation} AS ${q("best_total")}
      WHERE ${q("__node_key")} = ${q("__end_key")}
        AND ${routesRelation}.${q("distance")} = ${q("best_total")}.${
    q("distance")
  }
    ), ${rankedRelation} AS (
      SELECT CAST(row_number() OVER (ORDER BY ${
    q("__edge_keys")
  }) - 1 AS BIGINT) AS ${q("pathId")},
        ${q("steps")}
      FROM ${shortestRelation}
    )
    ${graphRouteResultSelect(rankedRelation)}`;
}
