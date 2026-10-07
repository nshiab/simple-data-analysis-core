import type SimpleTable from "../class/SimpleTable.ts";
import buildGraphTemporalCostStateSql from "../helpers/buildGraphTemporalCostStateSql.ts";
import getGraphWeightColumn from "../helpers/getGraphWeightColumn.ts";
import prepareGraphMetricOptions, {
  type PreparedGraphMetricOptions,
} from "../helpers/prepareGraphMetricOptions.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
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

type DistancesOptions = GraphTemporalOptions & {
  direction?: GraphDirection;
  outputTable?: string | boolean;
  weight?: string;
  elapsedTime?: boolean;
  minimize?: "steps" | "weight" | "elapsedTime";
};

export default function distances(
  simpleTable: SimpleTable,
  sourceColumn: string,
  targetColumn: string,
  startNodes: GraphId | GraphId[],
  options: DistancesOptions = {},
): SimpleTable {
  if (typeof sourceColumn !== "string") {
    throw new TypeError("distances() sourceColumn must be a string.");
  }
  if (typeof targetColumn !== "string") {
    throw new TypeError("distances() targetColumn must be a string.");
  }
  if (
    options === null || typeof options !== "object" || Array.isArray(options)
  ) {
    throw new TypeError("distances() options must be an object.");
  }
  if (
    options.direction !== undefined &&
    !["outgoing", "incoming", "both"].includes(options.direction)
  ) {
    throw new TypeError(
      'distances() options.direction must be "outgoing", "incoming", or "both".',
    );
  }
  if (options.weight !== undefined && typeof options.weight !== "string") {
    throw new TypeError("distances() options.weight must be a string.");
  }
  if (
    options.outputTable !== undefined &&
    typeof options.outputTable !== "string" &&
    typeof options.outputTable !== "boolean"
  ) {
    throw new TypeError(
      "distances() options.outputTable must be a string or boolean.",
    );
  }

  const metrics = prepareGraphMetricOptions(options, "distances()", true);
  const preparedStarts = prepareGraphStarts(
    startNodes,
    "distances()",
    "startNodes",
  );
  const direction = options.direction ?? "outgoing";
  const temporalOptions = prepareGraphTemporalOptions(
    options,
    direction,
    "distances()",
  );
  options = structuredClone(options);
  const parameters = {
    sourceColumn,
    targetColumn,
    startNodes: structuredClone(startNodes),
    options,
  };

  return queueGraphResult(simpleTable, {
    method: "distances()",
    parameters,
    outputTable: options.outputTable,
    preflight: temporalOptions === undefined
      ? undefined
      : (input) =>
        validateGraphTemporalEvents(
          input,
          temporalOptions,
          "distances()",
          parameters,
        ),
    values: (schema) => {
      const { temporal } = validateDistanceInputs(
        schema,
        sourceColumn,
        targetColumn,
        preparedStarts,
        options.weight,
        temporalOptions,
      );
      return temporal === undefined
        ? preparedStarts.values
        : [temporal.gapParameter, ...preparedStarts.values];
    },
    buildSelect: (input, schema) =>
      distancesSelect(
        input,
        schema,
        sourceColumn,
        targetColumn,
        preparedStarts,
        direction,
        options.weight,
        temporalOptions,
        metrics,
      ),
    outputSchema: (schema) => {
      const validated = validateDistanceInputs(
        schema,
        sourceColumn,
        targetColumn,
        preparedStarts,
        options.weight,
        temporalOptions,
      );
      return {
        start: validated.idType,
        node: validated.idType,
        steps: "BIGINT",
        ...(options.weight === undefined
          ? {}
          : { total: validated.distanceType }),
        ...(metrics.elapsedTime ? { elapsedTimeMs: "DOUBLE" } : {}),
      };
    },
  });
}

function validateDistanceInputs(
  schema: TableSchema,
  source: string,
  target: string,
  starts: PreparedGraphStarts,
  weight: string | undefined,
  temporalOptions: PreparedGraphTemporalOptions | undefined,
) {
  const endpoints = validateGraphStarts(
    schema,
    source,
    target,
    starts,
    "distances()",
    "startNodes",
  );
  const distanceType = weight === undefined
    ? "BIGINT"
    : getGraphWeightColumn(schema, weight, "distances()").distanceType;
  const temporal = temporalOptions === undefined
    ? undefined
    : prepareGraphTemporalSql(schema, temporalOptions, "distances()");
  return { idType: endpoints.idType, distanceType, temporal };
}

function distancesSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  starts: PreparedGraphStarts,
  direction: GraphDirection,
  weight: string | undefined,
  temporalOptions: PreparedGraphTemporalOptions | undefined,
  metrics: PreparedGraphMetricOptions,
): string {
  const prepared = prepareGraphTraversal(
    input,
    schema,
    source,
    target,
    starts,
    "distances()",
    "startNodes",
  );
  const weightColumn = weight === undefined
    ? undefined
    : getGraphWeightColumn(schema, weight, "distances()");
  const distanceType = weightColumn?.distanceType ?? "BIGINT";
  const edgeWeight = weightColumn === undefined
    ? `CAST(1 AS ${distanceType})`
    : `CAST(${quoteIdentifier("edges")}.${
      quoteIdentifier(weightColumn.column)
    } AS ${distanceType})`;
  const temporal = temporalOptions === undefined
    ? undefined
    : prepareGraphTemporalSql(schema, temporalOptions, "distances()");
  if (weight !== undefined || metrics.elapsedTime) {
    return summaryDistancesSelect(
      prepared,
      direction,
      temporal,
      distanceType,
      edgeWeight,
      metrics,
      weight !== undefined,
      weightColumn?.type === "FLOAT" || weightColumn?.type === "DOUBLE",
    );
  }
  if (temporal !== undefined) {
    return temporalDistancesSelect(
      prepared,
      direction as Exclude<GraphDirection, "both">,
      temporal,
      distanceType,
      edgeWeight,
      "steps",
      false,
    );
  }
  const relations = prepared.relationNames([
    "graph_start_values",
    "graph_starts",
    "graph_edges",
    "graph_distances",
  ]);
  const startValuesRelation = relations.graph_start_values;
  const startsRelation = relations.graph_starts;
  const edgesRelation = relations.graph_edges;
  const distancesRelation = relations.graph_distances;
  const start = `${quoteIdentifier("starts")}.${quoteIdentifier("start")}`;
  const startKey = `${quoteIdentifier("starts")}.${quoteIdentifier("__key")}`;
  const reachedStart = `${quoteIdentifier("reached")}.${
    quoteIdentifier("start")
  }`;
  const reachedStartKey = `${quoteIdentifier("reached")}.${
    quoteIdentifier("__start_key")
  }`;
  const reachedNodeKey = `${quoteIdentifier("reached")}.${
    quoteIdentifier("__node_key")
  }`;
  const reachedDistance = `${quoteIdentifier("reached")}.${
    quoteIdentifier("distance")
  }`;
  const edgeTo = `${quoteIdentifier("edges")}.${quoteIdentifier("__to")}`;
  const edgeToKey = `${quoteIdentifier("edges")}.${
    quoteIdentifier("__to_key")
  }`;
  const edgeFromKey = `${quoteIdentifier("edges")}.${
    quoteIdentifier("__from_key")
  }`;
  const edgeCost = `${quoteIdentifier("edges")}.${quoteIdentifier("__weight")}`;
  const bestDistance = `${quoteIdentifier("best")}.${
    quoteIdentifier("distance")
  }`;
  const candidateDistance =
    `CAST(${reachedDistance} + ${edgeCost} AS ${distanceType})`;

  const candidateSteps = `${quoteIdentifier("reached")}.${
    quoteIdentifier("steps")
  } + 1`;
  const bestSteps = `${quoteIdentifier("best")}.${quoteIdentifier("steps")}`;
  const order = (distance: string, steps: string) =>
    metrics.minimize === "steps"
      ? `ROW(${steps}, ${distance})`
      : `ROW(${distance}, ${steps})`;
  const candidateOrder = order(candidateDistance, candidateSteps);
  const selectedDistance = `arg_min(${candidateDistance}, ${candidateOrder})`;
  const selectedSteps = `arg_min(${candidateSteps}, ${candidateOrder})`;

  return `WITH RECURSIVE ${startValuesRelation}(${
    quoteIdentifier("start")
  }) AS (
      VALUES ${prepared.startValues}
    ), ${startsRelation} AS (
      SELECT ${quoteIdentifier("start")},
        ${prepared.key(quoteIdentifier("start"))} AS ${quoteIdentifier("__key")}
      FROM ${startValuesRelation}
    ), ${edgesRelation} AS (
      ${
    prepared.edges(direction, [
      `${edgeWeight} AS ${quoteIdentifier("__weight")}`,
    ])
  }
    ), ${distancesRelation}(
      ${quoteIdentifier("start")}, ${quoteIdentifier("node")},
      ${quoteIdentifier("__start_key")}, ${quoteIdentifier("__node_key")},
      ${quoteIdentifier("distance")}, ${quoteIdentifier("steps")}
    ) USING KEY(
      ${quoteIdentifier("__start_key")}, ${quoteIdentifier("__node_key")}
    ) AS (
      SELECT ${start}, ${edgeTo}, ${startKey}, ${edgeToKey},
        MIN(${edgeCost}) AS ${quoteIdentifier("distance")}, CAST(1 AS BIGINT)
      FROM ${startsRelation} AS ${quoteIdentifier("starts")}
      INNER JOIN ${edgesRelation} AS ${quoteIdentifier("edges")}
        ON ${startKey} = ${edgeFromKey}
      GROUP BY ${start}, ${edgeTo}, ${startKey}, ${edgeToKey}
      UNION
      SELECT ${reachedStart}, ${edgeTo}, ${reachedStartKey}, ${edgeToKey},
        ${selectedDistance} AS ${quoteIdentifier("distance")},
        ${selectedSteps} AS ${quoteIdentifier("steps")}
      FROM ${distancesRelation} AS ${quoteIdentifier("reached")}
      INNER JOIN ${edgesRelation} AS ${quoteIdentifier("edges")}
        ON ${reachedNodeKey} = ${edgeFromKey}
      LEFT JOIN recurring.${distancesRelation} AS ${quoteIdentifier("best")}
        ON ${reachedStartKey} = ${quoteIdentifier("best")}.${
    quoteIdentifier("__start_key")
  }
        AND ${edgeToKey} = ${quoteIdentifier("best")}.${
    quoteIdentifier("__node_key")
  }
      GROUP BY ${reachedStart}, ${edgeTo}, ${reachedStartKey}, ${edgeToKey},
        ${bestDistance}, ${bestSteps}
      HAVING ${bestDistance} IS NULL OR
        ${order(selectedDistance, selectedSteps)} < ${
    order(bestDistance, bestSteps)
  }
    )
    SELECT ${quoteIdentifier("start")}, ${quoteIdentifier("node")},
      ${quoteIdentifier("steps")}${
    weight === undefined
      ? ""
      : `, ${quoteIdentifier("distance")} AS ${quoteIdentifier("total")}`
  }
    FROM ${distancesRelation}
    ORDER BY ${quoteIdentifier("__start_key")}, ${
    quoteIdentifier(metrics.minimize === "steps" ? "steps" : "distance")
  }, ${quoteIdentifier("__node_key")}`;
}

function temporalDistancesSelect(
  prepared: ReturnType<typeof prepareGraphTraversal>,
  direction: Exclude<GraphDirection, "both">,
  temporal: ReturnType<typeof prepareGraphTemporalSql>,
  distanceType: string,
  edgeWeight: string,
  minimize: "steps" | "weight",
  includeTotal: boolean,
): string {
  const q = quoteIdentifier;
  const startsSelect = `SELECT ${q("start")},
        ${prepared.key(q("start"))} AS ${q("__key")}
      FROM (VALUES ${prepared.startValues}) AS ${q("start_values")}(${
    q("start")
  })`;
  const costStates = buildGraphTemporalCostStateSql(
    prepared,
    startsSelect,
    direction,
    temporal,
    distanceType,
    edgeWeight,
    [],
    minimize,
  );
  const order = minimize === "steps"
    ? `${q("steps")}, ${q("distance")}`
    : `${q("distance")}, ${q("steps")}`;
  return `${costStates.withClause}
    SELECT ${q("start")}, ${q("node")}, ${q("steps")}${
    includeTotal ? `, ${q("distance")} AS ${q("total")}` : ""
  }
    FROM ${costStates.costRelation}
    QUALIFY row_number() OVER (
      PARTITION BY ${q("__start_key")}, ${q("__node_key")}
      ORDER BY ${order}
    ) = 1
    ORDER BY ${q("__start_key")}, ${
    q(minimize === "steps" ? "steps" : "distance")
  }, ${q("__node_key")}`;
}

// Distinct visited sets, metrics, and temporal boundaries are enough to extend
// summaries. No edge IDs or full connection sequences are needed. Keeping the
// visited set is necessary: equal summaries can have different legal extensions.
function summaryDistancesSelect(
  prepared: ReturnType<typeof prepareGraphTraversal>,
  direction: GraphDirection,
  temporal: ReturnType<typeof prepareGraphTemporalSql> | undefined,
  distanceType: string,
  edgeWeight: string,
  metrics: PreparedGraphMetricOptions,
  includeTotal: boolean,
  floatingWeight: boolean,
): string {
  const q = quoteIdentifier;
  const relations = prepared.relationNames([
    "graph_starts",
    "graph_temporal_settings",
    "graph_event_rows",
    "graph_edges",
    "graph_summaries",
    "graph_metric_results",
    "graph_tied_summaries",
    "graph_best_metrics",
    "graph_metric_bounds",
  ]);
  const starts = relations.graph_starts;
  const settings = relations.graph_temporal_settings;
  const events = relations.graph_event_rows;
  const edges = relations.graph_edges;
  const summaries = relations.graph_summaries;
  const results = relations.graph_metric_results;
  const tied = relations.graph_tied_summaries;
  const ref = (alias: string, column: string) => `${q(alias)}.${q(column)}`;
  const searchDirection = direction as Exclude<GraphDirection, "both">;
  const firstAnchor = temporal?.journeyAnchor("edges", searchDirection);
  const sum = `CAST(${ref("reached", "distance")} + ${
    ref("edges", "__weight")
  } AS ${distanceType})`;
  // Reported costs must not reject routes before the primary objective has
  // selected its results. NULL marks overflow and propagates through sums;
  // non-negative weights cannot bring an overflowing total back into range.
  const nextDistance = metrics.minimize === "weight" ? sum : `TRY(${sum})`;
  const temporalColumns = temporal === undefined
    ? ""
    : `, ${q("__event_start")}, ${q("__event_end")}`;
  const eventValues = temporal === undefined
    ? ""
    : `, ${ref("edges", "__event_start")}, ${ref("edges", "__event_end")}`;
  const metric = metrics.minimize === "steps"
    ? q("steps")
    : metrics.minimize === "weight"
    ? q("distance")
    : q("__elapsed");
  // Use native time precision for selection. Collapse equal reported values
  // after conversion to milliseconds, since these are summary rows.
  const reportedElapsed = metrics.elapsedTime
    ? `, ${temporal!.elapsedMilliseconds(q("__elapsed"))} AS ${
      q("elapsedTimeMs")
    }`
    : "";
  const order = metrics.minimize === "steps"
    ? [
      q("steps"),
      q("__node_key"),
      ...(includeTotal ? [q("total")] : []),
      ...(metrics.elapsedTime ? [q("elapsedTimeMs")] : []),
    ]
    : metrics.minimize === "weight"
    ? [
      q("total"),
      q("__node_key"),
      q("steps"),
      ...(metrics.elapsedTime ? [q("elapsedTimeMs")] : []),
    ]
    : [
      q("elapsedTimeMs"),
      q("__node_key"),
      q("steps"),
      ...(includeTotal ? [q("total")] : []),
    ];

  const bounds = summaryBoundsSql(
    relations.graph_best_metrics,
    relations.graph_metric_bounds,
    starts,
    edges,
    settings,
    temporal,
    searchDirection,
    metrics.minimize,
    distanceType,
    floatingWeight,
  );

  return `WITH RECURSIVE ${settings} AS (
      ${
    temporal === undefined
      ? `SELECT 0 AS ${q("__gap")}`
      : `SELECT CAST(? AS HUGEINT) AS ${q("__gap")}`
  }
    ), ${events} AS MATERIALIZED (
      ${
    prepared.edges(direction, [
      `${edgeWeight} AS ${q("__weight")}`,
      ...(temporal?.eventSelections("edges") ?? []),
    ])
  }
    ), ${edges} AS MATERIALIZED (
      SELECT DISTINCT ${q("__from")}, ${q("__to")}, ${q("__from_key")},
        ${q("__to_key")}, ${q("__weight")}${temporalColumns}
      FROM ${events} AS ${q("events")}
      ${
    temporal === undefined ? "" : `WHERE ${temporal.eventValidity("events")}`
  }
    ), ${starts} AS (
      SELECT ${q("start")}, ${prepared.key(q("start"))} AS ${q("__key")}
      FROM (VALUES ${prepared.startValues}) AS ${q("start_values")}(${
    q("start")
  })
    ), ${bounds.ctes}, ${summaries}(
      ${q("start")}, ${q("node")}, ${q("__start_key")}, ${q("__node_key")},
      ${q("__visited")}, ${q("steps")}, ${q("distance")}${temporalColumns}${
    metrics.elapsedTime ? `, ${q("__anchor")}` : ""
  }
    ) AS (
      SELECT ${ref("starts", "start")}, ${ref("edges", "__to")},
        ${ref("starts", "__key")}, ${ref("edges", "__to_key")},
        list_sort(list_distinct([${ref("starts", "__key")}, ${
    ref("edges", "__to_key")
  }])),
        CAST(1 AS BIGINT), ${ref("edges", "__weight")}${eventValues}${
    metrics.elapsedTime ? `, ${firstAnchor}` : ""
  }
      FROM ${starts} AS ${q("starts")}
      INNER JOIN ${edges} AS ${q("edges")}
        ON ${ref("starts", "__key")} = ${ref("edges", "__from_key")}
      ${bounds.join(ref("starts", "__key"))}
      WHERE ${
    bounds.test("CAST(1 AS BIGINT)", ref("edges", "__weight"), firstAnchor)
  }
      UNION
      SELECT ${ref("reached", "start")}, ${ref("edges", "__to")},
        ${ref("reached", "__start_key")}, ${ref("edges", "__to_key")},
        list_sort(list_distinct(list_append(${ref("reached", "__visited")}, ${
    ref("edges", "__to_key")
  }))),
        ${ref("reached", "steps")} + 1, ${nextDistance}${eventValues}${
    metrics.elapsedTime ? `, ${ref("reached", "__anchor")}` : ""
  }
      FROM ${summaries} AS ${q("reached")}
      INNER JOIN ${edges} AS ${q("edges")}
        ON ${ref("reached", "__node_key")} = ${ref("edges", "__from_key")}
      CROSS JOIN ${settings} AS ${q("settings")}
      ${bounds.join(ref("reached", "__start_key"))}
      WHERE ${
    bounds.test(
      `${ref("reached", "steps")} + 1`,
      nextDistance,
      ref("reached", "__anchor"),
    )
  }
        AND ${ref("reached", "__node_key")} <> ${ref("reached", "__start_key")}
        AND (NOT list_contains(${ref("reached", "__visited")}, ${
    ref("edges", "__to_key")
  })
          OR ${ref("edges", "__to_key")} = ${ref("reached", "__start_key")})
        ${
    temporal === undefined ? "" : `AND ${
      temporal.transition(
        "reached",
        "edges",
        searchDirection,
        ref("settings", "__gap"),
      )
    }`
  }
    ), ${results} AS (
      SELECT *${
    metrics.elapsedTime
      ? `, ${
        temporal!.journeyElapsed(
          "summaries",
          ref("summaries", "__anchor"),
          searchDirection,
        )
      } AS ${q("__elapsed")}`
      : ""
  }
      FROM ${summaries} AS ${q("summaries")}
    ), ${tied} AS MATERIALIZED (
      SELECT DISTINCT ${q("start")}, ${q("node")}, ${q("__start_key")}, ${
    q("__node_key")
  },
        ${q("steps")}${
    includeTotal ? `, ${q("distance")} AS ${q("total")}` : ""
  }${reportedElapsed}
      FROM ${results}
      QUALIFY ${metric} = MIN(${metric}) OVER (
        PARTITION BY ${q("__start_key")}, ${q("__node_key")}
      )
    )
    SELECT ${q("start")}, ${q("node")}, ${q("steps")}${
    includeTotal
      ? `, CASE WHEN ${q("total")} IS NULL
          THEN error('distances() total exceeds the supported ${distanceType} range for an optimal route.')
          ELSE ${q("total")} END AS ${q("total")}`
      : ""
  }${metrics.elapsedTime ? `, ${q("elapsedTimeMs")}` : ""}
    FROM ${tied}
    ORDER BY ${q("__start_key")}, ${order.join(", ")}`;
}

// Compute primary optima without enumerating visited sets. Exact additive
// objectives have optimal prefixes (at the same event boundary in temporal
// traversal). Floating addition can erase prefix differences, and elapsed
// optima can depend on a later departure, so those use a per-start upper bound.
function summaryBoundsSql(
  best: string,
  limits: string,
  starts: string,
  edges: string,
  settings: string,
  temporal: ReturnType<typeof prepareGraphTemporalSql> | undefined,
  direction: Exclude<GraphDirection, "both">,
  minimize: PreparedGraphMetricOptions["minimize"],
  distanceType: string,
  floatingWeight: boolean,
) {
  const q = quoteIdentifier;
  const ref = (alias: string, column: string) => `${q(alias)}.${q(column)}`;
  const elapsed = minimize === "elapsedTime";
  const globalBound = elapsed || (minimize === "weight" && floatingWeight);
  const boundaries = temporal === undefined
    ? []
    : ["__event_start", "__event_end"];
  const keys = [
    "__start_key",
    "__node_key",
    ...boundaries,
    ...(elapsed ? ["__anchor"] : []),
  ];
  const firstAnchor = elapsed
    ? temporal!.journeyAnchor("edges", direction)
    : undefined;
  const firstKeys = [
    ref("starts", "__key"),
    ref("edges", "__to_key"),
    ...boundaries.map((key) => ref("edges", key)),
    ...(elapsed ? [firstAnchor!] : []),
  ];
  const nextKeys = [
    ref("reached", "__start_key"),
    ref("edges", "__to_key"),
    ...boundaries.map((key) => ref("edges", key)),
    ...(elapsed ? [ref("reached", "__anchor")] : []),
  ];
  const firstMetric = minimize === "steps"
    ? "CAST(1 AS BIGINT)"
    : elapsed
    ? temporal!.journeyElapsed("edges", firstAnchor!, direction)
    : ref("edges", "__weight");
  const nextMetric = minimize === "steps"
    ? `${ref("reached", "__metric")} + 1`
    : elapsed
    ? temporal!.journeyElapsed("edges", ref("reached", "__anchor"), direction)
    : `CAST(${ref("reached", "__metric")} + ${
      ref("edges", "__weight")
    } AS ${distanceType})`;
  const minimum = `MIN(${nextMetric})`;
  const bestMetric = ref("best", "__metric");
  const ctes = `${best}(${keys.map(q).join(", ")}, ${q("__metric")})
    USING KEY(${keys.map(q).join(", ")}) AS (
      SELECT ${firstKeys.join(", ")}, MIN(${firstMetric})
      FROM ${starts} AS ${q("starts")}
      INNER JOIN ${edges} AS ${q("edges")}
        ON ${ref("starts", "__key")} = ${ref("edges", "__from_key")}
      GROUP BY ${firstKeys.join(", ")}
      UNION
      SELECT ${nextKeys.join(", ")}, ${minimum}
      FROM ${best} AS ${q("reached")}
      INNER JOIN ${edges} AS ${q("edges")}
        ON ${ref("reached", "__node_key")} = ${ref("edges", "__from_key")}
      CROSS JOIN ${settings} AS ${q("settings")}
      LEFT JOIN recurring.${best} AS ${q("best")}
        ON ${
    keys.map((key, i) => `${ref("best", key)} = ${nextKeys[i]}`).join(" AND ")
  }
      WHERE ${ref("reached", "__node_key")} <> ${ref("reached", "__start_key")}
        ${
    temporal === undefined ? "" : `AND ${
      temporal.transition(
        "reached",
        "edges",
        direction,
        ref("settings", "__gap"),
      )
    }`
  }
      GROUP BY ${nextKeys.join(", ")}, ${bestMetric}
      HAVING ${bestMetric} IS NULL OR ${minimum} < ${bestMetric}
    )${
    globalBound
      ? `, ${limits} AS (
      SELECT ${q("__start_key")}, MAX(${q("__minimum")}) AS ${q("__metric")}
      FROM (
        SELECT ${q("__start_key")}, ${q("__node_key")}, MIN(${
        q("__metric")
      }) AS ${q("__minimum")}
        FROM ${best}
        GROUP BY ${q("__start_key")}, ${q("__node_key")}
      ) AS ${q("minima")}
      GROUP BY ${q("__start_key")}
    )`
      : ""
  }`;
  return {
    ctes,
    join: (startKey: string) =>
      `INNER JOIN ${globalBound ? limits : best} AS ${q("bounds")}
      ON ${ref("bounds", "__start_key")} = ${startKey}
      ${
        globalBound
          ? ""
          : `AND ${ref("bounds", "__node_key")} = ${ref("edges", "__to_key")}
        ${
            boundaries.map((key) =>
              `AND ${ref("bounds", key)} = ${ref("edges", key)}`
            ).join(" ")
          }`
      }`,
    test: (steps: string, distance: string, anchor: string | undefined) => {
      const metric = minimize === "steps"
        ? steps
        : elapsed
        ? temporal!.journeyElapsed("edges", anchor!, direction)
        : distance;
      return `${metric} ${globalBound ? "<=" : "="} ${
        ref("bounds", "__metric")
      }`;
    },
  };
}
