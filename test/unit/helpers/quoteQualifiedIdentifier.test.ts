import { test, expect } from "vite-plus/test";

import quoteQualifiedIdentifier from "../../../src/helpers/quoteQualifiedIdentifier.ts";

test("quoteQualifiedIdentifier - quotes the relation and identifier separately", () => {
  expect(quoteQualifiedIdentifier('people "archive"', "full name")).toStrictEqual(
    '"people ""archive"""."full name"',
  );
});
