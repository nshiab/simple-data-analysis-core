import { DOUBLE, INTEGER, VARCHAR } from "@duckdb/node-api";
import type SimpleTable from "../class/SimpleTable.ts";
import appendColumnBatches from "../helpers/appendColumnBatches.ts";
import buildApproximateMutualReachabilityMst from "../helpers/buildApproximateMutualReachabilityMst.ts";
import buildExactMutualReachabilityMst from "../helpers/buildExactMutualReachabilityMst.ts";
import clusterHdbscan from "../helpers/clusterHdbscan.ts";
import foldIdentifier from "../helpers/foldIdentifier.ts";
import prepareNumericFeatures from "../helpers/prepareNumericFeatures.ts";
import publishPreparedColumns from "../helpers/publishPreparedColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

type Options = NonNullable<Parameters<SimpleTable["hdbscan"]>[2]>;

export default function hdbscan(
  table: SimpleTable,
  columns: string | string[],
  newColumn: string,
  options: Options = {},
): void {
  const selected = typeof columns === "string" ? columns : [...columns];
  const settings = structuredClone(options);
  queueOp(table, {
    kind: "barrier",
    method: "hdbscan()",
    parameters: { columns: selected, newColumn, options: settings },
    execute: () => execute(table, selected, newColumn, settings),
  });
}

async function execute(
  table: SimpleTable,
  columns: string | string[],
  newColumn: string,
  options: Options,
): Promise<void> {
  const {
    minClusterSize = 5,
    metric = "euclidean",
    allowSingleCluster = false,
    approximate = false,
    membershipScoreColumn,
    outlierScoreColumn,
  } = options;
  const minSamples = options.minSamples ?? minClusterSize;
  if (typeof newColumn !== "string") {
    throw new Error("hdbscan() newColumn must be a string.");
  }
  if (!Number.isSafeInteger(minClusterSize) || minClusterSize < 2) {
    throw new Error(
      "hdbscan() minClusterSize must be a safe integer of at least 2.",
    );
  }
  if (!Number.isSafeInteger(minSamples) || minSamples < 1) {
    throw new Error(
      "hdbscan() minSamples must be a safe integer of at least 1.",
    );
  }
  if (!(["euclidean", "cosine"] as unknown[]).includes(metric)) {
    throw new Error('hdbscan() metric must be "euclidean" or "cosine".');
  }
  if (typeof allowSingleCluster !== "boolean") {
    throw new Error("hdbscan() allowSingleCluster must be a boolean.");
  }
  if (typeof approximate !== "boolean") {
    throw new Error("hdbscan() approximate must be a boolean.");
  }
  if (
    membershipScoreColumn !== undefined &&
    typeof membershipScoreColumn !== "string"
  ) {
    throw new Error("hdbscan() membershipScoreColumn must be a string.");
  }
  if (
    outlierScoreColumn !== undefined &&
    typeof outlierScoreColumn !== "string"
  ) {
    throw new Error("hdbscan() outlierScoreColumn must be a string.");
  }

  const sourceColumns = Object.keys(await table.getTypes());
  const outputNames = [newColumn, membershipScoreColumn, outlierScoreColumn]
    .filter(
      (name): name is string => name !== undefined,
    );
  validateOutputNames(sourceColumns, outputNames);

  const prepared = await prepareNumericFeatures(
    table,
    typeof columns === "string"
      ? { kind: "vector", column: columns }
      : { kind: "scalars", columns },
    { method: "hdbscan()" },
  );
  const connection = table.connection!;
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const name = (part: string) => `__sda_hdbscan_${suffix}_${part}`;
  const names = {
    rows: name("rows"),
    neighbors: name("neighbors"),
    search: name("search"),
    hnsw: name("hnsw"),
    candidates: name("candidates"),
    coreDistances: name("core_distances"),
    frontier: name("frontier"),
    edges: name("edges"),
    components: name("components"),
    representatives: name("representatives"),
    componentPairs: name("component_pairs"),
    bridgeCandidates: name("bridge_candidates"),
    mst: name("mst"),
    result: name("result"),
  };
  try {
    if (prepared.rowCount < 2) {
      throw new Error(
        `hdbscan() requires at least 2 rows, but the input has ${prepared.rowCount}.`,
      );
    }
    if (prepared.rowCount > 0x40000000) {
      throw new Error(
        "hdbscan() supports at most 1073741824 rows because its 2*n-1 hierarchy nodes use signed INTEGER identifiers.",
      );
    }
    if (minSamples >= prepared.rowCount) {
      const defaulted = options.minSamples === undefined
        ? " (defaulted from minClusterSize)"
        : "";
      throw new Error(
        `hdbscan() minSamples is ${minSamples}${defaulted}, but ${prepared.rowCount} rows provide at most ${
          prepared.rowCount - 1
        } other point${
          prepared.rowCount === 2 ? "" : "s"
        }. Set minSamples between 1 and ${
          prepared.rowCount - 1
        }, or provide at least ${minSamples + 1} rows.`,
      );
    }
    if (minClusterSize > prepared.rowCount) {
      throw new Error(
        `hdbscan() minClusterSize is ${minClusterSize}, but the input has ${prepared.rowCount} rows. Set minClusterSize between 2 and ${prepared.rowCount}, or provide more rows.`,
      );
    }
    const q = quoteIdentifier;
    await connection.run(
      `CREATE TEMP TABLE ${q(names.rows)} AS
       SELECT ${q(prepared.rowIdColumn)}::INTEGER AS vertex,
         ${q(prepared.vectorColumn)} AS vec
       FROM ${q(prepared.relation)}
       ORDER BY ${q(prepared.rowIdColumn)}`,
    );
    if (approximate) {
      await buildApproximateMutualReachabilityMst(
        connection,
        {
          count: prepared.rowCount,
          dimensions: prepared.dimensions,
          minSamples,
        },
        { metric },
        {
          rows: names.rows,
          neighbors: names.neighbors,
          search: names.search,
          hnsw: names.hnsw,
          candidates: names.candidates,
          coreDistances: names.coreDistances,
          edges: names.edges,
          components: names.components,
          representatives: names.representatives,
          componentPairs: names.componentPairs,
          bridgeCandidates: names.bridgeCandidates,
          mst: names.mst,
        },
      );
    } else {
      await buildExactMutualReachabilityMst(
        connection,
        { count: prepared.rowCount, minSamples },
        { metric },
        {
          rows: q(names.rows),
          coreDistances: q(names.coreDistances),
          frontier: q(names.frontier),
          mst: q(names.mst),
        },
      );
    }
    const result = await clusterHdbscan(connection, q(names.mst), {
      count: prepared.rowCount,
      minClusterSize,
      allowSingleCluster,
    });
    const labelColumn = "label";
    const membershipColumn = "membership";
    const gloshColumn = "glosh";
    const resultColumns = [
      "row_id INTEGER",
      `${labelColumn} VARCHAR`,
      membershipScoreColumn === undefined
        ? undefined
        : `${membershipColumn} DOUBLE`,
      outlierScoreColumn === undefined ? undefined : `${gloshColumn} DOUBLE`,
    ].filter((definition): definition is string => definition !== undefined);
    await connection.run(
      `CREATE TEMP TABLE ${q(names.result)} (${resultColumns.join(",")})`,
    );
    const outputTypes = [
      INTEGER,
      VARCHAR,
      ...(membershipScoreColumn === undefined ? [] : [DOUBLE]),
      ...(outlierScoreColumn === undefined ? [] : [DOUBLE]),
    ];
    await appendColumnBatches(
      connection,
      names.result,
      outputTypes,
      prepared.rowCount,
      (column, start, end) => {
        if (column === 0) {
          return Array.from(
            { length: end - start },
            (_, offset) => start + offset,
          );
        }
        if (column === 1) {
          return Array.from(
            result.labels.subarray(start, end),
            (label) => label < 0 ? "noise" : `cluster-${label}`,
          );
        }
        const membershipIndex = membershipScoreColumn === undefined ? -1 : 2;
        return Array.from(
          column === membershipIndex
            ? result.probabilities.subarray(start, end)
            : result.outlierScores.subarray(start, end),
        );
      },
    );
    const publicationOutputs = [{
      name: newColumn,
      expression: `r.${q(labelColumn)}`,
    }];
    if (membershipScoreColumn !== undefined) {
      publicationOutputs.push({
        name: membershipScoreColumn,
        expression: `r.${q(membershipColumn)}`,
      });
    }
    if (outlierScoreColumn !== undefined) {
      publicationOutputs.push({
        name: outlierScoreColumn,
        expression: `r.${q(gloshColumn)}`,
      });
    }
    await publishPreparedColumns(table, prepared, {
      method: "hdbscan()",
      parameters: { columns, newColumn, options },
      result: { relation: names.result, rowIdColumn: "row_id" },
      outputs: publicationOutputs,
    });
  } finally {
    for (
      const relation of Object.entries(names).reverse().flatMap((
        [key, value],
      ) => key === "hnsw" ? [] : [value])
    ) {
      await connection.run(`DROP TABLE IF EXISTS ${quoteIdentifier(relation)}`);
    }
    await prepared.cleanup();
  }
}

function validateOutputNames(
  sourceColumns: string[],
  outputNames: string[],
): void {
  const seen = new Map<string, string>();
  for (const name of outputNames) {
    if (name.length === 0 || name.includes("\0")) {
      throw new Error(
        "hdbscan() output column names must be non-empty strings without null characters.",
      );
    }
    const folded = foldIdentifier(name);
    const source = sourceColumns.find((column) =>
      foldIdentifier(column) === folded
    );
    if (source !== undefined) {
      throw new Error(
        `hdbscan() cannot create ${
          quoteIdentifier(name)
        } because that source column already exists. Remove it first or choose different output names.`,
      );
    }
    const duplicate = seen.get(folded);
    if (duplicate !== undefined) {
      throw new Error(
        `hdbscan() output columns ${quoteIdentifier(duplicate)} and ${
          quoteIdentifier(name)
        } refer to the same column. Choose distinct output names.`,
      );
    }
    seen.set(folded, name);
  }
}
