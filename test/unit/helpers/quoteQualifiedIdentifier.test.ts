import { assertEquals } from "@std/assert";
import quoteQualifiedIdentifier from "../../../src/helpers/quoteQualifiedIdentifier.ts";

Deno.test("quoteQualifiedIdentifier - quotes the relation and identifier separately", () => {
  assertEquals(
    quoteQualifiedIdentifier('people "archive"', "full name"),
    '"people ""archive"""."full name"',
  );
});
