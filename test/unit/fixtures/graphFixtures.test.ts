import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

const root = "test/data/graphs";

type CsvRow = Record<string, string>;

function compareIds(left: string, right: string, numeric = false) {
  return numeric
    ? Number(left) - Number(right)
    : left < right
    ? -1
    : left > right
    ? 1
    : 0;
}

async function readCsv(path: string) {
  const lines = (await Deno.readTextFile(path)).trimEnd().split("\n");
  const header = lines[0].split(",");
  const rows = lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split(",");
    assertEquals(values.length, header.length, `${path}: ${line}`);
    return Object.fromEntries(header.map((column, i) => [column, values[i]]));
  });
  return { header, rows };
}

Deno.test("graph edge fixtures keep scenarios valid, isolated, and tiny", async () => {
  const { header, rows } = await readCsv(`${root}/edges.csv`);
  assertEquals(header, ["scenario", "edgeId", "source", "target", "weight"]);
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
  assertEquals(
    [...scenarios.keys()].sort(),
    Object.keys(expectedCounts).sort(),
  );
  for (const [scenario, scenarioRows] of scenarios) {
    assertEquals(scenarioRows.length, expectedCounts[scenario], scenario);
    assertEquals(
      new Set(scenarioRows.map((row) => row.edgeId)).size,
      scenarioRows.length,
      `${scenario} edge IDs`,
    );
    for (const row of scenarioRows) {
      assert(row.source.length > 0, `${scenario} has an empty source`);
      assert(row.target.length > 0, `${scenario} has an empty target`);
      assert(
        Number.isFinite(Number(row.weight)) && Number(row.weight) >= 0,
        `${scenario} has an invalid weight`,
      );
    }
  }
  assert(
    scenarios.get("self-loop")!.some((row) => row.source === row.target),
  );
  assert(
    scenarios.get("weighted")!.some((row) => Number(row.weight) === 0),
  );
  assertEquals(
    new Set(
      scenarios.get("baseline")!.flatMap((row) => [row.source, row.target]),
    ),
    new Set(["A", "B", "C", "D", "E", "F", "G"]),
  );
  assertEquals(
    scenarios.get("cycle")!.slice(0, -1).map(({ scenario: _, ...row }) => row),
    scenarios.get("baseline")!.map(({ scenario: _, ...row }) => row),
  );
});

Deno.test("special graph fixtures preserve empty, custom, and typed inputs", async () => {
  assertEquals(await readCsv(`${root}/empty.csv`), {
    header: ["edgeId", "source", "target", "weight"],
    rows: [],
  });
  assertEquals((await readCsv(`${root}/custom-columns.csv`)).header, [
    "flightId",
    "origin",
    "destination",
    "cost",
  ]);
  assertEquals((await readCsv(`${root}/without-edge-id.csv`)).header, [
    "source",
    "target",
    "weight",
  ]);

  const sdb = new SimpleDB();
  try {
    const numeric = sdb.newTable("numericGraph").loadData(
      `${root}/numeric.csv`,
    );
    assertEquals(await numeric.getTypes(), {
      edgeId: "BIGINT",
      source: "BIGINT",
      target: "BIGINT",
      weight: "BIGINT",
    });
    assertEquals(await numeric.getFirstRow(), {
      edgeId: 0,
      source: 0,
      target: 10,
      weight: 1,
    });
    const numericCycle = sdb.newTable("numericCycle").loadData(
      `${root}/numeric-cycle.csv`,
    );
    assertEquals(await numericCycle.getTypes(), {
      edgeId: "BIGINT",
      source: "BIGINT",
      target: "BIGINT",
      weight: "BIGINT",
    });

    const custom = sdb.newTable("customGraph").loadData(
      `${root}/custom-columns.csv`,
    );
    assertEquals(Object.keys(await custom.getTypes()), [
      "flightId",
      "origin",
      "destination",
      "cost",
    ]);
    const unsupported = sdb.newTable("unsupportedGraph").loadData(
      `${root}/unsupported-types.csv`,
    );
    assertEquals(await unsupported.getTypes(), {
      booleanEdgeId: "BOOLEAN",
      dateSource: "DATE",
      stringTarget: "VARCHAR",
      stringWeight: "VARCHAR",
    });
  } finally {
    await sdb.close();
  }
});

Deno.test("graph preparation fixtures accept numeric and prefixed addId identities", async () => {
  const sdb = new SimpleDB();
  try {
    const numeric = sdb.newTable("preparedNumeric")
      .loadData(`${root}/without-edge-id.csv`)
      .addId("edgeId");
    const prefixed = sdb.newTable("preparedPrefixed")
      .loadData(`${root}/without-edge-id.csv`)
      .addId("edgeId", { prefix: "edge-" });

    assertEquals(await numeric.getData(), [
      { source: "A", target: "B", weight: 1, edgeId: 0 },
      { source: "B", target: "C", weight: 2, edgeId: 1 },
    ]);
    assertEquals(await prefixed.getData(), [
      { source: "A", target: "B", weight: 1, edgeId: "edge-0" },
      { source: "B", target: "C", weight: 2, edgeId: "edge-1" },
    ]);
    assertEquals((await numeric.getTypes()).edgeId, "BIGINT");
    assertEquals((await prefixed.getTypes()).edgeId, "VARCHAR");
  } finally {
    await sdb.close();
  }
});

Deno.test("every planned graph method has an exact expected-result schema", async () => {
  const schemas: Record<string, string[]> = {
    "neighbors.csv": ["case", "start", "node"],
    "degree.csv": ["case", "node", "incoming", "outgoing", "total"],
    "common_neighbors.csv": ["case", "node"],
    "reachable.csv": ["case", "start", "node"],
    "distances.csv": ["case", "start", "node", "distance"],
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
    "paths.csv": [
      "case",
      "pathId",
      "step",
      "weight",
      "total",
      "edgeId",
      "source",
      "target",
    ],
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
    assertEquals(fixture.header, schema, file);
    assert(fixture.rows.length > 0, file);
  }
  for (
    const [file, schema] of Object.entries({
      "neighbors.csv": ["case", "start", "node"],
      "distances.csv": ["case", "start", "node", "distance"],
      "shortest_path.csv": schemas["shortest_path.csv"],
      "find_cycles.csv": schemas["find_cycles.csv"],
      "topological_sort.csv": ["case", "node", "componentId", "order"],
    })
  ) {
    assertEquals(
      (await readCsv(`${root}/expected/numeric/${file}`)).header,
      schema,
    );
  }

  const contractRows = (await readCsv(`${root}/contracts.csv`)).rows;
  assertEquals(
    new Set(contractRows.map((row) => row.method)),
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

Deno.test("route expectations have real ordered steps and cumulative costs", async () => {
  const canonicalEdges = (await readCsv(`${root}/edges.csv`)).rows;
  const scenarioNames = [...new Set(canonicalEdges.map((row) => row.scenario))]
    .toSorted((left, right) => right.length - left.length);
  for (
    const path of [
      "expected/shortest_path.csv",
      "expected/paths.csv",
      "expected/find_cycles.csv",
      "expected/numeric/shortest_path.csv",
      "expected/numeric/find_cycles.csv",
    ]
  ) {
    const rows = (await readCsv(`${root}/${path}`)).rows;
    const edgeRows = path.includes("numeric/find_cycles")
      ? (await readCsv(`${root}/numeric-cycle.csv`)).rows
      : path.includes("numeric/")
      ? (await readCsv(`${root}/numeric.csv`)).rows
      : canonicalEdges;
    const cases = Map.groupBy(rows, (row) => row.case);

    for (const [caseName, caseRows] of cases) {
      const cycleRows = path.includes("find_cycles");
      const paths = Map.groupBy(
        caseRows,
        (row) =>
          cycleRows
            ? JSON.stringify([row.start, Number(row.pathId)])
            : JSON.stringify(Number(row.pathId)),
      );
      if (cycleRows) {
        for (
          const startRows of Map.groupBy(caseRows, (row) => row.start).values()
        ) {
          const ids = [...new Set(startRows.map((row) => Number(row.pathId)))];
          assertEquals(ids, ids.map((_, i) => i));
        }
      } else {
        const ids = [...new Set(caseRows.map((row) => Number(row.pathId)))];
        assertEquals(ids, ids.map((_, i) => i));
      }
      const pathGroups = [...paths.values()];
      const edgeSequences = pathGroups.map((pathRows) =>
        pathRows.map((row) => row.edgeId)
      );
      const numeric = path.includes("/numeric/");
      assertEquals(
        edgeSequences,
        pathGroups.toSorted((left, right) => {
          if (cycleRows) {
            const startComparison = compareIds(
              left[0].start,
              right[0].start,
              numeric,
            );
            if (startComparison) return startComparison;
          }
          for (let i = 0; i < Math.min(left.length, right.length); i++) {
            const comparison = compareIds(
              left[i].edgeId,
              right[i].edgeId,
              numeric,
            );
            if (comparison) return comparison;
          }
          return left.length - right.length;
        }).map((pathRows) => pathRows.map((row) => row.edgeId)),
        `${path}: ${caseName} path IDs`,
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
            if (
              path.includes("find_cycles") &&
              selected.at(-1)!.target !== selected[0].source
            ) return undefined;
            return selected;
          }
          for (const candidate of orientations[index]) {
            if (
              index === 0 || candidate.source === selected.at(-1)!.target
            ) {
              const result = orient(index + 1, [...selected, candidate]);
              if (result) return result;
            }
          }
        };
        const traversal = orient(0, []);
        assert(traversal, `${path}: ${caseName} has disconnected traversal`);
        pathRows.forEach((row, i) => {
          assertEquals(Number(row.step), i + 1, `${path}: ${caseName}`);
          distance += Number(row.weight);
          assertEquals(
            Number(
              row.total,
            ),
            distance,
            `${path}: ${caseName}`,
          );
          assert(row.edgeId.length > 0);
          assert(row.source.length > 0);
          assert(row.target.length > 0);
          const edge = availableEdges.find((candidate) =>
            candidate.edgeId === row.edgeId
          );
          assert(edge, `${path}: ${caseName} references ${row.edgeId}`);
          const forward = edge.source === row.source &&
            edge.target === row.target;
          assert(
            forward,
            `${path}: ${caseName} changed the original endpoints for ${row.edgeId}`,
          );
          assertEquals(
            Number(row.weight),
            caseName.endsWith("-weighted") ? Number(edge.weight) : 1,
          );
        });
        assertEquals(
          new Set(pathRows.map((row) => row.edgeId)).size,
          pathRows.length,
          `${path}: ${caseName} reuses an edge`,
        );
        if (path.includes("find_cycles")) {
          assertEquals(traversal.at(-1)!.target, traversal[0].source);
          assertEquals(
            traversal[0].source,
            pathRows[0].start,
            `${path}: ${caseName} must start at its requested node`,
          );
          if (caseName.includes("-both") && pathRows.length > 1) {
            assert(
              compareIds(pathRows[0].edgeId, pathRows.at(-1)!.edgeId, numeric) <
                0,
              `${path}: ${caseName} must use the smaller edge sequence orientation`,
            );
          }
          assertEquals(
            new Set(traversal.map((row) => row.source)).size,
            traversal.length,
          );
        } else {
          const nodes = [
            traversal[0].source,
            ...traversal.map((row) => row.target),
          ];
          assertEquals(
            new Set(nodes).size,
            nodes.length,
            `${path}: ${caseName} is not simple`,
          );
        }
      }
    }
  }
});

Deno.test("membership and component expectations are explicitly sorted", async () => {
  for (
    const [file, columns] of [
      ["neighbors.csv", ["start", "node"]],
      ["reachable.csv", ["start", "node"]],
      ["distances.csv", ["start", "distance", "node"]],
      ["degree.csv", ["node"]],
      ["common_neighbors.csv", ["node"]],
      ["connected_components.csv", ["node"]],
    ] as const
  ) {
    const rows = (await readCsv(`${root}/expected/${file}`)).rows;
    for (const [caseName, caseRows] of Map.groupBy(rows, (row) => row.case)) {
      assertEquals(
        caseRows,
        caseRows.toSorted((left, right) => {
          if (file === "degree.csv") {
            const difference = Number(right.total) - Number(left.total);
            if (difference) return difference;
          }
          for (const column of columns) {
            const comparison = compareIds(
              left[column],
              right[column],
              column === "distance",
            );
            if (comparison) return comparison;
          }
          return 0;
        }),
        `${file}: ${caseName}`,
      );
    }
  }

  for (
    const file of ["neighbors.csv", "distances.csv", "topological_sort.csv"]
  ) {
    const rows = (await readCsv(`${root}/expected/numeric/${file}`)).rows;
    const columns = file === "topological_sort.csv"
      ? ["order"]
      : file === "distances.csv"
      ? ["start", "distance", "node"]
      : ["start", "node"];
    for (const [caseName, caseRows] of Map.groupBy(rows, (row) => row.case)) {
      assertEquals(
        caseRows,
        caseRows.toSorted((left, right) => {
          for (const column of columns) {
            const comparison = compareIds(left[column], right[column], true);
            if (comparison) return comparison;
          }
          return 0;
        }),
        `numeric ${file}: ${caseName}`,
      );
    }
  }
});

Deno.test("graph expectations pin the high-value hand-derived cases", async () => {
  const degree = (await readCsv(`${root}/expected/degree.csv`)).rows;
  assertEquals(
    degree.find((row) =>
      row.case === "degree-weight-weighted" && row.node === "B"
    ),
    {
      case: "degree-weight-weighted",
      node: "B",
      incoming: "350",
      outgoing: "0",
      total: "350",
    },
  );

  const distances = (await readCsv(`${root}/expected/distances.csv`)).rows;
  assertEquals(
    distances.filter((row) => row.case === "baseline-A-outgoing"),
    [
      { case: "baseline-A-outgoing", start: "A", node: "B", distance: "1" },
      { case: "baseline-A-outgoing", start: "A", node: "C", distance: "1" },
      { case: "baseline-A-outgoing", start: "A", node: "D", distance: "2" },
      { case: "baseline-A-outgoing", start: "A", node: "E", distance: "3" },
    ],
  );

  const cycles = (await readCsv(`${root}/expected/find_cycles.csv`)).rows;
  assertEquals(
    cycles.filter((row) => row.case.startsWith("self-loop-")).length,
    3,
  );
  assertEquals(
    cycles.filter((row) => row.case === "zero-cycle-weighted").at(-1)
      ?.total,
    "2",
  );

  const readme = await Deno.readTextFile(`${root}/README.md`);
  for (
    const method of [
      "neighbors()",
      "degree()",
      "commonNeighbors()",
      "reachable()",
      "distances()",
      "shortestPath()",
      "paths()",
      "connectedComponents()",
      "findCycles()",
      "topologicalSort()",
    ]
  ) {
    assertStringIncludes(readme, method);
  }
  assertStringIncludes(readme, "B has weighted incoming degree 350");
  assertStringIncludes(readme, "A, B, C, D, E, F, G");
});

Deno.test("component labels and topological orders follow deterministic rules", async () => {
  const components =
    (await readCsv(`${root}/expected/connected_components.csv`)).rows;
  for (const [caseName, rows] of Map.groupBy(components, (row) => row.case)) {
    const groups = Map.groupBy(rows, (row) => Number(row.componentId));
    const ordered = [...groups.entries()].toSorted(([, left], [, right]) =>
      compareIds(left[0].node, right[0].node)
    );
    assertEquals(ordered.map(([id]) => id), ordered.map((_, i) => i), caseName);
  }

  const edges = (await readCsv(`${root}/edges.csv`)).rows;
  const orders = (await readCsv(`${root}/expected/topological_sort.csv`)).rows;
  for (const [scenario, rows] of Map.groupBy(orders, (row) => row.case)) {
    const connections = edges.filter((row) => row.scenario === scenario);
    const remaining = new Set(
      connections.flatMap((row) => [row.source, row.target]),
    );
    assertEquals(rows.length, remaining.size, scenario);
    const ids = new Map(rows.map((row) => [row.node, row.componentId]));
    for (const edge of connections) {
      assertEquals(ids.get(edge.source), ids.get(edge.target), scenario);
    }
    const counts = new Map<string, number>();
    for (const row of rows) {
      const eligible = [...remaining].filter((node) =>
        ids.get(node) === row.componentId &&
        !connections.some((edge) =>
          edge.target === node && remaining.has(edge.source)
        )
      ).toSorted(compareIds);
      assertEquals(
        row.node,
        eligible[0],
        `${scenario}: smallest eligible node`,
      );
      const order = (counts.get(row.componentId) ?? 0) + 1;
      assertEquals(Number(row.order), order, scenario);
      counts.set(row.componentId, order);
      remaining.delete(row.node);
    }
    assertEquals(remaining.size, 0, scenario);
  }
});
