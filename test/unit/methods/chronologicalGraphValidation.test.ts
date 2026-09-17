import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { observeSdaQueries } from "../../../benchmarks/queryProfile.ts";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import type SimpleTable from "../../../src/class/SimpleTable.ts";
import { getTableGeneration } from "../../../src/helpers/tableGeneration.ts";

type TemporalGraphCase = {
  method: string;
  run: (
    table: SimpleTable,
    outputTable: string,
  ) => SimpleTable;
};

const temporalGraphCases: TemporalGraphCase[] = [
  {
    method: "reachable()",
    run: (table, outputTable) =>
      table.reachable("source", "target", "unknown", {
        startTimeColumn: "start time",
        endTimeColumn: "end time",
        outputTable,
      }),
  },
  {
    method: "distances()",
    run: (table, outputTable) =>
      table.distances("source", "target", "unknown", {
        startTimeColumn: "start time",
        endTimeColumn: "end time",
        outputTable,
      }),
  },
  {
    method: "shortestPath()",
    run: (table, outputTable) =>
      table.shortestPath("source", "target", "edgeId", "A", "Z", {
        startTimeColumn: "start time",
        endTimeColumn: "end time",
        outputTable,
      }),
  },
  {
    method: "paths()",
    run: (table, outputTable) =>
      table.paths("source", "target", "edgeId", "A", "Z", {
        startTimeColumn: "start time",
        endTimeColumn: "end time",
        outputTable,
      }),
  },
  {
    method: "findCycles()",
    run: (table, outputTable) =>
      table.findCycles("source", "target", "edgeId", {
        startTimeColumn: "start time",
        endTimeColumn: "end time",
        outputTable,
      }),
  },
  {
    method: "connectedComponents()",
    run: (table, outputTable) =>
      table.connectedComponents("source", "target", {
        mode: "strong",
        startTimeColumn: "start time",
        endTimeColumn: "end time",
        outputTable,
      }),
  },
];

const invalidEvents = [
  {
    name: "null",
    row:
      `(2, NULL, 'Y', NULL::TIMESTAMP, TIMESTAMP '2025-01-01 04:00:00', TIMESTAMP 'infinity')`,
    message:
      'selected start-time column "start time" contains a null timestamp',
  },
  {
    name: "infinite",
    row:
      `(2, 'X', 'Y', TIMESTAMP '2025-01-01 03:00:00', TIMESTAMP 'infinity', NULL::TIMESTAMP)`,
    message:
      'selected end-time column "end time" contains an infinite timestamp',
  },
  {
    name: "reversed",
    row:
      `(2, 'X', 'Y', TIMESTAMP '2025-01-01 05:00:00', TIMESTAMP '2025-01-01 04:00:00', NULL::TIMESTAMP)`,
    message:
      'selected end-time column "end time" contains a timestamp before its start in "start time"',
  },
] as const;

Deno.test("all chronological graph methods reject invalid selected timestamps before traversal", async () => {
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    for (const [methodIndex, graph] of temporalGraphCases.entries()) {
      for (const [invalidIndex, invalid] of invalidEvents.entries()) {
        const sourceName = `temporalInvalid${methodIndex}_${invalid.name}`;
        const outputName =
          `temporalInvalidOutput${methodIndex}_${invalidIndex}`;
        const source = sdb.newTable(sourceName);
        await sdb.customQuery(`CREATE TABLE "${sourceName}" AS
          SELECT * FROM (VALUES
            (1, 'A', 'B', TIMESTAMP '2025-01-01 01:00:00', TIMESTAMP '2025-01-01 02:00:00', NULL::TIMESTAMP),
            ${invalid.row}
          ) events(edgeId, source, target, "start time", "end time", ignored)`);
        const queryStart = observer.queries.length;
        await assertRejects(
          () =>
            graph.run(source, outputName)
              .selectRows(0)
              .filter("false")
              .getData(),
          TypeError,
          `${graph.method} ${invalid.message}`,
        );
        assertEquals(await source.getRowCount(), 2);
        const attempted = observer.queries.slice(queryStart).map((entry) =>
          entry.query
        );
        assertEquals(
          attempted.some((query) => query.includes("WITH RECURSIVE")),
          false,
        );
        assertEquals(
          attempted.some((query) => query.includes("__graph_temporal_events")),
          true,
        );
      }
    }
  } finally {
    observer.restore();
    await sdb.close();
  }
});

Deno.test("chronological validation follows queued filtering and checks selected columns only", async () => {
  const sdb = new SimpleDB();
  try {
    for (const [index, graph] of temporalGraphCases.entries()) {
      const sourceName = `temporalFiltered${index}`;
      const source = sdb.newTable(sourceName);
      await sdb.customQuery(`CREATE TABLE "${sourceName}" AS
        SELECT * FROM (VALUES
          (1, 'A', 'B', TIMESTAMP '2025-01-01 01:00:00', TIMESTAMP '2025-01-01 02:00:00', TIMESTAMP 'infinity'),
          (2, 'X', 'Y', NULL::TIMESTAMP, TIMESTAMP '2025-01-01 04:00:00', NULL::TIMESTAMP)
        ) events(edgeId, source, target, "start time", "end time", ignored)`);
      source.filter('"start time" IS NOT NULL');
      await graph.run(source, `temporalFilteredOutput${index}`).run();
      assertEquals(await source.getRowCount(), 1);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("chronological validation runs after queued timestamp conversions", async () => {
  const sdb = new SimpleDB();
  try {
    for (const [index, graph] of temporalGraphCases.entries()) {
      const source = sdb.newTable(`temporalConverted${index}`).loadArray([{
        edgeId: 1,
        source: "A",
        target: "B",
        "start time": "2025-01-01 01:00:00",
        "end time": "2025-01-01 02:00:00",
      }]);
      source.convert({
        "start time": "datetime",
        "end time": "datetime",
      });
      await graph.run(source, `temporalConvertedOutput${index}`).run();
      const types = await source.getTypes();
      assertStringIncludes(types["start time"], "TIMESTAMP");
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("source-preserving chronological validation does not mutate the source generation", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("temporalSourceGeneration").loadArray([{
      edgeId: 1,
      source: "A",
      target: "B",
      time: new Date("2025-01-01T00:00:00Z"),
    }]);
    await source.run();
    const generation = getTableGeneration(source);
    assertEquals(
      await source.reachable("source", "target", "A", {
        startTimeColumn: "time",
        outputTable: "temporalGenerationOutput",
      }).getData(),
      [{ start: "A", node: "B" }],
    );
    assertEquals(getTableGeneration(source), generation);
  } finally {
    await sdb.close();
  }
});

Deno.test("all chronological graph methods accept an empty typed input", async () => {
  const sdb = new SimpleDB();
  try {
    for (const [index, graph] of temporalGraphCases.entries()) {
      const sourceName = `emptyTemporalValidation${index}`;
      const source = sdb.newTable(sourceName);
      await sdb.customQuery(`CREATE TABLE "${sourceName}" (
        edgeId BIGINT, source VARCHAR, target VARCHAR,
        "start time" TIMESTAMP, "end time" TIMESTAMP
      )`);
      assertEquals(
        await graph.run(source, `emptyTemporalOutput${index}`).getData(),
        [],
      );
    }
  } finally {
    await sdb.close();
  }
});
