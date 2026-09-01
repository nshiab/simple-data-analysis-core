import type { IndexDefinition } from "./indexDefinitions.ts";
import parseValue from "./parseValue.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

export default function buildCreateIndexQuery(
  table: string,
  index: IndexDefinition,
): string {
  switch (index.kind) {
    case "fts":
      return buildFtsIndexQuery(table, index);
    case "vss":
      return buildVssIndexQuery(table, index);
    default:
      return assertNever(index);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported index definition: ${JSON.stringify(value)}`);
}

function buildVssIndexQuery(
  table: string,
  index: Extract<IndexDefinition, { kind: "vss" }>,
): string {
  const withOptions = ["metric = 'cosine'"];
  if (index.options.efConstruction !== undefined) {
    withOptions.push(`ef_construction = ${index.options.efConstruction}`);
  }
  if (index.options.efSearch !== undefined) {
    withOptions.push(`ef_search = ${index.options.efSearch}`);
  }
  if (index.options.M !== undefined) {
    withOptions.push(`M = ${index.options.M}`);
  }
  return `CREATE INDEX ${quoteIdentifier(index.name)} ON ${
    quoteIdentifier(table)
  }
    USING HNSW (${quoteIdentifier(index.column)})
    WITH (${withOptions.join(", ")});`;
}

function buildFtsIndexQuery(
  table: string,
  index: Extract<IndexDefinition, { kind: "fts" }>,
): string {
  const options = index.options;
  return `PRAGMA create_fts_index(${quoteIdentifier(table)}, ${
    quoteIdentifier(index.idColumn)
  }, ${quoteIdentifier(index.textColumn)}${
    options.stemmer ? `, stemmer = ${parseValue(options.stemmer)}` : ""
  }${
    options.stopwords ? `, stopwords = ${parseValue(options.stopwords)}` : ""
  }${options.ignore ? `, ignore = ${parseValue(options.ignore)}` : ""}${
    options.stripAccents !== undefined
      ? `, strip_accents = ${options.stripAccents ? 1 : 0}`
      : ""
  }${
    options.lower !== undefined ? `, lower = ${options.lower ? 1 : 0}` : ""
  });`;
}
