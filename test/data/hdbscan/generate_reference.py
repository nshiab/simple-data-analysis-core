"""Generate exact HDBSCAN fixtures with a fully pinned Python environment.

Run from the repository root with the versions in requirements.txt, then review
and copy stdout to reference.json. The generic algorithm constructs the complete
distance matrix and `approx_min_span_tree=False` disables its approximation.
"""

import importlib.metadata
import json
import platform

import hdbscan
import numpy as np
import scipy
import sklearn
from sklearn.metrics import pairwise_distances


CASES = [
    {
        "name": "euclidean-duplicates-densities-noise",
        "metric": "euclidean",
        "minClusterSize": 3,
        "minSamples": 2,
        "vectors": [
            [0.0, 0.0],
            [0.0, 0.0],
            [0.2, 0.0],
            [0.0, 0.3],
            [5.0, 5.0],
            [5.1, 5.0],
            [5.0, 5.3],
            [10.0, -3.0],
        ],
    },
    {
        "name": "cosine-duplicates-ties-noise",
        "metric": "cosine",
        "minClusterSize": 3,
        "minSamples": 2,
        "vectors": [
            [1.0, 0.0],
            [1.0, 0.0],
            [0.98, 0.2],
            [0.9, -0.3],
            [-1.0, 0.0],
            [-0.98, 0.2],
            [-0.9, -0.3],
            [0.0, 1.0],
        ],
    },
]


def clean(value):
    if isinstance(value, np.ndarray):
        return clean(value.tolist())
    if isinstance(value, list):
        return [clean(item) for item in value]
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return float(value)
    return value


def generate(case):
    vectors = np.asarray(case["vectors"], dtype=np.float64)
    model = hdbscan.HDBSCAN(
        min_cluster_size=case["minClusterSize"],
        min_samples=case["minSamples"],
        metric=case["metric"],
        algorithm="generic",
        approx_min_span_tree=False,
        gen_min_span_tree=True,
        cluster_selection_method="eom",
        allow_single_cluster=True,
    ).fit(vectors)
    distances = pairwise_distances(vectors, metric=case["metric"])
    # The zero self-distance is rank 0, so index minSamples is the requested
    # minSamples-th other point. This matches hdbscan 0.8.40 reachability code.
    core_distances = np.partition(
        distances, case["minSamples"], axis=1
    )[:, case["minSamples"]]
    return {
        **case,
        "coreDistances": clean(core_distances),
        "mst": clean(model.minimum_spanning_tree_.to_numpy()),
        "labels": clean(model.labels_),
        "probabilities": clean(model.probabilities_),
        "outlierScores": clean(model.outlier_scores_),
    }


result = {
    "generator": "test/data/hdbscan/generate_reference.py",
    "python": platform.python_version(),
    "packages": {
        "hdbscan": importlib.metadata.version("hdbscan"),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "scikit-learn": sklearn.__version__,
    },
    "referenceSettings": {
        "algorithm": "generic",
        "approx_min_span_tree": False,
        "gen_min_span_tree": True,
        "cluster_selection_method": "eom",
        "allow_single_cluster": True,
    },
    "cases": [generate(case) for case in CASES],
}
print(json.dumps(result, indent=2, sort_keys=True))
