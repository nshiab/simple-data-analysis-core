import type { DuckDBConnection } from "@duckdb/node-api";
import {
  buildFuzzyGraph,
  buildNeighbors,
  prepareInput,
  type PrototypeOptions,
  resolveOptions,
  scalar,
} from "../prototypeUmap.ts";
import fitUmapCurve from "./fitUmapCurve.ts";
import optimizeUmapLayout from "./optimizeUmapLayout.ts";
import { initialUmapCoordinates } from "./umapRandom.ts";

type HybridOptions = Omit<PrototypeOptions, "batches" | "minDistance"> & {
  minDistance?: number;
  signal?: AbortSignal;
};

export async function writeUmapCoordinates(
  connection: DuckDBConnection,
  table: string,
  coordinates: Float64Array,
) {
  if (!["umap_layout", "umap_initial"].includes(table)) {
    throw new Error("Invalid internal coordinate table.");
  }
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE ${table} (vertex INTEGER,x DOUBLE,y DOUBLE)`,
  );
  const appender = await connection.createAppender(table);
  try {
    for (let vertex = 0; vertex < coordinates.length / 2; vertex++) {
      appender.appendInteger(vertex);
      appender.appendDouble(coordinates[2 * vertex]);
      appender.appendDouble(coordinates[2 * vertex + 1]);
      appender.endRow();
    }
  } finally {
    appender.closeSync();
  }
}

// Unpublished prototype, with the same dedicated-connection/input(id,vector,...)
// contract as the original SQL lab. It owns the umap_* scratch tables. Input is
// never mutated; umap_result is replaced only after a successful fit.
export default async function prototypeHybridUmap(
  connection: DuckDBConnection,
  options: HybridOptions = {},
  onStage?: (stage: string, milliseconds: number) => void | Promise<void>,
  onEpoch?: (epoch: number) => void | Promise<void>,
) {
  const { signal, minDistance = 0.1, ...graphOptions } = options;
  signal?.throwIfAborted();
  // Validate continuous curve settings and seed before any expensive SQL work.
  fitUmapCurve(minDistance);
  const settings = resolveOptions({ learningRate: 1, ...graphOptions });
  if (settings.seed > 0xffffffff) {
    throw new Error("seed must be an unsigned 32-bit integer.");
  }
  const interrupt = () => connection.interrupt();
  signal?.addEventListener("abort", interrupt, { once: true });
  const stage = async <T>(name: string, action: () => Promise<T>) => {
    signal?.throwIfAborted();
    const start = performance.now();
    const result = await action();
    await onStage?.(name, performance.now() - start);
    signal?.throwIfAborted();
    return result;
  };
  try {
    const input = await stage(
      "validation",
      () => prepareInput(connection, settings),
    );
    settings.neighbors = input.neighbors;
    const plan = await stage(
      "neighbors",
      () => buildNeighbors(connection, input, settings),
    );
    await stage(
      "fuzzyGraph",
      () => buildFuzzyGraph(connection, input.neighbors),
    );
    const graph = await stage("graphTransfer", async () => {
      const edges = await scalar(connection, "SELECT count(*) FROM umap_graph");
      const source = new Uint32Array(edges),
        target = new Uint32Array(edges),
        weight = new Float64Array(edges);
      const rows = await connection.stream(
        "SELECT source,target,weight FROM umap_graph ORDER BY source,target",
      );
      let edge = 0;
      for await (const chunk of rows.yieldRowsJs()) {
        for (const row of chunk) {
          source[edge] = Number(row[0]);
          target[edge] = Number(row[1]);
          weight[edge] = Number(row[2]);
          edge++;
        }
      }
      if (edge !== edges) throw new Error("Graph changed during transfer.");
      return { source, target, weight };
    });
    await stage("releaseScratch", async () => {
      await connection.run(`DROP TABLE IF EXISTS umap_search;
        DROP TABLE IF EXISTS umap_candidates; DROP TABLE umap_knn;
        DROP TABLE umap_directed; ALTER TABLE umap_rows DROP COLUMN vec`);
    });
    const initial = initialUmapCoordinates(input.count, settings.seed);
    const coordinates = await stage(
      "layout",
      () =>
        optimizeUmapLayout(graph, initial, {
          ...settings,
          minDistance,
          signal,
          onEpoch,
        }),
    );
    await stage("writeback", async () => {
      await writeUmapCoordinates(connection, "umap_layout", coordinates);
      await connection.run(`CREATE OR REPLACE TEMP TABLE umap_result AS
        SELECT i.*,l.x AS umap_x,l.y AS umap_y FROM input i
        JOIN umap_rows r ON i.id=r.id JOIN umap_layout l USING(vertex)`);
    });
    const { batches: _batches, ...effectiveSettings } = settings;
    return {
      ...input,
      settings: { ...effectiveSettings, minDistance },
      plan,
      initial,
    };
  } finally {
    signal?.removeEventListener("abort", interrupt);
  }
}
