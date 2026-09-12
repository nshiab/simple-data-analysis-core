import foldIdentifier from "./foldIdentifier.ts";
import getGraphEndpointColumns from "./getGraphEndpointColumns.ts";
import type { TableSchema } from "./pendingOps.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

export type GraphEdgeIdColumn = {
  column: string;
  family: "string" | "numeric";
  idType: string;
};

/** Resolves a route edge-ID column and its exact comparison type. */
export default function getGraphEdgeIdColumn(
  schema: TableSchema,
  requestedEdgeId: string,
  method: string,
): GraphEdgeIdColumn {
  const folded = foldIdentifier(requestedEdgeId);
  const column = Object.keys(schema).find((name) =>
    foldIdentifier(name) === folded
  );
  if (column === undefined) {
    throw new Error(
      `${method} the column ${
        quoteIdentifier(requestedEdgeId)
      } does not exist. Check for typos, or load the data first.`,
    );
  }

  try {
    const resolved = getGraphEndpointColumns(
      { [column]: schema[column] },
      column,
      column,
      method,
    );
    return {
      column,
      family: resolved.family,
      idType: resolved.idType,
    };
  } catch (error) {
    if (error instanceof TypeError) {
      throw new TypeError(
        `${method} requires string or whole-number edge IDs, but column ${
          quoteIdentifier(column)
        } has type ${schema[column]}.`,
      );
    }
    throw error;
  }
}
