import SimpleDB from "../../src/class/SimpleDB.ts";

type ProfileNode = {
  children?: ProfileNode[];
  extra_info?: Record<string, unknown>;
  operator_cardinality?: number;
  operator_name?: string;
  operator_timing?: number;
};

const width = 4;
const layers = 5;
const directory = "benchmarks/.work/graphs/chronological-shortest-path";
await Deno.mkdir(directory, { recursive: true });

for (const scenario of ["tied", "pruned"] as const) {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery("SET threads=1; SET memory_limit='1GB'");
    let edgeId = 0;
    const rows: {
      edgeId: number;
      source: string;
      target: string;
      time: Date;
      weight: number;
    }[] = [];
    const addEdge = (
      source: string,
      target: string,
      step: number,
      onSpine: boolean,
    ) => {
      rows.push({
        edgeId: edgeId++,
        source,
        target,
        time: new Date(Date.UTC(2025, 0, 1, 0, 0, step)),
        weight: scenario === "tied" || onSpine ? 0 : 1,
      });
    };
    for (let to = 0; to < width; to++) {
      addEdge("start", `L1-${to}`, 0, to === 0);
    }
    for (let layer = 1; layer < layers; layer++) {
      for (let from = 0; from < width; from++) {
        for (let to = 0; to < width; to++) {
          addEdge(
            `L${layer}-${from}`,
            `L${layer + 1}-${to}`,
            layer,
            from === 0 && to === 0,
          );
        }
      }
    }
    for (let from = 0; from < width; from++) {
      addEdge(`L${layers}-${from}`, "end", layers, from === 0);
    }

    const source = sdb.newTable(`chronological_shortest_${scenario}`)
      .loadArray(rows);
    await source.run();
    const profilePath = `${directory}/${scenario}.json`;
    await sdb.customQuery("SET enable_profiling='json'");
    await sdb.customQuery(`SET profiling_output='${profilePath}'`);
    const started = performance.now();
    const result = source.shortestPath(
      "source",
      "target",
      "edgeId",
      "start",
      "end",
      {
        startTimeColumn: "time",
        weight: "weight",
        outputTable: `chronological_shortest_${scenario}_result`,
      },
    );
    await result.run();
    const milliseconds = performance.now() - started;
    await sdb.customQuery("SET enable_profiling='no_output'");

    const output = await result.getData();
    const outputRoutes = new Set(output.map((row) => row.pathId)).size;
    const profile = JSON.parse(await Deno.readTextFile(profilePath)) as
      & ProfileNode
      & { latency: number };
    const routeCte = findOne(
      profile,
      (node) =>
        node.operator_name === "REC_CTE" &&
        node.extra_info?.["CTE Name"] === "graph_routes",
    );
    const endpointJoins = findAll(
      routeCte,
      (node) =>
        isJoin(node) && details(node).includes("__node_key = __from_key"),
    );
    const boundJoins = findAll(
      routeCte,
      (node) =>
        isJoin(node) && details(node).includes("distance + __weight") &&
        details(node).includes("distance"),
    );
    const chronologicalJoins = findAll(
      routeCte,
      (node) =>
        isJoin(node) && details(node).includes("__event_start") &&
        details(node).includes("__event_end") &&
        details(node).includes("__gap"),
    );
    if (
      endpointJoins.length === 0 || boundJoins.length === 0 ||
      chronologicalJoins.length === 0
    ) {
      throw new Error(`Missing route search joins in ${profilePath}.`);
    }

    console.log(JSON.stringify({
      scenario,
      width,
      layers,
      events: rows.length,
      possibleCompleteRoutes: width ** layers,
      outputRoutes,
      outputStepRows: output.length,
      retainedRoutePrefixes: routeCte.operator_cardinality,
      milliseconds,
      queryMilliseconds: profile.latency * 1000,
      endpointJoinCardinality: cardinality(endpointJoins),
      endpointJoinMilliseconds: timing(endpointJoins),
      boundJoinCardinality: cardinality(boundJoins),
      boundJoinMilliseconds: timing(boundJoins),
      chronologicalJoinCardinality: cardinality(chronologicalJoins),
      chronologicalJoinMilliseconds: timing(chronologicalJoins),
      profilePath,
    }));
  } finally {
    await sdb.close();
  }
}

function details(node: ProfileNode): string {
  return JSON.stringify(node.extra_info ?? {});
}

function isJoin(node: ProfileNode): boolean {
  return node.operator_name?.includes("JOIN") === true;
}

function findOne(
  node: ProfileNode,
  predicate: (candidate: ProfileNode) => boolean,
): ProfileNode {
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const match = findAll(child, predicate)[0];
    if (match !== undefined) return match;
  }
  throw new Error("Expected profile operator was not found.");
}

function findAll(
  node: ProfileNode,
  predicate: (candidate: ProfileNode) => boolean,
): ProfileNode[] {
  return [
    ...(predicate(node) ? [node] : []),
    ...(node.children ?? []).flatMap((child) => findAll(child, predicate)),
  ];
}

function cardinality(nodes: ProfileNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.operator_cardinality ?? 0), 0);
}

function timing(nodes: ProfileNode[]): number {
  return nodes.reduce(
    (sum, node) => sum + (node.operator_timing ?? 0) * 1000,
    0,
  );
}
