import type { DuckDBConnection } from "@duckdb/node-api";

/**
 * Inspect connectivity of an edge relation while transferring ids, not vectors.
 * Isolated vertices count as one-point components. Invalid ids fail closed.
 */
export default async function inspectGraphConnectivity(
  connection: DuckDBConnection,
  edges: string,
  vertexCount: number,
): Promise<{ componentCount: number; sizes: number[] }> {
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 1) {
    throw new Error("Graph vertex count must be a positive safe integer.");
  }
  const parent = new Int32Array(vertexCount);
  const sizes = new Int32Array(vertexCount).fill(1);
  for (let vertex = 0; vertex < vertexCount; vertex++) parent[vertex] = vertex;
  const root = (vertex: number) => {
    while (parent[vertex] !== vertex) {
      parent[vertex] = parent[parent[vertex]];
      vertex = parent[vertex];
    }
    return vertex;
  };
  const rows = await connection.stream(`SELECT source,target FROM ${edges}`);
  while (true) {
    const chunk = await rows.fetchChunk();
    if (!chunk || chunk.rowCount === 0) break;
    const sources = chunk.getColumnVector(0);
    const targets = chunk.getColumnVector(1);
    for (let row = 0; row < chunk.rowCount; row++) {
      const source = Number(sources.getItem(row));
      const target = Number(targets.getItem(row));
      if (
        !Number.isSafeInteger(source) || source < 0 || source >= vertexCount ||
        !Number.isSafeInteger(target) || target < 0 || target >= vertexCount
      ) {
        throw new Error("Graph edge contains an invalid vertex id.");
      }
      let sourceRoot = root(source), targetRoot = root(target);
      if (sourceRoot === targetRoot) continue;
      if (sizes[sourceRoot] < sizes[targetRoot]) {
        [sourceRoot, targetRoot] = [targetRoot, sourceRoot];
      }
      parent[targetRoot] = sourceRoot;
      sizes[sourceRoot] += sizes[targetRoot];
    }
  }
  const componentSizes: number[] = [];
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    if (root(vertex) === vertex) componentSizes.push(sizes[vertex]);
  }
  componentSizes.sort((a, b) => b - a);
  return { componentCount: componentSizes.length, sizes: componentSizes };
}
