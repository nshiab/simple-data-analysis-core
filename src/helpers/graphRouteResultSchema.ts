import type { TableSchema } from "./pendingOps.ts";
import validateGraphRouteResultSchema from "./validateGraphRouteResultSchema.ts";

/** Derives the route result schema while preserving input columns and types. */
export default function graphRouteResultSchema(
  schema: TableSchema,
  distanceType: string,
  method: string,
  elapsedTime = false,
): TableSchema {
  validateGraphRouteResultSchema(
    schema,
    method,
    elapsedTime ? ["elapsedTimeMs"] : [],
  );
  return {
    pathId: "BIGINT",
    step: "BIGINT",
    weight: distanceType,
    total: distanceType,
    ...(elapsedTime ? { elapsedTimeMs: "DOUBLE" } : {}),
    ...schema,
  };
}
