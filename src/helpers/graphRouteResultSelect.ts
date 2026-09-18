import type { GraphEdgeIdColumn } from "./getGraphEdgeIdColumn.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

/** Joins ranked route steps to their original input rows for final output. */
export default function graphRouteResultSelect(
  rankedRelation: string,
  input: string,
  edgeIdColumn: GraphEdgeIdColumn,
  includeStart = false,
): string {
  const q = quoteIdentifier;
  const routeStep = `${q("unnested")}.${q("route_step")}`;
  const originalEdgeId = `${q("original")}.${q(edgeIdColumn.column)}`;
  const edgeMatch = edgeIdColumn.family === "string"
    ? `ENCODE(CAST(${originalEdgeId} AS VARCHAR)) =
        ENCODE(${routeStep}.${q("edgeId")})`
    : `CAST(${originalEdgeId} AS ${edgeIdColumn.idType}) =
        ${routeStep}.${q("edgeId")}`;
  return `SELECT ${
    includeStart ? `${q("ranked")}.${q("start")},\n      ` : ""
  }${q("ranked")}.${q("pathId")},
      CAST(${q("unnested")}.${q("step")} AS BIGINT) AS ${q("step")},
      ${routeStep}.${q("weight")} AS ${q("weight")},
      ${routeStep}.${q("distance")} AS ${q("total")},
      ${q("original")}.*
    FROM ${rankedRelation} AS ${q("ranked")},
      UNNEST(${q("ranked")}.${q("steps")}) WITH ORDINALITY AS ${
    q("unnested")
  }(${q("route_step")}, ${q("step")})
    INNER JOIN ${input} AS ${q("original")}
      ON ${edgeMatch}
    ORDER BY ${includeStart ? `${q("ranked")}.${q("__start_key")}, ` : ""}${
    q("ranked")
  }.${q("pathId")}, ${q("unnested")}.${q("step")}`;
}
