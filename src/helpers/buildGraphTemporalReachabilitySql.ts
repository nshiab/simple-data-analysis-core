import type { PreparedGraphTemporalSql } from "./prepareGraphTemporalSql.ts";
import type {
  GraphDirection,
  PreparedGraphSql,
} from "./prepareGraphTraversal.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

export type GraphTemporalReachabilitySql = {
  edgesRelation: string;
  reachableRelation: string;
  withClause: string;
};

/**
 * Builds reusable chronological reachability CTEs from a start relation.
 * A callback may derive all-node starts from the materialized valid edges.
 */
export default function buildGraphTemporalReachabilitySql(
  prepared: PreparedGraphSql,
  startsSelect: string | ((validEdgesRelation: string) => string),
  direction: Exclude<GraphDirection, "both">,
  temporal: PreparedGraphTemporalSql,
): GraphTemporalReachabilitySql {
  const q = quoteIdentifier;
  const relations = prepared.relationNames([
    "graph_starts",
    "graph_temporal_settings",
    "graph_event_rows",
    "graph_edges",
    "graph_reachable_states",
  ]);
  const startsRelation = relations.graph_starts;
  const settingsRelation = relations.graph_temporal_settings;
  const eventRowsRelation = relations.graph_event_rows;
  const edgesRelation = relations.graph_edges;
  const reachableRelation = relations.graph_reachable_states;
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
  const gap = `${q("settings")}.${q("__gap")}`;
  const resolvedStartsSelect = typeof startsSelect === "string"
    ? startsSelect
    : startsSelect(edgesRelation);

  return {
    edgesRelation,
    reachableRelation,
    withClause: `WITH RECURSIVE ${settingsRelation} AS MATERIALIZED (
      SELECT CAST(? AS HUGEINT) AS ${q("__gap")}
    ), ${eventRowsRelation} AS MATERIALIZED (
      ${prepared.edges(direction, temporal.eventSelections("edges"))}
    ), ${edgesRelation} AS MATERIALIZED (
      SELECT *
      FROM ${eventRowsRelation} AS ${q("events")}
      WHERE ${temporal.eventValidity("events")}
    ), ${startsRelation} AS MATERIALIZED (
      ${resolvedStartsSelect}
    ), ${reachableRelation}(
      ${q("start")}, ${q("node")},
      ${q("__start_key")}, ${q("__node_key")},
      ${q("__event_id")}, ${q("__event_start")}, ${q("__event_end")}
    ) AS (
      SELECT ${start}, ${edgeTo}, ${startKey}, ${edgeToKey},
        ${eventId}, ${eventStart}, ${eventEnd}
      FROM ${startsRelation} AS ${q("starts")}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${startKey} = ${edgeFromKey}
      UNION
      SELECT ${reachedStart}, ${edgeTo}, ${reachedStartKey}, ${edgeToKey},
        ${eventId}, ${eventStart}, ${eventEnd}
      FROM ${reachableRelation} AS ${q("reached")}
      INNER JOIN ${edgesRelation} AS ${q("edges")}
        ON ${reachedNodeKey} = ${edgeFromKey}
      CROSS JOIN ${settingsRelation} AS ${q("settings")}
      WHERE ${temporal.transition("reached", "edges", direction, gap)}
    )`,
  };
}
