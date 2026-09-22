import { DOUBLE, type DuckDBConnection, INTEGER } from "@duckdb/node-api";
import appendColumnBatches from "./appendColumnBatches.ts";
import buildSparseMutualReachabilityMst from "./buildSparseMutualReachabilityMst.ts";
import buildVectorNeighbors from "./buildVectorNeighbors.ts";
import inspectGraphConnectivity from "./inspectGraphConnectivity.ts";
import quoteIdentifier from "./quoteIdentifier.ts";
import vectorDistanceExpression from "./vectorDistanceExpression.ts";

/**
 * Build an explicitly approximate mutual-reachability MST. HNSW supplies a
 * high-recall k-neighbor candidate graph; disconnected components are repaired
 * with deterministic all-member projection sweeps. Neither step guarantees the
 * complete graph's MST.
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
    Math.max(input.minSamples, 64),
  );
  await buildVectorNeighbors(
    connection,
    {
      count: input.count,
      dimensions: input.dimensions,
      neighborCount,
    },
    {
      metric: options.metric,
      search: "hnsw",
      includeSelf: false,
      hnsw: {
        efConstruction: 256,
        efSearch: Math.max(512, neighborCount * 2),
        connectivity: 32,
        candidateCount: Math.min(input.count, neighborCount * 2 + 1),
        singleThreaded: true,
        cosineAsL2: true,
      },
    },
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
  const mst = await buildSparseMutualReachabilityMst(
    connection,
    quoted.edges,
    input.count,
  );
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
    // Each sweep examines every point, rather than a fixed representative
    // sample. Consecutive component runs in the projected order provide a
    // connected backbone, while multiple directions offer alternative edges.
    // We also connect each member of a run to the nearest projected endpoint
    // in both adjacent runs. All weights are recomputed in the actual metric.
    const dimensions = Number(
      (await connection.runAndReadAll(
        `SELECT len(vec) FROM ${quoted.rows} LIMIT 1`,
      )).getRowsJS()[0][0],
    );
    await connection.run(
      `CREATE OR REPLACE TEMP TABLE ${quoted.bridgeCandidates}
      (source INTEGER,target INTEGER,distance DOUBLE)`,
    );
    const rawDistance = vectorDistanceExpression(
      "a.vec",
      "b.vec",
      options.metric,
    );
    const projectionCount = Math.min(dimensions, 8) + (dimensions > 1 ? 16 : 0);
    for (let projection = 0; projection < projectionCount; projection++) {
      // Coordinate directions handle axis-aligned and one-dimensional data;
      // fixed pseudo-random directions cover rotated component boundaries.
      // Coefficients do not depend on table names, execution order, or RNG state.
      const coefficients = Array.from(
        { length: dimensions },
        (_, dimension) => {
          if (projection < Math.min(dimensions, 8)) {
            return dimension === projection ? 1 : 0;
          }
          let hash = Math.imul(projection + 1, 0x9e3779b1) ^
            Math.imul(dimension + 1, 0x85ebca6b);
          hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
          hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
          return ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000 * 2 - 1;
        },
      );
      // Scaling each coordinate by the same global factor prevents overflow
      // in the projection without changing its ordering. Unit directions are
      // the appropriate search geometry for cosine.
      const vector = options.metric === "cosine"
        ? `list_transform(r.vec,x -> x/sqrt(array_inner_product(r.vec,r.vec)))::DOUBLE[${dimensions}]`
        : `list_transform(r.vec,x -> x/scale.maximum)::DOUBLE[${dimensions}]`;
      await connection.run(
        `CREATE OR REPLACE TEMP TABLE ${quoted.representatives} AS
        WITH projected AS (
          SELECT r.vertex,c.component,
            array_inner_product(${vector},[${
          coefficients.join(",")
        }]::DOUBLE[${dimensions}]) AS position
          FROM ${quoted.rows} r JOIN ${quoted.components} c USING(vertex)
          CROSS JOIN (SELECT greatest(1,max(list_max(list_transform(vec,x -> abs(x))))) AS maximum FROM ${quoted.rows}) scale
        ), ordered AS (
          SELECT *,lag(component) OVER w AS previous_component,
            lead(component) OVER w AS next_component,
            lag(vertex) OVER w AS previous_vertex,
            lead(vertex) OVER w AS next_vertex
          FROM projected WINDOW w AS (ORDER BY position,vertex)
        )
        SELECT vertex,
          last_value(CASE WHEN component != previous_component THEN previous_vertex END IGNORE NULLS)
            OVER (ORDER BY position,vertex ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS left_vertex,
          first_value(CASE WHEN component != next_component THEN next_vertex END IGNORE NULLS)
            OVER (ORDER BY position,vertex ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING) AS right_vertex
        FROM ordered;
        INSERT INTO ${quoted.bridgeCandidates}
        SELECT least(a.vertex,b.vertex)::INTEGER,greatest(a.vertex,b.vertex)::INTEGER,
          greatest(ca.distance,cb.distance,${rawDistance})::DOUBLE
        FROM (SELECT vertex,unnest([left_vertex,right_vertex]) AS target FROM ${quoted.representatives}) p
        JOIN ${quoted.rows} a ON a.vertex=p.vertex
        JOIN ${quoted.rows} b ON b.vertex=p.target
        JOIN ${quoted.coreDistances} ca ON ca.vertex=a.vertex
        JOIN ${quoted.coreDistances} cb ON cb.vertex=b.vertex`,
      );
    }
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
    await connection.run(`INSERT INTO ${quoted.edges}
      SELECT source,target,min(distance) AS distance
      FROM ${quoted.bridgeCandidates} GROUP BY source,target`);
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
