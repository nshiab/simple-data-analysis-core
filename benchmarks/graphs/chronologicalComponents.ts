import SimpleDB from "../../src/class/SimpleDB.ts";
import buildGraphTemporalReachabilitySql from "../../src/helpers/buildGraphTemporalReachabilitySql.ts";
import {
  buildMaximalGraphCliquesSql,
} from "../../src/helpers/buildChronologicalGraphComponentsSql.ts";
import prepareGraphTemporalSql, {
  prepareGraphTemporalOptions,
} from "../../src/helpers/prepareGraphTemporalSql.ts";
import { prepareGraphSql } from "../../src/helpers/prepareGraphTraversal.ts";
import quoteIdentifier from "../../src/helpers/quoteIdentifier.ts";

type ProfileNode = {
  children?: ProfileNode[];
  extra_info?: Record<string, unknown>;
  operator_cardinality?: number;
  operator_name?: string;
  operator_timing?: number;
};

type Profile = ProfileNode & {
  latency: number;
  system_peak_buffer_memory?: number;
  system_peak_temp_dir_size?: number;
};

const completeNodes = 32;
const multipartiteParts = 6;
const partSize = 3;
const directory = "benchmarks/.work/graphs/chronological-components";
await Deno.mkdir(directory, { recursive: true });

const sdb = new SimpleDB();
try {
  await sdb.customQuery("SET threads=1; SET memory_limit='1GB'");
  const time = new Date("2025-01-01T00:00:00Z");
  const events = Array.from(
    { length: completeNodes },
    (_, source) =>
      Array.from({ length: completeNodes }, (_, target) => ({
        source,
        target,
        time,
      })).filter((event) => event.source !== event.target),
  ).flat();
  const input = sdb.newTable("chronological_component_events")
    .loadArray(events);
  await input.run();
  const schema = await input.getTypes();
  const prepared = prepareGraphSql(
    quoteIdentifier(input.name),
    schema,
    "source",
    "target",
    "connectedComponents()",
  );
  const temporal = prepareGraphTemporalSql(
    schema,
    prepareGraphTemporalOptions(
      { startTimeColumn: "time" },
      undefined,
      "connectedComponents()",
    )!,
    "connectedComponents()",
  );
  const reachability = buildGraphTemporalReachabilitySql(
    prepared,
    (edges) =>
      `SELECT "__from" AS "start", "__from_key" AS "__key" FROM ${edges}
      UNION SELECT "__to", "__to_key" FROM ${edges}`,
    "outgoing",
    temporal,
  );
  const reachabilityProfile = await profileQuery(
    sdb,
    `${directory}/all-pairs-reachability.json`,
    `${reachability.withClause}
    SELECT count(*) AS states FROM ${reachability.reachableRelation}`,
    [temporal.gapParameter],
  );
  const reachabilityRows = reachabilityProfile.rows as { states: number }[];
  const reachabilityCte = findOne(
    reachabilityProfile.profile,
    (node) =>
      node.operator_name === "REC_CTE" &&
      node.extra_info?.["CTE Name"] === "graph_reachable_states",
  );
  console.log(JSON.stringify({
    phase: "all-pairs reachability",
    shape: "complete direct mutual graph",
    nodes: completeNodes,
    events: events.length,
    retainedStates: reachabilityRows[0].states,
    stateBound: completeNodes * events.length,
    recursiveRows: reachabilityCte.operator_cardinality,
    ...measurements(reachabilityProfile),
  }));

  for (
    const scenario of [
      { name: "complete", nodes: completeNodes, parts: 1 },
      {
        name: "complete-multipartite",
        nodes: multipartiteParts * partSize,
        parts: multipartiteParts,
      },
    ]
  ) {
    const nodes = quoteIdentifier("benchmark_component_nodes");
    const mutual = quoteIdentifier("benchmark_mutual_neighbors");
    const relations = {
      adjacency: quoteIdentifier("graph_mutual_adjacency"),
      initial: quoteIdentifier("graph_clique_initial"),
      maximal: quoteIdentifier("graph_maximal_cliques"),
      numbered: quoteIdentifier("graph_numbered_cliques"),
      search: quoteIdentifier("graph_clique_search"),
    };
    const differentParts = scenario.name === "complete"
      ? "TRUE"
      : `floor("left"."node" / ${partSize}) != floor("right"."node" / ${partSize})`;
    const cliqueSql = `WITH RECURSIVE ${nodes} AS MATERIALIZED (
        SELECT "node", "node" AS "__key"
        FROM range(${scenario.nodes}) AS "vertices"("node")
      ), ${mutual} AS MATERIALIZED (
        SELECT "left"."node" AS "__key",
          "right"."node" AS "__neighbor_key"
        FROM ${nodes} AS "left"
        CROSS JOIN ${nodes} AS "right"
        WHERE "left"."node" != "right"."node" AND ${differentParts}
      ), ${buildMaximalGraphCliquesSql(nodes, mutual, relations)}
      SELECT count(*) AS groups,
        CAST(sum(len("__members")) AS BIGINT) AS memberships
      FROM ${relations.numbered}`;
    const result = await profileQuery(
      sdb,
      `${directory}/${scenario.name}-cliques.json`,
      cliqueSql,
      [],
    );
    const rows = result.rows as { groups: number; memberships: number }[];
    const cliqueSearch = findOne(
      result.profile,
      (node) =>
        node.operator_name === "REC_CTE" &&
        node.extra_info?.["CTE Name"] === "graph_clique_search",
    );
    const expectedGroups = scenario.name === "complete"
      ? 1
      : partSize ** scenario.parts;
    const expectedMemberships = scenario.name === "complete"
      ? scenario.nodes
      : scenario.parts * expectedGroups;
    if (
      rows[0].groups !== expectedGroups ||
      rows[0].memberships !== expectedMemberships
    ) {
      throw new Error(`Unexpected ${scenario.name} clique counts.`);
    }
    console.log(JSON.stringify({
      phase: "maximal-clique enumeration",
      shape: scenario.name,
      nodes: scenario.nodes,
      parts: scenario.parts,
      groups: rows[0].groups,
      memberships: rows[0].memberships,
      recursiveStates: cliqueSearch.operator_cardinality,
      ...measurements(result),
    }));
  }
} finally {
  await sdb.close();
}

async function profileQuery(
  sdb: SimpleDB,
  profilePath: string,
  query: string,
  values: (string | number | bigint)[],
): Promise<{
  milliseconds: number;
  processRssAfter: number;
  processRssBefore: number;
  profile: Profile;
  rows: Record<string, unknown>[];
}> {
  await sdb.customQuery("SET enable_profiling='json'");
  await sdb.customQuery(`SET profiling_output='${profilePath}'`);
  const processRssBefore = Deno.memoryUsage().rss;
  const started = performance.now();
  const rows = await sdb.runQuery(query, sdb.connection, true, {
    explainSQL: false,
    logSQL: false,
    method: "chronological component benchmark",
    parameters: null,
    values,
  });
  const milliseconds = performance.now() - started;
  const processRssAfter = Deno.memoryUsage().rss;
  await sdb.customQuery("SET enable_profiling='no_output'");
  const profile = JSON.parse(await Deno.readTextFile(profilePath)) as Profile;
  return {
    milliseconds,
    processRssAfter,
    processRssBefore,
    profile,
    rows: rows ?? [],
  };
}

function measurements(result: {
  milliseconds: number;
  processRssAfter: number;
  processRssBefore: number;
  profile: Profile;
}) {
  return {
    milliseconds: result.milliseconds,
    queryMilliseconds: result.profile.latency * 1000,
    enginePeakBufferBytes: result.profile.system_peak_buffer_memory ?? null,
    enginePeakTempBytes: result.profile.system_peak_temp_dir_size ?? null,
    processRssBefore: result.processRssBefore,
    processRssAfter: result.processRssAfter,
    processRssChange: result.processRssAfter - result.processRssBefore,
  };
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
