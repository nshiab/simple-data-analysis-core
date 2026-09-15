# HDBSCAN graph feasibility

This benchmark supports the internal architecture decision in issue #191. It
measures vector-neighbor retrieval and the small exact mutual-reachability MST
baseline. It is not a throughput promise for the future public `hdbscan()`
method; that method still needs an end-to-end benchmark covering hierarchy,
cluster selection, scores, and result publication.

## Provisional module split

`buildVectorNeighbors()` is the shared seam. It materializes stable
`(source, target, rank, distance)` rows from prepared `DOUBLE[d]` vectors. A
caller explicitly chooses exact or HNSW search and whether self occupies rank 0.
UMAP uses self-inclusive neighborhoods. HDBSCAN uses `minSamples` other points.
Exact ties sort by target id. HNSW candidates are reranked by DOUBLE distance
and target id, but candidate retrieval itself has no reproducibility guarantee.

UMAP fuzzy graph construction remains in `buildUmapGraph()`. HDBSCAN core
distance, mutual reachability, spanning tree, hierarchy, and cluster selection
remain HDBSCAN concerns. There is no shared graph abstraction.

`buildExactMutualReachabilityMst()` is the HDBSCAN correctness baseline. It
computes exact core distances with bounded 32-source top-k aggregates, retaining
one scalar per point even when `minSamples` is large. It then runs Prim's
algorithm over the implicit complete mutual-reachability graph. Source vectors
and all bulk distance work remain in DuckDB. Stored algorithm state is O(n),
distance work is O(n²d), and the implementation issues O(n) sequential frontier
updates. Its purpose is correctness and small exact inputs; the measurements
below determine whether it is practical at larger sizes.

`inspectGraphConnectivity()` streams only edge ids into a union-find. An
approximate HDBSCAN implementation can use it to reject a disconnected HNSW
candidate graph. A connected candidate graph is necessary but does not prove
that it contains the exact mutual-reachability MST.

## Scalable strategy under evaluation

The proposed opt-in approximate strategy is:

1. Retrieve at least `minSamples` HNSW candidates per point.
2. Recompute candidate distances in DOUBLE and rank by `(distance, target)`.
3. Derive approximate core distances from the requested other-point rank.
4. Symmetrize candidate edges and calculate mutual-reachability weights in
   DuckDB.
5. Check connectivity before spanning-tree construction. If disconnected, retry
   with a larger, documented candidate-count bound whose O(nk) cost is explicit.
   This bound is an algorithm choice, not the benchmark's 8 GiB stopping rule.
   Fixed-k graphs can naturally remain disconnected when dense, well-separated
   groups contain more than k rows, so disconnection by itself is not a reason
   to reject the dataset.
6. For components that remain separate, calculate component centroids in DuckDB,
   build a small centroid MST, and bridge each selected component pair using
   actual rows. Select a bounded deterministic set of rows closest to the other
   component's centroid on each side, evaluate all cross-sample distances and
   mutual-reachability weights in DuckDB, and add the cheapest actual edge. Keep
   vectors in DuckDB and cap both representatives per component and total bridge
   work by deterministic candidate counts. If the component count or required
   state exceeds those bounds, fail with an actionable error rather than
   creating infinity-weight links.
7. Build the connected candidate MST and continue hierarchy construction.

This costs O(nkd) candidate reranking, O(nk) edge state, and approximately O(nd)
HNSW index storage, with constants controlled by DuckDB VSS. With c components
and at most r representatives per side, bridging stores O(cd + cr) summaries and
evaluates O(c r² d) distances after the centroid MST chooses c-1 component
pairs. It is approximate even when connected: HNSW can miss the true
`minSamples`-th neighbor, changing core distances; the candidate graph can omit
a cheaper MST edge; and representative bridges can be heavier than the true
cross-component edge. It must remain behind `approximate: true`; row count must
never activate it implicitly. Issue #192 must measure how these errors affect
partitions, noise, membership strength, and GLOSH before the mode can ship.

Exact alternatives considered were a materialized complete graph, a SQL-scan
Prim implementation, and Boruvka-style component scans. A complete graph has
O(n²) edge storage (about five billion undirected edges at 100,000 rows) and is
not viable. Prim has O(n) state and one complete set of pair distances overall,
but O(n) sequential queries. Boruvka reduces orchestration rounds but can rescan
the complete pair space in every round, increasing worst-case distance work to
O(n²d log n). DuckDB's HNSW index does not provide an exact-search guarantee. An
exact spatial-tree implementation would need metric-specific machinery and, if
implemented in TypeScript, would violate the decision to retain vectors in
DuckDB. The SQL-scan Prim baseline is therefore the provisional exact strategy;
its measured limits must be documented rather than silently changing modes. The
600-second and 8 GiB thresholds below are experiment stopping rules only; they
must not become hard-coded library limits.

## Reproduction

The worker generates deterministic vectors in DuckDB and creates a full payload
snapshot before selecting a vector-only working relation. `wide` payloads add a
2,048-character text value and a geometry to each row, exercising the current
UMAP snapshot behavior. Eight DuckDB threads are used.

Each 100,000-row case is launched through `run_bounded.py`. The wrapper polls
the Deno process RSS, which includes in-process DuckDB native allocations, and
terminates a case at 600 elapsed seconds or 8 GiB RSS. Only one large case runs
at a time.

```sh
python3 benchmarks/hdbscan-feasibility/run_bounded.py \
  --timeout-seconds 600 --max-rss-bytes 8589934592 -- \
  deno run -A benchmarks/hdbscan-feasibility/worker.ts \
  --rows 100000 --dimensions 4 --neighbors 15 --metric euclidean \
  --search hnsw --operation neighbors --payload narrow
```

Reference fixtures live in `test/data/hdbscan/reference.json`. They were
generated by `generate_reference.py` with Python hdbscan 0.8.40, NumPy 2.2.6,
SciPy 1.16.1, and scikit-learn 1.7.1. The reference forces the generic complete
distance path and `approx_min_span_tree=False`. Unit tests compare exact core
distances and the sorted MST weight multiset for Euclidean and cosine cases with
duplicates, ties, different densities, and noise.

## Results

Runs used a 16-core Apple M4 Max MacBook Pro with 64 GiB memory, macOS 26.6.2,
Deno 2.9.6, DuckDB 1.5.5, and eight DuckDB threads. Exact values and component
sizes are in `results-2026-09-15.json`.

|    Rows | Dimensions | Metric    | Search / payload   | Status       |  Elapsed | Peak RSS | Candidate components |
| ------: | ---------: | --------- | ------------------ | ------------ | -------: | -------: | -------------------: |
| 100,000 |          4 | Euclidean | HNSW / narrow      | completed    |   2.05 s | 0.15 GiB |                   19 |
| 100,000 |        128 | cosine    | HNSW / narrow      | completed    |   6.69 s | 4.46 GiB |                   14 |
| 100,000 |        128 | Euclidean | HNSW / wide        | completed    |   5.40 s | 4.91 GiB |                    7 |
| 100,000 |          4 | Euclidean | exact MST / narrow | time-limited | 600.10 s | 0.28 GiB |                  n/a |

The exact 100,000-row baseline did not complete within ten minutes. It stayed
well below the memory bound, confirming the intended linear stored state, but
the O(n²d) work and sequential frontier updates are not a practical 100,000-row
strategy. The architectural decision is to retain it as the exact baseline and
default semantic path, with its cost documented; no row-count threshold may
silently switch to HNSW. A faster exact implementation would require new
metric-specific indexing machinery or different evidence.

All three 100,000-row HNSW runs completed, but all three candidate graphs were
disconnected. This occurred even though the deterministic synthetic curve has no
missing values, confirming that connectivity repair is normal algorithm work
rather than input validation. Increasing k raises O(nk) edge state and may push
the 128-dimensional cases past the 8 GiB bound: k=15 already reached 4.46 GiB
narrow and 4.91 GiB with a wide snapshot. Bounded widening is useful for small
gaps, but deterministic representative-component bridges are the provisional
scalable policy after the memory budget is reached.

At 2,000 rows, 15-neighbor HNSW recall against exact search was 1.0 for
4-dimensional Euclidean data and 0.9946 for 32-dimensional cosine data. Three
repeated cosine runs produced the same edge hash in this environment. This is
observed repeatability, not a guarantee from DuckDB VSS.

Cluster partition, noise, membership strength, and GLOSH comparisons require the
hierarchy and score implementation in issue #192. The fixture already pins
reference labels and scores so that issue can measure representative-bridge
effects before approximate mode ships.
