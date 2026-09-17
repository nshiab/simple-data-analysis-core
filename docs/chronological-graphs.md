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

## Direct adjacency remains event-based

`neighbors()`, `degree()`, and `commonNeighbors()` answer questions about
individual connections. They do not accept chronological options because no
preceding event exists in these queries. Time columns remain ordinary unused
columns unless the caller filters the table before the direct query. A valid
flight therefore remains a direct edge even when it cannot follow or precede
another flight.

For a table containing only Toronto → Ottawa at 12:00–13:00, Ottawa is Toronto's
outgoing neighbor, Toronto's outgoing degree is one, Ottawa's incoming degree is
one, and both nodes have total degree one. The same flight is a valid one-step
chronological path and shortest path, and Ottawa is reachable from Toronto at
distance one. No artificial event is required before or after it.

For A → B at 08:00–10:00, B → C at 09:00–10:00, and B → D at 11:00–12:00, both C
and D are direct outgoing neighbors of B and B has two outgoing edges and two
distinct outgoing neighbors. With a one-hour minimum connection, a journey
beginning at A cannot continue to C, while the connection to D qualifies exactly
at the boundary. Direct adjacency describes available events; it does not
advertise transfer feasibility.

Parallel events are counted once each by edge degree and weight sums, and once
per endpoint by distinct-neighbor degree. Counts are never multiplied by the
number of preceding or following events that could form transfers. Likewise, two
standalone edges to the same destination establish a common neighbor without
implying synchronized arrivals or a feasible meeting. The consolidated
regressions are in `test/unit/methods/chronologicalGraphIntegration.test.ts`;
the existing direct method suites retain all outgoing, incoming, both,
multi-start, unknown-node, parallel-edge, self-connection, weight, and total
conventions.

## Reachability state and termination

Chronological `reachable()` materializes one valid-event relation and assigns
each physical input row its event ordinal there. The same materialized relation
is reused throughout recursion, so an ordinal cannot change between scans. Every
valid event leaving a requested start seeds a state; no preceding event or local
transfer partner is required.

Recursive states retain the requested start and the complete last-event state:
its physical ordinal, endpoint, effective start, and effective end. A candidate
event is joined from that endpoint and checked against the actual last event.
Incoming traversal joins a physical predecessor and applies the same
earlier-to-later comparison through the shared transition helper.

The recursive `UNION` deduplicates identical `(requested start, last event)`
states. A last event completely determines the current node and every possible
next transition, so reaching it through another route cannot reveal a new
continuation. With `S` distinct requested starts and `E` valid physical events,
at most `S × E` states are retained. This finite bound still holds when
non-strict ordering allows equal-time event cycles and avoids enumerating all
routes solely to establish reachability. Only after the closure is complete are
states projected to the existing distinct `start` and `node` result.

The internal SQL builder accepts an arbitrary typed start relation. Public
`reachable()` supplies bound requested starts; chronological strong-component
work can reuse the same closure over an all-node start relation without adding a
public reachability API.

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

## Distance state and cost dominance

Chronological `distances()` keys each recursive state by the requested start and
the last physical event. The state also carries that event's endpoint, effective
timestamps, and the minimum cost found for reaching it. Distinct events at the
same node remain distinct states: a cheap late arrival cannot discard a costlier
early arrival that is needed for a later connection.

For either outgoing or incoming traversal, a lower cost safely dominates a
higher cost only when both states have the same requested start and last
physical event. Those states have the same endpoint and exactly the same future
transfer eligibility. Non-negative weights then guarantee that no continuation
of the higher-cost state can improve on the same continuation of the lower-cost
state. Arrival or departure time alone is not a safe dominance key across
different events. Incoming traversal uses the same rule because the last event
in search order completely determines which physical predecessors can be joined
next.

Every state is seeded by one valid event, so projecting the minimum cost per
destination does not introduce an empty distance from a start to itself. A start
appears in its own results only through an actual self-connection or nonempty
return route. There are at most `S × E` keyed states for `S` requested starts
and `E` valid events. Updates require a strictly smaller cost. Together with the
existing finite, non-negative weight contract, every improvement has a
cycle-free witness: removing a cycle cannot increase its cost. There are only
finitely many such event sequences, while zero-cost cycles produce equal rather
than improving labels. The recursion therefore terminates when non-strict
ordering admits equal-time cycles and when those cycles have zero weight,
including under monotone floating-point addition.

The reusable cost-state SQL computes one scalar optimum for each physical event.
It is suitable for destination optima and lower bounds in later shortest route
work. It deliberately does not claim to retain every tied simple route; route
enumeration must keep its own route identity and visited-node state. When that
later work needs public edge IDs, it must project them from this same
materialized event relation; separately applying `row_number()` to another scan
would not provide a reliable physical-event join key.

The focused layered benchmark in `benchmarks/graphs/chronologicalDistances.ts`
measures retained cost states and the transfer join without enumerating routes.
With six layers and widths 4, 8, and 12, it retained 96, 384, and 864 states
respectively, exactly the physical event bound for one start, while the
corresponding six-event route counts were 16,384, 2,097,152, and 35,831,808.
These counts include only routes reaching the final layer; shorter prefixes add
further routes. On the 2026-09-17 local review run, the endpoint candidate joins
reported cardinalities of 320, 2,560, and 8,640 and operator times of 0.112 ms,
0.107 ms, and 0.183 ms. DuckDB evaluated the chronological predicate in a
separate join, with the same cardinalities and operator times of 0.464 ms, 0.367
ms, and 0.112 ms. The runner reports both stages separately: timing only the
endpoint join would omit the time comparison work, and adding their
cardinalities would double-count these transfers. These diagnostic timings
include profiler noise and are not performance guarantees; raw profiles are
retained under the ignored `benchmarks/.work/graphs/chronological-distances/`
directory.

## Shortest simple route bounds

Chronological `shortestPath()` reuses the cost-state recursion only to obtain
the scalar minimum cost at the requested destination. It does not reuse a cost
state's collapsed history or require a route prefix to be the cheapest way to
reach its event. Route enumeration separately retains the complete visited-node
list, ordered public edge-ID sequence, step records, last physical event, and
running cost. This keeps equal-cost histories, earlier and later arrivals that
can take the same next event, and histories with different visited-node
restrictions distinct until complete routes are selected.

The scalar walk optimum equals the simple-route optimum under this API's
constraints. All weights are finite and non-negative, and there is no maximum
connection gap. If a feasible chronological walk repeats a node, remove the
closed segment between two occurrences. The event before the removed segment
still precedes the event after it: chronological ordering and the non-negative
minimum gap are transitive in both outgoing physical order and incoming reverse
search order. Removing the segment cannot increase cost. Repeating this step
produces a feasible simple route no more expensive than the walk. Since every
simple route is also a walk, their minima are equal, including with zero-weight
cycles.

Enumeration can therefore discard a prefix only when its non-negative running
cost exceeds the global optimum. Every prefix of a tied optimum stays at or
below that optimum, including under monotone floating-point addition. Complete
routes are compared to the optimum using the same typed, left-associated cost
expression used by the cost-state recursion. This final equality retains all
tied simple routes without relying on event-optimal prefixes, which would lose
valid ties when competing histories share an event or have different visited
nodes.

The focused benchmark in `benchmarks/graphs/chronologicalShortestPath.ts`
separates returned route size from recursive prefix work. A five-layer,
width-four graph has 1,024 possible complete routes. When all routes tie, the
query returns 1,024 routes and 6,144 step rows while retaining 2,388 route
prefixes. With the same topology but one zero-cost spine and positive-cost
alternatives, the optimum bound reduces the search to six prefixes and returns
one six-step route. On the 2026-09-17 local run, the recursive endpoint join
produced 2,384 and 17 candidates respectively; the cost-bound and chronological
joins each retained 2,384 candidates in the tied case and five in the pruned
case. The benchmark reports these join stages separately because adding their
cardinalities would count the same candidates more than once.

This bound does not make all shortest-route queries polynomial. When many simple
prefixes remain at or below the optimum, especially with zero weights, the
method must retain them to return every tied optimum and can do exponential work
even when few prefixes ultimately reach the destination. There is no silent
route or depth cap. Benchmark timings are diagnostic rather than a performance
guarantee; raw profiles are written under the ignored
`benchmarks/.work/graphs/chronological-shortest-path/` directory.

## Chronological cycle identity and normalization

Chronological `findCycles()` seeds its simple-cycle search from every valid
physical event. It does not use the static smallest-node anchor, because the
rotation beginning at that node may violate time order. Each recursive state
retains the actual last event, the visited nodes, and the used physical event
ordinals. A candidate must pass the shared transition predicate against that
last event. Reaching the seed node closes the cycle immediately: the final event
is compared with its predecessor, but no artificial transition is imposed from
the final event back to the first. A valid self-connection is therefore a
one-event cycle regardless of the configured gap.

Temporal cycle identity is the lexicographically smallest rotation of the
cycle's typed edge-key sequence. Numeric IDs use their native numeric order;
string IDs use their binary bytes, matching the existing graph route order and
remaining independent of collations. This identity is used only for
deduplication and `pathId` ordering. The returned step sequence is never rotated
after enumeration. When non-strict equal-time ordering makes several rotations
feasible, `findCycles()` chooses the feasible rotation with the
lexicographically smallest edge-key sequence. It therefore returns a genuinely
chronological sequence while assigning the same identity and ID after input rows
are shuffled. Parallel events with distinct original edge IDs retain distinct
identities.

Incoming search starts from a physically later event and follows actual
predecessors backward. Its result steps and endpoints use the existing incoming
search orientation. For physical events B → C at 09:00, C → A at 10:00, and A →
B at 11:00, outgoing output is B → C → A → B, while incoming output is B → A → C
→ B using those events in 11:00, 10:00, 09:00 order. Both outputs represent the
same physical event cycle. Their edge sequences are reversed, so identity and
numbering are deterministic within each search direction and are not promised to
match across directions.

## Chronological strong components

Chronological `connectedComponents()` requires an explicitly supplied
`mode: "strong"`. Supplying either timestamp column with omitted mode or with
`mode: "weak"` is an argument error. Calls without chronological options keep
the existing static weak default and static strong-component behavior.

The method runs the shared chronological reachability closure from every node
that occurs in a valid event. Two distinct nodes are adjacent in the resulting
undirected mutual graph only when each can chronologically reach the other.
Those two directions may use independent journeys, and each journey may pass
through nodes outside the group. An intermediary becomes a member only when it
is mutually reachable with every other member.

Temporal strong components are every maximal clique of this mutual graph. They
can overlap, so one node can produce several `node`/`componentId` rows. They are
not ordinary strongly connected partitions: mutual chronological reachability is
not transitive, and overlapping groups are never merged. Every node from a valid
event belongs to at least one group, including endpoints of isolated one-way
events and self-connections. Such a node is a singleton exactly when it has no
mutual neighbor. An input with no valid events produces no rows.

Group identity is the complete sorted list of member keys. String IDs use their
encoded binary bytes and numeric IDs use their resolved native graph type, so
collations and JavaScript number precision do not affect identity or order.
Groups are numbered from zero in lexicographic order of those canonical member
lists. Result rows are ordered by `componentId` and then by the member's typed
key. IDs and row order therefore remain stable when input events are shuffled.

Maximal cliques are enumerated in DuckDB with a pivoted Bron–Kerbosch search.
Each recursive state retains the current clique and disjoint prospective and
excluded vertex lists. The pivot maximizes prospective neighbors, with the
smallest typed key breaking ties. Sibling branches process only vertices in
`P ∖ N(pivot)`; a branch removes the earlier vertices from that candidate list
while retaining earlier members of `P` that were not sibling candidates. This
avoids enumerating every subset of a complete mutual graph while preserving
every maximal overlapping group.

All-pairs event-state reachability is bounded by `N × E` states for `N` valid
event nodes and `E` valid physical events. Maximal-clique enumeration remains
output-sensitive and has unavoidable exponential worst cases. A complete mutual
graph yields one group and follows one pivot branch per level, while a complete
multipartite graph with `k` parts of three yields `3^k` maximal groups and
`k × 3^k` membership rows. The API returns all of them without a group,
membership, or search cap. The focused component benchmark reports reachability
and clique-enumeration time separately, along with state, group, membership, and
memory measurements where the runtime exposes them.

The reachability cases reuse the production event-state SQL. The first has one
strict equal-time wave, so only direct seed states survive; a second wave one
hour later exercises actual transfers and deduplication. The runner reports
recursive join predicates, cardinalities, and timings separately: endpoint and
chronological joins may process the same candidates, so their row counts must
not be added. The clique cases reuse the exact production clique CTE builder on
synthetic mutual graphs. Their timings include synthetic adjacency preparation
and aggregate output counts, but exclude all-pairs reachability, mutual-graph
construction from reachability, and final membership expansion and row sorting.
They are stage diagnostics, not end-to-end `connectedComponents()` timings.

Engine peak buffer measurements include connection-resident tables and retained
allocations; RSS snapshots also include the runtime and allocator. Successive
cases share a connection, so these figures are not isolated per-stage memory
costs and cannot be added together.

On the local benchmark environment (DuckDB 1.5.5, one thread, 1 GB limit), a
32-node complete direct-event graph retained 992 all-pairs reachability states
and took 2.68 ms of DuckDB query time. Clique enumeration on the corresponding
complete mutual graph retained 33 recursive states and returned one group with
32 memberships in 22.17 ms. A complete six-part graph with three nodes per part
retained 1,093 recursive states and returned 729 groups with 4,374 memberships
in 10.99 ms. DuckDB reported peak buffer usage of 10.3 MB, 26.6 MB, and 34.7 MB
for those three queries, with no temporary spill. These single runs include
profiling overhead and are diagnostic rather than performance guarantees. Raw
profiles are retained under the ignored
`benchmarks/.work/graphs/chronological-components/` directory.

The review's two-wave reachability case used 1,984 events and retained 32,736
states against the 63,488 state bound. Its endpoint join emitted 2,029,632
candidates, while the chronological join retained 30,752 rows. Query time was
26.18 ms and the engine peak buffer reading was 18.4 MB, without a temporary
spill. This case demonstrates recursive transfer work that the single equal-time
wave does not exercise; the same timing and memory caveats apply.

## Static compatibility with the approved baseline

The final static comparison uses baseline commit
`be11e360ffedebc62192b2bc07ffa0b64a9e4197` and its approved 57-case,
one-iteration capture. `compareStaticBaseline.ts` executes the extracted
baseline and final implementation in alternating order for five repetitions. For
every method, variant, and workload shape, the final result has the exact same
complete ordered rows and output types as the freshly executed baseline. Its row
count and full materialization SQL also match the authoritative saved
observation and named JSON profile. This includes all static directions and
weight/count/component variants. `neighbors()`, `degree()`, `commonNeighbors()`,
`topologicalSort()`, and `addId()` retain their original implementation files;
the sequence methods select their original SQL branches when no chronological
setting is supplied.

The five-run operation-time ratio had a median of 1.005 across the 57 cases,
with individual medians from 0.876 to 1.136. DuckDB query-time ratios had a
median of 1.007 and ranged from 0.886 to 1.137. The identical SQL makes these
small bidirectional differences consistent with profiling, scheduling, cache,
and allocator noise; they are recorded rather than treated as evidence of a
speedup, regression, or guaranteed parity. Raw comparison profiles remain in the
ignored `benchmarks/.work/graphs/static-baseline-comparison/` directory. The
reproducible extraction and comparison command is documented in
`benchmarks/graphs/README.md`.

## Master acceptance evidence

The following ledger maps every behavioral and validation acceptance item in
issue #199 to repository evidence. Test names are quoted exactly so a focused
case can be selected with `deno test --filter`.

| #199 section and items                                                                                                                                                                                                            | Passing coverage or recorded evidence                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `neighbors()` items 1–4: isolated/end events, no transfer filtering, direct-query explanation, all directions/starts/parallels/loops/unknowns                                                                                     | The two chronological integration regressions above; `neighbors defaults to outgoing and supports every direction`, `neighbors sorts multiple starts and omits unknown starts`, and `neighbors deduplicates parallel edges and includes self-connections`; “Direct adjacency remains event-based” above.                                                                                                                                                |
| `degree()` items 1–4: preserve events, edge/weight/loop/total rules, neighbor consistency, connection-gap example                                                                                                                 | The two chronological integration regressions above; `degree distinguishes edge, neighbor, and weighted counts` and `degree handles sources, sinks, convergence, disconnection, and self-loops`; “Direct adjacency remains event-based” above. The parallel example returns four feasible routes but counts two incoming edges, two outgoing edges, one neighbor per direction, and weights only once.                                                  |
| `commonNeighbors()` items 1–3: direct set intersection, standalone edges, no meeting claim                                                                                                                                        | `direct graph counts do not multiply parallel events by feasible transfers`, `commonNeighbors defaults to outgoing and supports every direction`, `commonNeighbors deduplicates memberships and includes requested endpoints`, and the direct-adjacency contract above.                                                                                                                                                                                 |
| `reachable()` items 1–4: last-event state, valid first events, actual continuity, unknown/return/equal-time termination                                                                                                           | “Reachability state and termination”; `reachable chronological traversal keeps valid first events and enforces connection gaps`, `reachable chronological traversal retains competing last-event states`, `reachable chronological traversal handles starts, parallel events, returns, equal times, and input order`, and its independent generated evaluator comparison.                                                                               |
| `distances()` items 1–4: hop/weight optimum, costlier early state, justified dominance without route enumeration, cost units                                                                                                      | “Distance state and cost dominance”; `distances chronological state keeps cheap late and costlier early arrivals`, `distances chronological traversal handles first events, invalid rows, returns, and equal-time zero costs`, `distances chronological SQL uses finite keyed event costs without route enumeration`, and its generated evaluator comparison. Public JSDoc defines distance as hop count or summed connection weight, not elapsed time. |
| `shortestPath()` items 1–4: all tied feasible simple routes, feasible rather than static optimum, competing histories and sound pruning, unchanged objective                                                                      | “Shortest simple route bounds”; `shortestPath chronological routing returns a costlier feasible optimum in both directions`, `shortestPath chronological routing retains tied arrival and visited-node histories`, `shortestPath chronological SQL shares numbered events and bounds route prefixes`, and the exhaustive generated minima comparison.                                                                                                   |
| `paths()` items 1–3: per-transition chronology in both directions, all simple routes and exact edge identity, no walks                                                                                                            | `paths chronological traversal keeps first events and enforces both-column connections`, `paths chronological traversal preserves incoming orientation, parallel IDs, weights, and invalid-row policy`, `paths retains actual event continuity and terminates equal-time cycles`, and its generated evaluator comparison.                                                                                                                               |
| `findCycles()` items 1–4: feasible returns, non-smallest-node start, chronological canonical identity without closing gap, loops/equal times/directions/no reuse                                                                  | “Chronological cycle identity and normalization”; `findCycles starts chronological cycles at a feasible event in both directions`, `findCycles applies strict, non-strict, gap, and self-loop chronology`, `findCycles preserves temporal parallel identities and deterministic cycle IDs`, and the independently normalized generated comparison.                                                                                                      |
| `connectedComponents()` items 1–6: node mutual reachability, all maximal groups, overlapping deterministic memberships, no SCC merge, singleton/empty cases, uncapped output benchmark                                            | “Chronological strong components”; `connectedComponents returns the documented overlapping chronological groups`, `connectedComponents allows chronological journeys through outside nodes`, the independent exhaustive temporal comparison, the exhaustive 64 four-node mutual graphs, and the complete-clique/multipartite benchmark evidence above.                                                                                                  |
| `topologicalSort()` and `addId()` unchanged                                                                                                                                                                                       | Their implementation files are byte-identical to the approved baseline. The complete static comparison includes all three topological workloads. `topologicalSort matches the shared baseline and duplicate-edge oracles` and the complete `addId()` suite cover public behavior. Neither signature advertises chronological settings.                                                                                                                  |
| Incoming items 1–3: physical predecessor rule, output orientation, reject temporal `both` and explicit settings without columns                                                                                                   | “Incoming results”; the incoming chronological cases for all five direction-capable sequence methods; shared transition-helper incoming tests; each method's validation cases for temporal `both` and explicit `minGapMs: 0`; the consolidated explicit `strictOrdering: false` rejection regression. Static `both` cases remain in each existing suite.                                                                                                |
| Shared implementation items 1–5: shared timestamps with explicit algorithms, queue/output/chaining/binding/cache/exact identity, inline public types, schemas and documented temporal differences, no extra date/context features | `prepareGraphTemporalOptions()` and `prepareGraphTemporalSql()` plus their helper suite; method-specific SQL builders; each method's queue/output/cache/exact-ID cases; inline signatures and JSDoc in `SimpleTable.ts`; full parameter binding in the recorded queries. The public API contains only the four agreed flat settings: no explicit dates, `maxGapMs`, virtual events, or direct-query temporal modes.                                     |
| Acceptance 1: unchanged static results, schemas, order, and SQL                                                                                                                                                                   | The 57-case exact baseline comparison above, including complete ordered result data, types, row counts, and full query SQL.                                                                                                                                                                                                                                                                                                                             |
| Acceptance 2: both columns, each fallback, invalid columns/types/options, activation, precision, timezone                                                                                                                         | Shared helper tests from `prepareGraphTemporalSql resolves fallback columns and validates DuckDB temporal types` through the nanosecond, mixed-precision, DATE-range, TIMESTAMPTZ, validity, and large-gap cases; method-level fallback/validation cases.                                                                                                                                                                                               |
| Acceptance 3: backward time, strict/non-strict, equality, zero and positive gap boundaries                                                                                                                                        | Helper transition tests plus each method's ordering/gap cases, including mixed `TIMESTAMP`/`TIMESTAMP_NS` boundaries at 999/1000/1001 ns.                                                                                                                                                                                                                                                                                                               |
| Acceptance 4: isolated and three-flight examples across direct and sequence queries                                                                                                                                               | `chronological graph integration preserves direct events while constraining transfers`; the independent evaluator standalone/exact-gap fixtures.                                                                                                                                                                                                                                                                                                        |
| Acceptance 5: neighbor/degree consistency, parallel versus distinct counts, weighted sums, no transfer multiplication                                                                                                             | `direct graph counts do not multiply parallel events by feasible transfers` and the direct method suites cited above.                                                                                                                                                                                                                                                                                                                                   |
| Acceptance 6: actual continuity, cheap-late/costly-early, ties, shuffle, loops, returns                                                                                                                                           | `paths retains actual event continuity and terminates equal-time cycles`; distance and shortest-path early-arrival cases; shortest tied-history cases; generated/shuffled comparisons; method loop/return cases.                                                                                                                                                                                                                                        |
| Acceptance 7: incoming valid journeys, reject physical backward time, temporal `both`, and explicit zero/false activation errors                                                                                                  | Incoming-result contract and method tests cited above, plus the consolidated integration validation test.                                                                                                                                                                                                                                                                                                                                               |
| Acceptance 8: non-strict equal-time termination/deduplication                                                                                                                                                                     | Reachability finite-state, distance improvement, route simple-node, and cycle used-event tests; generated evaluators run strict and non-strict graphs in both directions.                                                                                                                                                                                                                                                                               |
| Acceptance 9: chronological cycle not anchored at smallest node and valid one-event cycles                                                                                                                                        | `findCycles starts chronological cycles at a feasible event in both directions` and `findCycles applies strict, non-strict, gap, and self-loop chronology`.                                                                                                                                                                                                                                                                                             |
| Acceptance 10: independent overlapping components, both examples, singleton/determinism, explicit strong mode, outside intermediaries                                                                                             | The component contract and named component cases above, independent route/subset oracle, shuffled input comparisons, and exhaustive 64-graph regression.                                                                                                                                                                                                                                                                                                |
| Acceptance 11: event-state, transfer, and overlapping-output benchmarks without unnecessary pair materialization                                                                                                                  | Distance benchmark: 96/384/864 keyed states versus 16,384/2,097,152/35,831,808 full-depth routes. Shortest benchmark: 2,388 versus six prefixes. Reachability benchmark: 32,736 states and 2,029,632 endpoint candidates with 30,752 chronological transfers. Component benchmark: one 32-member clique versus 729 groups/4,374 memberships. Query profiles record actual operators; stage counts are not added.                                        |
| Acceptance 12: public option documentation and worked `.log()` examples; generated `llm.md`                                                                                                                                       | All six public signatures document all four flat options and contain executable `.log()` examples. Each method suite executes its exact examples and displayed tables. `deno task all-tests` runs `deno task llm`; `llm.md` is generated only by that task.                                                                                                                                                                                             |
| Acceptance 13: formatting, lint, type/doc checks, tests, publish dry-run, npm smoke, generated docs                                                                                                                               | `deno task all-tests` is the canonical final command. It runs `deno fmt --check`, `deno lint`, `deno check src/index.ts`, `deno doc --lint`, `deno publish --allow-dirty --dry-run`, the complete Deno test suite, npm smoke tests, and `deno task llm`.                                                                                                                                                                                                |

The benchmark commands are:

```sh
deno run -A benchmarks/graphs/chronologicalDistances.ts
deno run -A benchmarks/graphs/chronologicalShortestPath.ts
deno run -A benchmarks/graphs/chronologicalComponents.ts
deno task benchmark-graphs
```

Focused integration verification is available with:

```sh
deno test -A test/unit/methods/chronologicalGraphIntegration.test.ts
deno test -A test/unit/helpers/prepareGraphTemporalSql.test.ts \
  test/unit/helpers/enumerateChronologicalRoutes.test.ts \
  test/unit/methods/reachable.test.ts \
  test/unit/methods/distances.test.ts \
  test/unit/methods/shortestPath.test.ts \
  test/unit/methods/paths.test.ts \
  test/unit/methods/findCycles.test.ts \
  test/unit/methods/connectedComponents.test.ts
```
