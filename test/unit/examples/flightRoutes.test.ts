import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

const chronological = {
  startTimeColumn: "departure",
  endTimeColumn: "arrival",
  elapsedTime: true,
  weight: "price",
  minGapMs: 60 * 60 * 1000,
};

// Independently enumerated chronological routes; see graphs/flights.md.
const cheapest = [
  ["Toronto", 80, 1.5],
  ["New York", 120, 1.5],
  ["Vancouver", 180, 5.5],
  ["Mexico City", 290, 9],
  ["London", 350, 10],
  ["Paris", 430, 12.25],
  ["Frankfurt", 460, 13],
  ["Dubai", 590, 19],
  ["Tokyo", 700, 17],
  ["Singapore", 770, 28.5],
  ["Sydney", 1020, 38],
] as const;

Deno.test("fictional flights compare cheapest destinations and fastest Tokyo itinerary", async () => {
  const sdb = new SimpleDB();
  try {
    const flights = sdb.newTable("flights").loadData(
      "test/data/graphs/flights.csv",
    );
    const rows = await flights.getData();
    assertEquals(rows.length, 33);
    assertEquals(new Set(rows.map((row) => row.flightId)).size, 33);
    assertEquals(
      new Set(rows.flatMap((row) => [row.origin, row.destination])).size,
      12,
    );
    const types = await flights.getTypes();
    assertEquals(types.departure, "TIMESTAMP");
    assertEquals(types.arrival, "TIMESTAMP");
    const distances = await flights.distances(
      "origin",
      "destination",
      "Montreal",
      { ...chronological, minimize: "weight", outputTable: "distances" },
    ).getData();
    assertEquals(
      distances,
      cheapest.map(([node, total, hours]) => ({
        start: "Montreal",
        node,
        total,
        elapsedTimeMs: hours * 3_600_000,
      })),
    );
    const fastest = await flights.shortestPath(
      "origin",
      "destination",
      "flightId",
      "Montreal",
      "Tokyo",
      { ...chronological, minimize: "elapsedTime", outputTable: "fastest" },
    ).selectColumns(["flightId", "weight", "total", "elapsedTimeMs"]).getData();
    assertEquals(fastest, [
      { flightId: "F006", weight: 150, total: 150, elapsedTimeMs: 5_400_000 },
      { flightId: "F033", weight: 900, total: 1050, elapsedTimeMs: 57_600_000 },
    ]);
    const cheapestPath = await flights.shortestPath(
      "origin",
      "destination",
      "flightId",
      "Montreal",
      "Tokyo",
      { ...chronological, minimize: "weight", outputTable: "cheapestPath" },
    ).selectColumns(["flightId", "total", "elapsedTimeMs"]).getData();
    assertEquals(cheapestPath, [
      { flightId: "F003", total: 180, elapsedTimeMs: 19_800_000 },
      { flightId: "F014", total: 700, elapsedTimeMs: 61_200_000 },
    ]);
    const withoutLayover = await flights.shortestPath(
      "origin",
      "destination",
      "flightId",
      "Montreal",
      "Tokyo",
      {
        ...chronological,
        minGapMs: 0,
        minimize: "weight",
        outputTable: "withoutLayover",
      },
    ).selectColumns(["flightId", "total"]).getData();
    assertEquals(withoutLayover, [
      { flightId: "F001", total: 80 },
      { flightId: "F007", total: 280 },
    ]);
  } finally {
    await sdb.close();
  }
});
