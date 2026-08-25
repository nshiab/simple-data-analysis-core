import { assertEquals } from "@std/assert";
import { getOsmFileSuffix } from "../../../src/helpers/osmFiles.ts";

Deno.test("getOsmFileSuffix detects complete local and remote OSM suffixes", () => {
  assertEquals(getOsmFileSuffix("extract.osm"), ".osm");
  assertEquals(getOsmFileSuffix("extract.OSM.PBF"), ".osm.pbf");
  assertEquals(
    getOsmFileSuffix("https://example.com/extract.osm.pbf?download=1"),
    ".osm.pbf",
  );
  assertEquals(getOsmFileSuffix("extract.pbf"), null);
  assertEquals(getOsmFileSuffix("extract.geojson"), null);
});
