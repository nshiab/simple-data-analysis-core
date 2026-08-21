import { assertEquals } from "@std/assert";
import {
  getIndexCacheStrategy,
  type IndexDefinition,
} from "../../../src/helpers/indexDefinitions.ts";

Deno.test("should define the cache strategy for every index kind", () => {
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

  assertEquals(indexes.map(getIndexCacheStrategy), ["persist", "rebuild"]);
});
