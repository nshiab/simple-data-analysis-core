# Chronological graph contracts

This document fixes the shared contracts introduced by issue #200. The
chronological options are internal preparation only at this stage; the public
sequence methods add the options in issues #201–#206. Direct adjacency methods
(`neighbors()`, `degree()`, and `commonNeighbors()`) remain unchanged because
they do not evaluate consecutive events.

## Activation and options

A call is chronological when `startTimeColumn` or `endTimeColumn` is supplied.
The columns are independently optional. With only one column, an event is
instantaneous and that column is used as both its effective start and end. With
both columns, transitions compare the preceding event's end with the next
event's start.

`strictOrdering` defaults to `true`, and `minGapMs` defaults to zero. Explicit
`minGapMs: 0` and `strictOrdering: false` still require a time column. An
ordinary call with none of the four chronological options stays static.
Chronological direction may be `"outgoing"` or `"incoming"`; `"both"` is
rejected.

`minGapMs` must be finite, non-negative, no greater than
`Number.MAX_SAFE_INTEGER`, and exactly expressible as a whole number of
microseconds. Fractional milliseconds such as `0.001` are accepted, while
sub-microsecond settings such as `0.0001` are rejected. Whole-microsecond gaps
are a deliberate API granularity choice, shared across all accepted timestamp
types. The helper uses exact integer arithmetic rather than DuckDB intervals;
this restriction is not an engine precision limitation. Timestamp comparisons
still retain their native precision: two `TIMESTAMP_NS` events one nanosecond
apart satisfy strict ordering when the configured gap is zero.

For two physical events, the transition is valid when:

```text
next effective start - previous effective end >= minGapMs
and, when strictOrdering is true,
next effective start - previous effective end > 0
```

The minimum is inclusive. A positive minimum therefore makes the strict check
redundant, but both rules stay explicit in the helper. There is no gap before
the first event or after the last event, so a valid individual event is a valid
one-event route even when it cannot connect to another event.

## Timestamp domains and valid events

Chronological columns accept DuckDB `DATE`, `TIMESTAMP`, `TIMESTAMP_S`,
`TIMESTAMP_MS`, `TIMESTAMP_NS`, and `TIMESTAMP WITH TIME ZONE`. `TIME`, text,
numeric, interval, and other types are rejected. Different naive types may be
combined. A two-column event cannot mix `TIMESTAMP WITH TIME ZONE` with a naive
date or timestamp; callers must convert both columns to one domain first.

SDA initializes DuckDB sessions in UTC. Zoned timestamps are compared as
absolute instants. Naive dates and timestamps carry no timezone interpretation.
The helper does not convert timestamp values through JavaScript. It converts
them inside DuckDB to exact integer units for the transition predicate:

- nanoseconds when either effective column is `TIMESTAMP_NS`;
- microseconds for all other accepted timestamp types;
- exact day counts scaled to the selected unit for `DATE`.

The arithmetic is widened to DuckDB `HUGEINT` before subtraction. This keeps
nanoseconds, supports the full `DATE` range, avoids narrowing wider timestamps
to the `TIMESTAMP_NS` range, and avoids overflow from adding a large gap to a
timestamp.

A chronological event is valid only when every selected timestamp is non-null
and finite and its effective end is not before its effective start. Invalid rows
are excluded in the chronological edge relation. They do not cause a separate
validation scan or a whole-query error. Without chronological options, the
existing static graph behavior is unchanged.

## Shared preparation interface

`prepareGraphTemporalOptions()` runs synchronously before queueing. It validates
the option values and direction, distinguishes explicit settings from defaults,
and converts the gap to exact microseconds. `prepareGraphTemporalSql()` runs
from the queued input schema. It resolves case-insensitive column names,
validates types, and returns:

- projected effective start/end expressions and an internal event ordinal;
- an inline valid-event predicate;
- a bound gap value in the selected integer unit;
- an outgoing/incoming transition predicate.

Downstream methods should bind `gapParameter` through the existing queued values
array and cast it to `HUGEINT` in a one-row settings relation. They should
project `eventSelections()` once, filter with `eventValidity()`, and call
`transition()` with the settings relation's gap expression. The helper owns
timestamp comparison; each method keeps its traversal, pruning, route, or
component algorithm explicit.

When a method has no public edge-ID argument, the projected
`row_number() OVER ()` identifies an event state by its physical position in the
incoming relation. Parallel and otherwise identical rows remain distinct. The
ordinal is internal and is neither returned nor promised to remain stable after
the input is reordered. Route methods continue to return their supplied edge
IDs; no new public edge-ID parameter is required.

## Incoming results

Incoming traversal searches the same physically valid journey backward. It does
not reverse an event's real chronology. Given:

| Event | Physical route | Time        | Weight |
| ----- | -------------- | ----------- | ------ |
| F1    | A → B          | 08:00–09:00 | 2      |
| F2    | B → C          | 10:00–11:00 | 3      |

an incoming route from C to A visits F2 and then F1. The transition predicate
still checks `F1.end + gap <= F2.start`. Under the existing route result
convention, the returned steps follow search order and orient endpoints in that
direction:

| step | edgeId | source | target | weight | total |
| ---- | ------ | ------ | ------ | ------ | ----- |
| 1    | F2     | C      | B      | 3      | 3     |
| 2    | F1     | B      | A      | 2      | 5     |

For reachability or distance from C, B is one incoming step away and A is two.
An event arriving at B at 10:30 cannot be the predecessor of F2 even though the
incoming search encounters F2 first.

## Independent tiny-graph reference evaluator

`test/helpers/enumerateChronologicalRoutes.ts` is an exhaustive test-only
evaluator. It uses bigint timestamps and a direct arithmetic implementation; it
does not import or reproduce the production SQL builder. Callers must provide a
positive `maxSteps`, which makes enumeration bounded even when non-strict equal
times are allowed.

The evaluator treats each array position as a distinct event identity and does
not reuse an event in one route. Simple-node routes are the default. A return
route may revisit its start only as the final node, and enumeration stops when
that return closes. Incoming steps are emitted in search order while the
physical transition is checked earlier-to-later. Null and end-before-start
events are excluded. Shared fixtures cover a standalone flight, an impossible
and exact-gap transfer, and an equal-time return cycle.
