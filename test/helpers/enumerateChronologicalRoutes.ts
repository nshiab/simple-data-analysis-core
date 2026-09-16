export type ReferenceChronologicalEvent<Node, EdgeId> = {
  edgeId: EdgeId;
  endTime: bigint | null;
  source: Node;
  startTime: bigint | null;
  target: Node;
};

export type ReferenceChronologicalStep<Node, EdgeId> = {
  event: ReferenceChronologicalEvent<Node, EdgeId>;
  source: Node;
  target: Node;
};

type ReferenceChronologicalOptions<Node> = {
  direction?: "incoming" | "outgoing";
  end?: Node;
  maxSteps: number;
  minGap?: bigint;
  returnToStart?: boolean;
  simpleNodes?: boolean;
  strictOrdering?: boolean;
};

/** Exhaustively enumerates bounded tiny-graph routes without production SQL. */
export function enumerateChronologicalRoutes<Node, EdgeId>(
  events: ReferenceChronologicalEvent<Node, EdgeId>[],
  start: Node,
  options: ReferenceChronologicalOptions<Node>,
): ReferenceChronologicalStep<Node, EdgeId>[][] {
  if (!Number.isSafeInteger(options.maxSteps) || options.maxSteps < 1) {
    throw new TypeError("maxSteps must be a positive safe integer.");
  }
  const direction = options.direction ?? "outgoing";
  const minGap = options.minGap ?? 0n;
  if (minGap < 0n) {
    throw new TypeError("minGap must be non-negative.");
  }
  if (options.end !== undefined && options.returnToStart === true) {
    throw new TypeError("end and returnToStart cannot be combined.");
  }
  const strictOrdering = options.strictOrdering ?? true;
  const simpleNodes = options.simpleNodes ?? true;
  const routes: ReferenceChronologicalStep<Node, EdgeId>[][] = [];

  const visit = (
    node: Node,
    previousIndex: number | undefined,
    steps: ReferenceChronologicalStep<Node, EdgeId>[],
    usedEvents: Set<number>,
    visitedNodes: Set<Node>,
  ) => {
    if (steps.length >= options.maxSteps) return;
    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      if (!isValidEvent(event) || usedEvents.has(index)) continue;
      const connects = direction === "outgoing"
        ? Object.is(event.source, node)
        : Object.is(event.target, node);
      if (!connects) continue;
      if (
        previousIndex !== undefined &&
        !canFollow(
          events[previousIndex],
          event,
          direction,
          minGap,
          strictOrdering,
        )
      ) continue;

      const next = direction === "outgoing" ? event.target : event.source;
      const returns = options.returnToStart === true && Object.is(next, start);
      if (simpleNodes && visitedNodes.has(next) && !returns) continue;
      const step = direction === "outgoing"
        ? { event, source: event.source, target: event.target }
        : { event, source: event.target, target: event.source };
      const nextSteps = [...steps, step];
      const reachesEnd = options.end !== undefined &&
        Object.is(next, options.end);
      if (returns || reachesEnd) {
        routes.push(nextSteps);
        continue;
      }
      if (options.returnToStart !== true && options.end === undefined) {
        routes.push(nextSteps);
      }
      visit(
        next,
        index,
        nextSteps,
        new Set([...usedEvents, index]),
        new Set([...visitedNodes, next]),
      );
    }
  };

  visit(start, undefined, [], new Set(), new Set([start]));
  return routes;
}

function isValidEvent<Node, EdgeId>(
  event: ReferenceChronologicalEvent<Node, EdgeId>,
): event is ReferenceChronologicalEvent<Node, EdgeId> & {
  endTime: bigint;
  startTime: bigint;
} {
  return event.startTime !== null && event.endTime !== null &&
    event.endTime >= event.startTime;
}

function canFollow<Node, EdgeId>(
  previous: ReferenceChronologicalEvent<Node, EdgeId>,
  candidate: ReferenceChronologicalEvent<Node, EdgeId>,
  direction: "incoming" | "outgoing",
  minGap: bigint,
  strictOrdering: boolean,
): boolean {
  const earlier = direction === "outgoing" ? previous : candidate;
  const later = direction === "outgoing" ? candidate : previous;
  if (!isValidEvent(earlier) || !isValidEvent(later)) return false;
  const gap = later.startTime - earlier.endTime;
  return gap >= minGap && (!strictOrdering || gap > 0n);
}
