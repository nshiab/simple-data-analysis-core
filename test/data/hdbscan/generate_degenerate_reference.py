"""Tiny pinned exact reference probes; stdout is strict JSON with nonfinite strings."""
import hdbscan
import numpy as np
import json
import math
import importlib.metadata
import platform
import warnings
from pathlib import Path
from hdbscan._hdbscan_tree import outlier_scores
from sklearn.metrics import pairwise_distances

warnings.filterwarnings("ignore")
EXPECTED_PACKAGES = dict(line.strip().split("==") for line in
    Path(__file__).with_name("requirements.txt").read_text().splitlines() if line.strip())
PACKAGES = {name: importlib.metadata.version(name) for name in EXPECTED_PACKAGES}
if PACKAGES != EXPECTED_PACKAGES:
    raise RuntimeError(f"Install the pinned requirements before generating fixtures: {PACKAGES}")

def encode(value):
    if isinstance(value, np.ndarray):
        return encode(value.tolist())
    if isinstance(value, (list, tuple)):
        return [encode(item) for item in value]
    if isinstance(value, dict):
        return {key: encode(item) for key, item in value.items()}
    if isinstance(value, float) and not math.isfinite(value):
        return "NaN" if math.isnan(value) else "Infinity" if value > 0 else "-Infinity"
    return value

settings = dict(min_cluster_size=3, min_samples=1, metric="euclidean", algorithm="generic",
                alpha=1.0, approx_min_span_tree=False, gen_min_span_tree=True,
                cluster_selection_method="eom", cluster_selection_epsilon=0.0,
                cluster_selection_persistence=0.0,
                max_cluster_size=0, cluster_selection_epsilon_max=float("inf"),
                match_reference_implementation=False)
cases = []
decimal_boundary_cases = []
for epsilon in [0.0, 2.0**-7, 2.0**-14, 2.0**-20, .01, .0001, .000001]:
    for allow in [True, False] if epsilon == 0 else [True]:
        vectors = [[0.0], [epsilon], [2*epsilon], [3*epsilon], [1.0], [10.0]]
        model = hdbscan.HDBSCAN(**settings, allow_single_cluster=allow).fit(np.array(vectors))
        result = dict(epsilon=epsilon, vectors=vectors, allowSingleCluster=allow,
                      labels=model.labels_.tolist(), probabilities=model.probabilities_.tolist(),
                      referenceGlosh=model.outlier_scores_.tolist(),
                      condensedTree=model.condensed_tree_.to_numpy().tolist())
        if epsilon == 0:
            result["proposedFiniteGlosh"] = [0, 0, 0, 0, 1, 1]
            result["deviation"] = "Finite point lambda / infinite reference descendant maximum: score 1; infinite point lambda: score 0. Preserve all finite 0.8.44 scores and its corrected reverse-tree propagation."
        if epsilon in [.01, .0001, .000001]:
            result["comparisonNote"] = "Decimal near-tie label/membership evidence only: sklearn Gram arithmetic and native difference distances can straddle the exact root threshold. Do not demand identical root labels; finite GLOSH comparisons remain useful."
            decimal_boundary_cases.append(result)
        else:
            result["perturbationKind"] = "duplicates" if epsilon == 0 else "dyadic"
            cases.append(result)
tree_rows = [(6,7,1.,3),(6,8,1.,3),(7,0,2.,1),(7,9,2.,2),
             (8,3,3.,1),(8,4,3.,1),(8,5,3.,1),(9,1,10.,1),(9,2,10.,1)]
tree = np.array(tree_rows, dtype=[("parent",np.intp),("child",np.intp),
                                 ("lambda_val",float),("child_size",np.intp)])
large_offset_vectors = [[1e12, 1e12], [1e12 + 1, 1e12]]
distance_evidence = dict(
    vectors=large_offset_vectors,
    stableDifferenceDistance=math.dist(*large_offset_vectors),
    sklearnPairwiseDistance=float(pairwise_distances(large_offset_vectors, metric="euclidean")[0, 1]),
    explanation="Use ordinary distance from coordinate differences. Squared-norm/dot subtraction can cancel a nonzero large-offset separation to zero. Native DuckDB array_distance was independently checked to return 1 for this pair.",
)
print(json.dumps(encode(dict(
    generator="test/data/hdbscan/generate_degenerate_reference.py", python=platform.python_version(),
    packages=PACKAGES,
    settings=settings, fixedTraversalProbe=dict(condensedTree=tree_rows, referenceGlosh=outlier_scores(tree).tolist()), nonfiniteEncoding="Explicit strings, never bare nonstandard JSON NaN/Infinity", cases=cases, decimalBoundaryCases=decimal_boundary_cases, largeOffsetDistanceEvidence=distance_evidence,
)), indent=2, allow_nan=False))
