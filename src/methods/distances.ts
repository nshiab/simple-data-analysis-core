import type SimpleTable from "../class/SimpleTable.ts";
import getGraphWeightColumn from "../helpers/getGraphWeightColumn.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
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

type DistancesOptions = {
  direction?: GraphDirection;
  outputTable?: string | boolean;
  weight?: string;
};

export default function distances(
  simpleTable: SimpleTable,
  source: string,
  target: string,
  start: GraphId | GraphId[],
  options: DistancesOptions = {},
): SimpleTable {
  if (typeof source !== "string") {
    throw new TypeError("distances() source must be a string.");
  }
  if (typeof target !== "string") {
    throw new TypeError("distances() target must be a string.");
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

  const preparedStarts = prepareGraphStarts(start, "distances()");
  options = structuredClone(options);
  const direction = options.direction ?? "outgoing";
  const parameters = {
    source,
    target,
    start: structuredClone(start),
    options,
  };

  return queueGraphResult(simpleTable, {
    method: "distances()",
    parameters,
    outputTable: options.outputTable,
    values: (schema) => {
      validateDistanceInputs(
        schema,
        source,
        target,
        preparedStarts,
        options.weight,
      );
      return preparedStarts.values;
    },
    buildSelect: (input, schema) =>
      distancesSelect(
        input,
        schema,
        source,
        target,
        preparedStarts,
        direction,
        options.weight,
      ),
    outputSchema: (schema) => {
      const validated = validateDistanceInputs(
        schema,
        source,
        target,
        preparedStarts,
        options.weight,
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
) {
  const endpoints = validateGraphStarts(
    schema,
    source,
    target,
    starts,
    "distances()",
  );
  const distanceType = weight === undefined
    ? "BIGINT"
    : getGraphWeightColumn(schema, weight, "distances()").distanceType;
  return { idType: endpoints.idType, distanceType };
}

function distancesSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  starts: PreparedGraphStarts,
  direction: GraphDirection,
  weight: string | undefined,
): string {
  const prepared = prepareGraphTraversal(
    input,
    schema,
    source,
    target,
    starts,
    "distances()",
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
  const relations = prepared.relationNames([
    "graph_start_values",
    "graph_starts",
    "graph_edges",
    "graph_nodes",
    "graph_distances",
  ]);
  const startValuesRelation = relations.graph_start_values;
  const startsRelation = relations.graph_starts;
  const edgesRelation = relations.graph_edges;
  const nodesRelation = relations.graph_nodes;
  const distancesRelation = relations.graph_distances;
  const start = `${quoteIdentifier("starts")}.${quoteIdentifier("start")}`;
  const startKey = `${quoteIdentifier("starts")}.${quoteIdentifier("__key")}`;
  const nodeKey = `${quoteIdentifier("nodes")}.${quoteIdentifier("__key")}`;
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
    ), ${nodesRelation} AS (
      SELECT ${quoteIdentifier("__from")} AS ${quoteIdentifier("node")},
        ${quoteIdentifier("__from_key")} AS ${quoteIdentifier("__key")}
      FROM ${edgesRelation}
      UNION
      SELECT ${quoteIdentifier("__to")} AS ${quoteIdentifier("node")},
        ${quoteIdentifier("__to_key")} AS ${quoteIdentifier("__key")}
      FROM ${edgesRelation}
    ), ${distancesRelation}(
      ${quoteIdentifier("start")}, ${quoteIdentifier("node")},
      ${quoteIdentifier("__start_key")}, ${quoteIdentifier("__node_key")},
      ${quoteIdentifier("distance")}
    ) USING KEY(
      ${quoteIdentifier("__start_key")}, ${quoteIdentifier("__node_key")}
    ) AS (
      SELECT ${start}, ${start}, ${startKey}, ${startKey},
        CAST(0 AS ${distanceType}) AS ${quoteIdentifier("distance")}
      FROM ${startsRelation} AS ${quoteIdentifier("starts")}
      INNER JOIN ${nodesRelation} AS ${quoteIdentifier("nodes")}
        ON ${startKey} = ${nodeKey}
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
    quoteIdentifier("__node_key")
  }`;
}
