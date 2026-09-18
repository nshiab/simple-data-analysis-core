import foldIdentifier from "./foldIdentifier.ts";
import type { TableSchema } from "./pendingOps.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

const resultColumns = ["pathId", "step", "weight", "total"] as const;

/** Validates that route result columns do not replace original input columns. */
export default function validateGraphRouteResultSchema(
  schema: TableSchema,
  method: string,
  additionalResultColumns: readonly string[] = [],
): void {
  for (const resultColumn of [...resultColumns, ...additionalResultColumns]) {
    const folded = foldIdentifier(resultColumn);
    const inputColumn = Object.keys(schema).find((column) =>
      foldIdentifier(column) === folded
    );
    if (inputColumn !== undefined) {
      throw new Error(
        `${method} cannot add ${
          quoteIdentifier(resultColumn)
        } because input column ${
          quoteIdentifier(inputColumn)
        } conflicts with that result column. Rename ${
          quoteIdentifier(inputColumn)
        } with renameColumns() before calculating the graph.`,
      );
    }
  }
}
