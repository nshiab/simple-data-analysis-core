const root = "benchmarks/.work/umap/public";
const hybrid = "benchmarks/.work/umap/hybrid";
const jobs: Record<string, unknown>[] = [];
function add(name: string, options: Record<string, unknown>, repeats = 1) {
  for (let i = 1; i <= repeats; i++) {
    jobs.push({
      name: `${name}-${i}`,
      worker: "public",
      output: `${root}/${name}-${i}`,
      timeoutSeconds: 120,
      ...options,
    });
  }
}
add("movies", {
  input: "benchmarks/.work/umap/reference/movies.parquet",
  options: { metric: "cosine" },
  reference: `${hybrid}/movies-1/layout.csv`,
}, 3);
for (const seed of [42, 99, 123]) {
  add(`news-seed${seed}`, {
    input: `${hybrid}/news.parquet`,
    options: { metric: "cosine", seed },
    reference: `${hybrid}/news-hybrid-owned-seed${seed}/layout.csv`,
  });
}
for (const [rows, dimensions] of [[10000, 128], [10000, 1024], [100000, 128]]) {
  add(`scale-${rows}x${dimensions}`, {
    rows,
    dimensions,
    reference: `${hybrid}/scale-${rows}x${dimensions}-1/layout.csv`,
  });
}
await Deno.mkdir(root, { recursive: true });
await Deno.writeTextFile(
  `${root}/jobs.json`,
  JSON.stringify(jobs, null, 2) + "\n",
);
