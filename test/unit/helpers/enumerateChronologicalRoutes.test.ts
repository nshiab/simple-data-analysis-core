import { test, expect } from "vite-plus/test";
import { assertThrows } from "../../helpers/assertions.ts";

import {
  connectionEvents,
  equalTimeEvents,
  standaloneEvent,
} from "../../helpers/chronologicalGraphFixtures.ts";
import {
  enumerateChronologicalRoutes,
  type ReferenceChronologicalEvent,
  type ReferenceChronologicalStep,
} from "../../helpers/enumerateChronologicalRoutes.ts";

test("reference evaluator preserves a valid standalone event", () => {
  expect(
    edgeIds(
      enumerateChronologicalRoutes(standaloneEvent, "Toronto", {
        end: "Ottawa",
        maxSteps: standaloneEvent.length,
        minGap: 60n,
      }),
    ),
  ).toStrictEqual([["F1"]]);
});

test("reference evaluator checks the actual preceding event and inclusive gap", () => {
  expect(
    edgeIds(
      enumerateChronologicalRoutes(connectionEvents, "A", {
        maxSteps: connectionEvents.length,
        minGap: 60n,
      }),
    ),
  ).toStrictEqual([["F1"], ["F1", "F3"]]);
  expect(
    edgeIds(
      enumerateChronologicalRoutes(connectionEvents, "A", {
        end: "D",
        maxSteps: connectionEvents.length,
        minGap: 60n,
      }),
    ),
  ).toStrictEqual([["F1", "F3"]]);
  expect(
    edgeIds(
      enumerateChronologicalRoutes(connectionEvents, "A", {
        end: "D",
        maxSteps: connectionEvents.length,
        minGap: 61n,
      }),
    ),
  ).toStrictEqual([]);
});

test("reference evaluator searches incoming routes backward without reversing physical time", () => {
  const routes = enumerateChronologicalRoutes(connectionEvents, "D", {
    direction: "incoming",
    end: "A",
    maxSteps: connectionEvents.length,
    minGap: 60n,
  });
  expect(edgeIds(routes)).toStrictEqual([["F3", "F1"]]);
  expect(routes[0].map(({ source, target }) => ({ source, target }))).toStrictEqual([
    { source: "D", target: "B" },
    { source: "B", target: "A" },
  ]);
});

test("reference evaluator handles equal times, return routes, and event reuse explicitly", () => {
  expect(
    enumerateChronologicalRoutes(equalTimeEvents, "A", {
      maxSteps: equalTimeEvents.length,
      returnToStart: true,
    }),
  ).toStrictEqual([]);
  expect(
    edgeIds(
      enumerateChronologicalRoutes(equalTimeEvents, "A", {
        maxSteps: equalTimeEvents.length,
        returnToStart: true,
        strictOrdering: false,
      }),
    ),
  ).toStrictEqual([["E1", "E2"]]);
  const oneEdge = [{ edgeId: "only", source: "A", target: "B", startTime: 1n, endTime: 1n }];
  expect(
    enumerateChronologicalRoutes(oneEdge, "A", {
      maxSteps: 3,
      returnToStart: true,
      simpleNodes: false,
      strictOrdering: false,
    }),
  ).toStrictEqual([]);
});

test("reference evaluator excludes invalid events and requires an explicit bound", () => {
  const invalid: ReferenceChronologicalEvent<string, string>[] = [
    { edgeId: "null", source: "A", target: "B", startTime: null, endTime: 2n },
    {
      edgeId: "backward",
      source: "A",
      target: "B",
      startTime: 2n,
      endTime: 1n,
    },
  ];
  expect(enumerateChronologicalRoutes(invalid, "A", { maxSteps: 2 })).toStrictEqual([]);
  assertThrows(
    () => enumerateChronologicalRoutes(invalid, "A", { maxSteps: 0 }),
    TypeError,
    "positive safe integer",
  );
  assertThrows(
    () => enumerateChronologicalRoutes(invalid, "A", { maxSteps: 1, minGap: -1n }),
    TypeError,
    "minGap must be non-negative",
  );
  assertThrows(
    () =>
      enumerateChronologicalRoutes(invalid, "A", {
        end: "B",
        maxSteps: 1,
        returnToStart: true,
      }),
    TypeError,
    "cannot be combined",
  );
});

function edgeIds<Node, EdgeId>(routes: ReferenceChronologicalStep<Node, EdgeId>[][]): EdgeId[][] {
  return routes.map((route) => route.map((step) => step.event.edgeId));
}

test("reference evaluator preserves parallel identity and never reuses a looping event", () => {
  const loop = {
    edgeId: "loop",
    source: "A",
    target: "A",
    startTime: 1n,
    endTime: 1n,
  };
  expect(
    edgeIds(
      enumerateChronologicalRoutes([loop], "A", {
        maxSteps: 3,
        simpleNodes: false,
        strictOrdering: false,
      }),
    ),
  ).toStrictEqual([["loop"]]);
  expect(
    edgeIds(
      enumerateChronologicalRoutes([loop, { ...loop }], "A", {
        maxSteps: 3,
        simpleNodes: false,
        strictOrdering: false,
      }),
    ),
  ).toStrictEqual([["loop"], ["loop", "loop"], ["loop"], ["loop", "loop"]]);
  expect(
    edgeIds(
      enumerateChronologicalRoutes([loop], "A", {
        maxSteps: 3,
        returnToStart: true,
      }),
    ),
  ).toStrictEqual([["loop"]]);
});
