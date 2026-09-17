import SimpleDB from "../../src/class/SimpleDB.ts";
import buildGraphTemporalCostStateSql from "../../src/helpers/buildGraphTemporalCostStateSql.ts";
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

const widths = [4, 8, 12];
const layers = 6;
const directory = "benchmarks/.work/graphs/chronological-distances";
await Deno.mkdir(directory, { recursive: true });

for (const width of widths) {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery("SET threads=1; SET memory_limit='1GB'");
    const rows = Array.from(
      { length: layers },
      (_, layer) =>
        Array.from(
          { length: width },
          (_, from) =>
            Array.from({ length: width }, (_, to) => ({
              source: layer === 0 ? "start" : `L${layer}-${from}`,
              target: `L${layer + 1}-${to}`,
              time: new Date(Date.UTC(2025, 0, 1, 0, 0, layer)),
              weight: (from + to) % 3,
            })),
        ).flat(),
    ).flat();
    const source = sdb.newTable("chronological_distance_input").loadArray(rows);
    await source.run();

    const schema = await source.getTypes();
    const prepared = prepareGraphSql(
      quoteIdentifier(source.name),
      schema,
      "source",
      "target",
      "distances()",
    );
    const temporal = prepareGraphTemporalSql(
      schema,
      prepareGraphTemporalOptions(
        { startTimeColumn: "time", strictOrdering: false },
        "outgoing",
        "distances()",
      )!,
      "distances()",
    );
    const startsSelect = `SELECT 'start'::VARCHAR AS ${
      quoteIdentifier("start")
    }, ${prepared.key("'start'::VARCHAR")} AS ${quoteIdentifier("__key")}`;
    const costs = buildGraphTemporalCostStateSql(
      prepared,
      startsSelect,
      "outgoing",
      temporal,
      "HUGEINT",
      `CAST(${quoteIdentifier("edges")}.${
        quoteIdentifier("weight")
      } AS HUGEINT)`,
    );
    const profilePath = `${directory}/width-${width}.json`;
    await sdb.customQuery("SET enable_profiling='json'");
    await sdb.customQuery(`SET profiling_output='${profilePath}'`);
    const started = performance.now();
    const result = await sdb.runQuery(
      `${costs.withClause}
      SELECT count(*) AS ${quoteIdentifier("retainedStates")}
      FROM ${costs.costRelation}`,
      sdb.connection,
      true,
      {
        explainSQL: false,
        logSQL: false,
        method: "chronological distances state benchmark",
        parameters: null,
        values: [temporal.gapParameter],
      },
    );
    const milliseconds = performance.now() - started;
    await sdb.customQuery("SET enable_profiling='no_output'");
    const profile = JSON.parse(await Deno.readTextFile(profilePath)) as
      & ProfileNode
      & { latency: number };
    const transferJoins = findTransferJoins(profile);
    console.log(JSON.stringify({
      width,
      layers,
      events: rows.length,
      possibleRoutes: width ** (layers + 1),
      retainedStates: Number(result?.[0].retainedStates),
      stateBound: rows.length,
      milliseconds,
      queryMilliseconds: profile.latency * 1000,
      transferJoinMilliseconds: transferJoins.reduce(
        (sum, node) => sum + (node.operator_timing ?? 0) * 1000,
        0,
      ),
      transferJoinCardinality: transferJoins.reduce(
        (sum, node) => sum + (node.operator_cardinality ?? 0),
        0,
      ),
      profilePath,
    }));
  } finally {
    await sdb.close();
  }
}

function findTransferJoins(node: ProfileNode): ProfileNode[] {
  const detail = JSON.stringify(node.extra_info ?? {});
  const current = node.operator_name?.includes("JOIN") === true &&
      detail.includes("__node_key") && detail.includes("__from_key")
    ? [node]
    : [];
  return [
    ...current,
    ...(node.children ?? []).flatMap(findTransferJoins),
  ];
}
