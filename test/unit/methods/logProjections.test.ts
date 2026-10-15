import { test, expect, vi } from "vite-plus/test";
import SimpleDB from "../../../src/class/SimpleDB.ts";

test("logProjections reports missing geometry and the geometry column's projection", async () => {
  const sdb = new SimpleDB();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await sdb
      .newTable("plain")
      .loadArray([{ value: 1 }])
      .logProjections();
    expect(log.mock.calls).toStrictEqual([
      ["\nTable plain projections:"],
      ["No geometry columns found."],
    ]);
    log.mockClear();
    await sdb.newTable("point").loadGeoData("test/geodata/files/point.json").logProjections();
    expect(log.mock.calls).toStrictEqual([
      ["\nTable point projections:"],
      ["- Column \"geom\": GEOMETRY('EPSG:4326')"],
    ]);
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});
