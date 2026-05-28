import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import { readFileSync } from "node:fs";

Deno.test("should remove the small circle from the big circle", async () => {
  const sdb = new SimpleDB();

  const table = sdb.newTable();
  await table.loadGeoData("test/geodata/files/bigCircleWithHole.json");

  await table.fillHoles();

  const types = await table.getTypes();
  assertEquals(types.geom, "GEOMETRY('EPSG:4326')");

  await table.writeGeoData("test/output/bigCircleWithHoleFilled.json");

  assertEquals(
    JSON.parse(
      readFileSync("test/output/bigCircleWithHoleFilled.json", {
        encoding: "utf-8",
      }),
    ),
    JSON.parse(
      readFileSync("test/geodata/tests-results/bigCircleWithHoleFilled.json", {
        encoding: "utf-8",
      }),
    ),
  );
  await sdb.done();
});
