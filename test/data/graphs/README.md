# Shared graph fixtures

These files are the hand-checkable oracle for the native graph methods planned
in issues #166–#175. They contain data and expected answers only; no expected
result was produced by a graph implementation.

`edges.csv` has the canonical schema `scenario,edgeId,source,target,weight`.
Select exactly one scenario before calling a graph method. Edge IDs are unique
and endpoints are non-null within each scenario. `numeric.csv` is separate so
CSV inference keeps node and edge IDs numeric. `empty.csv` contains only its
header. `custom-columns.csv` verifies that input names such as `origin` and
`flightId` still produce the fixed graph output names. `without-edge-id.csv`
supports the documented `addId("edgeId")` and
`addId("edgeId", { prefix: "edge-" })` preparation paths.

Nodes are always discovered from both endpoint columns. There is no node file.
Consequently, an ID absent from both columns is unknown, and the empty table has
no nodes. A source-only or destination-only value is still a node. Self-loops
are real connections and never placeholders for isolated nodes.

## Scenario catalog

The adjacency lists below give the exact contents of `edges.csv`; each item is
`edgeId: source -> target (weight)`.

| Scenario              | Exact connections                                                                               | Purpose                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `baseline`            | `B1: A->B (1)`; `B2: A->C (1)`; `B3: B->D (1)`; `B4: C->D (1)`; `B5: D->E (1)`; `B6: F->G (1)`  | Branch, convergence, tied routes, sink/source-only nodes, disconnected DAG |
| `cycle`               | Baseline plus `C7: E->A (1)`                                                                    | Two directed cycles and topological failure                                |
| `self-loop`           | `L1: A->A (4)`; `L2: A->B (1)`                                                                  | Real one-step cycle plus an ordinary route                                 |
| `parallel`            | `P1: A->B (1)`; `P2: A->B (2)`; `P3: B->C (5)`                                                  | Membership deduplication and edge-distinct routes                          |
| `parallel-opposite`   | `Q1: A->B (1)`; `Q2: B->A (2)`                                                                  | A distinct two-edge undirected cycle with opposite storage orientation     |
| `weighted`            | `W1: A->E (10)`; `W2: A->B (1)`; `W3: B->D (1)`; `W4: D->E (1)`; `W5: A->C (0)`; `W6: C->E (3)` | One-hop versus minimum cost, a zero-cost step, and weighted ties           |
| `zero-cycle`          | `Z1: A->B (0)`; `Z2: B->C (2)`; `Z3: C->A (0)`                                                  | Finite simple paths and cumulative zero-weight cycle totals                |
| `single`              | `S1: A->B (1)`                                                                                  | Source-only A, sink-only B, no cycle                                       |
| `component-chain`     | `K1: A->B (1)`; `K2: B->C (1)`                                                                  | One weak and three strong components                                       |
| `component-cycle`     | Chain plus `K3: C->A (1)`                                                                       | One weak and one strong component                                          |
| `degree-weight`       | `D1: A->B (100)`; `D2: A->B (200)`; `D3: C->B (50)`                                             | B has weighted incoming degree 350; edge and neighbor counts differ        |
| `common`              | `H1/H2: A->C (1)`; `H3/H4: B->C (1)`; `H5: A->A (1)`; `H6: B->A (1)`                            | Duplicate shared neighbors and a requested node that is itself common      |
| `triangle`            | `T1: A->B (1)`; `T2: B->C (2)`; `T3: C->A (3)`                                                  | Directed cycle in every traversal mode                                     |
| `undirected-triangle` | `U1: A->B (1)`; `U2: B->C (2)`; `U3: A->C (3)`                                                  | Cycle only when direction is `both`                                        |
| `string-ids`          | `I1: 001->1 (1)`; `I2: A->a (1)`                                                                | Exact strings, leading zeros, case, and lexical ordering                   |
| `fraction-weight`     | `R1: A->B (0.5)`; `R2: B->C (1.25)`                                                             | Input numeric semantics and an exact total of 1.75                         |

Additional scenarios in `edges.csv`:

- `single-loop`: `J1: A->A (0)` is a complete single-node graph with a real
  zero-weight connection. It has degree 1 in each direction (weighted degree 0),
  one component, and one one-step cycle in every direction. With
  `includeStart:
  false`, reachable returns no rows.
- `parallel-equal`: `V1: A->B (1)`, `V2: A->B (1)`, `V3: B->C (5)` has two
  weighted shortest routes at cost 6, preserving both edge identities.

`numeric.csv` contains `0: 0->10 (1)`, `1: 0->2 (0)`, and `2: 2->10 (1)`.
Numeric zero is valid as a node ID, edge ID, and weight. Numeric ordering is
`0, 2, 10`, unlike lexical string ordering.

`numeric-cycle.csv` contains `10: 0->2`, `2: 2->10`, and `1: 10->0`. Its
both-direction normalized edge sequence is numeric `[1, 2, 10]`, proving that
implementations must compare typed values instead of delimiter-joined strings.

`unsupported-types.csv` is schema-only error input: it supplies a boolean edge
ID, date endpoint, and string weight. It is kept apart from valid graph rows and
supports cheap type checks without asking implementations to scan values.

| Separate file           | Exact contents                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `empty.csv`             | Header `edgeId,source,target,weight`; no rows                                                 |
| `custom-columns.csv`    | `F1: A->B (1)` and `F2: B->C (2)`, using `flightId,origin,destination,cost`                   |
| `without-edge-id.csv`   | `A->B (1)` and `B->C (2)`, using `source,target,weight`                                       |
| `unsupported-types.csv` | One row: `true,2026-09-11,A,heavy` under `booleanEdgeId,dateSource,stringTarget,stringWeight` |

## Expected result files

Every file under `expected/` begins with a `case` discriminator. Filter on one
case and drop that column before comparing with a method result. The remaining
columns are the exact public output schema and the rows are already in the
required order. Case names state the input scenario, node arguments, direction,
and weighted/count/mode option when those differ from defaults. `unknown` means
literal string `unknown`, absent from both endpoint columns. Multi-start cases
use `["F", "unknown", "A"]` to check sorting independently of argument order.
`weighted-A-outgoing` and `fraction-weight-A-outgoing` in distances select the
`weight` column; route/cycle cases select it only with a `-weighted` suffix.
`zero-cycle-weighted` uses outgoing direction. `no-start` means
`includeStart: false`. Numeric cases use numeric arguments, not strings. For
empty inputs, load the header-only file with explicit string endpoint/edge-ID
and numeric weight types so inference does not define the test's schema.

| Method                  | Expected file                       | Output after dropping `case`                       |
| ----------------------- | ----------------------------------- | -------------------------------------------------- |
| `neighbors()`           | `expected/neighbors.csv`            | `start,node`                                       |
| `degree()`              | `expected/degree.csv`               | `node,incoming,outgoing`                           |
| `commonNeighbors()`     | `expected/common_neighbors.csv`     | `node`                                             |
| `reachable()`           | `expected/reachable.csv`            | `start,node`                                       |
| `distances()`           | `expected/distances.csv`            | `start,node,distance`                              |
| `shortestPath()`        | `expected/shortest_path.csv`        | `pathId,step,edgeId,source,target,weight,distance` |
| `paths()`               | `expected/paths.csv`                | `pathId,step,edgeId,source,target,weight,distance` |
| `connectedComponents()` | `expected/connected_components.csv` | `node,componentId`                                 |
| `findCycles()`          | `expected/find_cycles.csv`          | `pathId,step,edgeId,source,target,weight,distance` |
| `topologicalSort()`     | `expected/topological_sort.csv`     | `node,order`                                       |

The files under `expected/numeric/` retain numeric identities for neighbors,
distances, shortest paths, cycle normalization, and topological order. The
text-ID expected files deliberately do not mix numeric and string IDs in one
column.

The baseline expectations include these useful checks:

- `reachable("source", "target", "A")` yields A, B, C, D, E;
  `includeStart: false` yields B, C, D, E.
- Distances from A are A=0, B=1, C=1, D=2, E=3.
- B and C have outgoing common neighbor D, incoming common neighbor A, and
  both-direction common neighbors A and D.
- Weak components are `{A,B,C,D,E}` and `{F,G}`. Every baseline node is its own
  strong component because the graph is acyclic.
- The exact topological order is A, B, C, D, E, F, G. It follows the smallest
  currently eligible ID rule, rather than sorting the final node list.

For weighted shortest paths from A to E, `W2/W3/W4` and `W5/W6` both total 3;
the latter starts with weight 0 and therefore has cumulative distances 0, 3. The
unweighted result is only direct edge W1. `paths()` retains all three simple
routes and their individual totals. The parallel fixture retains P1/P3 and P2/P3
as separate paths even though their node sequences match.

Route rows represent traversed connections. There is no synthetic start row. A
two-edge path has two rows, and a cycle contains its real closing edge.
Unweighted rows still have `weight=1` and cumulative `distance`. Incoming and
both-direction results report endpoints in traversal order while retaining the
stored edge ID; for example incoming edge B5 is emitted as E->D.

## Empty results and inexpensive errors

`contracts.csv` records empty-result and cheap-error cases that have no data
rows to store in an expected CSV. Empty results preserve the schemas above.
Unknown starts/endpoints produce no rows. In mixed multi-start queries, known
starts still produce their ordinary results and unknown starts contribute no
rows. A valid disconnected A-to-G route also produces no rows. Empty and
duplicate start arrays, identical route endpoints, identical `commonNeighbors()`
arguments, missing/invalid cycle direction, and weighted degree with
`count: "neighbors"` are argument errors. Missing columns, unsupported ID-column
types, and supplied IDs whose type is incompatible with the endpoint type are
schema/type errors.

Endpoint IDs must be non-null strings or whole numbers. Route edge IDs must be
unique, non-null strings or whole numbers. Weights must be finite, non-negative
numbers. Those row-level properties are caller requirements, so there are no
malformed-row fixtures and methods must not add preflight scans to audit them.
Matching is strict: no string/number coercion, trimming, case folding,
leading-zero removal, or rounding.

## Determinism

All ordinary results are sorted by the contract: `start,node` for multi-start
methods; `node` for degree, common neighbors, and components; `pathId,step` for
routes/cycles; and `order` for topological sorting.

Routes are sorted by their typed edge-ID sequence and numbered from pathId 0;
steps begin at 1. Components are numbered by sorted smallest member. Directed
cycles rotate to their smallest node while preserving traversal direction.
Both-direction cycles also choose the smaller of the two typed edge-ID sequences
and deduplicate reversal. Different edge combinations remain different cycles. A
single edge cannot be reused to create an out-and-back cycle; two distinct
parallel edges can form one. These rules are invariant to input row order while
the original edge IDs are preserved.

## Performance data

Correctness fixtures stay deliberately small. `benchmarks/graphs/workloads.ts`
builds DuckDB SQL for separately generated deep-chain, binary-branching, and
dense directed datasets. Future graph benchmarks should create those datasets
outside the timed operation and use no timing assertions in unit tests.
