"""Run reference quality evaluations AFTER the owned hybrid performance jobs."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location("reference", Path(__file__).parents[1] / "reference.py")
reference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference)
import duckdb
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import pairwise_distances
import umap

root = Path("benchmarks/.work/umap/hybrid")
out = Path("benchmarks/umap/results")
evidence = json.loads((root / "jobs.json.results.json").read_text())
observations = evidence["results"]
for observation in observations:
    job, result = observation["job"], observation["result"]
    if result["status"] != "ok":
        continue
    directory = Path(job["output"])
    observation["layoutSha256"] = hashlib.sha256((directory / "layout.csv").read_bytes()).hexdigest()
    if not job.get("input"):
        continue
    if not (directory / "quality.json").exists():
        with contextlib.redirect_stdout(io.StringIO()):
            reference.evaluate(SimpleNamespace(directory=str(directory), input=job["input"]))
    quality = json.loads((directory / "quality.json").read_text())
    quality["candidate"] = quality.pop("sql")
    quality["passed"] = (quality["candidate"]["trustworthiness"] >= quality["referenceDefault"]["trustworthiness"] - 0.03 and quality["candidate"]["neighborOverlap"] >= quality["referenceDefault"]["neighborOverlap"] - 0.10)
    observation["quality"] = quality
    print(job["name"], json.dumps(quality["candidate"]), "pass", quality["passed"], flush=True)

news = json.loads((root / "news-jobs.json.results.json").read_text())["results"]
c = duckdb.connect()
c.execute("SET threads=1")
vectors = np.asarray([r[0] for r in c.execute("SELECT vector FROM read_parquet(?) ORDER BY id", [str(root / "news.parquet")]).fetchall()], dtype=np.float32)
c.close()
n, k = len(vectors), 10
anchors = np.random.RandomState(42).choice(n, 512, replace=False)
distances = pairwise_distances(vectors[anchors].astype(np.float64), vectors.astype(np.float64), metric="cosine", n_jobs=1)
distances[np.arange(len(anchors)), anchors] = np.inf
high_order = np.argsort(distances, axis=1)
ranks = np.empty_like(high_order)
ranks[np.arange(len(anchors))[:, None], high_order] = np.arange(1, n + 1)


def metrics(coordinates):
    distances = pairwise_distances(coordinates[anchors], coordinates, n_jobs=1)
    distances[np.arange(len(anchors)), anchors] = np.inf
    neighbors = np.argsort(distances, axis=1)[:, :k]
    penalties = np.maximum(ranks[np.arange(len(anchors))[:, None], neighbors] - k, 0)
    overlap = np.mean([len(set(a[:k]) & set(b)) / k for a, b in zip(high_order, neighbors)])
    return dict(trustworthiness=float(1 - 2 * penalties.sum() / (len(anchors) * k * (2 * n - 3 * k - 1))), neighborOverlap=float(overlap), anchorCount=len(anchors), population=n)


reference_metrics = {}
figure, axes = plt.subplots(1, 3, figsize=(12, 4))
for seed in [42, 99, 123]:
    path = root / f"news-reference-seed{seed}.npy"
    if path.exists():
        standard = np.load(path)
    else:
        standard = umap.UMAP(n_neighbors=15, n_epochs=200, min_dist=0.1, metric="cosine", random_state=seed, n_jobs=1).fit_transform(vectors)
        np.save(path, standard)
    reference_metrics[str(seed)] = metrics(standard)
    if seed == 42:
        axes[2].scatter(standard[:, 0], standard[:, 1], s=2, alpha=0.5)
        axes[2].set_title("Python reference")
for observation in news:
    job, result = observation["job"], observation["result"]
    if result["status"] != "ok":
        continue
    coordinates = np.loadtxt(Path(job["output"]) / "layout.csv", delimiter=",", skiprows=1)[:, 1:]
    quality = metrics(coordinates)
    baseline = reference_metrics[str(result["settings"]["seed"])]
    quality["referenceDefault"] = baseline
    quality["passed"] = quality["trustworthiness"] >= baseline["trustworthiness"] - 0.03 and quality["neighborOverlap"] >= baseline["neighborOverlap"] - 0.10
    observation["sampledQuality"] = quality
    print(job["name"], json.dumps(quality), flush=True)
    if result["settings"]["seed"] == 42:
        index = 0 if result["approach"] == "hybrid-owned" else 1
        axes[index].scatter(coordinates[:, 0], coordinates[:, 1], s=2, alpha=0.5)
        axes[index].set_title("Owned TypeScript optimizer" if index == 0 else "UMAP-JS optimizer")
for ax in axes:
    ax.set_xticks([]); ax.set_yticks([])
figure.suptitle("7,600 news embeddings · cosine · seed 42 · arbitrary axes")
figure.tight_layout()
figure.savefig(out / "hybrid-news.png", dpi=160)
plt.close(figure)
evidence["newsSource"] = json.loads((root / "news-source.json").read_text())
evidence["newsResults"] = news
evidence["referenceNewsQuality"] = reference_metrics
(out / "hybrid-owned.json").write_text(json.dumps(evidence, indent=2) + "\n")
failures = [o["job"]["name"] for o in observations + news if o["result"]["status"] != "ok" or not o.get("quality", o.get("sampledQuality", {})).get("passed", True)]
if failures:
    raise RuntimeError("Hybrid validation failed: " + ", ".join(failures))
