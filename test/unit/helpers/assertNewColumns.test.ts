import { assertThrows } from "@std/assert";
import assertNewColumns from "../../../src/helpers/assertNewColumns.ts";

const schema = { a: "BIGINT", b: "VARCHAR" };

Deno.test("assertNewColumns - passes when the column does not exist", () => {
  // No throw means it passes.
  assertNewColumns(schema, ["c"], "cloneColumn()");
});

Deno.test("assertNewColumns - passes for several new columns", () => {
  assertNewColumns(schema, ["c", "d"], "latLon()");
});

Deno.test("assertNewColumns - throws when the column already exists", () => {
  assertThrows(
    () => assertNewColumns(schema, ["b"], "cloneColumn()"),
    Error,
    'cloneColumn() the column "b" already exists',
  );
});

Deno.test("assertNewColumns - throws if any one of several columns exists", () => {
  assertThrows(
    () => assertNewColumns(schema, ["c", "a"], "latLon()"),
    Error,
    'the column "a" already exists',
  );
});

Deno.test("assertNewColumns - allows an existing column listed in allowInPlace", () => {
  // splitExtract() may write back to the column it splits.
  assertNewColumns(schema, ["b"], "splitExtract()", ["b"]);
});

Deno.test("assertNewColumns - still throws for an existing column not in allowInPlace", () => {
  assertThrows(
    () => assertNewColumns(schema, ["a"], "splitExtract()", ["b"]),
    Error,
    'the column "a" already exists',
  );
});

Deno.test("assertNewColumns - passes for an empty column list", () => {
  assertNewColumns(schema, [], "cloneColumn()");
});
