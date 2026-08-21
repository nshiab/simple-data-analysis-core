/** The metadata required to identify and recreate a DuckDB HNSW index. */
export type VssIndexDefinition = {
  kind: "vss";
  name: string;
  column: string;
  options: {
    efConstruction?: number;
    efSearch?: number;
    M?: number;
  };
};

/** The metadata required to identify and recreate a DuckDB full-text index. */
export type FtsIndexDefinition = {
  kind: "fts";
  name: string;
  idColumn: string;
  textColumn: string;
  options: {
    stemmer?: string;
    stopwords?: string;
    ignore?: string;
    stripAccents?: boolean;
    lower?: boolean;
  };
};

/** A complete index definition stored by a SimpleTable. */
export type IndexDefinition = VssIndexDefinition | FtsIndexDefinition;

export type IndexCacheStrategy = "persist" | "rebuild";

const INDEX_CACHE_STRATEGIES: Record<
  IndexDefinition["kind"],
  IndexCacheStrategy
> = {
  fts: "persist",
  vss: "rebuild",
};

export function getIndexCacheStrategy(
  index: IndexDefinition,
): IndexCacheStrategy {
  return INDEX_CACHE_STRATEGIES[index.kind];
}
