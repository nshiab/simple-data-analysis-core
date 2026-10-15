import { test, expect } from "vite-plus/test";
import { ok as assert } from "node:assert/strict";
import { readFile as nodeReadFile } from "node:fs/promises";

import SimpleDB from "../../../src/class/SimpleDB.ts";

// Hand-checked fixtures: select one input scenario and one expected case.
// Numeric IDs stay in separate CSVs to preserve their inferred types.
// Mixed-case CSVs use an empty total cell when that case omits the column.
const root = "test/data/graphs";

function compareIds(left: string, right: string, numeric = false) {
  return numeric ? Number(left) - Number(right) : left < right ? -1 : left > right ? 1 : 0;
}

async function readCsv(path: string) {
  const lines = (await nodeReadFile(path, "utf8")).trimEnd().split("\n");
  const header = lines[0].split(",");
  const rows = lines
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const values = line.split(",");
      expect(values.length, `${path}: ${line}`).toStrictEqual(header.length);
      return Object.fromEntries(header.map((column, i) => [column, values[i]]));
    });
  return { header, rows };
}

test("graph edge fixtures keep scenarios valid, isolated, and tiny", async () => {
  const { header, rows } = await readCsv(`${root}/edges.csv`);
  expect(header).toStrictEqual(["scenario", "edgeId", "source", "target", "weight"]);
  const expectedCounts: Record<string, number> = {
    baseline: 6,
    cycle: 7,
    "self-loop": 2,
    "single-loop": 1,
    "parallel-equal": 3,
    parallel: 3,
    "parallel-opposite": 2,
    weighted: 6,
    "zero-cycle": 3,
    single: 1,
    "component-chain": 2,
    "component-cycle": 3,
    "degree-weight": 3,
    common: 6,
    triangle: 3,
    "undirected-triangle": 3,
    "string-ids": 2,
    "fraction-weight": 2,
  };
  const scenarios = Map.groupBy(rows, (row) => row.scenario);
  expect([...scenarios.keys()].sort()).toStrictEqual(Object.keys(expectedCounts).sort());
  for (const [scenario, scenarioRows] of scenarios) {
    expect(scenarioRows.length, scenario).toStrictEqual(expectedCounts[scenario]);
    expect(
      new Set(scenarioRows.map((row) => row.edgeId)).size,
      `${scenario} edge IDs`,
    ).toStrictEqual(scenarioRows.length);
    for (const row of scenarioRows) {
      assert(row.source.length > 0, `${scenario} has an empty source`);
      assert(row.target.length > 0, `${scenario} has an empty target`);
      assert(
        Number.isFinite(Number(row.weight)) && Number(row.weight) >= 0,
        `${scenario} has an invalid weight`,
      );
    }
  }
  assert(scenarios.get("self-loop")!.some((row) => row.source === row.target));
  assert(scenarios.get("weighted")!.some((row) => Number(row.weight) === 0));
  expect(
    new Set(scenarios.get("baseline")!.flatMap((row) => [row.source, row.target])),
  ).toStrictEqual(new Set(["A", "B", "C", "D", "E", "F", "G"]));
  expect(
    scenarios
      .get("cycle")!
      .slice(0, -1)
      .map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "scenario"))),
  ).toStrictEqual(
    scenarios
      .get("baseline")!
      .map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "scenario"))),
  );
});

test("special graph fixtures preserve empty, custom, and typed inputs", async () => {
  expect(await readCsv(`${root}/empty.csv`)).toStrictEqual({
    header: ["edgeId", "source", "target", "weight"],
    rows: [],
  });
  expect((await readCsv(`${root}/custom-columns.csv`)).header).toStrictEqual([
    "flightId",
    "origin",
    "destination",
    "cost",
  ]);
  expect((await readCsv(`${root}/without-edge-id.csv`)).header).toStrictEqual([
    "source",
    "target",
    "weight",
  ]);

  const sdb = new SimpleDB();
  try {
    const numeric = sdb.newTable("numericGraph").loadData(`${root}/numeric.csv`);
    expect(await numeric.getTypes()).toStrictEqual({
      edgeId: "BIGINT",
      source: "BIGINT",
      target: "BIGINT",
      weight: "BIGINT",
    });
    expect(await numeric.getFirstRow()).toStrictEqual({
      edgeId: 0,
      source: 0,
      target: 10,
      weight: 1,
    });
    const numericCycle = sdb.newTable("numericCycle").loadData(`${root}/numeric-cycle.csv`);
    expect(await numericCycle.getTypes()).toStrictEqual({
      edgeId: "BIGINT",
      source: "BIGINT",
      target: "BIGINT",
      weight: "BIGINT",
    });

    const custom = sdb.newTable("customGraph").loadData(`${root}/custom-columns.csv`);
    expect(Object.keys(await custom.getTypes())).toStrictEqual([
      "flightId",
      "origin",
      "destination",
      "cost",
    ]);
    const unsupported = sdb.newTable("unsupportedGraph").loadData(`${root}/unsupported-types.csv`);
    expect(await unsupported.getTypes()).toStrictEqual({
      booleanEdgeId: "BOOLEAN",
      dateSource: "DATE",
      stringTarget: "VARCHAR",
      stringWeight: "VARCHAR",
    });
  } finally {
    await sdb.close();
  }
});

test("graph preparation fixtures accept numeric and prefixed addId identities", async () => {
  const sdb = new SimpleDB();
  try {
    const numeric = sdb
      .newTable("preparedNumeric")
      .loadData(`${root}/without-edge-id.csv`)
      .addId("edgeId");
    const prefixed = sdb
      .newTable("preparedPrefixed")
      .loadData(`${root}/without-edge-id.csv`)
      .addId("edgeId", { prefix: "edge-" });

    expect(await numeric.getData()).toStrictEqual([
      { source: "A", target: "B", weight: 1, edgeId: 0 },
      { source: "B", target: "C", weight: 2, edgeId: 1 },
    ]);
    expect(await prefixed.getData()).toStrictEqual([
      { source: "A", target: "B", weight: 1, edgeId: "edge-0" },
      { source: "B", target: "C", weight: 2, edgeId: "edge-1" },
    ]);
    expect((await numeric.getTypes()).edgeId).toStrictEqual("BIGINT");
    expect((await prefixed.getTypes()).edgeId).toStrictEqual("VARCHAR");
  } finally {
    await sdb.close();
  }
});

test("every planned graph method has an exact expected-result schema", async () => {
  const schemas: Record<string, string[]> = {
    "neighbors.csv": ["case", "start", "node"],
    "degree.csv": ["case", "node", "incoming", "outgoing", "total"],
    "common_neighbors.csv": ["case", "node"],
    "reachable.csv": ["case", "start", "node"],
    "distances.csv": ["case", "start", "node", "steps", "total"],
    "shortest_path.csv": [
      "case",
      "pathId",
      "step",
      "weight",
      "total",
      "edgeId",
      "source",
      "target",
    ],
    "paths.csv": ["case", "pathId", "step", "weight", "total", "edgeId", "source", "target"],
    "connected_components.csv": ["case", "componentId", "node"],
    "find_cycles.csv": [
      "case",
      "start",
      "pathId",
      "step",
      "weight",
      "total",
      "edgeId",
      "source",
      "target",
    ],
    "topological_sort.csv": ["case", "node", "componentId", "order"],
  };
  for (const [file, schema] of Object.entries(schemas)) {
    const fixture = await readCsv(`${root}/expected/${file}`);
    expect(fixture.header, file).toStrictEqual(schema);
    assert(fixture.rows.length > 0, file);
  }
  for (const [file, schema] of Object.entries({
    "neighbors.csv": ["case", "start", "node"],
    "distances.csv": ["case", "start", "node", "steps", "total"],
    "shortest_path.csv": schemas["shortest_path.csv"],
    "find_cycles.csv": schemas["find_cycles.csv"],
    "topological_sort.csv": ["case", "node", "componentId", "order"],
  })) {
    expect((await readCsv(`${root}/expected/numeric/${file}`)).header).toStrictEqual(schema);
  }

  const contractRows = (await readCsv(`${root}/contracts.csv`)).rows;
  expect(new Set(contractRows.map((row) => row.method))).toStrictEqual(
    new Set([
      "neighbors",
      "degree",
      "commonNeighbors",
      "reachable",
      "distances",
      "shortestPath",
      "paths",
      "connectedComponents",
      "findCycles",
      "topologicalSort",
    ]),
  );
});

test("route expectations have real ordered steps and cumulative costs", async () => {
  const canonicalEdges = (await readCsv(`${root}/edges.csv`)).rows;
  const scenarioNames = [...new Set(canonicalEdges.map((row) => row.scenario))].toSorted(
    (left, right) => right.length - left.length,
  );
  for (const path of [
    "expected/shortest_path.csv",
    "expected/paths.csv",
    "expected/find_cycles.csv",
    "expected/numeric/shortest_path.csv",
    "expected/numeric/find_cycles.csv",
  ]) {
    const rows = (await readCsv(`${root}/${path}`)).rows;
    const edgeRows = path.includes("numeric/find_cycles")
      ? (await readCsv(`${root}/numeric-cycle.csv`)).rows
      : path.includes("numeric/")
        ? (await readCsv(`${root}/numeric.csv`)).rows
        : canonicalEdges;
    const cases = Map.groupBy(rows, (row) => row.case);

    for (const [caseName, caseRows] of cases) {
      const cycleRows = path.includes("find_cycles");
      const paths = Map.groupBy(caseRows, (row) =>
        cycleRows
          ? JSON.stringify([row.start, Number(row.pathId)])
          : JSON.stringify(Number(row.pathId)),
      );
      if (cycleRows) {
        for (const startRows of Map.groupBy(caseRows, (row) => row.start).values()) {
          const ids = [...new Set(startRows.map((row) => Number(row.pathId)))];
          expect(ids).toStrictEqual(ids.map((_, i) => i));
        }
      } else {
        const ids = [...new Set(caseRows.map((row) => Number(row.pathId)))];
        expect(ids).toStrictEqual(ids.map((_, i) => i));
      }
      const pathGroups = [...paths.values()];
      const edgeSequences = pathGroups.map((pathRows) => pathRows.map((row) => row.edgeId));
      const numeric = path.includes("/numeric/");
      expect(edgeSequences, `${path}: ${caseName} path IDs`).toStrictEqual(
        pathGroups
          .toSorted((left, right) => {
            if (cycleRows) {
              const startComparison = compareIds(left[0].start, right[0].start, numeric);
              if (startComparison) return startComparison;
            }
            for (let i = 0; i < Math.min(left.length, right.length); i++) {
              const comparison = compareIds(left[i].edgeId, right[i].edgeId, numeric);
              if (comparison) return comparison;
            }
            return left.length - right.length;
          })
          .map((pathRows) => pathRows.map((row) => row.edgeId)),
      );
      for (const pathRows of paths.values()) {
        let distance = 0;
        const scenario = path.includes("numeric/")
          ? undefined
          : scenarioNames.find((name) => caseName.startsWith(`${name}-`));
        if (!path.includes("numeric/")) {
          assert(scenario, `${path}: ${caseName} has no source scenario`);
        }
        const availableEdges = scenario
          ? edgeRows.filter((row) => row.scenario === scenario)
          : edgeRows;
        const orientations = pathRows.map((row) => {
          const forward = { source: row.source, target: row.target };
          const backward = { source: row.target, target: row.source };
          return caseName.includes("-both")
            ? [forward, backward]
            : caseName.includes("-incoming")
              ? [backward]
              : [forward];
        });
        const orient = (
          index: number,
          selected: { source: string; target: string }[],
        ): { source: string; target: string }[] | undefined => {
          if (index === orientations.length) {
            if (path.includes("find_cycles") && selected.at(-1)!.target !== selected[0].source)
              return undefined;
            return selected;
          }
          for (const candidate of orientations[index]) {
            if (index === 0 || candidate.source === selected.at(-1)!.target) {
              const result = orient(index + 1, [...selected, candidate]);
              if (result) return result;
            }
          }
        };
        const traversal = orient(0, []);
        assert(traversal, `${path}: ${caseName} has disconnected traversal`);
        pathRows.forEach((row, i) => {
          expect(Number(row.step), `${path}: ${caseName}`).toStrictEqual(i + 1);
          distance += Number(row.weight);
          if (path.endsWith("shortest_path.csv") && !caseName.endsWith("-weighted")) {
            expect(row.total, `${path}: ${caseName} omits total`).toStrictEqual("");
          } else {
            expect(Number(row.total), `${path}: ${caseName}`).toStrictEqual(distance);
          }
          assert(row.edgeId.length > 0);
          assert(row.source.length > 0);
          assert(row.target.length > 0);
          const edge = availableEdges.find((candidate) => candidate.edgeId === row.edgeId);
          assert(edge, `${path}: ${caseName} references ${row.edgeId}`);
          const forward = edge.source === row.source && edge.target === row.target;
          assert(forward, `${path}: ${caseName} changed the original endpoints for ${row.edgeId}`);
          expect(Number(row.weight)).toStrictEqual(
            caseName.endsWith("-weighted") ? Number(edge.weight) : 1,
          );
        });
        expect(
          new Set(pathRows.map((row) => row.edgeId)).size,
          `${path}: ${caseName} reuses an edge`,
        ).toStrictEqual(pathRows.length);
        if (path.includes("find_cycles")) {
          expect(traversal.at(-1)!.target).toStrictEqual(traversal[0].source);
          expect(
            traversal[0].source,
            `${path}: ${caseName} must start at its requested node`,
          ).toStrictEqual(pathRows[0].start);
          if (caseName.includes("-both") && pathRows.length > 1) {
            assert(
              compareIds(pathRows[0].edgeId, pathRows.at(-1)!.edgeId, numeric) < 0,
              `${path}: ${caseName} must use the smaller edge sequence orientation`,
            );
          }
          expect(new Set(traversal.map((row) => row.source)).size).toStrictEqual(traversal.length);
        } else {
          const nodes = [traversal[0].source, ...traversal.map((row) => row.target)];
          expect(new Set(nodes).size, `${path}: ${caseName} is not simple`).toStrictEqual(
            nodes.length,
          );
        }
      }
    }
  }
});

test("membership and component expectations are explicitly sorted", async () => {
  for (const [file, columns] of [
    ["neighbors.csv", ["start", "node"]],
    ["reachable.csv", ["start", "node"]],
    ["distances.csv", ["start", "total", "node"]],
    ["degree.csv", ["node"]],
    ["common_neighbors.csv", ["node"]],
    ["connected_components.csv", ["node"]],
  ] as const) {
    const rows = (await readCsv(`${root}/expected/${file}`)).rows;
    for (const [caseName, caseRows] of Map.groupBy(rows, (row) => row.case)) {
      expect(caseRows, `${file}: ${caseName}`).toStrictEqual(
        caseRows.toSorted((left, right) => {
          if (file === "degree.csv") {
            const difference = Number(right.total) - Number(left.total);
            if (difference) return difference;
          }
          for (const column of columns) {
            const comparison = compareIds(
              column === "total" && left.total === "" ? left.steps : left[column],
              column === "total" && right.total === "" ? right.steps : right[column],
              column === "total",
            );
            if (comparison) return comparison;
          }
          return 0;
        }),
      );
    }
  }

  for (const file of ["neighbors.csv", "distances.csv", "topological_sort.csv"]) {
    const rows = (await readCsv(`${root}/expected/numeric/${file}`)).rows;
    const columns =
      file === "topological_sort.csv"
        ? ["order"]
        : file === "distances.csv"
          ? ["start", "total", "node"]
          : ["start", "node"];
    for (const [caseName, caseRows] of Map.groupBy(rows, (row) => row.case)) {
      expect(caseRows, `numeric ${file}: ${caseName}`).toStrictEqual(
        caseRows.toSorted((left, right) => {
          for (const column of columns) {
            const comparison = compareIds(left[column], right[column], true);
            if (comparison) return comparison;
          }
          return 0;
        }),
      );
    }
  }
});

test("graph expectations pin the high-value hand-derived cases", async () => {
  const degree = (await readCsv(`${root}/expected/degree.csv`)).rows;
  expect(
    degree.find((row) => row.case === "degree-weight-weighted" && row.node === "B"),
  ).toStrictEqual({
    case: "degree-weight-weighted",
    node: "B",
    incoming: "350",
    outgoing: "0",
    total: "350",
  });

  const distances = (await readCsv(`${root}/expected/distances.csv`)).rows;
  expect(distances.filter((row) => row.case === "baseline-A-outgoing")).toStrictEqual([
    {
      case: "baseline-A-outgoing",
      start: "A",
      node: "B",
      steps: "1",
      total: "",
    },
    {
      case: "baseline-A-outgoing",
      start: "A",
      node: "C",
      steps: "1",
      total: "",
    },
    {
      case: "baseline-A-outgoing",
      start: "A",
      node: "D",
      steps: "2",
      total: "",
    },
    {
      case: "baseline-A-outgoing",
      start: "A",
      node: "E",
      steps: "3",
      total: "",
    },
  ]);

  const cycles = (await readCsv(`${root}/expected/find_cycles.csv`)).rows;
  expect(cycles.filter((row) => row.case.startsWith("self-loop-")).length).toStrictEqual(3);
  expect(cycles.filter((row) => row.case === "zero-cycle-weighted").at(-1)?.total).toStrictEqual(
    "2",
  );
});

test("component labels and topological orders follow deterministic rules", async () => {
  const components = (await readCsv(`${root}/expected/connected_components.csv`)).rows;
  for (const [caseName, rows] of Map.groupBy(components, (row) => row.case)) {
    const groups = Map.groupBy(rows, (row) => Number(row.componentId));
    const ordered = [...groups.entries()].toSorted(([, left], [, right]) =>
      compareIds(left[0].node, right[0].node),
    );
    expect(
      ordered.map(([id]) => id),
      caseName,
    ).toStrictEqual(ordered.map((_, i) => i));
  }

  const edges = (await readCsv(`${root}/edges.csv`)).rows;
  const orders = (await readCsv(`${root}/expected/topological_sort.csv`)).rows;
  for (const [scenario, rows] of Map.groupBy(orders, (row) => row.case)) {
    const connections = edges.filter((row) => row.scenario === scenario);
    const remaining = new Set(connections.flatMap((row) => [row.source, row.target]));
    expect(rows.length, scenario).toStrictEqual(remaining.size);
    const ids = new Map(rows.map((row) => [row.node, row.componentId]));
    for (const edge of connections) {
      expect(ids.get(edge.source), scenario).toStrictEqual(ids.get(edge.target));
    }
    const counts = new Map<string, number>();
    for (const row of rows) {
      const eligible = [...remaining]
        .filter(
          (node) =>
            ids.get(node) === row.componentId &&
            !connections.some((edge) => edge.target === node && remaining.has(edge.source)),
        )
        .toSorted(compareIds);
      expect(row.node, `${scenario}: smallest eligible node`).toStrictEqual(eligible[0]);
      const order = (counts.get(row.componentId) ?? 0) + 1;
      expect(Number(row.order), scenario).toStrictEqual(order);
      counts.set(row.componentId, order);
      remaining.delete(row.node);
    }
    expect(remaining.size, scenario).toStrictEqual(0);
  }
});
