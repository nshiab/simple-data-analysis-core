# Three-way UMAP comparison

This unpublished lab compares three concrete implementations of issue #181:

| Approach   | Neighbors and fuzzy graph                                             | Layout                             |
| ---------- | --------------------------------------------------------------------- | ---------------------------------- |
| DuckDB     | Existing SQL prototype; exact at 1,000 rows, VSS HNSW at larger sizes | Existing batched SQL optimizer     |
| Hybrid     | Same DuckDB graph, exported as scalar weighted edges                  | UMAP-JS 1.4.0 sequential optimizer |
| TypeScript | UMAP-JS 1.4.0 NN-descent and fuzzy graph                              | The same UMAP-JS optimizer         |

“TypeScript” means all UMAP numerical work runs in JavaScript. DuckDB still
holds the SDA table, supplies vectors in stable ID order, and receives output.
This tests an installable library using its native `number[][]` representation,
not a hypothetical optimized typed-array implementation.

## Controls and boundaries

- Every worker starts in a fresh process, uses one DuckDB thread, 200 epochs, 15
  neighbors, minimum distance 0.1, five negative samples, and seed 42 unless the
  manifest explicitly overrides them. Repeated cases rotate approach order.
- All three receive identical seeded starting coordinates. Both UMAP-JS paths
  reset their optimizer random stream after graph construction. A unit test
  verifies that the graph adapter exactly reproduces the public library's
  optimizer when supplied the same graph. SQL uses a different sampling stream
  and batched updates; it is not numerically identical sequential SGD.
- SQL uses its previously explored learning rate 0.1. UMAP-JS uses its standard
  rate 1. Separate movie controls exchange those rates. Equal numeric learning
  rates need not produce equivalent behavior in different update algorithms.
- The measured operation starts with the input table loaded and ends with its
  original columns plus two coordinates in DuckDB. Validation, ID mapping,
  vector/graph transfer, initialization, and writeback count. Module startup,
  input loading/generation, verification, and artifact exports are separately
  excluded. This is a cold fit in a fresh process, not a warmed library loop.
- Peak RSS includes the process and resident input; it is not incremental
  allocation. The worker records the native high-water mark immediately after
  writeback. Later verification can increase the separately reported process
  peak. The parent samples RSS every 500 ms for failures and a 4 GiB guard.
- Each worker has 1 GB DuckDB buffer memory, 2 GB maximum DuckDB spill, 2,048
  MiB V8 old-space, and a 120-second deadline plus five seconds of termination
  grace. These are distinct limits, not a single total-memory budget. A killed
  worker's sampled peak is a lower bound. Failures are retained in the evidence.
  A follow-up 100,000 × 128 TypeScript control increases V8 old-space to 3,072
  MiB, retaining the same RSS guard and deadline, to distinguish heap budget
  failures from an inherent row-count limit.
- The hybrid adapter accesses private methods in pinned UMAP-JS 1.4.0 because
  its public API cannot accept a weighted graph. It is benchmark code, not a
  proposed production integration. Full TypeScript uses normal `initializeFit`,
  including its search structures for later transforms; hybrid skips those.
- The dependency is scoped to this directory in `deno.json`. No public export
  imports it. Existing repository placement rules would put a production
  UMAP-JS-dependent integration in `simple-data-analysis`, not core.

## Cases and decision criteria

Use the original fixed 1,000-row Swiss roll and separated clusters (384
dimensions, Euclidean), and public movie plot embeddings (1,536 dimensions,
cosine). Three movie repetitions measure timing variation. Additional movie
cases use seed 99 and five neighbors/minimum distance zero, which previously
exposed SQL layout quality loss. Three repetitions each at 10,000 × 128 and
10,000 × 1,024 assess scaling. Single bounded 100,000-row cases are stress
tests, not supported-size guarantees. Generated scale vectors have ten groups;
they do not replace real high-dimensional quality evaluation.

Before reviewing quality results, prefer an implementation that maintains
trustworthiness within 0.03 and neighbor overlap within 0.10 of reference UMAP
on each small dataset, then compare time, memory, and integration complexity.
The earlier absolute trustworthiness gate of 0.90 cannot distinguish candidates
fairly on movies: reference UMAP itself scored around 0.82. Keep that historical
failure visible in the original findings; use reference-relative quality for
this comparison. Under ten seconds at 10,000 rows is a useful exploratory
performance target, not a product commitment.

Exact small-dataset quality uses the pinned Python reference environment from
the parent README. It measures trustworthiness and original-neighbor overlap at
ten neighbors, graph edge precision/recall, and reference layouts both with the
candidate graph/initialization and normal spectral initialization. Large case
quality uses 256 fixed anchors ranked against all 10,000 input rows; label this
as a sampled estimate. All quality evaluation runs after timed workers.
Coordinates and graph exports allow inspection and deterministic-repeat checks.

## Reproduce

First prepare the reference environment/data and install VSS as described in the
parent README. Then, from the repository root:

```sh
deno run -A benchmarks/umap/compare/jobs.ts
deno run -A benchmarks/umap/compare/run.ts benchmarks/.work/umap/compare/quality-jobs.json
deno run -A benchmarks/umap/compare/run.ts benchmarks/.work/umap/compare/scale-jobs.json
deno run -A benchmarks/umap/compare/run.ts benchmarks/.work/umap/compare/stress-jobs.json
deno run -A benchmarks/umap/compare/run.ts benchmarks/.work/umap/compare/control-jobs.json
deno run -A benchmarks/umap/compare/run.ts benchmarks/.work/umap/compare/memory-jobs.json
/tmp/umap-reference-env/bin/python benchmarks/umap/compare/evaluate.py
deno test -A test/unit/prototypes
```

Run manifests serially with no competing benchmarks. `ps` must be available to
the harness for RSS monitoring. The evaluator caches per-job quality files;
delete those if changing the evaluator. Raw worker observations live under the
ignored `benchmarks/.work/umap/compare` directory; portable evidence and the
three-way plot are saved under `benchmarks/umap/results`.

Sources: [UMAP-JS](https://github.com/PAIR-code/umap-js),
[UMAP reference implementation](https://github.com/lmcinnes/umap), and the
pinned movie source recorded by the parent experiment. This comparison measures
these implementations on one machine; it does not prove a language-wide limit.
