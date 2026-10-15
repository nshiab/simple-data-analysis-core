import { test, expect } from "vite-plus/test";

import { getOsmFileSuffix } from "../../../src/helpers/osmFiles.ts";

test("getOsmFileSuffix detects complete local and remote OSM suffixes", () => {
  expect(getOsmFileSuffix("extract.osm")).toStrictEqual(".osm");
  expect(getOsmFileSuffix("extract.OSM.PBF")).toStrictEqual(".osm.pbf");
  expect(getOsmFileSuffix("https://example.com/extract.osm.pbf?download=1")).toStrictEqual(
    ".osm.pbf",
  );
  expect(getOsmFileSuffix("extract.pbf")).toStrictEqual(null);
  expect(getOsmFileSuffix("extract.geojson")).toStrictEqual(null);
});
