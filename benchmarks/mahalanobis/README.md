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

## Recorded full sweep

The retained [results](results.json) were measured on an Apple M4 Max with 16
logical CPUs and 64 GiB RAM, using Deno 2.9.6, DuckDB 1.5.5, and one DuckDB
thread. Public-method time includes preparation, distance validation,
publication, and scratch cleanup; peak RSS covers the worker process, including
DuckDB's native allocations.

| Rows    | Dimensions | Public method (seconds) | Peak RSS (MiB) | Status    |
| ------- | ---------- | ----------------------- | -------------- | --------- |
| 100,000 | 8          | 0.220                   | 170.0          | completed |
| 20,000  | 32         | 0.339                   | 158.2          | completed |
| 4,096   | 128        | 0.889                   | 166.2          | completed |
| 1,536   | 384        | 5.362                   | 297.5          | completed |
| 1,024   | 768        | 21.472                  | 478.3          | completed |
| 2,048   | 1,536      | 118.614                 | 1,271.0        | completed |

All cases retained every row in input order with finite distances and no scratch
relations. The largest relative same-sample identity error was `6.33e-13`. Row
counts vary across the dimension sweep, so the table does not isolate dimension
scaling or establish a universal size limit. These results describe this
deterministic dataset and machine, not a runtime guarantee.
