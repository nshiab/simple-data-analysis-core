import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import { readFileSync } from "node:fs";

test("should simplify the geometries", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");
  table.simplify(0.5);
  table.reducePrecision(1);
  table.sort();

  await table.writeGeoData("test/output/CanadianProvincesAndTerritories-simplified.json");

  expect(
    JSON.parse(
      readFileSync("test/output/CanadianProvincesAndTerritories-simplified.json", {
        encoding: "utf-8",
      }),
    ),
  ).toStrictEqual(
    JSON.parse(
      readFileSync("test/geodata/tests-results/CanadianProvincesAndTerritories-simplified.json", {
        encoding: "utf-8",
      }),
    ),
  );
  await sdb.close();
});
test("should simplify the geometries but keep the outer boundaries intact", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");
  table.simplify(0.5, { simplifyBoundary: false });
  table.reducePrecision(1);
  table.sort();

  await table.writeGeoData("test/output/CanadianProvincesAndTerritories-simplified-interior.json");

  expect(
    JSON.parse(
      readFileSync("test/output/CanadianProvincesAndTerritories-simplified-interior.json", {
        encoding: "utf-8",
      }),
    ),
  ).toStrictEqual(
    JSON.parse(
      readFileSync(
        "test/geodata/tests-results/CanadianProvincesAndTerritories-simplified-interior.json",
        { encoding: "utf-8" },
      ),
    ),
  );
  await sdb.close();
});
test("should simplify the geometries from a specific column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");
  table.simplify(0.5, { column: "geom" });
  table.reducePrecision(1);
  table.sort();

  await table.writeGeoData("test/output/CanadianProvincesAndTerritories-simplified-column.json");

  expect(
    JSON.parse(
      readFileSync("test/output/CanadianProvincesAndTerritories-simplified-column.json", {
        encoding: "utf-8",
      }),
    ),
  ).toStrictEqual(
    JSON.parse(
      readFileSync("test/geodata/tests-results/CanadianProvincesAndTerritories-simplified.json", {
        encoding: "utf-8",
      }),
    ),
  );
  await sdb.close();
});
