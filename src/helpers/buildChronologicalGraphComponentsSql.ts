import buildGraphTemporalReachabilitySql from "./buildGraphTemporalReachabilitySql.ts";
import type { PreparedGraphTemporalSql } from "./prepareGraphTemporalSql.ts";
import type { PreparedGraphSql } from "./prepareGraphTraversal.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

/** Builds all-pairs chronological reachability and maximal-clique membership SQL. */
export default function buildChronologicalGraphComponentsSql(
  prepared: PreparedGraphSql,
  temporal: PreparedGraphTemporalSql,
): string {
  const q = quoteIdentifier;
  const reachability = buildGraphTemporalReachabilitySql(
    prepared,
    (edges) =>
      `SELECT ${q("__from")} AS ${q("start")},
          ${q("__from_key")} AS ${q("__key")}
        FROM ${edges}
        UNION
        SELECT ${q("__to")}, ${q("__to_key")} FROM ${edges}`,
    "outgoing",
    temporal,
  );
  const relations = prepared.relationNames([
    "graph_component_nodes",
    "graph_component_reachability",
    "graph_mutual_neighbors",
    "graph_mutual_adjacency",
    "graph_clique_initial",
    "graph_clique_search",
    "graph_maximal_cliques",
    "graph_numbered_cliques",
  ]);
  const nodes = relations.graph_component_nodes;
  const reached = relations.graph_component_reachability;
  const mutual = relations.graph_mutual_neighbors;
  const adjacency = relations.graph_mutual_adjacency;
  const initial = relations.graph_clique_initial;
  const search = relations.graph_clique_search;
  const maximal = relations.graph_maximal_cliques;
  const numbered = relations.graph_numbered_cliques;
  const edges = reachability.edgesRelation;
  const reachable = reachability.reachableRelation;

  return `${reachability.withClause}, ${nodes} AS MATERIALIZED (
      SELECT ${q("node")}, ${q("__key")}
      FROM (
        SELECT ${q("__from")} AS ${q("node")},
          ${q("__from_key")} AS ${q("__key")}
        FROM ${edges}
        UNION
        SELECT ${q("__to")}, ${q("__to_key")} FROM ${edges}
      ) AS ${q("valid_nodes")}
    ), ${reached} AS MATERIALIZED (
      SELECT ${q("__start_key")}, ${q("__node_key")}
      FROM ${reachable}
      UNION
      SELECT ${q("__key")}, ${q("__key")} FROM ${nodes}
    ), ${mutual} AS MATERIALIZED (
      SELECT ${q("forward")}.${q("__start_key")} AS ${q("__key")},
        ${q("forward")}.${q("__node_key")} AS ${q("__neighbor_key")}
      FROM ${reached} AS ${q("forward")}
      INNER JOIN ${reached} AS ${q("reverse")}
        ON ${q("forward")}.${q("__start_key")} =
          ${q("reverse")}.${q("__node_key")}
        AND ${q("forward")}.${q("__node_key")} =
          ${q("reverse")}.${q("__start_key")}
      WHERE ${q("forward")}.${q("__start_key")} !=
        ${q("forward")}.${q("__node_key")}
    ), ${
    buildMaximalGraphCliquesSql(nodes, mutual, {
      adjacency,
      initial,
      maximal,
      numbered,
      search,
    })
  }
    SELECT ${q("numbered")}.${q("componentId")},
      ${q("nodes")}.${q("node")}
    FROM ${numbered} AS ${q("numbered")}
    CROSS JOIN unnest(${q("numbered")}.${q("__members")}) WITH ORDINALITY
      AS ${q("member")}(${q("__key")}, ${q("__order")})
    INNER JOIN ${nodes} AS ${q("nodes")}
      ON ${q("member")}.${q("__key")} = ${q("nodes")}.${q("__key")}
    ORDER BY ${q("numbered")}.${q("componentId")},
      ${q("member")}.${q("__order")}`;
}

export type MaximalGraphCliqueRelations = {
  adjacency: string;
  initial: string;
  maximal: string;
  numbered: string;
  search: string;
};

/** Builds pivoted Bron–Kerbosch CTEs over typed node and mutual-edge relations. */
export function buildMaximalGraphCliquesSql(
  nodes: string,
  mutual: string,
  relations: MaximalGraphCliqueRelations,
): string {
  const q = quoteIdentifier;
  const { adjacency, initial, maximal, numbered, search } = relations;
  // Sibling candidates are P minus the pivot's neighbors. For branch v, move
  // only earlier siblings (candidate < v and outside N(pivot)) from P to X;
  // earlier P vertices inside N(pivot) must remain prospective.
  return `${adjacency} AS MATERIALIZED (
      SELECT ${q("nodes")}.${q("__key")},
        COALESCE(
          list(${q("mutual")}.${q("__neighbor_key")}
            ORDER BY ${q("mutual")}.${q("__neighbor_key")})
            FILTER (WHERE ${q("mutual")}.${q("__neighbor_key")} IS NOT NULL),
          list_slice(list_value(${q("nodes")}.${q("__key")}), 1, 0)
        ) AS ${q("__neighbors")}
      FROM ${nodes} AS ${q("nodes")}
      LEFT JOIN ${mutual} AS ${q("mutual")}
        ON ${q("nodes")}.${q("__key")} = ${q("mutual")}.${q("__key")}
      GROUP BY ${q("nodes")}.${q("__key")}
    ), ${initial} AS MATERIALIZED (
      SELECT list_slice(${q("__keys")}, 1, 0) AS ${q("__r")},
        ${q("__keys")} AS ${q("__p")},
        list_slice(${q("__keys")}, 1, 0) AS ${q("__x")}
      FROM (
        SELECT list(${q("__key")} ORDER BY ${q("__key")}) AS ${q("__keys")}
        FROM ${nodes}
      ) AS ${q("all_nodes")}
      WHERE ${q("__keys")} IS NOT NULL
    ), ${search}(${q("__r")}, ${q("__p")}, ${q("__x")}) AS (
      SELECT ${q("__r")}, ${q("__p")}, ${q("__x")} FROM ${initial}
      UNION ALL
      SELECT list_append(${q("state")}.${q("__r")},
          ${q("branch")}.${q("__key")}),
        list_filter(${q("state")}.${q("__p")}, ${q("candidate")} ->
          list_contains(${q("branch_neighbors")}.${q("__neighbors")},
            ${q("candidate")})
          AND (
            ${q("candidate")} >= ${q("branch")}.${q("__key")}
            OR list_contains(${q("pivot")}.${q("__neighbors")},
              ${q("candidate")})
          )),
        list_filter(
          list_concat(${q("state")}.${q("__x")},
            ${q("state")}.${q("__p")}),
          ${q("candidate")} ->
            list_contains(${q("branch_neighbors")}.${q("__neighbors")},
              ${q("candidate")})
            AND (
              list_contains(${q("state")}.${q("__x")}, ${q("candidate")})
              OR (
                ${q("candidate")} < ${q("branch")}.${q("__key")}
                AND NOT list_contains(${q("pivot")}.${q("__neighbors")},
                  ${q("candidate")})
              )
            )
        )
      FROM ${search} AS ${q("state")}
      CROSS JOIN LATERAL (
        SELECT ${q("candidate_adjacency")}.${q("__key")},
          ${q("candidate_adjacency")}.${q("__neighbors")}
        FROM unnest(list_concat(${q("state")}.${q("__p")},
          ${q("state")}.${q("__x")})) AS ${q("candidate_key")}(${q("__key")})
        INNER JOIN ${adjacency} AS ${q("candidate_adjacency")}
          ON ${q("candidate_key")}.${q("__key")} =
            ${q("candidate_adjacency")}.${q("__key")}
        ORDER BY list_unique(list_intersect(
            ${q("state")}.${q("__p")},
            ${q("candidate_adjacency")}.${q("__neighbors")}
          )) DESC,
          ${q("candidate_adjacency")}.${q("__key")}
        LIMIT 1
      ) AS ${q("pivot")}
      CROSS JOIN LATERAL (
        SELECT ${q("candidate")}.${q("__key")}
        FROM unnest(${q("state")}.${q("__p")})
          AS ${q("candidate")}(${q("__key")})
        WHERE NOT list_contains(${q("pivot")}.${q("__neighbors")},
          ${q("candidate")}.${q("__key")})
      ) AS ${q("branch")}
      INNER JOIN ${adjacency} AS ${q("branch_neighbors")}
        ON ${q("branch")}.${q("__key")} =
          ${q("branch_neighbors")}.${q("__key")}
    ), ${maximal} AS MATERIALIZED (
      SELECT list_sort(${q("__r")}) AS ${q("__members")}
      FROM ${search}
      WHERE len(${q("__p")}) = 0 AND len(${q("__x")}) = 0
    ), ${numbered} AS MATERIALIZED (
      SELECT ${q("__members")},
        CAST(row_number() OVER (ORDER BY ${q("__members")}) - 1 AS BIGINT)
          AS ${q("componentId")}
      FROM ${maximal}
    )`;
}
