"""Generate exact HDBSCAN fixtures with a fully pinned Python environment.

Run from the repository root with the versions in requirements.txt, then review
and copy stdout to reference.json. The generic algorithm constructs the complete
distance matrix and `approx_min_span_tree=False` disables its approximation.
"""

import importlib.metadata
import json
import platform
from pathlib import Path

import hdbscan
import numpy as np
from sklearn.metrics import pairwise_distances


EXPECTED_PACKAGES = dict(
    line.strip().split("==")
    for line in Path(__file__).with_name("requirements.txt").read_text().splitlines()
    if line.strip()
)
PACKAGES = {name: importlib.metadata.version(name) for name in EXPECTED_PACKAGES}
if PACKAGES != EXPECTED_PACKAGES:
    raise RuntimeError(f"Install the pinned requirements before generating fixtures: {PACKAGES}")
SETTINGS = {
    "algorithm": "generic",
    "alpha": 1.0,
    "approx_min_span_tree": False,
    "gen_min_span_tree": True,
    "cluster_selection_method": "eom",
    "allow_single_cluster": True,
    "cluster_selection_epsilon": 0.0,
    "cluster_selection_persistence": 0.0,
    "cluster_selection_epsilon_max": float("inf"),
    "max_cluster_size": 0,
    "match_reference_implementation": False,
}


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
        **SETTINGS,
    ).fit(vectors)
    distances = pairwise_distances(vectors, metric=case["metric"])
    # The zero self-distance is rank 0, so index minSamples is the requested
    # minSamples-th other point. This matches hdbscan 0.8.44 reachability code.
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
    "packages": PACKAGES,
    # Infinity is a setting, not a numeric result; keep the artifact strict JSON.
    "referenceSettings": {**SETTINGS, "cluster_selection_epsilon_max": "Infinity"},
    "cases": [generate(case) for case in CASES],
}
print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))
