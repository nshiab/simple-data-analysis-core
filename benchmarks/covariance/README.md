# Covariance and Mahalanobis benchmark

This benchmark measures the DuckDB covariance aggregation, the TypeScript
correlation-scaled Cholesky factor, and bulk DuckDB distance evaluation
separately. Each case has more rows than dimensions. The full cases include 384,
768, and 1,536-dimensional embedding-shaped inputs.

Run a smoke measurement with:

```sh
deno run -A benchmarks/covariance/run.ts --quick
```

Run the complete dimension sweep with:

```sh
deno run -A benchmarks/covariance/run.ts
```

The runner records hardware and software versions, phase runtimes, peak process
RSS (including DuckDB native allocations), the explicit matrix-state size, and
the relative error in `sum(distance²) = (n - 1) * d`. It terminates an
individual case after 10 minutes or when sampled RSS exceeds 8 GiB. Results
default to `benchmarks/.work/covariance-results.json`; pass
`--output=/absolute/path.json` to retain evidence elsewhere.

Covariance aggregation performs `O(n d²)` products. The covariance, Cholesky,
and whitening arrays consume `O(d²)` memory. The worker reports source vector
payload, live model and refactor arrays, temporary whitening storage, and both
UTF-8 and JavaScript UTF-16 sizes of the generated SQL. DuckDB and JavaScript
object overhead remain visible in peak RSS. Bulk evaluation keeps vectors in
DuckDB, but its generated whitening expression also contains `O(d²)` numeric
coefficients. Planning and parsing that expression can therefore become material
at embedding dimensions even when execution memory remains bounded. The
benchmark reports those costs in the distance phase rather than treating summary
matrices as automatically small.
