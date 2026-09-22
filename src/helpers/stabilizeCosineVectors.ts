import type { DuckDBConnection } from "@duckdb/node-api";
import readScalarNumber from "./readScalarNumber.ts";

/**
 * Stabilizes cosine arithmetic in a caller-owned private vector relation.
 * The already-quoted relation has unique vertex ids and a fixed-size DOUBLE
 * vec column. Source data must be retained separately by the caller.
 *
 * Safe vectors keep their existing arithmetic and tie behavior. Outside the
 * safe range, divide by the largest absolute component, then by the resulting
 * length. This preserves direction without overflowing or underflowing norms.
 * The bounds keep squared-norm products between 1e-300 and 1e300, with room
 * for rounding. Only the private vec column changes; no scratch tables remain.
 */
export default async function stabilizeCosineVectors(
  connection: DuckDBConnection,
  rows: string,
): Promise<void> {
  if (
    await readScalarNumber(
      connection,
      `SELECT count(*) FROM ${rows} WHERE vec IS NULL
        OR len(vec)=0 OR list_count(vec)!=len(vec)
        OR NOT list_bool_and(list_transform(vec, value -> isfinite(value)))
        OR list_max(list_transform(vec, value -> abs(value)))=0`,
    )
  ) {
    throw new Error(
      "Cosine distance requires finite, non-null values and nonzero vectors.",
    );
  }
  await connection.run(`WITH magnitudes AS MATERIALIZED (
      SELECT vertex,vec,list_max(list_transform(vec, value -> abs(value))) AS magnitude
      FROM ${rows}
    ), scaled AS MATERIALIZED (
      SELECT vertex,list_transform(vec, value -> value / magnitude) AS vec
      FROM magnitudes
      WHERE magnitude < 1e-75 OR magnitude > 1e75 / sqrt(len(vec))
    ), lengths AS MATERIALIZED (
      SELECT vertex,vec,sqrt(list_sum(list_transform(vec, value -> value * value))) AS norm
      FROM scaled
    )
    UPDATE ${rows} AS target SET vec=cast_to_type(
      list_transform(lengths.vec, value -> value / lengths.norm),target.vec)
    FROM lengths WHERE target.vertex=lengths.vertex`);
}
