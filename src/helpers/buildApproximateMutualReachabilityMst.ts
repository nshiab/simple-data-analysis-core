import { DOUBLE, type DuckDBConnection, INTEGER } from "@duckdb/node-api";
import appendColumnBatches from "./appendColumnBatches.ts";
import buildVectorNeighbors from "./buildVectorNeighbors.ts";
import inspectGraphConnectivity from "./inspectGraphConnectivity.ts";
import quoteIdentifier from "./quoteIdentifier.ts";
import vectorDistanceExpression from "./vectorDistanceExpression.ts";

type WeightedEdge = { source: number; target: number; distance: number };
type ComponentPair = { left: number; right: number };

/**
 * Build an explicitly approximate mutual-reachability MST. HNSW supplies a
 * bounded k-neighbor candidate graph; disconnected components are repaired
 * with deterministic edges between at most eight actual representatives.
 */
export default async function buildApproximateMutualReachabilityMst(
  connection: DuckDBConnection,
  input: { count: number; dimensions: number; minSamples: number },
  options: { metric: "euclidean" | "cosine" },
  names: {
    rows: string;
    neighbors: string;
    search: string;
    hnsw: string;
    candidates: string;
    coreDistances: string;
    edges: string;
    components: string;
    representatives: string;
    componentPairs: string;
    bridgeCandidates: string;
    mst: string;
  },
): Promise<{ candidateComponents: number; neighborCount: number }> {
  const q = quoteIdentifier;
  const quoted = Object.fromEntries(
    Object.entries(names).map(([key, value]) => [key, q(value)]),
  ) as { [Key in keyof typeof names]: string };
  const neighborCount = Math.min(
    input.count - 1,
    Math.max(input.minSamples, 15),
  );
  await buildVectorNeighbors(
    connection,
    {
      count: input.count,
      dimensions: input.dimensions,
      neighborCount,
    },
    { metric: options.metric, search: "hnsw", includeSelf: false },
    {
      rows: quoted.rows,
      neighbors: quoted.neighbors,
      search: quoted.search,
      hnsw: quoted.hnsw,
      candidates: quoted.candidates,
    },
  );
  await connection.run(`CREATE OR REPLACE TEMP TABLE ${quoted.coreDistances} AS
    SELECT source AS vertex,distance
    FROM ${quoted.neighbors} WHERE rank=${input.minSamples - 1};
    CREATE OR REPLACE TEMP TABLE ${quoted.edges} AS
    SELECT least(n.source,n.target)::INTEGER AS source,
      greatest(n.source,n.target)::INTEGER AS target,
      min(greatest(cs.distance,ct.distance,n.distance))::DOUBLE AS distance
    FROM ${quoted.neighbors} n
    JOIN ${quoted.coreDistances} cs ON cs.vertex=n.source
    JOIN ${quoted.coreDistances} ct ON ct.vertex=n.target
    GROUP BY least(n.source,n.target),greatest(n.source,n.target)`);
  await connection.run(`DROP TABLE IF EXISTS ${quoted.neighbors};
    DROP TABLE IF EXISTS ${quoted.candidates};
    DROP TABLE IF EXISTS ${quoted.search}`);

  const componentCount = await repairApproximateConnectivity(
    connection,
    { count: input.count },
    options,
    {
      rows: names.rows,
      coreDistances: names.coreDistances,
      edges: names.edges,
      components: names.components,
      representatives: names.representatives,
      componentPairs: names.componentPairs,
      bridgeCandidates: names.bridgeCandidates,
    },
  );
  const mst = await sparseKruskal(connection, quoted.edges, input.count);
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE ${quoted.mst}
      (source INTEGER,target INTEGER,distance DOUBLE)`,
  );
  await appendColumnBatches(
    connection,
    names.mst,
    [INTEGER, INTEGER, DOUBLE],
    mst.length,
    (column, start, end) =>
      mst.slice(start, end).map((edge) =>
        column === 0 ? edge.source : column === 1 ? edge.target : edge.distance
      ),
  );
  return { candidateComponents: componentCount, neighborCount };
}

/** Internal connectivity-repair seam used by focused approximation tests. */
export async function repairApproximateConnectivity(
  connection: DuckDBConnection,
  input: { count: number },
  options: { metric: "euclidean" | "cosine" },
  names: {
    rows: string;
    coreDistances: string;
    edges: string;
    components: string;
    representatives: string;
    componentPairs: string;
    bridgeCandidates: string;
  },
): Promise<number> {
  const q = quoteIdentifier;
  const quoted = Object.fromEntries(
    Object.entries(names).map(([key, value]) => [key, q(value)]),
  ) as { [Key in keyof typeof names]: string };
  const componentOf = await readComponents(
    connection,
    quoted.edges,
    input.count,
  );
  let maximumComponent = -1;
  for (const component of componentOf) {
    if (component > maximumComponent) maximumComponent = component;
  }
  const componentCount = maximumComponent + 1;
  if (componentCount > 1) {
    await createComponentRows(connection, names.components, componentOf);
    await connection.run(
      `CREATE OR REPLACE TEMP TABLE ${quoted.representatives} AS
       WITH ranked AS (
         SELECT c.component,r.vertex,r.vec,d.distance AS core_distance,
           row_number() OVER (PARTITION BY c.component ORDER BY r.vertex)-1
             AS member_rank,
           count(*) OVER (PARTITION BY c.component) AS component_size
         FROM ${quoted.components} c
         JOIN ${quoted.rows} r USING(vertex)
         JOIN ${quoted.coreDistances} d USING(vertex)
       ), sampled AS (
         SELECT component,vertex,vec,core_distance FROM ranked,
           range(0,8) samples(sample)
         WHERE sample<least(component_size,8)
           AND member_rank=CASE WHEN component_size=1 THEN 0 ELSE
             floor(sample*(component_size-1)/(least(component_size,8)-1)) END
       )
       SELECT * FROM sampled`,
    );
    const pairs = componentCount <= 256
      ? await planAnchorMst(
        connection,
        quoted.rows,
        quoted.coreDistances,
        quoted.components,
        componentCount,
        options.metric,
      )
      : await planAnchorChain(
        connection,
        quoted.rows,
        quoted.components,
      );
    await createComponentPairs(connection, names.componentPairs, pairs);
    const rawDistance = vectorDistanceExpression(
      "a.vec",
      "b.vec",
      options.metric,
    );
    await connection.run(
      `CREATE OR REPLACE TEMP TABLE ${quoted.bridgeCandidates} AS
       SELECT pair_id,least(a.vertex,b.vertex)::INTEGER AS source,
         greatest(a.vertex,b.vertex)::INTEGER AS target,
         greatest(a.core_distance,b.core_distance,${rawDistance})::DOUBLE
           AS distance
       FROM ${quoted.componentPairs} p
       JOIN ${quoted.representatives} a ON a.component=p.left_component
       JOIN ${quoted.representatives} b ON b.component=p.right_component`,
    );
    const invalidBridgeDistances = Number(
      (await connection.runAndReadAll(
        `SELECT count(*) FROM ${quoted.bridgeCandidates}
         WHERE distance IS NULL OR NOT isfinite(distance)`,
      )).getRowsJS()[0][0],
    );
    if (invalidBridgeDistances > 0) {
      throw new Error(
        `Approximate HDBSCAN connectivity repair produced ${invalidBridgeDistances} non-finite candidate distances. Rescale the input features.`,
      );
    }
    await connection.run(
      `INSERT INTO ${quoted.edges}
       SELECT source,target,distance FROM ${quoted.bridgeCandidates}
       QUALIFY row_number() OVER (
         PARTITION BY pair_id ORDER BY distance,source,target
       )=1`,
    );
  }
  const connectivity = await inspectGraphConnectivity(
    connection,
    quoted.edges,
    input.count,
  );
  if (connectivity.componentCount !== 1) {
    throw new Error(
      `Approximate HDBSCAN connectivity repair left ${connectivity.componentCount} graph components.`,
    );
  }
  return componentCount;
}

async function readComponents(
  connection: DuckDBConnection,
  edges: string,
  count: number,
): Promise<Int32Array> {
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
  const union = (left: number, right: number) => {
    let a = find(left), b = find(right);
    if (a === b) return;
    if (size[a] < size[b]) [a, b] = [b, a];
    parent[b] = a;
    size[a] += size[b];
  };
  const result = await connection.stream(`SELECT source,target FROM ${edges}`);
  while (true) {
    const chunk = await result.fetchChunk();
    if (!chunk || chunk.rowCount === 0) break;
    const sources = chunk.getColumnVector(0);
    const targets = chunk.getColumnVector(1);
    for (let row = 0; row < chunk.rowCount; row++) {
      union(Number(sources.getItem(row)), Number(targets.getItem(row)));
    }
  }
  const minimum = new Map<number, number>();
  for (let vertex = 0; vertex < count; vertex++) {
    const root = find(vertex);
    minimum.set(root, Math.min(minimum.get(root) ?? vertex, vertex));
  }
  const ids = [...minimum]
    .sort((a, b) => a[1] - b[1])
    .map(([root], component) => [root, component] as const);
  const componentByRoot = new Map(ids);
  const componentOf = new Int32Array(count);
  for (let vertex = 0; vertex < count; vertex++) {
    componentOf[vertex] = componentByRoot.get(find(vertex))!;
  }
  return componentOf;
}

async function createComponentRows(
  connection: DuckDBConnection,
  name: string,
  componentOf: Int32Array,
): Promise<void> {
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE ${quoteIdentifier(name)}
      (vertex INTEGER,component INTEGER)`,
  );
  await appendColumnBatches(
    connection,
    name,
    [INTEGER, INTEGER],
    componentOf.length,
    (column, start, end) =>
      Array.from(
        { length: end - start },
        (_, offset) =>
          column === 0 ? start + offset : componentOf[start + offset],
      ),
  );
}

async function planAnchorMst(
  connection: DuckDBConnection,
  rows: string,
  coreDistances: string,
  components: string,
  componentCount: number,
  metric: "euclidean" | "cosine",
): Promise<ComponentPair[]> {
  const rawDistance = vectorDistanceExpression("a.vec", "b.vec", metric);
  const result = (await connection.runAndReadAll(
    `WITH anchors AS (
      SELECT c.component,r.vertex,r.vec,d.distance AS core_distance
      FROM ${components} c JOIN ${rows} r USING(vertex)
      JOIN ${coreDistances} d USING(vertex)
      QUALIFY row_number() OVER (PARTITION BY c.component ORDER BY r.vertex)=1
    )
    SELECT a.component,b.component,
      greatest(a.core_distance,b.core_distance,${rawDistance})::DOUBLE
    FROM anchors a JOIN anchors b ON a.component<b.component
    ORDER BY a.component,b.component`,
  )).getRowsJS();
  const weights = new Float64Array(componentCount * componentCount).fill(
    Infinity,
  );
  for (const row of result) {
    const left = Number(row[0]),
      right = Number(row[1]),
      weight = Number(row[2]);
    if (!Number.isFinite(weight)) {
      throw new Error(
        "Approximate HDBSCAN anchor planning produced a non-finite distance.",
      );
    }
    weights[left * componentCount + right] = weight;
    weights[right * componentCount + left] = weight;
  }
  const visited = new Uint8Array(componentCount);
  const best = new Float64Array(componentCount).fill(Infinity);
  const parent = new Int32Array(componentCount).fill(-1);
  visited[0] = 1;
  for (let component = 1; component < componentCount; component++) {
    best[component] = weights[component];
    parent[component] = 0;
  }
  const pairs: ComponentPair[] = [];
  for (let edge = 0; edge < componentCount - 1; edge++) {
    let chosen = -1;
    for (let component = 0; component < componentCount; component++) {
      if (
        !visited[component] &&
        (chosen < 0 || best[component] < best[chosen] ||
          (best[component] === best[chosen] && component < chosen))
      ) chosen = component;
    }
    if (chosen < 0 || !Number.isFinite(best[chosen])) {
      throw new Error("Approximate HDBSCAN anchor graph is disconnected.");
    }
    visited[chosen] = 1;
    pairs.push({ left: parent[chosen], right: chosen });
    for (let component = 0; component < componentCount; component++) {
      const weight = weights[chosen * componentCount + component];
      if (
        !visited[component] &&
        (weight < best[component] ||
          (weight === best[component] && chosen < parent[component]))
      ) {
        best[component] = weight;
        parent[component] = chosen;
      }
    }
  }
  return pairs;
}

async function planAnchorChain(
  connection: DuckDBConnection,
  rows: string,
  components: string,
): Promise<ComponentPair[]> {
  const ordered = (await connection.runAndReadAll(
    `SELECT c.component FROM ${components} c JOIN ${rows} r USING(vertex)
     QUALIFY row_number() OVER (PARTITION BY c.component ORDER BY r.vertex)=1
     ORDER BY array_extract(r.vec,1),r.vertex`,
  )).getRowsJS().map((row) => Number(row[0]));
  return ordered.slice(1).map((component, index) => ({
    left: ordered[index],
    right: component,
  }));
}

async function createComponentPairs(
  connection: DuckDBConnection,
  name: string,
  pairs: ComponentPair[],
): Promise<void> {
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE ${quoteIdentifier(name)}
      (pair_id INTEGER,left_component INTEGER,right_component INTEGER)`,
  );
  await appendColumnBatches(
    connection,
    name,
    [INTEGER, INTEGER, INTEGER],
    pairs.length,
    (column, start, end) =>
      Array.from({ length: end - start }, (_, offset) => {
        const index = start + offset;
        return column === 0
          ? index
          : column === 1
          ? pairs[index].left
          : pairs[index].right;
      }),
  );
}

async function sparseKruskal(
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
