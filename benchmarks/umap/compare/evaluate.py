"""Untimed quality evaluation after all performance workers have finished."""
import contextlib
import importlib.util
import io
import json
import hashlib
from pathlib import Path
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location("reference", Path(__file__).parents[1] / "reference.py")
reference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference)
import duckdb
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import pairwise_distances
from sklearn.manifold import trustworthiness


def rank_penalty_score(ranks, low_order, population, neighbors):
    penalties = np.maximum(ranks[np.arange(len(low_order))[:, None], low_order] - neighbors, 0)
    return float(1 - 2 * penalties.sum() / (len(low_order) * neighbors * (2 * population - 3 * neighbors - 1)))


# Validate the sampled formula against sklearn when every row is an anchor.
rng = np.random.RandomState(123)
test_vectors, test_layout = rng.normal(size=(40, 4)), rng.normal(size=(40, 2))
test_high, test_low = pairwise_distances(test_vectors), pairwise_distances(test_layout)
np.fill_diagonal(test_high, np.inf)
np.fill_diagonal(test_low, np.inf)
test_order = np.argsort(test_high, axis=1)
test_ranks = np.empty_like(test_order)
test_ranks[np.arange(40)[:, None], test_order] = np.arange(1, 41)
assert abs(rank_penalty_score(test_ranks, np.argsort(test_low, axis=1)[:, :5], 40, 5) - trustworthiness(test_vectors, test_layout, n_neighbors=5)) < 1e-12

ROOT = Path("benchmarks/.work/umap/compare")
OUT = Path("benchmarks/umap/results")
OUT.mkdir(exist_ok=True)
observations = []
for category in ["quality", "scale", "stress", "control", "memory"]:
    path = ROOT / f"{category}-jobs.json.results.json"
    if path.exists():
        observations.extend(json.loads(path.read_text())["results"])

for observation in observations:
    job, result = observation["job"], observation["result"]
    if result["status"] != "ok" or not job.get("input"):
        continue
    directory = Path(job["output"])
    observation["layoutSha256"] = hashlib.sha256((directory / "layout.csv").read_bytes()).hexdigest()
    quality_path = directory / "quality.json"
    if not quality_path.exists():
        with contextlib.redirect_stdout(io.StringIO()):
            reference.evaluate(SimpleNamespace(directory=str(directory), input=job["input"]))
    quality = json.loads(quality_path.read_text())
    # The original evaluator calls the candidate result "sql" for historical
    # reasons; the comparison's persisted evidence uses a neutral name.
    quality["candidate"] = quality.pop("sql")
    observation["quality"] = quality
    print(job["name"], json.dumps(quality["candidate"]), flush=True)

# Larger cases: exact ranks against ALL rows, evaluated at 256 fixed anchors.
# This is a sampled estimate of trustworthiness, not a subset-only projection.
for dimensions in [128, 1024]:
    prefix = f"scale-10000x{dimensions}"
    path = ROOT / f"{prefix}-duckdb-1/input.parquet"
    if not path.exists():
        continue
    db = duckdb.connect()
    db.execute("SET threads=1")
    vectors = np.asarray([row[0] for row in db.execute("SELECT vector FROM read_parquet(?) ORDER BY id", [str(path)]).fetchall()], dtype=np.float64)
    db.close()
    n, k = len(vectors), 10
    anchors = np.random.RandomState(42).choice(n, 256, replace=False)
    distances = pairwise_distances(vectors[anchors], vectors, n_jobs=1)
    distances[np.arange(len(anchors)), anchors] = np.inf
    high_order = np.argsort(distances, axis=1)
    ranks = np.empty_like(high_order)
    ranks[np.arange(len(anchors))[:, None], high_order] = np.arange(1, n + 1)
    for observation in observations:
        job = observation["job"]
        if not job["name"].startswith(prefix) or observation["result"]["status"] != "ok":
            continue
        coordinates = np.loadtxt(Path(job["output"]) / "layout.csv", delimiter=",", skiprows=1)[:, 1:]
        low_distances = pairwise_distances(coordinates[anchors], coordinates, n_jobs=1)
        low_distances[np.arange(len(anchors)), anchors] = np.inf
        low_order = np.argsort(low_distances, axis=1)[:, :k]
        overlap = np.mean([len(set(a[:k]) & set(b)) / k for a, b in zip(high_order, low_order)])
        observation["sampledQuality"] = dict(anchorCount=len(anchors), population=n, seed=42, neighbors=k,
            trustworthiness=rank_penalty_score(ranks, low_order, n, k), neighborOverlap=float(overlap))
        print(job["name"], json.dumps(observation["sampledQuality"]), flush=True)

figure, axes = plt.subplots(3, 3, figsize=(10, 9))
for row, dataset in enumerate(["swiss", "blobs", "movies"]):
    db = duckdb.connect()
    labels = np.asarray([r[0] for r in db.execute("SELECT label FROM read_parquet(?) ORDER BY id", [f"benchmarks/.work/umap/reference/{dataset}.parquet"]).fetchall()])
    db.close()
    for col, approach in enumerate(["duckdb", "hybrid", "typescript"]):
        observation = next(o for o in observations if o["job"]["name"] == f"{dataset}-{approach}-1")
        points = np.loadtxt(Path(observation["job"]["output"]) / "layout.csv", delimiter=",", skiprows=1)[:, 1:]
        ax = axes[row, col]
        ax.scatter(points[:, 0], points[:, 1], c=labels if dataset != "movies" else "#2563eb", s=3, alpha=0.65, rasterized=True)
        q = observation["quality"]["candidate"]
        ax.set_title(f"{dataset} · {approach}\ntrust {q['trustworthiness']:.3f} · overlap {q['neighborOverlap']:.3f}", fontsize=10)
        ax.set_xticks([])
        ax.set_yticks([])
figure.suptitle("Same input and starting coordinates · 200 epochs · arbitrary axes", fontsize=12)
figure.tight_layout()
figure.savefig(OUT / "three-way.png", dpi=160)
plt.close(figure)

cases = ["movies", "scale-10000x128", "scale-10000x1024"]
approaches = ["duckdb", "hybrid", "typescript"]
colors = ["#64748b", "#2563eb", "#d97706"]
figure, axes = plt.subplots(1, 2, figsize=(11, 4.5))
for index, approach in enumerate(approaches):
    groups = [[o["result"] for o in observations if o["job"]["name"] in [f"{case}-{approach}-{repeat}" for repeat in [1, 2, 3]] and o["result"]["status"] == "ok"] for case in cases]
    for ax, field, divisor in zip(axes, ["milliseconds", "operationPeakRssBytes"], [1000, 1048576]):
        values = [float(np.median([r[field] for r in group])) / divisor for group in groups]
        bars = ax.bar(np.arange(len(cases)) + (index - 1) * 0.25, values, width=0.24, color=colors[index], label=approach)
        ax.bar_label(bars, labels=[f"{value:.1f}" if field == "milliseconds" else f"{value:.0f}" for value in values], fontsize=8, padding=3)
        ax.set_xticks(range(len(cases)), ["1k movies × 1536", "10k × 128", "10k × 1024"], fontsize=9)
        ax.spines[["top", "right"]].set_visible(False)
axes[0].set_ylabel("Seconds (table to table)")
axes[1].set_ylabel("Process peak RSS (MiB)")
axes[0].legend(frameon=False)
figure.suptitle("Three fresh-process repetitions · median · lower is better")
figure.tight_layout()
figure.savefig(OUT / "three-way-performance.png", dpi=160)
plt.close(figure)
environment = json.loads((ROOT / "quality-jobs.json.results.json").read_text())["environment"]
reference_root = ROOT.parent / "reference"
metadata = dict(referenceEnvironment=json.loads((reference_root / "environment.json").read_text()),
                movieSource=json.loads((reference_root / "movies-source.json").read_text()),
                inputSha256={name: hashlib.sha256((reference_root / f"{name}.parquet").read_bytes()).hexdigest() for name in ["swiss", "blobs", "movies"]})
(OUT / "three-way.json").write_text(json.dumps(dict(environment=environment, metadata=metadata, observations=observations), indent=2) + "\n")
