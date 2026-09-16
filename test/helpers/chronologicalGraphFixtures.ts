import type { ReferenceChronologicalEvent } from "./chronologicalGraphReference.ts";

export const standaloneEvent: ReferenceChronologicalEvent<string, string>[] = [
  {
    edgeId: "F1",
    source: "Toronto",
    target: "Ottawa",
    startTime: 12n * 60n,
    endTime: 13n * 60n,
  },
];

export const connectionEvents: ReferenceChronologicalEvent<string, string>[] = [
  {
    edgeId: "F1",
    source: "A",
    target: "B",
    startTime: 8n * 60n,
    endTime: 10n * 60n,
  },
  {
    edgeId: "F2",
    source: "B",
    target: "C",
    startTime: 9n * 60n,
    endTime: 10n * 60n,
  },
  {
    edgeId: "F3",
    source: "B",
    target: "D",
    startTime: 11n * 60n,
    endTime: 12n * 60n,
  },
];

export const equalTimeEvents: ReferenceChronologicalEvent<string, string>[] = [
  { edgeId: "E1", source: "A", target: "B", startTime: 1n, endTime: 1n },
  { edgeId: "E2", source: "B", target: "A", startTime: 1n, endTime: 1n },
];
