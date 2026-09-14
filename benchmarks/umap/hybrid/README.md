# Dependency-free hybrid UMAP

This is the selected continuation of issue #181 after the three-way comparison.
DuckDB validates vectors and builds the weighted fuzzy neighborhood graph; an
owned TypeScript module optimizes the two-dimensional layout. The executable
path imports no UMAP-JS or other external runtime dependency beyond DuckDB. It
is now shared with the [public core method](../PUBLIC.md). This lab adapter
retains a dedicated scratch connection and `input(id, vector, ...)` contract,
preserving the original table and all columns.

`prototypeHybridUmap.ts` orchestrates the fit and writes `umap_result` with
`umap_x` and `umap_y`. `optimizeUmapLayout.ts` accepts a directed weighted graph
and interleaved initial coordinates, and returns new interleaved coordinates.
Callers must keep borrowed graph/initial arrays unchanged until the fit ends.
The numerical module does not depend on DuckDB or any external package.

## Implemented algorithm

- Same exact/HNSW neighbor search and fuzzy union graph as the validated SQL
  prototype, including its duplicate-distance policy and input checks. The HNSW
  plan must contain `HNSW_INDEX_JOIN`; unbounded fallback is rejected.
- Sequential Euclidean UMAP SGD, scheduled positive edges, five negative samples
  by default, attraction applied to both endpoints, repulsion to the sampled
  head, gradients clipped to four, and linearly decaying learning rate.
- Double precision coordinates and schedules; Uint32 edge endpoints. Graph
  arrays require 16 bytes per directed edge, schedules another 24 bytes per
  edge, and initial/output coordinates together 32 bytes per vertex. This
  excludes SQL state, conversion chunks, runtime overhead, and allocator
  high-water marks.
- Stable source/target edge order and separate seeded Mulberry32 streams for
  initial coordinates and negative sampling. The seed is an unsigned 32-bit
  integer. Input IDs define stable vertex order, including duplicate vectors.
- Random initialization, spread one, repulsion strength one, no densMAP,
  supervision, transform, or spectral initialization. These are algorithmic
  scope choices, not claims to implement every reference UMAP feature.
- An owned two-variable damped Gauss-Newton fit provides continuous
  `minDistance` values from zero through one. It fits the same target curve as
  reference `find_ab_params`; the old SQL prototype's three presets are no
  longer a restriction on this path.
- Zero-distance negative pairs receive zero gradient, matching current Python
  UMAP. This intentionally differs from UMAP-JS 1.4.0's constant positive
  gradient fallback. The random generator, edge orientation, and precision also
  differ from one or both reference implementations; matching final coordinates
  across implementations is not an acceptance criterion.
- `AbortSignal` interrupts SQL and is checked between optimizer epochs. The
  numerical loop yields to timers every five epochs. Input remains untouched.
  Cancellation during graph construction or layout preserves the previous
  result; the result table is replaced when writeback succeeds.
- Graph conversion uses bounded row chunks and typed arrays. Unused SQL index,
  candidates, neighbor, and directed-edge tables are dropped before layout;
  high-dimensional scratch vectors are released. The input vectors stay in SQL.

## Validation and reproduction

Use the pinned Python environment, source data, and installed VSS extension from
the parent README. Run performance jobs serially, followed by quality
evaluation:

```sh
/tmp/umap-reference-env/bin/python benchmarks/umap/hybrid/referenceFixtures.py
deno test -A test/unit/prototypes/umapHybrid.test.ts
deno run -A benchmarks/umap/hybrid/jobs.ts
deno run -A benchmarks/umap/compare/run.ts benchmarks/.work/umap/hybrid/jobs.json
/tmp/umap-reference-env/bin/python benchmarks/umap/hybrid/prepareNews.py
deno run -A benchmarks/umap/compare/run.ts benchmarks/.work/umap/hybrid/news-jobs.json
/tmp/umap-reference-env/bin/python benchmarks/umap/hybrid/evaluate.py
```

`referenceFixtures.py` invokes the installed Python reference's unchanged epoch
routine with substituted RNG and float64 distance/clip helpers. This isolates
SGD update correctness from random-stream and precision differences. The
reference trace receives the candidate's curve parameters; the curve fitter is
checked separately against SciPy-derived parameters at seven minimum distances.
The committed fixture lets Deno tests run without Python. Tests also cover
invalid graphs/options, finite output, reproducibility, preservation of IDs,
vectors and payload, reversed physical row order, and timer-driven cancellation.

The small end-to-end evaluations use the original movies and synthetic data,
additional seeds, and minimum distances between the old presets. The new larger
case uses every row of the public `pietrolesci/agnews` test embeddings, labelled
`all-MiniLM-L12-v2` by the provider: 7,600 × 384, cosine distance, ordered by
source UID. Revision, source SHA-256, and commands are pinned in
`prepareNews.py`. No embedding model or provider API is called. Source data
remain ignored.

News quality evaluates 512 fixed anchors against **all** 7,600 rows at ten
neighbors, comparing the owned optimizer, the historical UMAP-JS hybrid, and
Python reference UMAP across seeds 42, 99 and 123. These are sampled quality
estimates, not full-population scores or confidence intervals. The preexisting
gates remain trustworthiness within 0.03 and neighbor overlap within 0.10 of the
Python reference. Inspect failures; do not tune acceptance thresholds afterward.

Results are recorded in [hybrid-owned.json](../results/hybrid-owned.json) and
[the current findings](../HYBRID.md). Earlier observations remain unchanged.
Quality caches live in each ignored job directory; remove `quality.json` or
`news-reference-seed*.npy` when changing the evaluator or reference settings.

Sources:
[UMAP's algorithm](https://umap-learn.readthedocs.io/en/latest/how_umap_works.html),
the pinned Python `umap-learn` source installed from `requirements.txt`, and
[the news dataset](https://huggingface.co/datasets/pietrolesci/agnews/tree/01e7414408f5412b92ddef7e7213f67aded40288/embedding_all-MiniLM-L12-v2).
