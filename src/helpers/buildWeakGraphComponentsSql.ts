import quoteIdentifier from "./quoteIdentifier.ts";

/** Builds weak component labels and zero-based IDs from bidirectional edges. */
export default function buildWeakGraphComponentsSql(
  edges: string,
  nodes: string,
  labels: string,
  roots: string,
): string {
  const q = quoteIdentifier;
  return `${labels}(
      ${q("node")}, ${q("__node_key")}, ${q("__root_key")}
    ) USING KEY(${q("__node_key")}) AS (
      SELECT ${q("node")}, ${q("__key")}, ${q("__key")}
      FROM ${nodes}
      UNION
      SELECT ${q("edges")}.${q("__to")},
        ${q("edges")}.${q("__to_key")},
        MIN(${q("reached")}.${q("__root_key")})
      FROM ${labels} AS ${q("reached")}
      INNER JOIN ${edges} AS ${q("edges")}
        ON ${q("reached")}.${q("__node_key")} =
          ${q("edges")}.${q("__from_key")}
      INNER JOIN recurring.${labels} AS ${q("best")}
        ON ${q("edges")}.${q("__to_key")} =
          ${q("best")}.${q("__node_key")}
      GROUP BY ${q("edges")}.${q("__to")},
        ${q("edges")}.${q("__to_key")}, ${q("best")}.${q("__root_key")}
      HAVING MIN(${q("reached")}.${q("__root_key")}) <
        ${q("best")}.${q("__root_key")}
    ), ${roots} AS (
      SELECT ${q("__root_key")},
        CAST(row_number() OVER (ORDER BY ${q("__root_key")}) - 1 AS BIGINT)
          AS ${q("componentId")}
      FROM (SELECT DISTINCT ${q("__root_key")} FROM ${labels})
        AS ${q("distinct_roots")}
    )`;
}
