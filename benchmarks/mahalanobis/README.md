# Public Mahalanobis benchmark

This harness measures the complete public `mahalanobis()` operation from numeric
feature preparation through covariance estimation, matrix factorization,
row-wise distance evaluation, and atomic publication.

```sh
# Small smoke measurement
deno run -A benchmarks/mahalanobis/run.ts --quick
# Complete increasing-dimension sweep
deno run -A benchmarks/mahalanobis/run.ts
```

The input table is created before timing starts. The timed operation includes
copying the source into the private prepared relation and recreating the source
table during publication. Verification checks source row order and vector type,
finite DOUBLE outputs, scratch cleanup, and the same-sample identity
`sum(distance²) = (n - 1) * d`.

Each dimension runs in a separate worker with one DuckDB thread. The runner
stops a worker after 10 minutes or sampled RSS above 8 GiB, saves each finished
case immediately, and records process high-water RSS on successful runs. These
are experiment stopping rules rather than library limits. Results default to
`benchmarks/.work/mahalanobis-results.json`; use an absolute `--output=...`
argument to retain evidence elsewhere.

The source vector payload alone uses `8 n d` bytes. Covariance, factorization,
and whitening use `O(d²)` state and `O(d³)` factor work. Covariance aggregation
and native row evaluation use `O(n d²)` arithmetic. RSS also includes DuckDB
query state, allocator overhead, temporary prepared and centered vectors, and
the source-table replacement used for atomic publication.
