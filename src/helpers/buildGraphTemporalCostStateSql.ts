import type { PreparedGraphTemporalSql } from "./prepareGraphTemporalSql.ts";
import type {
  GraphDirection,
  PreparedGraphSql,
} from "./prepareGraphTraversal.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

export type GraphTemporalCostStateSql = {
  costRelation: string;
  edgesRelation: string;
  withClause: string;
};

/** Builds keyed best-cost chronological states from an arbitrary start relation. */
export default function buildGraphTemporalCostStateSql(
  prepared: PreparedGraphSql,
  startsSelect: string | ((validEdgesRelation: string) => string),
  direction: Exclude<GraphDirection, "both">,
  temporal: PreparedGraphTemporalSql,
  distanceType: string,
  edgeWeight: string,
): GraphTemporalCostStateSql {
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
  const reachedDistance = `${q("reached")}.${q("distance")}`;
  const edgeTo = `${q("edges")}.${q("__to")}`;
  const edgeToKey = `${q("edges")}.${q("__to_key")}`;
  const edgeFromKey = `${q("edges")}.${q("__from_key")}`;
  const eventId = `${q("edges")}.${q("__event_id")}`;
  const eventStart = `${q("edges")}.${q("__event_start")}`;
  const eventEnd = `${q("edges")}.${q("__event_end")}`;
  const edgeCost = `${q("edges")}.${q("__weight")}`;
  const bestDistance = `${q("best")}.${q("distance")}`;
  const gap = `${q("settings")}.${q("__gap")}`;
  const candidateDistance =
    `CAST(${reachedDistance} + ${edgeCost} AS ${distanceType})`;
  const resolvedStartsSelect = typeof startsSelect === "string"
    ? startsSelect
    : startsSelect(edgesRelation);

  return {
    costRelation,
    edgesRelation,
    withClause: `WITH RECURSIVE ${settingsRelation} AS MATERIALIZED (
      SELECT CAST(? AS HUGEINT) AS ${q("__gap")}
    ), ${eventRowsRelation} AS MATERIALIZED (
      ${
      prepared.edges(direction, [
        `${edgeWeight} AS ${q("__weight")}`,
        ...temporal.eventSelections("edges"),
      ])
    }
    ), ${edgesRelation} AS MATERIALIZED (
      SELECT *
      FROM ${eventRowsRelation} AS ${q("events")}
      WHERE ${temporal.eventValidity("events")}
    ), ${startsRelation} AS MATERIALIZED (
      ${resolvedStartsSelect}
    ), ${costRelation}(
      ${q("start")}, ${q("node")},
      ${q("__start_key")}, ${q("__node_key")},
      ${q("__event_id")}, ${q("__event_start")}, ${q("__event_end")},
      ${q("distance")}
    ) USING KEY(${q("__start_key")}, ${q("__event_id")}) AS (
      SELECT ${start}, ${edgeTo}, ${startKey}, ${edgeToKey},
        ${eventId}, ${eventStart}, ${eventEnd}, ${edgeCost}
      FROM ${startsRelation} AS ${q("starts")}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${startKey} = ${edgeFromKey}
      UNION
      SELECT ${reachedStart}, ${edgeTo}, ${reachedStartKey}, ${edgeToKey},
        ${eventId}, ${eventStart}, ${eventEnd},
        MIN(${candidateDistance}) AS ${q("distance")}
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
