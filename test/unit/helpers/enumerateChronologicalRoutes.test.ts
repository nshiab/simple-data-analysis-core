import { assertEquals, assertThrows } from "@std/assert";
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

Deno.test("reference evaluator preserves a valid standalone event", () => {
  assertEquals(
    edgeIds(enumerateChronologicalRoutes(standaloneEvent, "Toronto", {
      end: "Ottawa",
      maxSteps: standaloneEvent.length,
      minGap: 60n,
    })),
    [["F1"]],
  );
});

Deno.test("reference evaluator checks the actual preceding event and inclusive gap", () => {
  assertEquals(
    edgeIds(enumerateChronologicalRoutes(connectionEvents, "A", {
      maxSteps: connectionEvents.length,
      minGap: 60n,
    })),
    [["F1"], ["F1", "F3"]],
  );
  assertEquals(
    edgeIds(enumerateChronologicalRoutes(connectionEvents, "A", {
      end: "D",
      maxSteps: connectionEvents.length,
      minGap: 60n,
    })),
    [["F1", "F3"]],
  );
  assertEquals(
    edgeIds(enumerateChronologicalRoutes(connectionEvents, "A", {
      end: "D",
      maxSteps: connectionEvents.length,
      minGap: 61n,
    })),
    [],
  );
});

Deno.test("reference evaluator searches incoming routes backward without reversing physical time", () => {
  const routes = enumerateChronologicalRoutes(connectionEvents, "D", {
    direction: "incoming",
    end: "A",
    maxSteps: connectionEvents.length,
    minGap: 60n,
  });
  assertEquals(edgeIds(routes), [["F3", "F1"]]);
  assertEquals(
    routes[0].map(({ source, target }) => ({ source, target })),
    [{ source: "D", target: "B" }, { source: "B", target: "A" }],
  );
});

Deno.test("reference evaluator handles equal times, return routes, and event reuse explicitly", () => {
  assertEquals(
    enumerateChronologicalRoutes(equalTimeEvents, "A", {
      maxSteps: equalTimeEvents.length,
      returnToStart: true,
    }),
    [],
  );
  assertEquals(
    edgeIds(enumerateChronologicalRoutes(equalTimeEvents, "A", {
      maxSteps: equalTimeEvents.length,
      returnToStart: true,
      strictOrdering: false,
    })),
    [["E1", "E2"]],
  );
  const oneEdge = [
    { edgeId: "only", source: "A", target: "B", startTime: 1n, endTime: 1n },
  ];
  assertEquals(
    enumerateChronologicalRoutes(oneEdge, "A", {
      maxSteps: 3,
      returnToStart: true,
      simpleNodes: false,
      strictOrdering: false,
    }),
    [],
  );
});

Deno.test("reference evaluator excludes invalid events and requires an explicit bound", () => {
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
  assertEquals(
    enumerateChronologicalRoutes(invalid, "A", { maxSteps: 2 }),
    [],
  );
  assertThrows(
    () => enumerateChronologicalRoutes(invalid, "A", { maxSteps: 0 }),
    TypeError,
    "positive safe integer",
  );
  assertThrows(
    () =>
      enumerateChronologicalRoutes(invalid, "A", { maxSteps: 1, minGap: -1n }),
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

function edgeIds<Node, EdgeId>(
  routes: ReferenceChronologicalStep<Node, EdgeId>[][],
): EdgeId[][] {
  return routes.map((route) => route.map((step) => step.event.edgeId));
}

Deno.test("reference evaluator preserves parallel identity and never reuses a looping event", () => {
  const loop = {
    edgeId: "loop",
    source: "A",
    target: "A",
    startTime: 1n,
    endTime: 1n,
  };
  assertEquals(
    edgeIds(enumerateChronologicalRoutes([loop], "A", {
      maxSteps: 3,
      simpleNodes: false,
      strictOrdering: false,
    })),
    [["loop"]],
  );
  assertEquals(
    edgeIds(enumerateChronologicalRoutes([loop, { ...loop }], "A", {
      maxSteps: 3,
      simpleNodes: false,
      strictOrdering: false,
    })),
    [["loop"], ["loop", "loop"], ["loop"], ["loop", "loop"]],
  );
  assertEquals(
    edgeIds(enumerateChronologicalRoutes([loop], "A", {
      maxSteps: 3,
      returnToStart: true,
    })),
    [["loop"]],
  );
});
