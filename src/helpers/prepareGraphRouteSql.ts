import getGraphEdgeIdColumn from "./getGraphEdgeIdColumn.ts";
import getGraphWeightColumn from "./getGraphWeightColumn.ts";
import type { TableSchema } from "./pendingOps.ts";
import prepareGraphStarts, {
  type GraphId,
  type PreparedGraphStarts,
} from "./prepareGraphStarts.ts";
import prepareGraphTraversal, {
  validateGraphStarts,
} from "./prepareGraphTraversal.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

export type PreparedGraphRouteEndpoints = {
  end: PreparedGraphStarts;
  start: PreparedGraphStarts;
  values: PreparedGraphStarts;
};

/** Prepares and validates the two scalar endpoints shared by route methods. */
export function prepareGraphRouteEndpoints(
  start: GraphId,
  end: GraphId,
  method: string,
): PreparedGraphRouteEndpoints {
  if (Array.isArray(start)) {
    throw new TypeError(`${method} start must be one node ID.`);
  }
  if (Array.isArray(end)) {
    throw new TypeError(`${method} end must be one node ID.`);
  }
  const preparedStart = prepareGraphStarts(start, method);
  const preparedEnd = prepareGraphStarts(end, method);
  if (preparedStart.family !== preparedEnd.family) {
    throw new TypeError(
      `${method} start and end must both be string IDs or both be numeric IDs.`,
    );
  }
  if (preparedStart.values[0] === preparedEnd.values[0]) {
    throw new TypeError(
      `${method} start and end must be different. Use distances() for a zero-distance result or findCycles() to find loops.`,
    );
  }
  return {
    start: preparedStart,
    end: preparedEnd,
    values: {
      family: preparedStart.family,
      numericValues: [
        ...preparedStart.numericValues,
        ...preparedEnd.numericValues,
      ],
      values: [preparedStart.values[0], preparedEnd.values[0]],
    },
  };
}

/** Validates the columns shared by edge-route methods from queued schema data. */
export function validateGraphRouteInputs(
  schema: TableSchema,
  source: string,
  target: string,
  edgeId: string,
  endpoints: PreparedGraphRouteEndpoints,
  weight: string | undefined,
  method: string,
) {
  const nodes = validateGraphStarts(
    schema,
    source,
    target,
    endpoints.values,
    method,
  );
  const edges = getGraphEdgeIdColumn(schema, edgeId, method);
  const weightColumn = weight === undefined
    ? undefined
    : getGraphWeightColumn(schema, weight, method);
  return {
    distanceType: weightColumn?.distanceType ?? "BIGINT",
    edgeIdType: edges.idType,
    nodeIdType: nodes.idType,
  };
}

/** Prepares the typed SQL expressions shared by edge-route enumeration. */
export function prepareGraphRouteSql(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  edgeId: string,
  endpoints: PreparedGraphRouteEndpoints,
  weight: string | undefined,
  method: string,
) {
  const traversal = prepareGraphTraversal(
    input,
    schema,
    source,
    target,
    endpoints.values,
    method,
  );
  const edgeIdColumn = getGraphEdgeIdColumn(schema, edgeId, method);
  const weightColumn = weight === undefined
    ? undefined
    : getGraphWeightColumn(schema, weight, method);
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
  const keyType = edgeIdColumn.family === "string"
    ? "BLOB"
    : edgeIdColumn.idType;
  const stepType = `STRUCT(${q("edgeId")} ${edgeIdColumn.idType}, ${
    q("source")
  } ${traversal.endpoints.idType}, ${
    q("target")
  } ${traversal.endpoints.idType}, ${q("weight")} ${distanceType}, ${
    q("distance")
  } ${distanceType})`;

  return {
    distanceType,
    edgeIdColumn,
    edgeKey,
    edgeWeight,
    endpointValue: `TRY_CAST(? AS ${traversal.endpoints.idType})`,
    keyType,
    stepType,
    traversal,
    typedEdgeId,
    weightType: weightColumn?.type,
  };
}

/** Builds the fixed public projection from ranked route step lists. */
export function graphRouteResultSelect(rankedRelation: string): string {
  const q = quoteIdentifier;
  return `SELECT ${q("pathId")}, CAST(${q("step")} AS BIGINT) AS ${q("step")},
      ${q("route_step")}.${q("edgeId")} AS ${q("edgeId")},
      ${q("route_step")}.${q("source")} AS ${q("source")},
      ${q("route_step")}.${q("target")} AS ${q("target")},
      ${q("route_step")}.${q("weight")} AS ${q("weight")},
      ${q("route_step")}.${q("distance")} AS ${q("distance")}
    FROM ${rankedRelation},
      UNNEST(${q("steps")}) WITH ORDINALITY AS ${q("unnested")}(${
    q("route_step")
  }, ${q("step")})
    ORDER BY ${q("pathId")}, ${q("step")}`;
}
