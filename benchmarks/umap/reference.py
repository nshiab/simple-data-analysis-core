"""Development-only reference preparation, graph checks, and quality evaluation.

Run with the pinned requirements in this directory; never imported at runtime.
"""

import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import time
import urllib.request

# Bound numerical thread pools before importing NumPy / Numba.
os.environ.setdefault("NUMBA_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MPLCONFIGDIR", "/tmp/umap-matplotlib")
os.environ.setdefault("XDG_CACHE_HOME", "/tmp/umap-python-cache")

import duckdb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.sparse import coo_matrix
from sklearn.datasets import make_blobs, make_swiss_roll
from sklearn.manifold import trustworthiness
from sklearn.metrics import pairwise_distances
from sklearn.neighbors import NearestNeighbors
import umap
from umap.umap_ import fuzzy_simplicial_set, find_ab_params, make_epochs_per_sample
from umap.layouts import optimize_layout_euclidean


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")


def graph_for(vectors, neighbors, metric):
    if len(vectors) > 2000:
        raise ValueError("Exact reference validation is bounded to 2,000 rows.")
    # Compare the graph using DOUBLE distances and unmodified reference UMAP's
    # fuzzy calculations. Canonicalize exact duplicates: float32 cosine roundoff
    # can otherwise change rho discontinuously to a spurious positive epsilon.
    distances = pairwise_distances(vectors.astype(np.float64), metric=metric).astype(np.float32)
    _, groups = np.unique(vectors, axis=0, return_inverse=True)
    distances[groups[:, None] == groups[None, :]] = 0
    # Explicit self in column zero, including duplicates; stable ties by row id.
    np.fill_diagonal(distances, -1)
    indices = np.argsort(distances, axis=1, kind="stable")[:, :neighbors]
    np.fill_diagonal(distances, 0)
    knn = np.take_along_axis(distances, indices, axis=1)
    graph, sigmas, rhos = fuzzy_simplicial_set(
        vectors, neighbors, np.random.RandomState(42), metric,
        knn_indices=indices, knn_dists=knn,
    )
    if not np.isfinite(sigmas).all() or not np.isfinite(graph.data).all():
        raise ValueError("Reference graph contains non-finite values; check the pinned numerical environment.")
    return graph.tocoo(), sigmas, rhos


def save_graph(path, graph):
    order = np.lexsort((graph.col, graph.row))
    np.savetxt(path, np.column_stack((graph.row[order], graph.col[order], graph.data[order])),
               delimiter=",", header="source,target,weight", comments="", fmt=["%d", "%d", "%.17g"])


def parquet(path, vectors, labels):
    temporary = path.with_suffix(".json")
    write_json(temporary, [dict(id=i, vector=x.tolist(), label=float(labels[i])) for i, x in enumerate(vectors)])
    db = duckdb.connect()
    db.execute("SET threads=1")
    db.execute(f"CREATE TABLE data AS SELECT id, vector::FLOAT[{vectors.shape[1]}] AS vector, label FROM read_json_auto(?)", [str(temporary)])
    db.execute("COPY data TO ? (FORMAT PARQUET)", [str(path)])
    db.close()
    temporary.unlink()


def prepare(args):
    output = Path(args.directory)
    output.mkdir(parents=True, exist_ok=True)
    random = np.random.RandomState(42)
    for name in ["blobs", "swiss"]:
        if name == "blobs":
            points, labels = make_blobs(n_samples=1000, centers=5, n_features=8, random_state=42)
        else:
            points, labels = make_swiss_roll(n_samples=1000, noise=0.05, random_state=42)
        # Isometric linear embedding in 384 dimensions, retaining known structure.
        basis, _ = np.linalg.qr(random.normal(size=(384, points.shape[1])))
        vectors = (points @ basis.T).astype(np.float32)
        parquet(output / f"{name}.parquet", vectors, labels)
        graph, _, _ = graph_for(vectors, 15, "euclidean")
        save_graph(output / f"{name}-graph.csv", graph)

    # Small committed fixtures make graph correctness tests independent of Python.
    fixture = []
    for metric in ["euclidean", "cosine"]:
        vectors = random.normal(size=(16, 4)).astype(np.float32)
        vectors[1] = vectors[0]
        graph, sigmas, rhos = graph_for(vectors, 5, metric)
        fixture.append(dict(metric=metric, neighbors=5, vectors=vectors.tolist(),
                            sigma=sigmas.tolist(), rho=rhos.tolist(),
                            edges=[dict(source=int(i), target=int(j), weight=float(w))
                                   for i, j, w in zip(graph.row, graph.col, graph.data)]))
    fixture_path = Path(__file__).parents[2] / "test/data/umap/reference.json"
    fixture_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(fixture_path, dict(version=umap.__version__, cases=fixture,
               distancePolicy="Float64 distances rounded to float32 for reference smooth_knn_dist; exact duplicate distances forced to zero."))
    write_json(output / "curves.json", {str(m): list(find_ab_params(1, m)) for m in [0, 0.1, 0.5]})
    write_json(output / "environment.json", {name: importlib.metadata.version(name) for name in
               ["umap-learn", "numpy", "scipy", "scikit-learn", "numba", "pynndescent", "duckdb", "matplotlib"]})


def movies(args):
    output = Path(args.directory)
    output.mkdir(parents=True, exist_ok=True)
    # Public precomputed plot embeddings: no provider calls, credentials, or model downloads.
    revision = "271a09d81ba8ff768f538bbc51ee40a497b8e5c7"
    url = f"https://huggingface.co/datasets/MongoDB/embedded_movies/resolve/{revision}/sample_mflix.embedded_movies.json"
    data = urllib.request.urlopen(url, timeout=60).read()
    try:
        rows = json.loads(data)
    except json.JSONDecodeError:
        rows = [json.loads(line) for line in data.splitlines() if line.strip()]
    eligible = [r for r in rows if isinstance(r.get("plot_embedding"), list)
                and len(r["plot_embedding"]) == 1536]
    # Stable fixed-seed sample rather than only the oldest films in file order.
    chosen = np.random.RandomState(42).choice(len(eligible), min(1000, len(eligible)), replace=False)
    vectors = np.asarray([eligible[i]["plot_embedding"] for i in chosen], dtype=np.float32)
    parquet(output / "movies.parquet", vectors, np.arange(len(vectors)))
    graph, _, _ = graph_for(vectors, 15, "cosine")
    save_graph(output / "movies-graph.csv", graph)
    write_json(output / "movies-source.json", dict(url=url, revision=revision,
               sha256=hashlib.sha256(data).hexdigest(), rows=len(vectors), dimensions=1536,
               selectedSourceRows=chosen.tolist(), license="apache-2.0"))


def evaluate(args):
    directory = Path(args.directory)
    observation = json.loads((directory / "observation.json").read_text())
    settings = observation["result"]["settings"]
    db = duckdb.connect()
    db.execute("SET threads=1")
    rows = db.execute("SELECT vector,label FROM read_parquet(?) ORDER BY id", [args.input]).fetchall()
    if len(rows) > 2000:
        db.close()
        raise ValueError("Exact quality evaluation is bounded to 2,000 rows.")
    db.close()
    vectors = np.asarray([row[0] for row in rows], dtype=np.float32)
    labels = np.asarray([row[1] for row in rows])
    coordinates = np.loadtxt(directory / "layout.csv", delimiter=",", skiprows=1)[:, 1:]
    initial = np.loadtxt(directory / "initial.csv", delimiter=",", skiprows=1)[:, 1:].astype(np.float32)
    edges = np.loadtxt(directory / "graph.csv", delimiter=",", skiprows=1)
    sql_graph = coo_matrix((edges[:, 2], (edges[:, 0].astype(int), edges[:, 1].astype(int))), shape=(len(rows), len(rows)))
    reference_graph, sigmas, rhos = graph_for(vectors, settings["neighbors"], settings["metric"])
    difference = (sql_graph.tocsr() - reference_graph.tocsr()).data

    a, b = find_ab_params(1, settings["minDistance"])
    # Warm the JIT on a tiny graph; separately report the cold cost.
    warm_start = time.perf_counter()
    umap.UMAP(n_neighbors=5, n_epochs=20, init="random", random_state=42, n_jobs=1).fit_transform(vectors[:20])
    warm_seconds = time.perf_counter() - warm_start
    start = time.perf_counter()
    retained = sql_graph.copy()
    retained.data[retained.data < retained.data.max() / (settings["epochs"] if settings["epochs"] > 10 else 500)] = 0
    retained.eliminate_zeros()
    reference = initial.copy()
    optimize_layout_euclidean(
        reference, reference, retained.row, retained.col, settings["epochs"], len(rows),
        make_epochs_per_sample(retained.data, settings["epochs"]), a, b,
        np.random.RandomState(settings["seed"]).randint(-2147483647, 2147483646, 3).astype(np.int64),
        initial_alpha=1.0, negative_sample_rate=settings["negativeSamples"],
        parallel=False, move_other=True,
    )
    optimizer_seconds = time.perf_counter() - start
    start = time.perf_counter()
    standard = umap.UMAP(n_neighbors=settings["neighbors"], min_dist=settings["minDistance"],
                         n_epochs=settings["epochs"], metric=settings["metric"],
                         random_state=settings["seed"], n_jobs=1).fit_transform(vectors)
    standard_seconds = time.perf_counter() - start

    high_neighbors = NearestNeighbors(n_neighbors=11, metric=settings["metric"]).fit(vectors).kneighbors(return_distance=False)[:, :10]
    def metrics(points):
        low_neighbors = NearestNeighbors(n_neighbors=11).fit(points).kneighbors(return_distance=False)[:, :10]
        overlap = np.mean([len(set(a) & set(b)) / 10 for a, b in zip(high_neighbors, low_neighbors)])
        return dict(trustworthiness=float(trustworthiness(vectors, points, n_neighbors=10, metric=settings["metric"])),
                    neighborOverlap=float(overlap))

    reference_support = set(zip(reference_graph.row.tolist(), reference_graph.col.tolist()))
    sql_support = set(zip(sql_graph.row.tolist(), sql_graph.col.tolist()))
    result = dict(umapVersion=umap.__version__, graphMaxAbsoluteError=float(np.max(np.abs(difference))) if len(difference) else 0,
                  graphEdgeRecall=len(reference_support & sql_support)/len(reference_support),
                  graphEdgePrecision=len(reference_support & sql_support)/len(sql_support),
                  jitWarmupSeconds=warm_seconds, referenceOptimizerSeconds=optimizer_seconds,
                  referenceFullSeconds=standard_seconds,
                  initial=metrics(initial), sql=metrics(coordinates),
                  referenceSameGraph=metrics(reference), referenceDefault=metrics(standard))
    scales_path = directory / "scales.csv"
    if scales_path.exists():
        scales = np.loadtxt(scales_path, delimiter=",", skiprows=1)
        result.update(rhoMaxAbsoluteError=float(np.max(np.abs(scales[:, 1]-rhos))),
                      sigmaMaxAbsoluteError=float(np.max(np.abs(scales[:, 2]-sigmas))))
    write_json(directory / "quality.json", result)
    figure, axes = plt.subplots(1, 3, figsize=(12, 4))
    candidate_title = {"duckdb": "SQL batched optimizer", "hybrid": "DuckDB graph / UMAP-JS", "typescript": "UMAP-JS full pipeline", "hybrid-owned": "DuckDB graph / owned TypeScript"}.get(observation["result"].get("approach"), "SQL batched optimizer")
    for ax, points, title in zip(axes, [coordinates, reference, standard],
                                 [candidate_title, "Reference: same graph / init", "Reference: default spectral init"]):
        ax.scatter(points[:, 0], points[:, 1], c=labels if "movies" not in args.input else "#2563eb", s=4, alpha=0.7)
        ax.set_title(title, fontsize=10)
        ax.set_xticks([])
        ax.set_yticks([])
    figure.suptitle(Path(args.input).stem + " — exploratory projections; axes are arbitrary")
    figure.tight_layout()
    figure.savefig(directory / "comparison.png", dpi=150)
    plt.close(figure)
    print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "movies", "evaluate"])
    parser.add_argument("directory")
    parser.add_argument("--input")
    arguments = parser.parse_args()
    dict(prepare=prepare, movies=movies, evaluate=evaluate)[arguments.command](arguments)
