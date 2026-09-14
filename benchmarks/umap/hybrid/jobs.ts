const root = "benchmarks/.work/umap/hybrid";
const jobs: {
  name: string;
  worker: "hybrid";
  approach: "hybrid-owned";
  output: string;
  timeoutSeconds: number;
  input?: string;
  rows?: number;
  dimensions?: number;
  options?: Record<string, number | string>;
}[] = [];
function add(
  name: string,
  data: {
    input?: string;
    rows?: number;
    dimensions?: number;
    options?: Record<string, number | string>;
  },
  repeats = 1,
) {
  for (let repeat = 1; repeat <= repeats; repeat++) {
    const id = `${name}-${repeat}`;
    jobs.push({
      name: id,
      worker: "hybrid",
      approach: "hybrid-owned",
      output: `${root}/${id}`,
      timeoutSeconds: 120,
      ...data,
    });
  }
}
for (const dataset of ["swiss", "blobs", "movies"]) {
  add(dataset, {
    input: `benchmarks/.work/umap/reference/${dataset}.parquet`,
    options: { metric: dataset === "movies" ? "cosine" : "euclidean" },
  }, dataset === "movies" ? 3 : 1);
}
const movies = { input: "benchmarks/.work/umap/reference/movies.parquet" };
add("movies-small-neighborhood", {
  ...movies,
  options: { metric: "cosine", neighbors: 5, minDistance: 0 },
});
for (const seed of [0, 7, 99, 123]) {
  add(`movies-seed${seed}`, { ...movies, options: { metric: "cosine", seed } });
}
for (const minDistance of [0.025, 0.25, 0.8, 1]) {
  add(`movies-distance${minDistance}`, {
    ...movies,
    options: { metric: "cosine", minDistance },
  });
}
add(
  "movies-hnsw",
  { ...movies, options: { metric: "cosine", search: "hnsw" } },
  3,
);
for (const dimensions of [128, 1024]) {
  add(`scale-10000x${dimensions}`, { rows: 10000, dimensions }, 3);
}
add("scale-100000x128", { rows: 100000, dimensions: 128 });
await Deno.mkdir(root, { recursive: true });
await Deno.writeTextFile(
  `${root}/jobs.json`,
  JSON.stringify(jobs, null, 2) + "\n",
);
