import type { TableSchema } from "./pendingOps.ts";
import validateGraphRouteResultSchema from "./validateGraphRouteResultSchema.ts";

/** Derives the route result schema while preserving input columns and types. */
export default function graphRouteResultSchema(
  schema: TableSchema,
  distanceType: string,
  method: string,
): TableSchema {
  validateGraphRouteResultSchema(schema, method);
  return {
    pathId: "BIGINT",
    step: "BIGINT",
    weight: distanceType,
    total: distanceType,
    ...schema,
  };
}
