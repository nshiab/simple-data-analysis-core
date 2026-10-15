import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import { readFileSync } from "node:fs";

test("should remove the small circle from the big circle", async () => {
  const sdb = new SimpleDB();

  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/bigCircleWithHole.json");

  table.fillHoles();

  const types = await table.getTypes();
  expect(types.geom).toStrictEqual("GEOMETRY('EPSG:4326')");

  await table.writeGeoData("test/output/bigCircleWithHoleFilled.json");

  expect(
    JSON.parse(
      readFileSync("test/output/bigCircleWithHoleFilled.json", {
        encoding: "utf-8",
      }),
    ),
  ).toStrictEqual(
    JSON.parse(
      readFileSync("test/geodata/tests-results/bigCircleWithHoleFilled.json", {
        encoding: "utf-8",
      }),
    ),
  );
  await sdb.close();
});
