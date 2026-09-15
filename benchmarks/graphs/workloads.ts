export const graphWorkloads = [
  { name: "deep-chain", label: "Deep chain", nodes: 100_000 },
  { name: "branching", label: "Binary branching", nodes: 100_000 },
  { name: "dense", label: "Dense directed", nodes: 1_000 },
] as const;

export type GraphWorkloadName = typeof graphWorkloads[number]["name"];

/**
 * Builds a deterministic DuckDB query for a generated graph benchmark input.
 * Fixture creation belongs outside the measured graph operation.
 */
export function graphWorkloadQuery(
  name: GraphWorkloadName,
  nodes: number,
): string {
  assertNodeCount(nodes);
  if (name === "deep-chain") {
    return `SELECT i::BIGINT AS edgeId, i::BIGINT AS source,
      (i + 1)::BIGINT AS target, 1::DOUBLE AS weight
      FROM range(${Math.max(0, nodes - 1)}) AS edges(i)`;
  }
  if (name === "branching") {
    return `SELECT (i - 1)::BIGINT AS edgeId,
      floor((i - 1) / 2)::BIGINT AS source,
      i::BIGINT AS target, 1::DOUBLE AS weight
      FROM range(1, ${nodes}) AS edges(i)`;
  }
  return `SELECT row_number() OVER (ORDER BY source.i, target.i) - 1 AS edgeId,
    source.i::BIGINT AS source, target.i::BIGINT AS target,
    1::DOUBLE AS weight
    FROM range(${nodes}) AS source(i)
    CROSS JOIN range(${nodes}) AS target(i)
    WHERE source.i <> target.i`;
}

export function graphWorkloadEdgeCount(
  name: GraphWorkloadName,
  nodes: number,
): number {
  assertNodeCount(nodes);
  return name === "dense" ? nodes * (nodes - 1) : Math.max(0, nodes - 1);
}

function assertNodeCount(nodes: number) {
  if (!Number.isSafeInteger(nodes) || nodes < 0) {
    throw new TypeError(
      "Graph workload nodes must be a non-negative safe integer.",
    );
  }
}
