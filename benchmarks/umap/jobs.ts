// Reproducible manifests; the benchmark runner never silently changes a job.
const root = "benchmarks/.work/umap";
type Job = {
  name: string;
  input?: string;
  graph?: string;
  rows?: number;
  dimensions?: number;
  output: string;
  timeoutSeconds: number;
  options: Record<string, string | number>;
};
const quality: Job[] = [];
for (const dataset of ["swiss", "blobs", "movies"]) {
  for (const mode of ["optimizer", "exact", "hnsw"]) {
    const name = `${dataset}-${mode}`;
    quality.push({
      name,
      input: `${root}/reference/${dataset}.parquet`,
      ...(mode === "optimizer"
        ? { graph: `${root}/reference/${dataset}-graph.csv` }
        : {}),
      output: `${root}/${name}`,
      timeoutSeconds: 30,
      options: {
        metric: dataset === "movies" ? "cosine" : "euclidean",
        search: mode === "hnsw" ? "hnsw" : "exact",
        epochs: 200,
      },
    });
  }
}
const scale: Job[] = [];
for (const rows of [1000, 10000, 100000]) {
  for (const dimensions of [128, 1024]) {
    const name = `scale-${rows}-${dimensions}`;
    scale.push({
      name,
      rows,
      dimensions,
      output: `${root}/${name}`,
      timeoutSeconds: 120,
      options: { search: "hnsw", epochs: 200 },
    });
  }
}
for (const dimensions of [128, 1024]) {
  const name = `exact-10000-${dimensions}`;
  scale.push({
    name,
    rows: 10000,
    dimensions,
    output: `${root}/${name}`,
    timeoutSeconds: 60,
    options: { search: "exact", epochs: 200 },
  });
}
const tuning: Job[] = [];
for (
  const [name, options] of [
    ["movies-local", { neighbors: 5, minDistance: 0 }],
    ["movies-broad", { neighbors: 30, minDistance: 0.5 }],
    ["movies-batches", { batches: 8 }],
    ["movies-rate", { learningRate: 1 }],
    ["movies-repeat", {}],
    ["movies-seed", { seed: 99 }],
  ] as const
) {
  tuning.push({
    name,
    input: `${root}/reference/movies.parquet`,
    output: `${root}/${name}`,
    timeoutSeconds: 30,
    options: { metric: "cosine", epochs: 200, ...options },
  });
}
await Deno.mkdir(root, { recursive: true });
for (const [name, jobs] of Object.entries({ quality, scale, tuning })) {
  await Deno.writeTextFile(
    `${root}/${name}-jobs.json`,
    JSON.stringify(jobs, null, 2) + "\n",
  );
}
console.log(`Wrote quality, scale, and tuning manifests under ${root}.`);
