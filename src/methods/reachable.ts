import type SimpleTable from "../class/SimpleTable.ts";
import buildGraphTemporalReachabilitySql from "../helpers/buildGraphTemporalReachabilitySql.ts";
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

type ReachableOptions = GraphTemporalOptions & {
  direction?: GraphDirection;
  outputTable?: string | boolean;
};

export default function reachable(
  simpleTable: SimpleTable,
  sourceColumn: string,
  targetColumn: string,
  startNodes: GraphId | GraphId[],
  options: ReachableOptions = {},
): SimpleTable {
  if (typeof sourceColumn !== "string") {
    throw new TypeError("reachable() sourceColumn must be a string.");
  }
  if (typeof targetColumn !== "string") {
    throw new TypeError("reachable() targetColumn must be a string.");
  }
  if (
    options === null || typeof options !== "object" || Array.isArray(options)
  ) {
    throw new TypeError("reachable() options must be an object.");
  }
  if (
    options.direction !== undefined &&
    !["outgoing", "incoming", "both"].includes(options.direction)
  ) {
    throw new TypeError(
      'reachable() options.direction must be "outgoing", "incoming", or "both".',
    );
  }
  if (
    options.outputTable !== undefined &&
    typeof options.outputTable !== "string" &&
    typeof options.outputTable !== "boolean"
  ) {
    throw new TypeError(
      "reachable() options.outputTable must be a string or boolean.",
    );
  }

  const preparedStarts = prepareGraphStarts(
    startNodes,
    "reachable()",
    "startNodes",
  );
  const direction = options.direction ?? "outgoing";
  const temporalOptions = prepareGraphTemporalOptions(
    options,
    direction,
    "reachable()",
  );
  options = structuredClone(options);
  const parameters = {
    sourceColumn,
    targetColumn,
    startNodes: structuredClone(startNodes),
    options,
  };

  return queueGraphResult(simpleTable, {
    method: "reachable()",
    parameters,
    outputTable: options.outputTable,
    preflight: temporalOptions === undefined
      ? undefined
      : (input) =>
        validateGraphTemporalEvents(
          input,
          temporalOptions,
          "reachable()",
          parameters,
        ),
    values: (schema) => {
      const { temporal } = validateInputs(
        schema,
        sourceColumn,
        targetColumn,
        preparedStarts,
        temporalOptions,
      );
      return temporal === undefined
        ? preparedStarts.values
        : [temporal.gapParameter, ...preparedStarts.values];
    },
    buildSelect: (input, schema) =>
      reachableSelect(
        input,
        schema,
        sourceColumn,
        targetColumn,
        preparedStarts,
        direction,
        temporalOptions,
      ),
    outputSchema: (schema) => {
      const { endpoints } = validateInputs(
        schema,
        sourceColumn,
        targetColumn,
        preparedStarts,
        temporalOptions,
      );
      return {
        start: endpoints.idType,
        node: endpoints.idType,
      };
    },
  });
}

function validateInputs(
  schema: TableSchema,
  source: string,
  target: string,
  starts: PreparedGraphStarts,
  temporalOptions: PreparedGraphTemporalOptions | undefined,
) {
  const endpoints = validateGraphStarts(
    schema,
    source,
    target,
    starts,
    "reachable()",
    "startNodes",
  );
  const temporal = temporalOptions === undefined
    ? undefined
    : prepareGraphTemporalSql(schema, temporalOptions, "reachable()");
  return { endpoints, temporal };
}

function reachableSelect(
  input: string,
  schema: TableSchema,
  source: string,
  target: string,
  starts: PreparedGraphStarts,
  direction: GraphDirection,
  temporalOptions: PreparedGraphTemporalOptions | undefined,
): string {
  const prepared = prepareGraphTraversal(
    input,
    schema,
    source,
    target,
    starts,
    "reachable()",
    "startNodes",
  );
  if (temporalOptions !== undefined) {
    const temporal = prepareGraphTemporalSql(
      schema,
      temporalOptions,
      "reachable()",
    );
    return temporalReachableSelect(
      prepared,
      direction as Exclude<GraphDirection, "both">,
      temporal,
    );
  }
  const relations = prepared.relationNames([
    "graph_start_values",
    "graph_starts",
    "graph_edges",
    "graph_reachable",
  ]);
  const startValuesRelation = relations.graph_start_values;
  const startsRelation = relations.graph_starts;
  const edgesRelation = relations.graph_edges;
  const reachableRelation = relations.graph_reachable;
  const start = `${quoteIdentifier("starts")}.${quoteIdentifier("start")}`;
  const startKey = `${quoteIdentifier("starts")}.${quoteIdentifier("__key")}`;
  const reachedStart = `${quoteIdentifier("reached")}.${
    quoteIdentifier("start")
  }`;
  const reachedStartKey = `${quoteIdentifier("reached")}.${
    quoteIdentifier("__start_key")
  }`;
  const edgeTo = `${quoteIdentifier("edges")}.${quoteIdentifier("__to")}`;
  const edgeToKey = `${quoteIdentifier("edges")}.${
    quoteIdentifier("__to_key")
  }`;
  const edgeFromKey = `${quoteIdentifier("edges")}.${
    quoteIdentifier("__from_key")
  }`;
  const reachedNodeKey = `${quoteIdentifier("reached")}.${
    quoteIdentifier("__node_key")
  }`;

  return `WITH RECURSIVE ${startValuesRelation}(${
    quoteIdentifier("start")
  }) AS (
      VALUES ${prepared.startValues}
    ), ${startsRelation} AS (
      SELECT ${quoteIdentifier("start")},
        ${prepared.key(quoteIdentifier("start"))} AS ${quoteIdentifier("__key")}
      FROM ${startValuesRelation}
    ), ${edgesRelation} AS (
      ${prepared.edges(direction)}
    ), ${reachableRelation}(
      ${quoteIdentifier("start")}, ${quoteIdentifier("node")},
      ${quoteIdentifier("__start_key")}, ${quoteIdentifier("__node_key")}
    ) AS (
      SELECT ${start}, ${edgeTo}, ${startKey}, ${edgeToKey}
      FROM ${startsRelation} AS ${quoteIdentifier("starts")}
      INNER JOIN ${edgesRelation} AS ${quoteIdentifier("edges")}
        ON ${startKey} = ${edgeFromKey}
      UNION
      SELECT ${reachedStart}, ${edgeTo}, ${reachedStartKey}, ${edgeToKey}
      FROM ${reachableRelation} AS ${quoteIdentifier("reached")}
      INNER JOIN ${edgesRelation} AS ${quoteIdentifier("edges")}
        ON ${reachedNodeKey} = ${edgeFromKey}
    )
    SELECT ${quoteIdentifier("start")}, ${quoteIdentifier("node")}
    FROM ${reachableRelation}
    ORDER BY ${quoteIdentifier("__start_key")}, ${
    quoteIdentifier("__node_key")
  }`;
}

function temporalReachableSelect(
  prepared: ReturnType<typeof prepareGraphTraversal>,
  direction: Exclude<GraphDirection, "both">,
  temporal: ReturnType<typeof prepareGraphTemporalSql>,
): string {
  const q = quoteIdentifier;
  const startsSelect = `SELECT ${q("start")},
        ${prepared.key(q("start"))} AS ${q("__key")}
      FROM (VALUES ${prepared.startValues}) AS ${q("start_values")}(${
    q("start")
  })`;
  const reachability = buildGraphTemporalReachabilitySql(
    prepared,
    startsSelect,
    direction,
    temporal,
  );
  return `${reachability.withClause}
    SELECT ${q("start")}, ${q("node")}
    FROM (
      SELECT DISTINCT ${q("start")}, ${q("node")},
        ${q("__start_key")}, ${q("__node_key")}
      FROM ${reachability.reachableRelation}
    ) AS ${q("reachable_nodes")}
    ORDER BY ${q("__start_key")}, ${q("__node_key")}`;
}
