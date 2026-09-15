"""Deterministic moderate sparse-graph quality references; pinned exact HDBSCAN."""
import importlib.metadata
import json
from pathlib import Path
import platform

import hdbscan
import numpy as np
from sklearn.metrics import pairwise_distances

expected = dict(line.split("==") for line in Path(__file__).with_name("requirements.txt").read_text().splitlines() if line)
packages = {name: importlib.metadata.version(name) for name in expected}
assert packages == expected, (packages, expected)
rng = np.random.default_rng(192044)

# Two noisy interlocking arcs, a tight blob, a diffuse blob, and uniform noise.
t = np.linspace(0, np.pi, 144)
moon_a = np.column_stack([np.cos(t), np.sin(t)]) + rng.normal(0, .025, (144, 2))
moon_b = np.column_stack([1 - np.cos(t), .5 - np.sin(t)]) + rng.normal(0, .035, (144, 2))
euclidean = np.vstack([moon_a, moon_b, rng.normal([4, 0], .08, (96, 2)),
                       rng.normal([4, 2], .25, (72, 2)), rng.uniform([-1.5, -1.5], [5, 3], (56, 2))])
euclidean = euclidean[rng.permutation(len(euclidean))]

# Curved spherical arcs and patches with different angular densities plus noise.
theta = np.concatenate([np.linspace(-1.4, -.25, 144), np.linspace(.25, 1.4, 144),
                        rng.normal(2.2, .025, 96), rng.normal(-2.2, .16, 72), rng.uniform(-np.pi, np.pi, 56)])
phi = np.concatenate([.25 * np.sin(4*theta[:144]) + rng.normal(0, .018, 144),
                      -.25 * np.sin(4*theta[144:288]) + rng.normal(0, .03, 144),
                      rng.normal(.6, .025, 96), rng.normal(-.5, .16, 72), rng.uniform(-.75, .75, 56)])
cosine = np.column_stack([np.cos(theta)*np.cos(phi), np.sin(theta)*np.cos(phi), np.sin(phi)])
cosine = cosine[rng.permutation(len(cosine))]

# Forced singleton candidate components. First-coordinate ordering alternates
# between two separated tracks, so the >256 anchor chain misses short links.
i = np.arange(257)
chain = np.column_stack([i / 64, 4*(i % 2) + .01*np.sin(i*1.7)])

# Two connected candidate groups, each with ten points. Their closest pair is
# at excluded representative rank4. Exact core distances are retained so this
# probe isolates repair/topology consequences, not core-neighbor misses.
representative = np.array([[0. if i == 4 else .1 if i == 14 else 100.+i if i < 10 else 200.+i]
                           for i in range(20)])

settings = dict(algorithm="generic", alpha=1.0, approx_min_span_tree=False,
                gen_min_span_tree=True, cluster_selection_method="eom",
                cluster_selection_epsilon=0.0, cluster_selection_persistence=0.0,
                cluster_selection_epsilon_max=float("inf"), max_cluster_size=0,
                match_reference_implementation=False, allow_single_cluster=False)
cases = []
for name, vectors, metric, min_cluster_size, min_samples, mode in [
    ("euclidean-arcs-densities-noise", euclidean, "euclidean", 24, 10, "hnsw"),
    ("cosine-curved-arcs-densities-noise", cosine, "cosine", 24, 10, "hnsw"),
    ("forced-chain-two-tracks", chain, "euclidean", 12, 3, "forced-chain"),
    ("forced-representative-miss", representative, "euclidean", 3, 1, "forced-representative"),
]:
    model = hdbscan.HDBSCAN(**settings, min_cluster_size=min_cluster_size,
                          min_samples=min_samples, metric=metric).fit(vectors)
    distances = pairwise_distances(vectors, metric=metric)
    assert np.isfinite(distances).all(), name
    assert np.isfinite(model.probabilities_).all(), name
    assert np.isfinite(model.outlier_scores_).all(), name
    core = np.partition(distances, min_samples, axis=1)[:, min_samples]
    case = dict(name=name, vectors=vectors.tolist(), metric=metric, minClusterSize=min_cluster_size,
                minSamples=min_samples, allowSingleCluster=False, mode=mode,
                labels=model.labels_.tolist(), probabilities=model.probabilities_.tolist(),
                outlierScores=model.outlier_scores_.tolist(), coreDistances=core.tolist(),
                mst=model.minimum_spanning_tree_.to_numpy().tolist())
    cases.append(case)
print(json.dumps(dict(generator="test/data/hdbscan/quality-generate.py", seed=192044,
                      python=platform.python_version(), packages=packages,
                      settings={**settings, "cluster_selection_epsilon_max": "Infinity"},
                      cases=cases), indent=2, allow_nan=False))
