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
  minimize?: "weight" | "elapsedTime";
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
        distance: validated.distanceType,
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
  if (temporalOptions !== undefined) {
    const temporal = prepareGraphTemporalSql(
      schema,
      temporalOptions,
      "distances()",
    );
    if (metrics.elapsedTime) {
      return elapsedDistancesSelect(
        prepared,
        direction as Exclude<GraphDirection, "both">,
        temporal,
        distanceType,
        edgeWeight,
        metrics.minimize,
      );
    }
    return temporalDistancesSelect(
      prepared,
      direction as Exclude<GraphDirection, "both">,
      temporal,
      distanceType,
      edgeWeight,
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
      ${quoteIdentifier("distance")}
    ) USING KEY(
      ${quoteIdentifier("__start_key")}, ${quoteIdentifier("__node_key")}
    ) AS (
      SELECT ${start}, ${edgeTo}, ${startKey}, ${edgeToKey},
        MIN(${edgeCost}) AS ${quoteIdentifier("distance")}
      FROM ${startsRelation} AS ${quoteIdentifier("starts")}
      INNER JOIN ${edgesRelation} AS ${quoteIdentifier("edges")}
        ON ${startKey} = ${edgeFromKey}
      GROUP BY ${start}, ${edgeTo}, ${startKey}, ${edgeToKey}
      UNION
      SELECT ${reachedStart}, ${edgeTo}, ${reachedStartKey}, ${edgeToKey},
        MIN(${candidateDistance}) AS ${quoteIdentifier("distance")}
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
        ${bestDistance}
      HAVING ${bestDistance} IS NULL OR MIN(${candidateDistance}) < ${bestDistance}
    )
    SELECT ${quoteIdentifier("start")}, ${quoteIdentifier("node")},
      ${quoteIdentifier("distance")}
    FROM ${distancesRelation}
    ORDER BY ${quoteIdentifier("__start_key")}, ${
    quoteIdentifier("distance")
  }, ${quoteIdentifier("__node_key")}`;
}

function temporalDistancesSelect(
  prepared: ReturnType<typeof prepareGraphTraversal>,
  direction: Exclude<GraphDirection, "both">,
  temporal: ReturnType<typeof prepareGraphTemporalSql>,
  distanceType: string,
  edgeWeight: string,
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
  );
  return `${costStates.withClause}
    SELECT ${q("start")}, ${q("node")},
      MIN(${q("distance")}) AS ${q("distance")}
    FROM ${costStates.costRelation}
    GROUP BY ${q("start")}, ${q("node")}, ${q("__start_key")},
      ${q("__node_key")}
    ORDER BY ${q("__start_key")}, ${q("distance")}, ${q("__node_key")}`;
}

function elapsedDistancesSelect(
  prepared: ReturnType<typeof prepareGraphTraversal>,
  direction: Exclude<GraphDirection, "both">,
  temporal: ReturnType<typeof prepareGraphTemporalSql>,
  distanceType: string,
  edgeWeight: string,
  minimize: PreparedGraphMetricOptions["minimize"],
): string {
  const q = quoteIdentifier;
  const relations = prepared.relationNames([
    "graph_starts",
    "graph_temporal_settings",
    "graph_event_rows",
    "graph_edges",
    "graph_elapsed_states",
    "graph_elapsed_results",
  ]);
  const starts = relations.graph_starts;
  const settings = relations.graph_temporal_settings;
  const events = relations.graph_event_rows;
  const edges = relations.graph_edges;
  const states = relations.graph_elapsed_states;
  const results = relations.graph_elapsed_results;
  const ref = (alias: string, column: string) => `${q(alias)}.${q(column)}`;
  const anchor = temporal.journeyAnchor("edges", direction);
  const reachedAnchor = ref("reached", "__anchor");
  const candidateDistance = `CAST(${ref("reached", "distance")} + ${
    ref("edges", "__weight")
  } AS ${distanceType})`;
  const order = minimize === "elapsedTime"
    ? `${q("__elapsed")}, ${q("distance")}`
    : `${q("distance")}, ${q("__elapsed")}`;

  // A physical event and the first departure (last arrival for incoming
  // traversal) fix elapsed time. Keep the cheapest cost for each such state;
  // merging different anchors would lose later-departing, faster journeys.
  // The state space is finite, and strict improvements terminate zero cycles.
  return `WITH RECURSIVE ${settings} AS MATERIALIZED (
      SELECT CAST(? AS HUGEINT) AS ${q("__gap")}
    ), ${events} AS MATERIALIZED (
      ${
    prepared.edges(direction, [
      `${edgeWeight} AS ${q("__weight")}`,
      ...temporal.eventSelections("edges"),
    ])
  }
    ), ${edges} AS MATERIALIZED (
      SELECT * FROM ${events} AS ${q("events")}
      WHERE ${temporal.eventValidity("events")}
    ), ${starts} AS MATERIALIZED (
      SELECT ${q("start")}, ${prepared.key(q("start"))} AS ${q("__key")}
      FROM (VALUES ${prepared.startValues}) AS ${q("start_values")}(${
    q("start")
  })
    ), ${states}(
      ${q("start")}, ${q("node")}, ${q("__start_key")}, ${q("__node_key")},
      ${q("__event_id")}, ${q("__event_start")}, ${q("__event_end")},
      ${q("__anchor")}, ${q("distance")}
    ) USING KEY(${q("__start_key")}, ${q("__event_id")}, ${q("__anchor")}) AS (
      SELECT ${ref("starts", "start")}, ${ref("edges", "__to")},
        ${ref("starts", "__key")}, ${ref("edges", "__to_key")},
        ${ref("edges", "__event_id")}, ${ref("edges", "__event_start")},
        ${ref("edges", "__event_end")}, ${anchor}, ${ref("edges", "__weight")}
      FROM ${starts} AS ${q("starts")}
      INNER JOIN ${edges} AS ${q("edges")}
        ON ${ref("starts", "__key")} = ${ref("edges", "__from_key")}
      UNION
      SELECT ${ref("reached", "start")}, ${ref("edges", "__to")},
        ${ref("reached", "__start_key")}, ${ref("edges", "__to_key")},
        ${ref("edges", "__event_id")}, ${ref("edges", "__event_start")},
        ${ref("edges", "__event_end")}, ${reachedAnchor},
        MIN(${candidateDistance}) AS ${q("distance")}
      FROM ${states} AS ${q("reached")}
      INNER JOIN ${edges} AS ${q("edges")}
        ON ${ref("reached", "__node_key")} = ${ref("edges", "__from_key")}
      CROSS JOIN ${settings} AS ${q("settings")}
      LEFT JOIN recurring.${states} AS ${q("best")}
        ON ${ref("reached", "__start_key")} = ${ref("best", "__start_key")}
        AND ${ref("edges", "__event_id")} = ${ref("best", "__event_id")}
        AND ${reachedAnchor} = ${ref("best", "__anchor")}
      WHERE ${
    temporal.transition("reached", "edges", direction, ref("settings", "__gap"))
  }
      GROUP BY ${ref("reached", "start")}, ${ref("edges", "__to")},
        ${ref("reached", "__start_key")}, ${ref("edges", "__to_key")},
        ${ref("edges", "__event_id")}, ${ref("edges", "__event_start")},
        ${ref("edges", "__event_end")}, ${reachedAnchor}, ${
    ref("best", "distance")
  }
      HAVING ${ref("best", "distance")} IS NULL OR
        MIN(${candidateDistance}) < ${ref("best", "distance")}
    ), ${results} AS (
      SELECT *, ${
    temporal.journeyElapsed("states", ref("states", "__anchor"), direction)
  } AS ${q("__elapsed")}
      FROM ${states} AS ${q("states")}
    )
    SELECT ${q("start")}, ${q("node")}, ${q("distance")},
      ${temporal.elapsedMilliseconds(q("__elapsed"))} AS ${q("elapsedTimeMs")}
    FROM ${results}
    QUALIFY row_number() OVER (
      PARTITION BY ${q("__start_key")}, ${q("__node_key")}
      ORDER BY ${order}, ${q("__event_id")}, ${q("__anchor")}
    ) = 1
    ORDER BY ${q("__start_key")}, ${order}, ${q("__node_key")}`;
}
