/** Build a DOUBLE-precision distance expression for prepared vector aliases. */
export default function vectorDistanceExpression(
  left: string,
  right: string,
  metric: "euclidean" | "cosine",
): string {
  if (metric === "euclidean") return `array_distance(${left},${right})`;
  // DuckDB can return tiny positive or negative errors for equal/cosine-aligned
  // vectors. Exact equality also makes duplicate behavior deterministic.
  return `CASE WHEN ${left}=${right} THEN 0 ELSE greatest(0,array_cosine_distance(${left},${right})) END`;
}
