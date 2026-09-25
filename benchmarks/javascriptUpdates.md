# JavaScript update copy benchmark

This benchmark compares Core before and after removing redundant copies from
JavaScript updates. It exercises complete operations, including JavaScript
conversion and callback execution, rather than timing only the appender.

## Reproduce

From the repository root, extract the unchanged source into the ignored work
folder and compare it with the current source:

```sh
mkdir -p benchmarks/.work/copy-performance/baseline
git archive a644a62 src | tar -x -C benchmarks/.work/copy-performance/baseline
deno run -A benchmarks/javascriptUpdates.ts ./.work/copy-performance/baseline/src/ > benchmarks/.work/copy-performance/comparison.json
```

Omit the argument to measure only the current source. The optional source path
is relative to the benchmark file and must name the `src/` directory with a
trailing slash. Both implementations use the current repository's dependency
versions.

Each fixture contains 100,000 rows. The narrow fixture has an integer ID and a
double value; the wide fixture also has a 512-character string per row.
Normalization adds a four-element vector. JavaScript updates and generated
columns use batches of 1,000 rows. Generation uses an immediate deterministic
callback, with no model, network, or response cache involved.

Each variant gets two warm-ups and seven measured runs, alternating before/after
order. Every operation starts with a fresh in-memory database with one thread, a
1 GB memory limit, and UTC. Timing excludes database startup, fixture creation,
and validation. SQL checks every result and the retained payload after every
run. JSON output includes all samples and runtime versions. This measures
elapsed time, not memory usage.

## Local results

Measured on macOS arm64 with Deno 2.9.6, DuckDB 1.5.5, and
`@duckdb/node-api@1.5.5-r.5`. Baseline commit: `a644a62`.

| Operation                             | Fixture | Before median | After median | Time reduction |
| ------------------------------------- | ------- | ------------: | -----------: | -------------: |
| `updateWithJS`                        | Narrow  |      69.75 ms |     49.17 ms |          29.5% |
| `updateWithJS`                        | Wide    |     133.35 ms |    108.90 ms |          18.3% |
| `updateColumnsWithJS`                 | Narrow  |     109.35 ms |     82.20 ms |          24.8% |
| `updateColumnsWithJS`                 | Wide    |     119.77 ms |     93.47 ms |          22.0% |
| `normalizeVector` (unchanged control) | Narrow  |      36.94 ms |     36.99 ms |          -0.2% |
| `normalizeVector` (unchanged control) | Wide    |      49.76 ms |     49.46 ms |           0.6% |

These are local measurements, not cross-platform guarantees. In particular,
external AI latency can dwarf the generated-column savings. Normalization's wide
fixture costs more, but this comparison does not isolate the cost of its
snapshot from other work on the additional column.

## Changes and retained behavior

- `updateWithJS` appends matching native batches directly into its result table.
  JSON/geometry conversion and differing batch schemas retain the SQL staging
  path. Once generation finishes, a qualified DROP and RENAME publishes the
  result without another full-table copy. Callback and value-conversion failures
  still precede publication; publication failures do not roll back.
- `updateColumnsWithJS`, used by SDA's AI methods, appends generated values
  directly into the result-column table. It retains all-null batch inference and
  rejects changes to non-null output types.
- The generated-column source snapshot stays: it preserves stable row identity,
  duplicate rows, callback isolation, and untouched native SQL values. Numeric
  feature snapshots and their index-preserving publication are unchanged.
- No recovery copy is added to scalar `loadArray`. AI response caches and
  temporary output-file publication remain useful and are unchanged.

The extension consumes this helper from Core. It needs a released Core version
and dependency update to receive these improvements; the benchmark does not
imply that its currently pinned release already includes them.
