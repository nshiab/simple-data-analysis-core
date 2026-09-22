import type { DuckDBConnection } from "@duckdb/node-api";

type Edge = { source: number; target: number; distance: number };
type Linkage = { left: number; right: number; distance: number; size: number };
type CondensedEdge = {
  parent: number;
  child: number;
  lambda: number;
  childSize: number;
};

/**
 * Build the condensed hierarchy, select EOM clusters, and calculate point
 * outputs from an HDBSCAN mutual-reachability MST. Only O(n) graph/hierarchy
 * state crosses from DuckDB; source vectors remain native.
 */
export default async function clusterHdbscan(
  connection: DuckDBConnection,
  mst: string,
  options: {
    count: number;
    minClusterSize: number;
    allowSingleCluster: boolean;
  },
): Promise<{
  labels: Int32Array;
  probabilities: Float64Array;
  outlierScores: Float64Array;
}> {
  // Leaves and internal nodes share the signed Int32 hierarchy namespace.
  if (
    !Number.isSafeInteger(options.count) || options.count < 2 ||
    options.count > 0x40000000
  ) {
    throw new Error(
      "HDBSCAN hierarchy requires between 2 and 1073741824 rows so all 2*n-1 node identifiers fit signed INTEGER state.",
    );
  }
  const edges = await readMst(connection, mst, options.count);
  const linkage = buildSingleLinkage(edges, options.count);
  const tree = condenseTree(linkage, options.count, options.minClusterSize);
  return selectClusters(tree, options.count, options.allowSingleCluster);
}

async function readMst(
  connection: DuckDBConnection,
  mst: string,
  count: number,
): Promise<Edge[]> {
  const edges: Edge[] = [];
  const result = await connection.stream(
    `SELECT source,target,distance FROM ${mst}`,
  );
  while (true) {
    const chunk = await result.fetchChunk();
    if (!chunk || chunk.rowCount === 0) break;
    const sources = chunk.getColumnVector(0);
    const targets = chunk.getColumnVector(1);
    const distances = chunk.getColumnVector(2);
    for (let row = 0; row < chunk.rowCount; row++) {
      const rawSource = sources.getItem(row);
      const rawTarget = targets.getItem(row);
      const rawDistance = distances.getItem(row);
      if (
        rawSource === null || rawSource === undefined ||
        rawTarget === null || rawTarget === undefined ||
        rawDistance === null || rawDistance === undefined
      ) {
        throw new Error(
          "HDBSCAN mutual-reachability MST contains an invalid edge.",
        );
      }
      const source = Number(rawSource);
      const target = Number(rawTarget);
      const distance = Number(rawDistance);
      if (
        !Number.isSafeInteger(source) || source < 0 || source >= count ||
        !Number.isSafeInteger(target) || target < 0 || target >= count ||
        source === target || !Number.isFinite(distance) || distance < 0
      ) {
        throw new Error(
          "HDBSCAN mutual-reachability MST contains an invalid edge.",
        );
      }
      edges.push({ source, target, distance });
    }
  }
  if (edges.length !== count - 1) {
    throw new Error(
      `HDBSCAN mutual-reachability MST returned ${edges.length} edges; ${
        count - 1
      } were required.`,
    );
  }
  return edges;
}

function buildSingleLinkage(edges: Edge[], count: number): Linkage[] {
  edges.sort((a, b) =>
    a.distance - b.distance ||
    Math.min(a.source, a.target) - Math.min(b.source, b.target) ||
    Math.max(a.source, a.target) - Math.max(b.source, b.target)
  );
  const parent = new Int32Array(count);
  const size = new Int32Array(count).fill(1);
  const node = new Int32Array(count);
  for (let vertex = 0; vertex < count; vertex++) {
    parent[vertex] = vertex;
    node[vertex] = vertex;
  }
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
  const linkage: Linkage[] = [];
  for (const edge of edges) {
    let leftRoot = find(edge.source);
    let rightRoot = find(edge.target);
    if (leftRoot === rightRoot) {
      throw new Error(
        "HDBSCAN mutual-reachability edges do not form a tree.",
      );
    }
    const combinedNode = count + linkage.length;
    const combinedSize = size[leftRoot] + size[rightRoot];
    linkage.push({
      left: node[leftRoot],
      right: node[rightRoot],
      distance: edge.distance,
      size: combinedSize,
    });
    if (size[leftRoot] < size[rightRoot]) {
      [leftRoot, rightRoot] = [rightRoot, leftRoot];
    }
    parent[rightRoot] = leftRoot;
    size[leftRoot] = combinedSize;
    node[leftRoot] = combinedNode;
  }
  if (linkage.length !== count - 1 || linkage.at(-1)?.size !== count) {
    throw new Error(
      "HDBSCAN mutual-reachability edges do not form one connected tree.",
    );
  }
  return linkage;
}

function condenseTree(
  hierarchy: Linkage[],
  count: number,
  minClusterSize: number,
): CondensedEdge[] {
  const root = 2 * count - 2;
  const relabel = new Int32Array(root + 1).fill(-1);
  relabel[root] = count;
  let nextLabel = count + 1;
  const ignored = new Uint8Array(root + 1);
  const result: CondensedEdge[] = [];

  for (const current of breadthFirstHierarchy(hierarchy, count, root)) {
    if (ignored[current] || current < count) continue;
    const split = hierarchy[current - count];
    const lambda = split.distance > 0 ? 1 / split.distance : Infinity;
    const leftSize = split.left >= count
      ? hierarchy[split.left - count].size
      : 1;
    const rightSize = split.right >= count
      ? hierarchy[split.right - count].size
      : 1;
    if (leftSize >= minClusterSize && rightSize >= minClusterSize) {
      relabel[split.left] = nextLabel++;
      result.push({
        parent: relabel[current],
        child: relabel[split.left],
        lambda,
        childSize: leftSize,
      });
      relabel[split.right] = nextLabel++;
      result.push({
        parent: relabel[current],
        child: relabel[split.right],
        lambda,
        childSize: rightSize,
      });
    } else if (
      leftSize < minClusterSize && rightSize < minClusterSize
    ) {
      appendRunt(
        hierarchy,
        count,
        split.left,
        relabel[current],
        lambda,
        ignored,
        result,
      );
      appendRunt(
        hierarchy,
        count,
        split.right,
        relabel[current],
        lambda,
        ignored,
        result,
      );
    } else if (leftSize < minClusterSize) {
      relabel[split.right] = relabel[current];
      appendRunt(
        hierarchy,
        count,
        split.left,
        relabel[current],
        lambda,
        ignored,
        result,
      );
    } else {
      relabel[split.left] = relabel[current];
      appendRunt(
        hierarchy,
        count,
        split.right,
        relabel[current],
        lambda,
        ignored,
        result,
      );
    }
  }
  if (result.length === 0) {
    throw new Error("HDBSCAN condensed hierarchy is empty.");
  }
  return result;
}

function appendRunt(
  hierarchy: Linkage[],
  count: number,
  root: number,
  parent: number,
  lambda: number,
  ignored: Uint8Array,
  result: CondensedEdge[],
): void {
  for (const node of breadthFirstHierarchy(hierarchy, count, root)) {
    if (node < count) {
      result.push({ parent, child: node, lambda, childSize: 1 });
    }
    ignored[node] = 1;
  }
}

function breadthFirstHierarchy(
  hierarchy: Linkage[],
  count: number,
  root: number,
): number[] {
  const result: number[] = [];
  let level = [root];
  while (level.length > 0) {
    for (const node of level) result.push(node);
    const next: number[] = [];
    for (const node of level) {
      if (node < count) continue;
      const split = hierarchy[node - count];
      next.push(split.left, split.right);
    }
    level = next;
  }
  return result;
}

function selectClusters(
  tree: CondensedEdge[],
  count: number,
  allowSingleCluster: boolean,
): {
  labels: Int32Array;
  probabilities: Float64Array;
  outlierScores: Float64Array;
} {
  let root = Number.MAX_SAFE_INTEGER;
  let maximumParent = -1;
  for (const edge of tree) {
    if (edge.parent < root) root = edge.parent;
    if (edge.parent > maximumParent) maximumParent = edge.parent;
  }
  if (root !== count) {
    throw new Error("HDBSCAN condensed hierarchy has an invalid root.");
  }
  const births = new Float64Array(maximumParent + 1).fill(NaN);
  for (const edge of tree) {
    if (Number.isNaN(births[edge.child])) births[edge.child] = edge.lambda;
    else births[edge.child] = Math.min(births[edge.child], edge.lambda);
  }
  births[root] = 0;
  const stability = new Map<number, number>();
  for (let cluster = root; cluster <= maximumParent; cluster++) {
    stability.set(cluster, 0);
  }
  for (const edge of tree) {
    stability.set(
      edge.parent,
      stability.get(edge.parent)! +
        (edge.lambda - births[edge.parent]) * edge.childSize,
    );
  }

  const clusterEdges = tree.filter(({ childSize }) => childSize > 1);
  const nodeList = [...stability.keys()].sort((a, b) => b - a);
  if (!allowSingleCluster) nodeList.pop();
  const preferred = new Map<number, boolean>();
  const children = new Map<number, number[]>();
  for (const edge of clusterEdges) {
    const values = children.get(edge.parent) ?? [];
    values.push(edge.child);
    children.set(edge.parent, values);
  }
  for (const cluster of nodeList) {
    const childClusters = children.get(cluster) ?? [];
    // hdbscan 0.8.44 stores this otherwise-double reduction in a C float.
    const subtreeStability = accumulateFloat32(
      childClusters.map((child) => stability.get(child)!),
    );
    if (subtreeStability > stability.get(cluster)!) {
      stability.set(cluster, subtreeStability);
      preferred.set(cluster, false);
    } else {
      preferred.set(cluster, true);
    }
  }
  const clusters: number[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const cluster = pending.pop()!;
    if ((cluster !== root || allowSingleCluster) && preferred.get(cluster)) {
      clusters.push(cluster);
      continue;
    }
    const childClusters = children.get(cluster) ?? [];
    for (let index = childClusters.length - 1; index >= 0; index--) {
      pending.push(childClusters[index]);
    }
  }
  clusters.sort((a, b) => a - b);
  const labelsByCluster = new Map(
    clusters.map((cluster, label) => [cluster, label]),
  );
  const pointEdges = new Array<CondensedEdge>(count);
  const parentByCluster = new Map<number, number>();
  for (const edge of tree) {
    if (edge.child < count) pointEdges[edge.child] = edge;
    else parentByCluster.set(edge.child, edge.parent);
  }
  for (let point = 0; point < count; point++) {
    if (pointEdges[point] === undefined) {
      throw new Error("HDBSCAN condensed hierarchy omitted an input row.");
    }
  }

  const labels = new Int32Array(count).fill(-1);
  const selectedAncestor = new Int32Array(maximumParent + 1).fill(-1);
  for (let cluster = root; cluster <= maximumParent; cluster++) {
    if (labelsByCluster.has(cluster)) {
      selectedAncestor[cluster] = cluster;
      continue;
    }
    const parent = parentByCluster.get(cluster);
    if (parent !== undefined) {
      selectedAncestor[cluster] = selectedAncestor[parent];
    }
  }
  let rootExit = 0;
  for (const edge of tree) {
    if (edge.parent === root && edge.lambda > rootExit) rootExit = edge.lambda;
  }
  for (let point = 0; point < count; point++) {
    const pointEdge = pointEdges[point];
    const cluster = selectedAncestor[pointEdge.parent];
    if (cluster < 0) continue;
    if (
      cluster === root &&
      !(clusters.length === 1 && allowSingleCluster &&
        pointEdge.lambda >= rootExit)
    ) continue;
    labels[point] = labelsByCluster.get(cluster)!;
  }

  const deaths = directMaximumLambdas(tree, maximumParent);
  const probabilities = new Float64Array(count);
  for (let point = 0; point < count; point++) {
    const label = labels[point];
    if (label < 0) continue;
    const cluster = clusters[label];
    const maximum = deaths[cluster];
    const lambda = pointEdges[point].lambda;
    probabilities[point] = maximum === 0 || !Number.isFinite(lambda)
      ? 1
      : Math.min(lambda, maximum) / maximum;
  }

  // hdbscan 0.8.44 propagates maximum density through the condensed tree in
  // reverse edge order, so each parent sees maxima already resolved below it.
  for (let index = tree.length - 1; index >= 0; index--) {
    const edge = tree[index];
    if (deaths[edge.child] > deaths[edge.parent]) {
      deaths[edge.parent] = deaths[edge.child];
    }
  }
  const outlierScores = new Float64Array(count);
  for (let point = 0; point < count; point++) {
    const edge = pointEdges[point];
    const maximum = deaths[edge.parent];
    if (maximum === 0 || !Number.isFinite(edge.lambda)) {
      outlierScores[point] = 0;
    } else if (!Number.isFinite(maximum)) {
      // hdbscan 0.8.44 returns NaN for (Infinity - finite) / Infinity.
      // Use the finite perturbation limit so public outputs remain finite.
      outlierScores[point] = 1;
    } else {
      outlierScores[point] = (maximum - edge.lambda) / maximum;
    }
  }
  if (
    probabilities.some((value) => !Number.isFinite(value)) ||
    outlierScores.some((value) => !Number.isFinite(value))
  ) {
    throw new Error("HDBSCAN produced non-finite point scores.");
  }
  return { labels, probabilities, outlierScores };
}

/** Match a C float accumulator, including rounding after every addition. */
export function accumulateFloat32(values: number[]): number {
  let total = 0;
  for (const value of values) total = Math.fround(total + value);
  return total;
}

function directMaximumLambdas(
  tree: CondensedEdge[],
  maximumParent: number,
): Float64Array {
  const deaths = new Float64Array(maximumParent + 1);
  for (const edge of tree) {
    deaths[edge.parent] = Math.max(deaths[edge.parent], edge.lambda);
  }
  return deaths;
}
