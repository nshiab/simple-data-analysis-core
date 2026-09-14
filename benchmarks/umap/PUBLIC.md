# Public hybrid UMAP integration — 2026-09-14

The selected hybrid is now exposed as `SimpleTable.umap(column, options)` in
core. DuckDB computes neighbors and the weighted graph; the owned TypeScript
optimizer consumes scalar edges in typed arrays. No new runtime dependency is
needed. UMAP-JS remains scoped to the historical comparison benchmarks.

```ts
await table.umap("embedding", {
  metric: "cosine",
  idColumn: "id",
  xColumn: "x",
  yColumn: "y",
  seed: 42,
}).selectColumns(["label", "x", "y"]).log();
```

The public signature and documentation live in
[`SimpleTable.ts`](../../src/class/SimpleTable.ts); orchestration lives in
[`umap.ts`](../../src/methods/umap.ts). The numerical modules in
[`src/helpers`](../../src/helpers) are internal. The hybrid benchmark re-exports
those modules so its SciPy curve and Python SGD trace checks also exercise the
shipped code. A separate production graph test checks Python's neighbor weights,
rho, and sigma directly.

## Interface and behavior

- Default output columns are `umapX` and `umapY`, both DOUBLE. Existing output
  names, including case-insensitive collisions, are rejected.
- Defaults: 15 neighbors including self, Euclidean metric, 200 epochs, seed 42,
  minimum distance 0.1, learning rate 1, five negative samples. Spread and
  repulsion strength remain one; initialization is random.
- `search: "auto"` selects exact neighbors through 1,000 rows and HNSW above
  that. Users can explicitly request either path. HNSW installs/loads VSS and
  requires an index join plan. If DuckDB declines the plan, only inputs up to
  1,000 rows may fall back to the bounded exact implementation. Larger inputs
  fail before executing a correlated all-pairs query. Exact work is quadratic
  but does not materialize a complete distance matrix.
- An optional unique, non-null `idColumn` determines vertex ordering; without
  it, input row order determines vertices. Original row order is preserved in
  either case, including duplicate rows and user columns named `rowid`.
- Numeric LIST and ARRAY inputs must have equal, nonempty dimensions and finite
  elements. Cosine vectors must have nonzero norms. Extreme magnitudes that
  overflow distance arithmetic are rejected. At least three rows are needed;
  neighborhood size is clamped to row count minus one.
- Fits execute as queued barriers. Temporary tables have unique private names
  and are cleaned on success, failure, or cancellation. Source payloads stay in
  native SQL types, including JSON, exact decimals, large integers, and geometry
  CRS. Temporary sources remain temporary, including in file databases.
- Publication and native index recreation run in a transaction. Failed or
  cancelled fits do not publish partial coordinate columns. A live `AbortSignal`
  is retained separately from the cloned queue settings. It interrupts SQL and
  is checked between graph steps and optimizer epochs; the CPU loop yields to
  timers every five epochs. Cancellation latency depends on the active query or
  epoch size.

## Integration measurements

These are complete **public method** fits after input loading, including native
source snapshots, graph construction, typed-array optimization, publication, and
scratch cleanup. Settings match the earlier
[owned hybrid measurements](HYBRID.md). Apple M4 Max, 64 GiB RAM, Deno 2.9.6,
DuckDB 1.5.5, one DuckDB thread, 1 GB DuckDB buffer limit, 2 GB spill limit,
2,048 MiB V8 old-space limit; each process had a 120-second deadline and a 4 GiB
sampled RSS guard. Native process peak RSS includes input preparation and all
allocations up to completion of the operation, not just DuckDB buffers.

| Dataset                               |          Time | Process peak RSS | Repeats           |
| ------------------------------------- | ------------: | ---------------: | ----------------- |
| 1,000 movie embeddings × 1,536, exact | 1.73 s median |      173–184 MiB | 3                 |
| 7,600 news embeddings × 384, HNSW     |   4.17–4.21 s |          617 MiB | seeds 42, 99, 123 |
| 10,000 synthetic × 128, HNSW          |        4.16 s |          344 MiB | 1                 |
| 10,000 synthetic × 1,024, HNSW        |        8.69 s |        1,295 MiB | 1                 |
| 100,000 synthetic × 128, HNSW         |       63.79 s |          771 MiB | 1                 |

All nine runs reproduced the corresponding saved hybrid coordinates exactly
(maximum absolute coordinate difference zero), preserved source row counts and
payload hashes, and produced finite coordinates. Thus the previous movie and
three-seed news quality scores apply unchanged to these public fits. This is not
new evidence of Python-identical coordinates or a quality guarantee for 100,000
rows. The 100,000 × 1,024 case remains an earlier unresolved resource limit; it
was not rerun or claimed as supported. Source snapshots add some memory compared
with the dedicated-connection prototype. Single-run timing variation does not
establish a speed improvement.

UMAP remains exploratory: local neighborhoods, apparent groups, and displayed
distances depend on parameters and can distort relationships. Keep embeddings
for similarity calculations. Spectral initialization, transforming new points,
supervision, and densMAP remain outside this implementation.

## Reproduction

First prepare the datasets and saved baseline layouts with the
[hybrid reproduction instructions](hybrid/README.md), then run:

```sh
deno run -A benchmarks/umap/public/jobs.ts
deno run -A benchmarks/umap/compare/run.ts benchmarks/.work/umap/public/jobs.json
deno test -A test/unit/methods/umap.test.ts test/unit/helpers/buildUmapGraph.test.ts test/unit/prototypes/umapHybrid.test.ts
```

The public worker fails on coordinate drift, changed source hashes, non-finite
results, or a timeout. The runner records every worker's exit code and external
memory observation. Full observations are saved in
[`public-integration.json`](results/public-integration.json).

Validation after integration: **1,709 tests passed, zero failed, seven existing
CI network skips**. Formatting, lint, source type checks, and public JSDoc lint
passed. The packed npm package passed Node and Bun smoke tests in both ESM and
CommonJS, including a real UMAP fit. The public API documentation was
regenerated with the repository's `llm` task.
