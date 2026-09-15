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
approximate HDBSCAN implementation can use it to detect a disconnected HNSW
candidate graph before repairing its connectivity. A connected candidate graph
is necessary but does not prove that it contains the exact mutual-reachability
MST.

## Scalable strategy under evaluation

The proposed opt-in approximate strategy is:

1. Retrieve at least `minSamples` HNSW candidates per point.
2. Recompute candidate distances in DOUBLE and rank by `(distance, target)`.
3. Derive approximate core distances from the requested other-point rank.
4. Symmetrize candidate edges and calculate mutual-reachability weights in
   DuckDB.
5. Check connectivity before spanning-tree construction. Start with
   `k = min(n-1, max(minSamples, 15))`. A single optional widening to
   `min(n-1, 2*k)` is a tuning candidate for #192, not an established benefit;
   release the previous search index and candidate scratch before rebuilding.
   Always derive core distances from rank `minSamples-1`, even when k is larger.
6. Repair remaining components with actual-point representatives. A concrete
   bounded prototype policy for #192 is at most r=8 representatives per
   component, chosen at evenly spaced ranks in vertex-id order (including its
   smallest vertex id, the anchor). Keep representative vectors in DuckDB. For
   c<=256 components, run Prim on the complete graph of actual anchor points to
   choose c-1 component pairs. For larger c, order anchors by their first
   feature and then vertex id and pair adjacent components in a chain. This
   fallback needs no all-component distance matrix and always connects the
   components. It is deliberately approximate and can create poor links when the
   first coordinate does not reflect separation.
7. For each selected component pair, compute the at most r² actual point
   distances and mutual-reachability weights in DuckDB. Add the lightest edge,
   breaking ties by `(min(source,target),max(source,target))`. Validate every
   computed distance as finite; never insert infinity links. Anchors and
   representatives are actual input rows, so cosine never encounters a new
   zero-vector centroid when each input vector is valid. Recheck connectivity,
   then build the connected candidate MST and continue hierarchy construction.

The constants 15, 8, and 256 above make a concrete **provisional prototype**,
not a validated final search policy or a public limit. #192 must measure and
adjust them against clustering quality and end-to-end resource use. An input
whose components exceed 256 still uses the linear chain fallback.

This costs O(nkd) candidate reranking and O(nk) edge state. HNSW additionally
stores FLOAT vectors and index links: O(nd+nM) state with DuckDB-controlled
constants. Representatives retain at most min(n, cr) row ids, with vectors in
DuckDB. The component-pair plan uses O(c) algorithm state and O(c²d) distance
work only when c<=256; beyond that it uses an O(c log c) ordering. Evaluating
selected bridges costs O(c r² d), with O(c) final bridge edges. Selecting
representatives requires scanning/grouping the n component memberships and
sorting by vertex id; it does not compute distances from every point to every
component. Small-component anchor Prim can also evaluate distances in DuckDB
without transferring vectors to JavaScript.

This remains approximate even when connected: HNSW can miss the true
`minSamples`-th neighbor, changing core distances; the candidate graph can omit
a cheaper MST edge; anchor-based component pairing or its chain fallback can
miss the best component pairs; and representative bridges can be heavier than
the true cross-component edge. It must remain behind `approximate: true`; row
count must never activate it implicitly. No bridge implementation or final
approximate-clustering quality claim is delivered by #191. Issue #192 must
compare partitions independent of label numbering, noise, membership strength,
and GLOSH before approximate mode ships, including adversarial cases where
representative bridges miss the exact cross-component minimum and where cosine
component centroids cancel to zero.

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
terminates a case at 600 elapsed seconds or an observed 8 GiB RSS. Sampling
occurs every 0.25 seconds and can miss short-lived memory peaks. The reviewed
wrapper stops with `measurement-failed` if RSS cannot be read for a live worker;
it never silently disables the memory stop rule. Only one large case runs at a
time.

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
sizes are in `results-2026-09-15.json`. These historical runs used the source
snapshot captured in commit `5c1936f`, before the review fixes. The original
wrapper silently ignored RSS sampling failures and did not record sample counts
or errors. Its recorded peaks are observed samples, not exact peaks; continuous
enforcement of the RSS stopping rule cannot be verified retrospectively. The
corrected wrapper and helper validation have not been rerun at 100,000 rows.
Treat these measurements as provisional feasibility evidence, not certified
resource bounds or timings for the reviewed version.

|    Rows | Dimensions | Metric    | Search / payload   | Status       |  Elapsed | Peak RSS | Candidate components |
| ------: | ---------: | --------- | ------------------ | ------------ | -------: | -------: | -------------------: |
| 100,000 |          4 | Euclidean | HNSW / narrow      | completed    |   2.05 s | 0.15 GiB |                   19 |
| 100,000 |        128 | cosine    | HNSW / narrow      | completed    |   6.69 s | 4.46 GiB |                   14 |
| 100,000 |        128 | Euclidean | HNSW / wide        | completed    |   5.40 s | 4.91 GiB |                    7 |
| 100,000 |          4 | Euclidean | exact MST / narrow | time-limited | 600.10 s | 0.28 GiB |                  n/a |

The exact 100,000-row baseline did not complete within ten minutes. It stayed at
a low observed RSS, consistent with the intended linear stored state, but the
O(n²d) work and sequential frontier updates are not a practical 100,000-row
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
scalable policy after the single candidate-widening attempt, if that attempt is
retained. This policy has bounded candidate counts and does not use benchmark
stopping rules as library limits.

At 2,000 rows, 15-neighbor HNSW recall against exact search was 1.0 for
4-dimensional Euclidean data and 0.9946 for 32-dimensional cosine data. Three
repeated cosine runs produced the same edge hash in this environment. This is
observed repeatability, not a guarantee from DuckDB VSS.

Cluster partition, noise, membership strength, and GLOSH comparisons require the
hierarchy and score implementation in issue #192. The fixture already pins
reference labels and scores so that issue can measure representative-bridge
effects before approximate mode ships.
