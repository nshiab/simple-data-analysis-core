# Phase 0 baseline (issue #78)

Reference numbers recorded before any of the roadmap work in
[#78](https://github.com/nshiab/simple-data-analysis-core/issues/78). Each
subsequent phase gates on the full test suite plus a benchmark comparison
against these numbers.

## Environment

- Date: 2026-07-02
- Machine: MacBook Pro, Apple M4 Max, 64 GB RAM
- OS: macOS 26.5.1
- Runtime: Deno 2.8.3 (V8 14.9.207.2-rusty, TypeScript 6.0.3)
- DuckDB: v1.5.3 (`@duckdb/node-api@1.5.3-r.2`)
- Core: `@nshiab/simple-data-analysis-core@1.0.1`, commit `f7084f1`

## Benchmark

The scenario from
[simple-data-analysis-benchmarks](https://github.com/nshiab/simple-data-analysis-benchmarks)
(average temperature per decade and city from the AHCCD daily temperatures), run
directly against the local core source with `benchmarks/bench.ts`:

1. Load a CSV file (importing)
2. Select four columns, remove rows with missing temperature, convert types
   (cleaning)
3. Add a computed decade column (modifying)
4. Write the cleaned data to CSV (writing)
5. Read all rows into JS objects with `getData` (gettingData)
6. Identity round-trip through JS with `updateWithJS` (updatingWithJS)
7. Average temperature per decade and city with `summarize` (summarizing)

Steps 5–6 are additions over the benchmarks-repo scenario: they exercise the
DuckDB → JS read path targeted by Phase 1 and the full materialization that
Phase 5's batching addresses. Because of them, the totals below are not
comparable with the benchmarks-repo results — compare per step.

10 iterations per file. Per-iteration timings are in `benchmarks/results/`.

To reproduce (expects the data files from a sibling checkout of
`simple-data-analysis-benchmarks`, or pass a data directory as first argument):

```bash
deno task bench
```

### Small file — ahccd-sample.csv (74.7 MB, 971,804 rows, 20 columns)

| Step           | Mean (s) | StdDev (s) |
| -------------- | -------- | ---------- |
| Importing      | 0.326    | 0.004      |
| Cleaning       | 0.105    | 0.001      |
| Modifying      | 0.005    | 0.000      |
| Writing        | 0.030    | 0.006      |
| GettingData    | 0.639    | 0.011      |
| UpdatingWithJS | 1.067    | 0.030      |
| Summarizing    | 0.006    | 0.001      |
| **Total**      | 2.177    | 0.035      |

The two JS round-trip steps account for ~78% of the total on the cleaned sample
table (~942k rows × 5 columns) — this is the pipeline Phase 1 replaces with
typed readers.

### Big file — ahccd.csv (1.7 GB, 22,051,025 rows, 20 columns)

| Step           | Mean (s) | StdDev (s) |
| -------------- | -------- | ---------- |
| Importing      | 2.309    | 0.106      |
| Cleaning       | 0.911    | 0.120      |
| Modifying      | 0.160    | 0.000      |
| Writing        | 0.367    | 0.079      |
| GettingData    | —        | —          |
| UpdatingWithJS | —        | —          |
| Summarizing    | 0.042    | 0.001      |
| **Total**      | 3.789    | 0.169      |

`getData()` (and therefore `updateWithJS()`) on the cleaned big table (~21.4M
rows × 5 columns) **crashes with a V8 fatal out-of-memory error** ("Ineffective
mark-compacts near heap limit", ~4 GB heap) — the JSON-serialized read path
cannot materialize the table at all. Recorded here as the baseline behavior that
Phase 1 (typed readers, no JSON strings) should improve and Phase 5 (streaming /
batched `updateWithJS`) should fix; both steps are skipped for this file in
`bench.ts` until then.

## Test coverage

Snapshot of `deno task test-coverage` on the same commit, as the regression
baseline. Full per-file table in `benchmarks/coverage-baseline.txt`.

- Tests: **902 passed, 0 failed** (1m23s)
- Overall coverage (all files): **91.6% branch, 76.4% function, 83.8% line**

Files most touched by the roadmap phases:

| File                    | Branch % | Function % | Line % |
| ----------------------- | -------- | ---------- | ------ |
| class/SimpleTable.ts    | 96.5     | 98.7       | 97.8   |
| class/SimpleDB.ts       | 87.6     | 94.1       | 88.1   |
| helpers/queryDB.ts      | 93.2     | 100.0      | 84.1   |
| helpers/runQuery.ts     | 100.0    | 100.0      | 100.0  |
| helpers/convertForJS.ts | 90.6     | 100.0      | 87.2   |
