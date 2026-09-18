import { assertEquals, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("chronological graph integration preserves direct events while constraining transfers", async () => {
  const sdb = new SimpleDB();
  try {
    const isolated = [{
      flightId: "F0",
      origin: "Toronto",
      destination: "Ottawa",
      departure: new Date("2025-01-01T12:00:00Z"),
      arrival: new Date("2025-01-01T13:00:00Z"),
    }];
    assertEquals(
      await sdb.newTable().loadArray(isolated)
        .neighbors("origin", "destination", "Toronto").getData(),
      [{ start: "Toronto", node: "Ottawa" }],
    );
    assertEquals(
      await sdb.newTable().loadArray(isolated)
        .degree("origin", "destination").getData(),
      [
        { node: "Ottawa", incoming: 1, outgoing: 0, total: 1 },
        { node: "Toronto", incoming: 0, outgoing: 1, total: 1 },
      ],
    );
    assertEquals(
      await sdb.newTable().loadArray(isolated)
        .reachable("origin", "destination", "Toronto", {
          startTimeColumn: "departure",
          endTimeColumn: "arrival",
        }).getData(),
      [{ start: "Toronto", node: "Ottawa" }],
    );
    assertEquals(
      await sdb.newTable().loadArray(isolated)
        .distances("origin", "destination", "Toronto", {
          startTimeColumn: "departure",
          endTimeColumn: "arrival",
        }).getData(),
      [{ start: "Toronto", node: "Ottawa", distance: 1 }],
    );
    const isolatedRoute = [{
      pathId: 0,
      step: 1,
      weight: 1,
      total: 1,
      flightId: "F0",
      origin: "Toronto",
      destination: "Ottawa",
      departure: new Date("2025-01-01T12:00:00Z"),
      arrival: new Date("2025-01-01T13:00:00Z"),
    }];
    assertEquals(
      await sdb.newTable().loadArray(isolated)
        .paths(
          "origin",
          "destination",
          "flightId",
          "Toronto",
          "Ottawa",
          { startTimeColumn: "departure", endTimeColumn: "arrival" },
        ).getData(),
      isolatedRoute,
    );
    assertEquals(
      await sdb.newTable().loadArray(isolated)
        .shortestPath(
          "origin",
          "destination",
          "flightId",
          "Toronto",
          "Ottawa",
          { startTimeColumn: "departure", endTimeColumn: "arrival" },
        ).getData(),
      isolatedRoute,
    );

    const flights = [
      {
        flightId: "F1",
        origin: "A",
        destination: "B",
        departure: new Date("2025-01-01T08:00:00Z"),
        arrival: new Date("2025-01-01T10:00:00Z"),
      },
      {
        flightId: "F2",
        origin: "B",
        destination: "C",
        departure: new Date("2025-01-01T09:00:00Z"),
        arrival: new Date("2025-01-01T10:00:00Z"),
      },
      {
        flightId: "F3",
        origin: "B",
        destination: "D",
        departure: new Date("2025-01-01T11:00:00Z"),
        arrival: new Date("2025-01-01T12:00:00Z"),
      },
    ];
    assertEquals(
      await sdb.newTable().loadArray(flights)
        .neighbors("origin", "destination", "B").getData(),
      [{ start: "B", node: "C" }, { start: "B", node: "D" }],
    );
    assertEquals(
      await sdb.newTable().loadArray(flights)
        .degree("origin", "destination")
        .filter("node = 'B'").getData(),
      [{ node: "B", incoming: 1, outgoing: 2, total: 3 }],
    );
    assertEquals(
      await sdb.newTable().loadArray(flights)
        .degree("origin", "destination", { count: "neighbors" })
        .filter("node = 'B'").getData(),
      [{ node: "B", incoming: 1, outgoing: 2, total: 3 }],
    );
    assertEquals(
      await sdb.newTable().loadArray(flights)
        .reachable("origin", "destination", "A", {
          startTimeColumn: "departure",
          endTimeColumn: "arrival",
          minGapMs: 60 * 60 * 1000,
        }).getData(),
      [{ start: "A", node: "B" }, { start: "A", node: "D" }],
    );
    assertEquals(
      await sdb.newTable().loadArray(flights)
        .paths("origin", "destination", "flightId", "A", "C", {
          startTimeColumn: "departure",
          endTimeColumn: "arrival",
          minGapMs: 60 * 60 * 1000,
        }).getData(),
      [],
    );
    assertEquals(
      await sdb.newTable().loadArray(flights)
        .paths("origin", "destination", "flightId", "A", "D", {
          startTimeColumn: "departure",
          endTimeColumn: "arrival",
          minGapMs: 60 * 60 * 1000,
        }).getData(),
      [
        {
          pathId: 0,
          step: 1,
          weight: 1,
          total: 1,
          flightId: "F1",
          origin: "A",
          destination: "B",
          departure: new Date("2025-01-01T08:00:00Z"),
          arrival: new Date("2025-01-01T10:00:00Z"),
        },
        {
          pathId: 0,
          step: 2,
          weight: 1,
          total: 2,
          flightId: "F3",
          origin: "B",
          destination: "D",
          departure: new Date("2025-01-01T11:00:00Z"),
          arrival: new Date("2025-01-01T12:00:00Z"),
        },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("direct graph counts do not multiply parallel events by feasible transfers", async () => {
  const sdb = new SimpleDB();
  try {
    const parallel = [
      {
        edgeId: "AB1",
        source: "A",
        target: "B",
        departure: new Date("2025-01-01T07:00:00Z"),
        arrival: new Date("2025-01-01T09:00:00Z"),
        weight: 1,
      },
      {
        edgeId: "AB2",
        source: "A",
        target: "B",
        departure: new Date("2025-01-01T08:00:00Z"),
        arrival: new Date("2025-01-01T09:00:00Z"),
        weight: 2,
      },
      {
        edgeId: "BC1",
        source: "B",
        target: "C",
        departure: new Date("2025-01-01T10:00:00Z"),
        arrival: new Date("2025-01-01T11:00:00Z"),
        weight: 3,
      },
      {
        edgeId: "BC2",
        source: "B",
        target: "C",
        departure: new Date("2025-01-01T11:00:00Z"),
        arrival: new Date("2025-01-01T12:00:00Z"),
        weight: 4,
      },
    ];
    assertEquals(
      await sdb.newTable().loadArray(parallel)
        .neighbors("source", "target", "B").getData(),
      [{ start: "B", node: "C" }],
    );
    assertEquals(
      await sdb.newTable().loadArray(parallel)
        .degree("source", "target").filter("node = 'B'").getData(),
      [{ node: "B", incoming: 2, outgoing: 2, total: 4 }],
    );
    assertEquals(
      await sdb.newTable().loadArray(parallel)
        .degree("source", "target", { count: "neighbors" })
        .filter("node = 'B'").getData(),
      [{ node: "B", incoming: 1, outgoing: 1, total: 2 }],
    );
    assertEquals(
      await sdb.newTable().loadArray(parallel)
        .degree("source", "target", { weight: "weight" })
        .filter("node = 'B'").getData(),
      [{ node: "B", incoming: 3, outgoing: 7, total: 10 }],
    );
    assertEquals(
      new Set(
        (await sdb.newTable().loadArray(parallel)
          .renameColumns({ weight: "cost" })
          .paths("source", "target", "edgeId", "A", "C", {
            startTimeColumn: "departure",
            endTimeColumn: "arrival",
            minGapMs: 60 * 60 * 1000,
          }).getData()).map((row) => row.pathId),
      ).size,
      4,
    );

    const standaloneCommon = [
      { source: "X", target: "Z", time: new Date("2025-01-01T15:00:00Z") },
      { source: "Y", target: "Z", time: new Date("2025-01-01T08:00:00Z") },
    ];
    assertEquals(
      await sdb.newTable().loadArray(standaloneCommon)
        .commonNeighbors("source", "target", "X", "Y").getData(),
      [{ node: "Z" }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("every remaining sequence method rejects explicit non-strict ordering without a time column", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    const calls = [
      () =>
        table.reachable("source", "target", "A", {
          strictOrdering: false,
        }),
      () =>
        table.distances("source", "target", "A", {
          strictOrdering: false,
        }),
      () =>
        table.shortestPath("source", "target", "edgeId", "A", "B", {
          strictOrdering: false,
        }),
      () =>
        table.paths("source", "target", "edgeId", "A", "B", {
          strictOrdering: false,
        }),
    ];
    for (const call of calls) {
      assertThrows(
        call,
        TypeError,
        "require options.startTimeColumn or options.endTimeColumn",
      );
    }
  } finally {
    await sdb.close();
  }
});
