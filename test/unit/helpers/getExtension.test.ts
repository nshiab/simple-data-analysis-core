import { test, expect } from "vite-plus/test";

import getExtension from "../../../src/helpers/getExtension.ts";

test("should return the extension when csv", function () {
  const extension = getExtension("coucou/key2/pat.a.te.csv");
  expect(extension).toStrictEqual("csv");
});
test("should return the extension when csv is compressed", function () {
  const extension = getExtension("coucou/key2/pat.a.te.csv.gz");
  expect(extension).toStrictEqual("csv");
});
test("should return the extension when json", function () {
  const extension = getExtension("coucou/key2/pat.a.te.json");
  expect(extension).toStrictEqual("json");
});
test("should return the extension when json is compressed", function () {
  const extension = getExtension("coucou/key2/pat.a.te.json.gz");
  expect(extension).toStrictEqual("json");
});
test("should return the extension when parquet", function () {
  const extension = getExtension("coucou/key2/pat.a.te.parquet");
  expect(extension).toStrictEqual("parquet");
});
