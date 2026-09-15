# Public HDBSCAN benchmark

This harness measures the complete public `hdbscan()` operation: numeric feature
preparation, exact or approximate mutual-reachability graph work, hierarchy
construction, EOM selection, membership and GLOSH calculation, atomic
publication, and scratch cleanup.

```sh
# Small exact and approximate smoke measurements
deno run -A benchmarks/hdbscan/run.ts --quick
# Full 100,000-row bounded sweep
deno run -A benchmarks/hdbscan/run.ts
```

The input table is created before timing. Every full case has 100,000 rows and
covers low-dimensional or 128-dimensional embeddings, Euclidean or cosine
distance, exact or explicitly approximate search, and narrow or wide source
payloads. Wide rows retain a 2,048-character string, DECIMAL, DATE, and STRUCT
during publication.

Each case runs in a separate worker with eight DuckDB threads. The runner reuses
the independently tested `hdbscan-feasibility/run_bounded.py` watchdog, which
polls whole-process RSS, including DuckDB native allocations, every 250
milliseconds and stops a case after ten minutes or above 8 GiB. These are
experiment stopping rules rather than public-method limits. It records a
measurement failure if RSS cannot be read for a live worker and writes each
result immediately. Results default to `benchmarks/.work/hdbscan-results.json`;
pass an absolute `--output=/path/results.json` to retain evidence elsewhere.

Successful workers verify row count and order, output types, finite membership
and GLOSH values, exact wide-payload preservation, and removal of every private
scratch table and index. The report also records cluster/noise counts, elapsed
public-method time, peak sampled RSS, process high-water RSS, hardware, runtime
versions, metric, parameters, and approximation mode.

Approximate mode uses `k=max(minSamples,15)`, up to eight actual-point
representatives per disconnected component, complete anchor Prim for at most 256
components, and an adjacent-anchor chain beyond that. HNSW candidate retrieval
is not guaranteed reproducible; repeated measurements can yield different
approximate graphs and final scores. The exact implementation has quadratic
distance work plus sequential Prim updates and is expected to reach the
100,000-row stopping time; the harness records that result without changing the
public method to approximate mode.
