# UMAP in DuckDB: unpublished feasibility experiment

Issue: <https://github.com/nshiab/simple-data-analysis-core/issues/181>.

This directory is excluded from the published package. The original SQL
prototype adds no public method and no runtime dependency beyond the existing
DuckDB package and its optional VSS extension. All vector arithmetic, graph
construction, random sampling, and coordinate updates run in DuckDB; TypeScript
controls queries and epochs.

The follow-up [three-way comparison](compare/README.md) also benchmarks hybrid
and fully TypeScript UMAP using a dependency scoped to benchmark code. See its
[comparison results](COMPARISON.md) and the [owned hybrid findings](HYBRID.md)
and the [current public method and integration measurements](PUBLIC.md).

## Decision gates

Set before running quality evaluations: on 1,000-row synthetic manifolds and
text embeddings, target under 10 seconds for the complete SQL operation and
under 1 GiB process peak RSS. At 10 neighbors, target trustworthiness at least
0.90 and no more than 0.03 below reference UMAP with default spectral
initialization, and neighbor overlap no more than 0.10 below reference. These
are exploratory gates for this prototype, not proposed public guarantees.
Inspect comparisons using the same graph and initialization to distinguish
optimizer error from initialization and neighbor-search differences. Record
failures as well as successes.

Start with the optimizer on a reference graph, then validate the complete
pipeline. Evaluate 10,000 and 100,000 vectors with bounded jobs; they are
stretch evaluations, not required supported sizes. A failed experiment may
recommend stopping, refining SQL, or separately evaluating a native extension.

## Run

From the repository root, use Python 3.12 and the isolated development
environment:

```sh
uv venv --python 3.12 /tmp/umap-reference-env
uv pip install --python /tmp/umap-reference-env/bin/python -r benchmarks/umap/requirements.txt
/tmp/umap-reference-env/bin/python benchmarks/umap/reference.py prepare benchmarks/.work/umap/reference
/tmp/umap-reference-env/bin/python benchmarks/umap/reference.py movies benchmarks/.work/umap/reference
deno run -A benchmarks/umap/jobs.ts
deno task umap-benchmark benchmarks/.work/umap/quality-jobs.json
deno task umap-benchmark benchmarks/.work/umap/scale-jobs.json
deno task umap-benchmark benchmarks/.work/umap/tuning-jobs.json
```

`prepare` creates synthetic datasets, reference graphs, and the small committed
unit-test fixture. `movies` downloads public, precomputed plot embeddings from
MongoDB/embedded_movies and records its revision, SHA-256, and sampled source
rows. No embedding provider is called. Large datasets and generated files live
under the ignored `benchmarks/.work/` directory.

HNSW jobs require VSS installed for the DuckDB version in `deno.json` (run
`INSTALL vss` on that DuckDB connection once, or use SDA's `createVssIndex`).
The worker only loads an already-installed extension. On macOS, if a Python.org
interpreter lacks CA certificates, run the download command with
`SSL_CERT_FILE=/etc/ssl/cert.pem`; keep TLS verification enabled.

Create a JSON array of jobs, then run
`deno task umap-benchmark path/to/jobs.json`:

```json
[
  {
    "name": "swiss-optimizer",
    "input": "benchmarks/.work/umap/reference/swiss.parquet",
    "graph": "benchmarks/.work/umap/reference/swiss-graph.csv",
    "output": "benchmarks/.work/umap/swiss-optimizer",
    "timeoutSeconds": 120,
    "options": { "epochs": 200, "seed": 42 }
  },
  {
    "name": "synthetic-10000-1024-hnsw",
    "rows": 10000,
    "dimensions": 1024,
    "output": "benchmarks/.work/umap/synthetic-10000-1024-hnsw",
    "timeoutSeconds": 120,
    "options": { "search": "hnsw", "epochs": 200 }
  }
]
```

Omit `graph` for the complete pipeline. Omit `input` to generate synthetic
vectors inside DuckDB. The input Parquet schema is `id` (unique, non-null,
stably ordered), `vector` (numeric LIST or ARRAY), plus optional extra columns.
The in-process result `umap_result` retains every input column and adds `umap_x`
and `umap_y`. Existing output columns are rejected. Vectors with identical
values remain distinct rows. Scratch tables use the `umap_` prefix; use a
dedicated connection.

Each job runs in a fresh child process with one DuckDB thread, a 1 GB DuckDB
memory limit, and a 2 GB spill limit. A SQL interrupt enforces the job deadline;
the parent kills the child after an additional five seconds. Failed jobs retain
completed stage timings. The memory limit does not cap all process allocations,
including VSS index memory. Peak RSS is measured with native `getrusage` through
Deno's `node:process` compatibility layer (Deno 2.9.6 uses bytes on macOS and
KiB on Linux). Hard-killed jobs may have no final peak-RSS measurement.

Stage snapshots also record actual buffer usage and spill bytes from
`duckdb_memory()`. Final records include the sparse graph's raw numeric payload
size and the last optimizer batch's materialized gradient-row count. Raw graph
size excludes table overhead, duplicated scratch tables, sampled negative
events, query operators, and VSS allocations.

```sh
/tmp/umap-reference-env/bin/python benchmarks/umap/reference.py evaluate \
  benchmarks/.work/umap/swiss-optimizer \
  --input benchmarks/.work/umap/reference/swiss.parquet
deno test -A test/unit/prototypes/umap.test.ts
```

Quality evaluation is intentionally restricted to small datasets: its exact
pairwise metrics use quadratic memory. The Python script reports cold JIT warmup
separately from warm reference optimizer and full UMAP timings. It writes
quality metrics and a three-panel comparison image.

## Implemented algorithm and deliberate deviations

- Exact top-k neighbors use bounded source batches and streaming top-k heaps.
  Computation remains O(n²d). The approximate path uses an HNSW index and
  requires `HNSW_INDEX_JOIN` in `EXPLAIN`; it refuses a silent full-scan
  fallback. On DuckDB 1.5.5 the `top_n_window_elimination` optimizer is
  temporarily disabled to expose the VSS join pattern, then its previous setting
  is restored. Index construction is included in neighbor timings. Candidate
  distances are recomputed in DOUBLE. Candidate ids and scalar distances are
  materialized before ranking so the ranking window does not retain full vectors
  for each neighbor.
- Neighborhood size includes self, as in reference UMAP. Self is explicitly
  first; ties use stable row ids. When requested neighbors exceed or equal the
  row count, use `n-1`. Fewer than three rows are rejected. Nulls, empty
  vectors, non-finite values, inconsistent dimensions, zero cosine vectors, and
  numerical overflow are rejected. All-identical Euclidean vectors are
  supported. Exact duplicate cosine vectors are assigned distance zero; tiny
  positive roundoff must not replace the first distinct neighbor when computing
  rho.
- Smooth-kNN uses local connectivity 1, bandwidth 1, 64 binary-search
  iterations, tolerance 1e-5, and the reference minimum sigma scale. Membership
  strengths are combined by fuzzy union `a+b-a*b`, retaining a sparse directed
  symmetric graph.
- Layout implements the UMAP attraction and repulsion gradients, componentwise
  clipping, weighted edge schedules, negative sampling, and decaying learning
  rate. **This is an experimental batched UMAP optimizer, not a claim of a
  complete reference-equivalent implementation.** A batch reads one coordinate
  snapshot and sums updates, whereas reference SGD updates coordinates as it
  visits edges and negative samples. `batches` controls the number of
  interleaved edge batches per epoch; no degree normalization or substitute
  graph-layout objective is used.
- Default learning rate is 0.1, versus reference 1.0, to investigate stability
  of batched updates. Reference comparisons retain reference's standard learning
  rate. Default epochs are 200. These are experiment settings, not an API
  design.
- Initialization is seeded uniform random; no spectral eigensolver, PCA,
  transform of new rows, densMAP, supervision, or automatic early stopping is
  implemented. Seeded counter hashes choose initial positions and negative
  samples. Pin DuckDB, thread count, input ids, and options for reproducibility;
  no cross-version or cross-platform bitwise guarantee is made. HNSW uses its
  own index construction; the supplied seed does not control that
  implementation.
- `minDistance` supports 0, 0.1, and 0.5 with spread fixed at 1. Curve
  parameters were calculated offline with reference `find_ab_params`. General
  curve fitting and other UMAP parameters are deferred. Arithmetic uses DOUBLE
  except VSS's required FLOAT vectors; reference UMAP largely uses float32.

UMAP projections are exploratory. Apparent clusters and distances depend on
parameters and can distort original relationships. Preserve original embeddings
for similarity search; projection coordinates are not semantic distances.

## Sources

- [UMAP algorithm](https://umap-learn.readthedocs.io/en/latest/how_umap_works.html)
- [Reference source](https://github.com/lmcinnes/umap), validated against
  0.5.9.post2
- [Reproducibility](https://umap-learn.readthedocs.io/en/latest/reproducibility.html)
- [DuckDB VSS source](https://github.com/duckdb/duckdb-vss)
- [Public movie embeddings](https://huggingface.co/datasets/MongoDB/embedded_movies)

The community extension catalog and `ml` documentation were rechecked on
2026-09-14: no UMAP computation extension was listed. `ml` lists PCA, LDA, and
t-SNE. This prototype does not install or benchmark `ml` or claim those
algorithms are substitutes for UMAP.
