# HDBSCAN approximation quality

[quality-results.json](quality-results.json) records a moderate, one-thread
DuckDB 1.5.5 comparison against pinned exact Python hdbscan 0.8.44, using
[reproducible fixtures](../../test/data/hdbscan/quality-README.md). It measures
the shared graph and hierarchy pipeline. Its timings are observational and
exclude public input preparation and publication; use [README.md](README.md) for
public method performance and memory measurements.

## Sparse candidate results

Both 512-row cases use 15 neighbors per point (15/511 possible other points),
`minSamples=10`, and `minClusterSize=24`. Both candidate graphs were connected.
Five repeated HNSW runs per case had identical MST, partition, and score hashes
in this one-thread sample. This is not a reproducibility guarantee: the separate
100,000-row, eight-thread [repeats](repeat-results.json) materially changed
cluster and noise counts on all three datasets, including wide Euclidean data.

The following comparisons use native exact output to isolate approximation from
the exact tie convention described below. Cluster identifiers are ignored:
co-membership counts unordered pairs that are clustered together in exactly one
result; noise-mask changes are reported separately. `changedRows` in the JSON's
co-membership object counts rows participating in changed pairs, not an aligned
label disagreement count.

| Dataset                              | Exact / approximate clusters | Exact / approximate noise | Changed co-membership pairs | Membership error max / mean | GLOSH error max / mean  |
| ------------------------------------ | ---------------------------- | ------------------------- | --------------------------- | --------------------------- | ----------------------- |
| Euclidean arcs, densities, noise     | 4 / 4                        | 35 / 35                   | 0 / 130816                  | < 4e-16 / < 4e-16           | < 4e-16 / < 4e-16       |
| Cosine curved arcs, densities, noise | 4 / 4                        | 22 / 17                   | 612 / 130816                | 0.0189622 / 0.0000708094    | 0.0100107 / 0.000107306 |

The cosine comparison changes five noise decisions and pair relations involving
259 rows. Against Python directly, its membership error is the same to rounding,
while GLOSH max/mean error is 0.0658709 / 0.000364614, including the exact tie
baseline. Euclidean approximate-versus-Python differences are also the exact tie
baseline. Full max/mean errors, noise masks, and pair counts against both exact
baselines are retained for every repetition in the JSON.

## Exact tie convention and independent hierarchy check

Native exact versus metric-based Python has these boundary differences:

| Dataset   | Noise-mask changes | Membership error max / mean | GLOSH error max / mean  |
| --------- | ------------------ | --------------------------- | ----------------------- |
| Euclidean | 1                  | 0.0596137 / 0.000116433     | 0.0877216 / 0.000239084 |
| Cosine    | 0                  | < 4e-12 / < 4e-12           | 0.0658709 / 0.000257308 |

The independently generated
[tied-MST reference](../../test/data/hdbscan/quality-tie-reference.json) proves
that feeding the same ordered MST to Python produces exactly the native labels,
memberships, and GLOSH values. Reversing only these equal-weight blocks inside
Python isolates the differences without changing a distance or edge:

- Euclidean `(68,76),(76,385)` at 0.8123776675496557 changes point 76 from noise
  to a cluster, membership 0 to 0.0596137, and GLOSH 0.852665 to 0.940386.
- Euclidean `(56,125),(125,418)` at 0.14216097563224073 changes only point 125's
  GLOSH, 0.0407898 to 0.0754792.
- Cosine `(16,386),(137,409),(409,456)` at 0.0028408033830185087 changes points
  386 and 409's GLOSH, 0.364404 to 0.430275.

These points depart at their cluster's birth density. Binary ordering of tied
merges changes their condensed parent and the maximum density used for scoring.
SDA uses deterministic endpoint ordering rather than copying NumPy's incidental
unstable sort. This is an explicit compatibility choice, not bit-for-bit
agreement with every Python metric-based output. The hierarchy regression tests
check all 512 labels and scores for each shared ordered MST, including reversed
SQL insertion order.

## Controlled connectivity repair consequences

These probes retain native exact core distances and invoke the actual repair
seam with deliberately constructed candidate components. They isolate repair
quality, not how often HNSW would produce those components.

- **Representative miss:** two 10-point connected groups have a true minimum
  cross distance of 0.1 at points excluded by eight evenly spaced
  representatives. Repair chooses 101. Final partition, two noise rows, and
  membership stay the same, but GLOSH max/mean differences against unrestricted
  repair of the same candidate components are 0.00523583 / 0.000261791. Against
  complete native exact they are 0.00524584 / 0.000262792.
- **More than 256 components:** 257 singleton components on two separated tracks
  force the first-coordinate anchor chain to alternate between tracks. Repaired
  output has 16 clusters and seven noise points versus exact two clusters and no
  noise. It changes 16503/32896 co-membership pairs; membership max/mean error
  is 1 / 0.0272389 and GLOSH max/mean error is 0.342702 / 0.00531793. This
  singleton input cannot arise from a complete 15-candidate-per-point graph: its
  components contain at least 16 points, so more than 256 components requires at
  least 4112 points. The small seam probe demonstrates fallback consequences,
  not a claim about their frequency in the default graph.

The repair guarantees connectivity with actual finite point-to-point weights. It
provides no bound on full-graph MST, partition, membership, or GLOSH error.
These measurements support an explicitly provisional opt-in approximation;
quality and repeatability depend on the data, graph construction, and threading.
