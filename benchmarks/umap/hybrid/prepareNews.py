"""Prepare a pinned, public, precomputed news embedding dataset (no model calls)."""
import hashlib
import json
import urllib.request
from pathlib import Path
import duckdb

root = Path("benchmarks/.work/umap/hybrid")
root.mkdir(parents=True, exist_ok=True)
revision = "01e7414408f5412b92ddef7e7213f67aded40288"
url = f"https://huggingface.co/datasets/pietrolesci/agnews/resolve/{revision}/embedding_all-MiniLM-L12-v2/test-00000-of-00001-eed3e12e11740a39.parquet"
source = root / "agnews-source.parquet"
if not source.exists():
    source.write_bytes(urllib.request.urlopen(url, timeout=60).read())
digest = hashlib.sha256(source.read_bytes()).hexdigest()
if digest != "46e4b77127dc8a4220e0b5db1cbb820a6670747fbcbe7d888fd53cc784ca7f30":
    raise ValueError("Unexpected news source SHA-256")
c = duckdb.connect()
c.execute("SET threads=1")
c.execute('CREATE TABLE news AS SELECT uid AS id, uid AS label, "embedding_all-MiniLM-L12-v2"::FLOAT[384] AS vector FROM read_parquet(?) ORDER BY uid', [str(source)])
assert c.execute("SELECT count(*),count(DISTINCT id) FROM news").fetchone() == (7600, 7600)
c.execute("COPY news TO ? (FORMAT PARQUET)", [str(root / "news.parquet")])
c.close()
(root / "news-source.json").write_text(json.dumps(dict(url=url, revision=revision, sha256=digest, count=7600, dimensions=384, model="all-MiniLM-L12-v2", split="test", selection="all rows, ordered by uid"), indent=2) + "\n")
jobs = []
for seed in [42, 99, 123]:
    for approach in ["hybrid-owned", "hybrid"]:
        name = f"news-{approach}-seed{seed}"
        job = dict(name=name, approach=approach, input=str(root / "news.parquet"), output=str(root / name), timeoutSeconds=120, options=dict(metric="cosine", search="hnsw", seed=seed))
        if approach == "hybrid-owned":
            job["worker"] = "hybrid"
        jobs.append(job)
(root / "news-jobs.json").write_text(json.dumps(jobs, indent=2) + "\n")
