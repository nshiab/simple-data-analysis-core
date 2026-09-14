const root = "benchmarks/.work/umap/compare";
const approaches = ["duckdb", "hybrid", "typescript"];
const jobs: {
  name: string;
  approach: string;
  output: string;
  timeoutSeconds: number;
  input?: string;
  rows?: number;
  dimensions?: number;
  options?: Record<string, string | number>;
}[] = [];
function add(
  name: string,
  repetitions: number,
  data: {
    input?: string;
    rows?: number;
    dimensions?: number;
    options?: Record<string, string | number>;
  },
) {
  for (let repeat = 0; repeat < repetitions; repeat++) {
    // Rotate execution order; every repetition has its own fresh process.
    for (let offset = 0; offset < approaches.length; offset++) {
      const approach = approaches[(offset + repeat) % approaches.length];
      const id = `${name}-${approach}-${repeat + 1}`;
      jobs.push({
        name: id,
        approach,
        output: `${root}/${id}`,
        timeoutSeconds: 120,
        ...data,
      });
    }
  }
}
for (const name of ["swiss", "blobs", "movies"]) {
  add(name, name === "movies" ? 3 : 1, {
    input: `benchmarks/.work/umap/reference/${name}.parquet`,
    options: { metric: name === "movies" ? "cosine" : "euclidean" },
  });
}
add("movies-small-neighborhood", 1, {
  input: "benchmarks/.work/umap/reference/movies.parquet",
  options: { metric: "cosine", neighbors: 5, minDistance: 0 },
});
add("movies-seed99", 1, {
  input: "benchmarks/.work/umap/reference/movies.parquet",
  options: { metric: "cosine", seed: 99 },
});
await Deno.mkdir(root, { recursive: true });
await Deno.writeTextFile(
  `${root}/quality-jobs.json`,
  JSON.stringify(jobs, null, 2) + "\n",
);
jobs.length = 0;
for (const dimensions of [128, 1024]) {
  add(`scale-10000x${dimensions}`, 3, { rows: 10000, dimensions });
}
await Deno.writeTextFile(
  `${root}/scale-jobs.json`,
  JSON.stringify(jobs, null, 2) + "\n",
);
jobs.length = 0;
for (const dimensions of [128, 1024]) {
  add(`scale-100000x${dimensions}`, 1, { rows: 100000, dimensions });
}
await Deno.writeTextFile(
  `${root}/stress-jobs.json`,
  JSON.stringify(jobs, null, 2) + "\n",
);
jobs.length = 0;
for (const approach of approaches) {
  const name = `movies-learning-rate-control-${approach}`;
  jobs.push({
    name,
    approach,
    output: `${root}/${name}`,
    timeoutSeconds: 120,
    input: "benchmarks/.work/umap/reference/movies.parquet",
    options: {
      metric: "cosine",
      learningRate: approach === "duckdb" ? 1 : 0.1,
    },
  });
}
for (const approach of ["duckdb", "hybrid"]) {
  for (let repeat = 1; repeat <= (approach === "hybrid" ? 3 : 1); repeat++) {
    const name = `movies-hnsw-${approach}-${repeat}`;
    jobs.push({
      name,
      approach,
      output: `${root}/${name}`,
      timeoutSeconds: 120,
      input: "benchmarks/.work/umap/reference/movies.parquet",
      options: { metric: "cosine", search: "hnsw" },
    });
  }
}
await Deno.writeTextFile(
  `${root}/control-jobs.json`,
  JSON.stringify(jobs, null, 2) + "\n",
);
const memoryName = "scale-100000x128-typescript-larger-heap";
await Deno.writeTextFile(
  `${root}/memory-jobs.json`,
  JSON.stringify(
    [{
      name: memoryName,
      approach: "typescript",
      rows: 100000,
      dimensions: 128,
      output: `${root}/${memoryName}`,
      timeoutSeconds: 120,
      v8OldSpaceMiB: 3072,
    }],
    null,
    2,
  ) + "\n",
);
