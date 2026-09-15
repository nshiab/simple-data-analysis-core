# Exact HDBSCAN reference fixtures

The current reference is **Python hdbscan 0.8.44** with Python 3.13.7 and all
packages pinned in `requirements.txt`. Both generators check the installed
versions before producing output. No Python package is a runtime dependency of
SDA.

## Reproduction

Create an isolated environment with Python 3.13.7, install `requirements.txt`,
then run from the repository root:

```sh
python test/data/hdbscan/generate_reference.py > reference.json
python test/data/hdbscan/generate_degenerate_reference.py > degenerate-reference.json
```

Review these generated files before replacing the files in this directory. Both
generators force the generic complete-distance computation,
`approx_min_span_tree=False`, `alpha=1`, EOM, zero epsilon and persistence
thresholds, no maximum cluster size, and `match_reference_implementation=False`.
The ordinary fixtures use `allow_single_cluster=True`; the degenerate fixtures
also exercise `False`. Each case records its metric, input vectors,
`min_cluster_size`, and `min_samples` either directly or through the recorded
shared settings.

`min_samples` excludes self: the reference's full distance row includes zero
self at rank 0, so rank `min_samples` is the requested other-point neighbor. SDA
intentionally validates small-input parameters instead of copying Python's
clamping behavior. Metric distances and output scores use doubles.

## Why the reference changed from 0.8.40

[Release 0.8.44](https://pypi.org/project/hdbscan/0.8.44/) fixes propagation of
maximum lambda values through the condensed tree for GLOSH. Version 0.8.40's
ascending-parent traversal stopped at its first point edge, which could miss
deeper maxima and alter finite scores. Version 0.8.44 traverses condensed edges
in reverse. The reference issue requires a pinned package version; the earlier
choice of 0.8.40 was not a fixed public contract.

Regenerating the two original fixtures changed:

- Euclidean fixture: point 7's GLOSH score changed from `0.2726066238990723` to
  `0.9788000423998728`.
- Cosine fixture: the final displayed MST edge changed from `(4,6)` to `(5,6)`
  with the same weight `0.13370916195911964`, an equal-weight edge choice.
- Both fixtures retained exactly the same core distances, cluster labels, noise
  classification, membership strengths, and sorted MST weight multisets. All
  other GLOSH scores were unchanged.

`degenerate-reference.json` includes a small condensed-tree probe whose point 0
GLOSH score is `0.8` with the corrected traversal; the earlier reference
returned `0`. Historical feasibility benchmarks were actually recorded with
0.8.40 and have not been relabeled as 0.8.44 runs.

Source provenance: the official PyPI `hdbscan-0.8.44.tar.gz` SHA-256 is
`1ac6196fabdd42072284b60c9be7b9b504b5f4f25cf7a551a8af29a3c7963a4d`. Its
`hdbscan/_hdbscan_tree.pyx` SHA-256 is
`bae7a230325c585de78f1e86bace6b0d541d39321e26de3e4457d89566121316`. The
reference source uses the BSD 3-Clause license.

## Duplicate-heavy GLOSH and the explicit finite-limit proposal

The newer package still returns NaN GLOSH values when a point leaves at a finite
lambda but its condensed parent's descendant maximum lambda is infinite. This
occurs for valid input: four copies of `[0]` plus `[1]` and `[10]`, Euclidean,
`min_cluster_size=3`, `min_samples=1`.

The separate degenerate fixture retains the package output as the **string
`"NaN"`**, and records the proposed finite outputs separately. Likewise,
infinite internal lambda values are strings. Both generators use strict JSON
serialization; these strings are deliberate evidence markers, not null values or
ordinary numeric expectations.

The proposed SDA behavior, to be explicitly disclosed for maintainer review, is
score `1` for finite point lambda under an infinite maximum, and score `0` for
infinite point lambda. The first is the finite limit of `1-lambda/max`; the
second follows the package's explicit infinite-point rule. The fixture includes
small finite perturbations converging to `1` for the two tail points. This is an
explicit reference deviation limited to undefined infinity arithmetic. All
finite 0.8.44 scores and its corrected reverse-tree maximum propagation must
still match. Do not replace every infinite internal lambda with an arbitrary
large number, reject valid duplicate-heavy inputs, or silently turn Python NaN
into JSON null.
