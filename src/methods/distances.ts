import type SimpleTable from "../class/SimpleTable.ts";
import buildGraphTemporalCostStateSql from "../helpers/buildGraphTemporalCostStateSql.ts";
import getGraphWeightColumn from "../helpers/getGraphWeightColumn.ts";
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
