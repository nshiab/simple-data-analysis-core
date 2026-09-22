# HDBSCAN approximation improvements

These measurements evaluate the approximation changes against baseline commit
`c33943aacd25564033a24ced2061de7cf73174a5`, on 2026-09-22. The historical
[quality results](quality-results.json), [public results](results.json), and
[repeat results](repeat-results.json) are unchanged. New result files record
source hashes; this report does not reinterpret the historical measurements as
results from the new implementation.

## Implementation and rationale

Approximate HDBSCAN now retains `k=min(n-1,max(minSamples,64))` neighbors,
retrieves up to `min(n,2*k+1)` candidates, and reranks them in DOUBLE. HNSW uses
`ef_construction=256`, `ef_search=max(512,2*k)`, and `M=32`. Index construction
uses vertex order and one DuckDB thread, restoring the previous thread setting
in `finally`; query execution can use the caller's threads. UMAP continues to
use its existing neighbor budgets, metric, and construction settings.

Cosine retrieval searches L2 distances between unit vectors normalized in DOUBLE
before casting to FLOAT. This preserves cosine's mathematical neighbor ordering
while avoiding FLOAT dot-product cancellation for near-collinear candidates.
Final core and edge distances still use the shared DOUBLE cosine implementation,
including the accepted numerical fixes. The source vectors and public metric are
unchanged. FLOAT rounding and approximate retrieval still introduce error.

Disconnected components now receive candidate bridges from every point.
Deterministic sweeps use up to eight coordinate directions and sixteen fixed
pseudo-random directions (one coordinate sweep for one-dimensional data). In
each projected order, every vertex links to the nearest projected endpoint of
both adjacent component runs. Adjacent runs form a connected backbone; taking
all sweeps together offers alternative cross-component edges. Actual DOUBLE
mutual-reachability weights and endpoint-ordered Kruskal select the final tree.
This removes the eight-representative omission and the special behavior at 256
components. Projection sweeps cost bounded `O(p*n)` candidates and
`O(p*n*log(n)+p*n*d)` work, with `p<=24`; they do not materialize all row pairs.
They guarantee connectivity, not optimal full-graph bridge weights.

The sparse Kruskal implementation was extracted unchanged into its own internal
helper so both the production path and repair-quality harness consume the same
candidate graph. Exact mode, public parameters, deterministic endpoint ties, and
the duplicate-heavy finite GLOSH convention are unchanged.

## Fast regression signals

[New quality results](approximation-quality-results.json) compare against native
exact output, independently of cluster label numbering. Each ordinary fixture
was repeated five times.

| Probe                                                 | Before                                                                  | After                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| 512-row Euclidean arcs                                | Correct partition/noise; score errors below 4e-16                       | Same                                                   |
| 512-row cosine arcs                                   | 612 changed co-membership pairs; five noise changes                     | No pair or noise changes; score errors below 3e-16     |
| 257 singleton components on two tracks                | 16 clusters, seven noise; 16,503 changed pairs                          | Exact two clusters, no noise; score errors below 2e-16 |
| Boundary vertices excluded by representative sampling | Selected bridge 101 despite a 0.1 cross edge; GLOSH error up to 0.00525 | Includes the 0.1 bridge; exact partition and scores    |

Both ordinary fixtures now have exact core distances and total MST weights. The
two forced-component probes isolate repair behavior; they are not claims about
how frequently HNSW produces those components. Regression tests exercise these
same seams, retain all fixtures, and also compare repeated output arrays. The
close-angular-neighbor regression checks all neighbors against DOUBLE exact
search and verifies thread restoration after an injected index-build failure.

## Moderate subsets of the 100,000-row datasets

The quality harness samples 2,048 evenly spaced source IDs from each benchmark
formula, retaining `minSamples=15`, `minClusterSize=25`, and
`allowSingleCluster=true`. Native exact is feasible at this size. All three
subsets have identical partitions and noise masks before and after; the
improvement here is in membership and GLOSH accuracy. Five new runs per subset
have identical partition and score hashes.

| Subset         | Membership error before max / mean | Membership error after max / mean | GLOSH error after max / mean |
| -------------- | ---------------------------------- | --------------------------------- | ---------------------------- |
| 4d Euclidean   | < 3e-16 / < 3e-16                  | < 3e-16 / < 3e-16                 | < 3e-16 / < 3e-16            |
| 128d cosine    | 0.0367757 / 0.00745835             | 0.0328885 / 0.00422529            | 0.0328885 / 0.00422529       |
| 128d Euclidean | 0.0123126 / 0.00153688             | 0.00631214 / 0.000611092          | 0.00631214 / 0.000611092     |

[Baseline subset measurements](approximation-subset-baseline-results.json) use
copies of the two original helpers read from the baseline commit, without
changing the checkout.
[New subset measurements](approximation-subset-results.json) include
core-distance errors and total MST weights. For example, the new cosine MST
weighs 1.30499637 versus exact 1.30132607; its maximum core-distance error is
4.66e-7. The 4d subset's score agreement does not imply an exact MST: its bridge
weights still make the total 17.43819867 versus exact 17.43644612.

[Candidate ablations](candidate-quality-results.json) change one search setting
at a time on the 2,048-row, 128d cosine SQL-generated subset. Recall of the
exact 15-neighbor sets was 68.87% with original settings, 68.87% with only
serialized construction, 73.53% with only unit-L2 retrieval, 71.48% with only
increased search effort, and 70.16% with only wider reranking. Combining the new
settings reached 87.42%. Each case repeats three times. Serialization alone is
therefore not an accuracy fix; the remaining 12.58% missing neighbors also
demonstrate that the improved search is still approximate.

## Bounded public measurements and repeatability

[New public measurements](approximation-performance-results.json) retain all
attempts, including two process-exit RSS sampling failures, and separate
completed cosine reruns. Hardware and software are recorded in the JSON: Apple
M4 Max, 16 logical CPUs, 64 GiB RAM, Deno 2.9.6, DuckDB 1.5.5. Each public
worker requests eight threads; only index construction temporarily uses one.
Each worker is stopped at 600 seconds or 8 GiB process RSS. RSS includes native
DuckDB allocations; reported completed peaks take the larger sampled RSS and
process high-water RSS.

| Input                      | Original public time | New completed public times | New peak RSS    | Repeated clusters / noise |
| -------------------------- | -------------------- | -------------------------- | --------------- | ------------------------- |
| 100k, 4d Euclidean, narrow | 1.982 s              | 11.91 / 12.05 s            | 1.55 / 1.50 GiB | 66 / 6110 in both         |
| 100k, 128d cosine, narrow  | 8.721 s              | 63.46 / 63.77 s            | 1.87 / 1.98 GiB | 12 / 264 in both          |
| 100k, 128d Euclidean, wide | 7.843 s              | 47.61 / 49.40 s            | 2.67 / 2.60 GiB | 8 / 0 in both             |

For each input, the completed repetitions have identical SHA-256 hashes for
canonical partitions, noise masks, memberships, and GLOSH scores. Canonical
cluster IDs use the first source-row ID, so label renumbering cannot conceal a
partition change. Every completed run preserved source rows/order/types and wide
payloads, produced finite scores, and removed scratch objects. Moderate quality
checks also ran during parts of the timing sweep, so these elapsed measurements
should be treated as observations rather than isolated timing estimates.

The old 100k repeated cluster/noise counts varied on all three inputs. New
counts differ from the old counts, but that is not evidence of exact 100k
correctness: the native exact 100k baseline timed out at 600 seconds, and was
not rerun here. Eight generating groups are not a clustering oracle; density
substructure may legitimately split. These measurements support better
repeatability on the tested runtime, not a cross-version or cross-platform
bitwise reproducibility guarantee.

## Reproduction and remaining limits

```sh
deno run -A benchmarks/hdbscan/quality.ts --summary > benchmarks/.work/approximation-quality.json
deno run -A benchmarks/hdbscan/quality.ts --benchmark-subsets --summary > benchmarks/.work/approximation-subsets.json
deno run -A benchmarks/hdbscan/candidate-quality.ts > benchmarks/.work/candidate-quality.json
deno run -A benchmarks/hdbscan/run.ts --approximate-only --repeat=2
```

This is a defensible improvement for the explicit approximation option, with a
higher time/memory cost. It does not establish an error bound, correct every
missed neighbor or bridge, or replace the exact default. The remaining moderate
score errors and lack of a completed 100k exact baseline must remain visible
when evaluating whether approximation suits a dataset.

## Validation

`deno task all-tests` passed with 2,168 tests and no failures, including
formatting, lint, type checks, documentation lint, publish dry-run, Node and Bun
package smoke tests, and `npm pack`.
