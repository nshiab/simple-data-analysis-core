import { test, expect } from "vite-plus/test";

import {
  getIndexCacheStrategy,
  type IndexDefinition,
} from "../../../src/helpers/indexDefinitions.ts";

test("should define the cache strategy for every index kind", () => {
  const indexes: IndexDefinition[] = [
    {
      kind: "fts",
      name: "fts_index_articles",
      idColumn: "id",
      textColumn: "text",
      options: {},
    },
    {
      kind: "vss",
      name: "vss_cosine_index_articles",
      column: "embedding",
      options: {},
    },
  ];

  expect(indexes.map(getIndexCacheStrategy)).toStrictEqual(["persist", "rebuild"]);
});
