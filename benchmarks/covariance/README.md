# Covariance and Mahalanobis benchmark

This benchmark measures DuckDB covariance aggregation, TypeScript
correlation-scaled Cholesky factorization, and bulk DuckDB distance evaluation
separately. Each case has more rows than dimensions. The full cases include 384,
768, and 1,536-dimensional embedding-shaped inputs.

```sh
# Small smoke measurement
deno run -A benchmarks/covariance/run.ts --quick
# Complete dimension sweep
deno run -A benchmarks/covariance/run.ts
```

The runner records hardware and software versions, phase runtimes, process RSS
including DuckDB native allocations, explicit matrix payload sizes, and the
relative error in `sum(distance²) = (n - 1) * d`. Workers use one DuckDB thread.
Results default to `benchmarks/.work/covariance-results.json`; pass
`--output=/absolute/path.json` to retain evidence elsewhere. Each finished case
is saved immediately. Worker phase records are retained even after a timeout.

## Watchdog and measurement scope

Each case is stopped with SIGKILL after 10 minutes or sampled RSS above 8 GiB;
these are experimental stopping rules, not library limits. The runner requires
working `ps` access and samples every 250 ms. Successful cases additionally
report the operating system's process RSS high-water mark (`resourceUsage`),
covering allocations between samples. Deno's macOS value is bytes and its Linux
value is KiB; the worker normalizes these to bytes. A killed worker can only
report the sampled peak, which is a lower bound. Time is measured to process
exit and includes worker startup, input generation, all phases, and
verification.

The distance phase includes whitening, native coefficient-table creation,
centering, row evaluation, result materialization, validation, and coefficient
cleanup. The final identity aggregate and returned-result cleanup are outside
that phase, but included in total elapsed time. The matrix phase independently
refactors the covariance; the covariance phase already includes its first
factorization. This harness measures prepared inputs. Public `mahalanobis()`
input preparation and publication need separate end-to-end measurements.

## Recorded dimension sweep

The [raw results](results.json) were recorded on September 15, 2026, on an Apple
M4 Max (16 logical cores, 64 GiB RAM), with Deno 2.9.6 and DuckDB 1.5.5. Every
worker used one DuckDB thread. All cases completed within the experiment limits.

|    Rows | Features | Total elapsed |    Peak RSS | Relative distance-sum error |
| ------: | -------: | ------------: | ----------: | --------------------------: |
| 100,000 |        8 |       0.389 s |   131.6 MiB |                    6.55e-15 |
|  20,000 |       32 |       0.501 s |   123.1 MiB |                    2.00e-15 |
|   4,096 |      128 |       1.067 s |   155.5 MiB |                    1.67e-15 |
|   1,536 |      384 |       3.184 s |   319.7 MiB |                    3.95e-16 |
|   1,024 |      768 |      22.497 s |   450.4 MiB |                    2.49e-14 |
|   2,048 |    1,536 |     121.888 s | 1,224.0 MiB |                    6.32e-13 |

These single-run observations demonstrate the cost of increasing dimensions;
they do not promise the same runtime for other data or hardware. The largest
case spent 36.3 seconds preparing covariance and 84.4 seconds evaluating
distances. The initial sweep's macOS RSS conversion error was corrected and the
whole sweep rerun before recording this evidence.

## Memory and numerical limits

Covariance aggregation and distance evaluation each perform `O(n d²)` work.
Cholesky and triangular whitening construction require `O(d³)` work. The live
model contains covariance and Cholesky matrices (two `8 d²`-byte arrays), plus
four `8 d`-byte vectors. Refactoring adds two matrices and a scale vector; its
transient correlation matrix adds another `8 d²` bytes. During initial
covariance preparation, the original matrix is also live while factorization
copies it. Whitening adds one `8 d²`-byte JavaScript array and a native table of
that payload size. Appending explicitly uses `DOUBLE[d]`, one row at a time.
Native centered vectors add `8 n d` bytes; aggregate/output state is `O(n)`.
Numeric payload counts exclude allocator overhead, object wrappers, temporary
chunks, query state, and pending JavaScript garbage; RSS includes these costs.

The evaluator materializes centering once per observation and joins the native
whitening rows to it, aggregating dot-product squares by observation. Source
vectors stay in DuckDB. SQL contains only `O(d)` centroid literals; the former
`O(d²)` matrix literal inside a repeated lambda has been removed. A same-host
600-row, 32-dimensional microcheck improved the distance phase from 100.70 ms to
6.45 ms while retaining exact agreement with the distance-sum identity. This
microcheck does not establish high-dimensional feasibility; use the full sweep.

Covariance is sample covariance (`n - 1`). Anchor subtraction preserves small
representable deviations at large offsets; per-feature observed-magnitude
scaling avoids overflow of cross-product sums before division by `n - 1`.
Factorization uses correlation space so ordinary changes of feature units do not
change the instability criterion. A Hager condition estimate augmented by
LAPACK's alternating-vector probe rejects estimated reciprocal condition at or
below `64 d ε`; the estimate is not an exact condition number. See the
[LAPACK DLACON reference](https://www.netlib.org/lapack/double/dlacon.f).
Constant, dependent, or unstable dimensions throw; no regularization or
pseudoinverse is applied. Inputs must have `n > d`. DOUBLE cannot represent
arbitrarily small variance, arbitrarily large covariance, or distinctions
already lost when large integers/decimals or offset data are converted to it.
