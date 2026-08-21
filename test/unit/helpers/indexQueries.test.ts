import { assertEquals } from "@std/assert";
import buildCreateIndexQuery from "../../../src/helpers/indexQueries.ts";

Deno.test("should build an FTS index query from its definition", () => {
  assertEquals(
    buildCreateIndexQuery("articles", {
      kind: "fts",
      name: "fts_index_articles",
      idColumn: "article id",
      textColumn: "article text",
      options: {
        stemmer: "english",
        stopwords: "none",
        ignore: "[^a-z]+",
        stripAccents: false,
        lower: false,
      },
    }),
    `PRAGMA create_fts_index("articles", "article id", "article text", stemmer = 'english', stopwords = 'none', ignore = '[^a-z]+', strip_accents = 0, lower = 0);`,
  );
});

Deno.test("should build a VSS index query from its definition", () => {
  assertEquals(
    buildCreateIndexQuery("article embeddings", {
      kind: "vss",
      name: "vss_cosine_index_articles",
      column: "embedding vector",
      options: {
        efConstruction: 0,
        efSearch: 0,
        M: 0,
      },
    }),
    `CREATE INDEX "vss_cosine_index_articles" ON "article embeddings"
    USING HNSW ("embedding vector")
    WITH (metric = 'cosine', ef_construction = 0, ef_search = 0, M = 0);`,
  );
});
