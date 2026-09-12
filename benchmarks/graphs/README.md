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

Topological sorting uses one recursive Kahn computation, selecting the smallest
eligible typed ID at each step. It retains visited-ID lists and repeatedly
checks remaining dependencies; long chains can therefore require substantial
recursive work and memory despite having few edges. It does not enumerate paths
or run a separate cycle preflight. A terminal count check rejects incomplete
ordering, and the queued result materializes before subsequent table operations
so even an empty downstream filter or zero-row limit cannot suppress cycle
errors. Upstream preparation can fuse into the sorting statement; downstream
operations start a new statement. The benchmark measures the complete sort
materialization.
