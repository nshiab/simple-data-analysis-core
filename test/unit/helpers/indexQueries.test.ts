import { test, expect } from "vite-plus/test";

import buildCreateIndexQuery from "../../../src/helpers/indexQueries.ts";

test("should build an FTS index query from its definition", () => {
  expect(
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
  ).toStrictEqual(
    `PRAGMA create_fts_index("articles", "article id", "article text", stemmer = 'english', stopwords = 'none', ignore = '[^a-z]+', strip_accents = 0, lower = 0);`,
  );
});

test("should build a VSS index query from its definition", () => {
  expect(
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
  ).toStrictEqual(`CREATE INDEX "vss_cosine_index_articles" ON "article embeddings"
    USING HNSW ("embedding vector")
    WITH (metric = 'cosine', ef_construction = 0, ef_search = 0, M = 0);`);
});
