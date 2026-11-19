import { test } from "vite-plus/test";
import { assertThrows } from "../../helpers/assertions.ts";

import assertNewColumns from "../../../src/helpers/assertNewColumns.ts";

const schema = { a: "BIGINT", b: "VARCHAR" };

test("assertNewColumns - passes when the column does not exist", () => {
  // No throw means it passes.
  assertNewColumns(schema, ["c"], "cloneColumn()");
});

test("assertNewColumns - passes for several new columns", () => {
  assertNewColumns(schema, ["c", "d"], "extractLatLon()");
});

test("assertNewColumns - throws when the column already exists", () => {
  assertThrows(
    () => assertNewColumns(schema, ["b"], "cloneColumn()"),
    Error,
    'cloneColumn() the column "b" already exists',
  );
});

test("assertNewColumns - throws if any one of several columns exists", () => {
  assertThrows(
    () => assertNewColumns(schema, ["c", "a"], "extractLatLon()"),
    Error,
    'the column "a" already exists',
  );
});

test("assertNewColumns - allows an existing column listed in allowInPlace", () => {
  // splitExtract() may write back to the column it splits.
  assertNewColumns(schema, ["b"], "splitExtract()", ["b"]);
});

test("assertNewColumns - still throws for an existing column not in allowInPlace", () => {
  assertThrows(
    () => assertNewColumns(schema, ["a"], "splitExtract()", ["b"]),
    Error,
    'the column "a" already exists',
  );
});

test("assertNewColumns - passes for an empty column list", () => {
  assertNewColumns(schema, [], "cloneColumn()");
});

test("assertNewColumns can check DuckDB identifier collisions and allow a replaced name", () => {
  const options = { checkDuckDBNameCollisions: true };
  assertNewColumns(schema, ["A"], "unnest()", ["a"], options);
  assertThrows(
    () => assertNewColumns(schema, ["B"], "unnest()", ["a"], options),
    Error,
    'the column "B" already exists',
  );
  assertThrows(
    () => assertNewColumns(schema, ["A", "a"], "unnest()", ["a"], options),
    Error,
    'the column "a" already exists',
  );
});
