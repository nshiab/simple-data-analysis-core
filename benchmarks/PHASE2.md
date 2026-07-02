# Phase 2 results (issue #78)

Errors and ergonomics — no performance changes expected or observed.

## 2a. Structured errors

New `SDAError` class (exported from the package root) thrown by `runQuery` when
a query fails. It carries `method`, `parameters`, `query` and the original error
as `cause`, and its message includes all of them, so uncaught errors stay as
informative as the old console output. The previous behavior logged the context
with `console.warn`/`console.log` and rethrew the raw DuckDB error; nothing is
logged anymore unless `debug` is enabled, which keeps the console output.

## 2b. `Promise<this>` returns

All mutation methods on `SimpleTable` (91) and `SimpleDB` (5) now return
`Promise<this>` instead of `Promise<void>` and end with `return this;`.
Source-compatible: no caller consumed the `void`. Enables composition:

```ts
const data = await table
  .loadArray(rows)
  .then((t) => t.filter(`amount > 1`))
  .then((t) => t.sort({ name: "asc" }))
  .then((t) => t.getData());
```

## Benchmark

Same machine and scenario as [BASELINE.md](./BASELINE.md). Within noise of Phase
1 across all steps, as expected. Per-iteration timings in
`benchmarks/results/*-phase2.csv`.

| Step (small file) | Phase 1 (s) | Phase 2 (s) |
| ----------------- | ----------- | ----------- |
| Importing         | 0.321       | 0.330       |
| Cleaning          | 0.102       | 0.106       |
| Modifying         | 0.005       | 0.006       |
| Writing           | 0.025       | 0.026       |
| GettingData       | 0.429       | 0.457       |
| UpdatingWithJS    | 0.865       | 0.899       |
| Summarizing       | 0.006       | 0.007       |
| **Total**         | 1.754       | 1.830       |

Big file: total 3.598 → 3.753 s, within run-to-run variance (stdDev 0.30).
