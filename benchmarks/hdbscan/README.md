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

## Recorded results (2026-09-15)

Apple M4 Max, 16 logical CPUs, 64 GiB RAM; eight DuckDB threads, Deno 2.9.6,
DuckDB 1.5.5. Every case uses `minClusterSize: 25`, `minSamples: 15`, and the
other documented defaults. [Full results](results.json) retain the settings,
monitoring sample counts, and verification outputs.

| Mode and input                    | Public method | Process elapsed |   Peak RSS | Status       |
| --------------------------------- | ------------: | --------------: | ---------: | ------------ |
| Approximate, 4d euclidean, narrow |       1.982 s |         2.349 s |  505.5 MiB | completed    |
| Approximate, 128d cosine, narrow  |       8.721 s |        11.260 s | 1287.8 MiB | completed    |
| Approximate, 128d euclidean, wide |       7.843 s |        10.470 s | 2373.0 MiB | completed    |
| Exact, 4d euclidean, narrow       |    Incomplete |       600.015 s |  279.2 MiB | time-limited |

All completed cases preserved every row and source payload, produced finite
scores, and left no scratch objects. The exact run stopped at 600 seconds with
2,300 valid RSS samples; no clustering result was produced. Its peak is sampled
RSS, while completed runs additionally report process high-water RSS. These are
dataset-specific observations, not runtime guarantees.

## Repeated approximate runs

[Repeat results](repeat-results.json) retain the full reviewed-watchdog outputs
for a second invocation of each approximate case. Same ordered data and settings
can produce materially different partitions; HNSW index construction/search has
no reproducibility guarantee. Cluster counts and noise counts below demonstrate
variability, but cannot quantify point-by-point agreement at 100,000 rows
because the exact run did not finish.

| Input                | First clusters / noise | Repeat clusters / noise |
| -------------------- | ---------------------: | ----------------------: |
| 4d euclidean, narrow |              52 / 3089 |               58 / 4085 |
| 128d cosine, narrow  |            420 / 22405 |             351 / 20184 |
| 128d euclidean, wide |                  8 / 0 |                44 / 753 |

Reproduce a repeat by invoking the command array recorded in its JSON result,
through `python3 benchmarks/hdbscan-feasibility/run_bounded.py -- <command...>`
from the repository root. The watchdog defaults remain 600 seconds and 8 GiB.
Smaller reference comparisons and forced-repair consequences are documented
separately in [the quality report](qualityREADME.md).
