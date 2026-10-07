import type { TableSchema } from "./pendingOps.ts";
import validateGraphRouteResultSchema from "./validateGraphRouteResultSchema.ts";

/** Derives the route result schema while preserving input columns and types. */
export default function graphRouteResultSchema(
  schema: TableSchema,
  distanceType: string,
  method: string,
  elapsedTime = false,
  includeTotal = true,
): TableSchema {
  validateGraphRouteResultSchema(
    schema,
    method,
    elapsedTime ? ["elapsedTimeMs"] : [],
    includeTotal,
  );
  return {
    pathId: "BIGINT",
    step: "BIGINT",
    weight: distanceType,
    ...(includeTotal ? { total: distanceType } : {}),
    ...(elapsedTime ? { elapsedTimeMs: "DOUBLE" } : {}),
    ...schema,
  };
}
