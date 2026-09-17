# Native graph benchmarks

Run `deno task benchmark-graphs` to profile the graph methods on generated deep
chains, binary branching graphs, and dense directed graphs. No input downloads
or graph extension are needed. Correctness fixtures remain in
`test/data/graphs/`; these generated workloads are separate.

See [local observations](results.md) for a complete default run with timings,
memory measurements, and observed query operators.

The default run uses three warm measurements per case, 128 chain nodes, 127
branching nodes, and seven dense nodes. These deliberately small defaults keep
complete path/cycle enumeration practical. The methods themselves have no
benchmark-imposed hop or result limit. Dense path/cycle output grows rapidly as
nodes are added.

```sh
deno task benchmark-graphs --iterations=1 --methods=neighbors,degree
deno task benchmark-graphs --methods=reachable,distances --chain-nodes=1000 --branch-nodes=1023
deno task benchmark-graphs --methods=findCycles --dense-nodes=6
deno run -A benchmarks/graphs/chronologicalDistances.ts
deno run -A benchmarks/graphs/chronologicalShortestPath.ts
deno run -A benchmarks/graphs/chronologicalComponents.ts
```

Options use `--name=value`: `iterations`, comma-separated `methods`,
`chain-nodes`, `branch-nodes`, and `dense-nodes`. Every selected method runs on
all three shapes. Weighted variants use the generated unit-weight column;
weighted correctness, fractional costs, and zero-weight cycles are tested by the
unit suite. Components include both modes, degree includes all counting modes,
and cycles include all directions. Topological sorting uses a dense DAG
(`source < target`) so its dense case measures successful ordering.

Each case creates a new in-memory database with one DuckDB thread and a 1 GB
memory limit. Fixture creation and one warm-up run are outside timing. The
measurement includes the public call, queue/schema work, SQL computation,
deterministic labeling/sorting, and output-table materialization. Result row
count retrieval and profiling-file reads are outside timing. Profiling is
intentionally enabled during measurement, so these are diagnostic timings with
profiling overhead, not a comparison against unprofiled libraries.

`benchmarks/.work/graphs/observations.json` contains environment versions and
all observations. One native DuckDB JSON profile per observation retains the
actual materialization SQL and operator tree, including recursive operators,
scans, grouping, sorting, cardinalities, and operator timings. The runner checks
that it captured the graph materialization rather than a metadata query.

- `milliseconds`: complete measured operation duration.
- `queryMilliseconds`: DuckDB's materialization-query latency.
- `cumulativeRowsScanned`: engine-reported cumulative scanned rows, including
  scans that report this metric. It does not account for all recursive work;
  inspect recursive operator cardinalities and timings too. It is not a SQL call
  count or physical disk-read count.
- `enginePeakBufferBytes` and `enginePeakTempBytes`: DuckDB-reported system
  peaks; these include database state and are not memory attributable solely to
  one operator. The source and warm-up result remain present.
- `processRssAfter`: process RSS after the operation and row-count read. This
  includes runtime and allocator state from preceding cases; it is not a
  per-method peak-memory comparison.

Use the raw plans to investigate scan/grouping costs and retain all repetitions
when comparing changes. Unit tests verify correctness independently; no timing
assertion is part of the test suite. These local measurements do not establish
performance parity with graph extensions or guarantees for larger graphs.

`compareStaticBaseline.ts` checks static graph compatibility against an
extracted source tree and a saved one-iteration benchmark artifact. It compares
the complete ordered result, output types, row count, and full materialization
SQL for all 57 method/variant/workload cases. It also runs each version five
times by default, alternating which version runs first, and records median
operation and DuckDB-query timings. Timings remain diagnostic; exact result and
SQL comparisons are the compatibility checks.

```sh
baseline_root=$(mktemp -d /tmp/sda-static-baseline-XXXXXX)
git archive be11e360ffedebc62192b2bc07ffa0b64a9e4197 | tar -x -C "$baseline_root"
deno run -A benchmarks/graphs/compareStaticBaseline.ts \
  --baseline-root="$baseline_root" \
  --baseline-observations=/path/to/baseline-graphs/observations.json \
  --iterations=5
```

Only `observations.json` from the approved one-iteration capture and the profile
named by each observation are inputs. Extra profiles from unrelated runs in the
same directory are ignored. The comparison report and new profiles are written
under the ignored `benchmarks/.work/graphs/static-baseline-comparison/`
directory.

The focused chronological-distance runner builds layered event graphs whose
number of possible routes grows exponentially. `fullDepthRoutes` counts routes
reaching the final layer, excluding shorter prefixes. It reports the number of
keyed event-cost states retained by `distances()`, the finite state bound,
complete query time, and the timing and cardinality reported by DuckDB for
transfer joins. Raw profiles are written under
`benchmarks/.work/graphs/chronological-distances/`. This runner measures the
cost-state algorithm directly and does not enumerate the possible routes.

The focused chronological-component runner measures all-pairs event-state
reachability and maximal-clique enumeration as separate queries. One strict
equal-time wave measures direct seeds; two waves exercise transfers and state
deduplication. Recursive transfer operators report their actual predicates,
times, and cardinalities; do not sum row counts from successive join stages. Its
complete mutual graph verifies that pivoting follows one branch per level
instead of enumerating every subset. Its complete multipartite graph has six
parts of three nodes, producing `3^6 = 729` maximal groups and `6 × 3^6 = 4,374`
membership rows. It reports retained reachability states, recursive clique
states, groups, memberships, query time, DuckDB peak buffer/temp storage, and
process RSS before and after each phase. The runner reuses production
reachability and clique SQL builders. Clique queries operate on synthetic mutual
graphs and aggregate output counts; they exclude reachability, mutual-graph
derivation, and final membership expansion/sorting. These are not end-to-end
method times. Engine peak buffers include connection-resident data and retained
allocations, and process RSS includes runtime/allocator state. Cases share a
connection, so memory readings are not isolated operator costs and cannot be
added. Raw profiles are written under
`benchmarks/.work/graphs/chronological-components/`.

Topological sorting uses one recursive Kahn computation, selecting the smallest
eligible typed ID at each step. It retains visited-ID lists and repeatedly
checks remaining dependencies; long chains can therefore require substantial
recursive work and memory despite having few edges. It does not enumerate paths
or run a separate cycle preflight. A terminal count check rejects incomplete
ordering, and the queued result materializes before subsequent table operations
so even an empty downstream filter or zero-row limit cannot suppress cycle
errors. Upstream preparation can fuse into the sorting statement; downstream
operations start a new statement. The benchmark measures the complete sort
materialization, including weak component labeling. Component IDs match the
default `connectedComponents()` method. The final result is grouped by component
and its order restarts at one within each group. Labeling propagates the
smallest node ID through each group, so long chains require more rounds than
shallow or densely connected graphs.

## Cost of adding component IDs

A local comparison on 2026-09-15 measured the implementation at `95154d3`
against the version adding component IDs and per-component order. Both used the
same current dependencies, one DuckDB thread, a 1 GB memory limit, and the same
preloaded input table. Each case had two warm-up runs per version and five
measured runs, alternating which version ran first. Unlike the profiled
benchmark above, profiling was disabled. Times include queuing and result
materialization; input creation, row-count checks, and cleanup were outside
timing.

| Input           | Before (median ms) | With components (median ms) | Change |
| --------------- | -----------------: | --------------------------: | -----: |
| chain-128       |               35.5 |                        57.2 | +61.2% |
| chain-1000      |              856.2 |                      1055.9 | +23.3% |
| branching-1023  |              879.2 |                       885.6 |  +0.7% |
| dense-dag-100   |               38.0 |                        39.1 |  +3.0% |
| 50-chains-of-20 |              869.9 |                       865.4 |  -0.5% |

Chains connect consecutive numeric IDs. The branching graph is a binary tree;
the dense DAG has every connection from a lower to a higher ID (4,950
connections). The final case has 50 disconnected chains of 20 nodes each.

These timings show noticeable overhead on long chains, with little difference on
the other tested shapes. Differences of a few percent may be measurement noise.
This is a local sample, not a performance guarantee for other datasets.
