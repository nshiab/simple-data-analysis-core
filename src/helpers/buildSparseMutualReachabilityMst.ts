import type { DuckDBConnection } from "@duckdb/node-api";

type WeightedEdge = { source: number; target: number; distance: number };

/** Select a deterministically ordered MST from a connected sparse candidate graph. */
export default async function buildSparseMutualReachabilityMst(
  connection: DuckDBConnection,
  edges: string,
  count: number,
): Promise<WeightedEdge[]> {
  const parent = new Int32Array(count);
  const size = new Int32Array(count).fill(1);
  for (let vertex = 0; vertex < count; vertex++) parent[vertex] = vertex;
  const find = (start: number): number => {
    let root = start;
    while (parent[root] !== root) root = parent[root];
    let current = start;
    while (parent[current] !== current) {
      const next = parent[current];
      parent[current] = root;
      current = next;
    }
    return root;
  };
  const mst: WeightedEdge[] = [];
  const result = await connection.stream(
    `SELECT source,target,distance FROM ${edges}
     ORDER BY distance,source,target`,
  );
  while (mst.length < count - 1) {
    const chunk = await result.fetchChunk();
    if (!chunk || chunk.rowCount === 0) break;
    const sources = chunk.getColumnVector(0);
    const targets = chunk.getColumnVector(1);
    const distances = chunk.getColumnVector(2);
    for (let row = 0; row < chunk.rowCount && mst.length < count - 1; row++) {
      const source = Number(sources.getItem(row));
      const target = Number(targets.getItem(row));
      const distance = Number(distances.getItem(row));
      let left = find(source), right = find(target);
      if (left === right) continue;
      if (size[left] < size[right]) [left, right] = [right, left];
      parent[right] = left;
      size[left] += size[right];
      mst.push({ source, target, distance });
    }
  }
  if (mst.length !== count - 1) {
    throw new Error(
      "Approximate HDBSCAN candidate graph has no spanning tree.",
    );
  }
  return mst;
}
