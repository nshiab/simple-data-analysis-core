# Running the Core benchmarks

Run `deno task benchmark-core` to update the tables below. The existing
`deno task benchmark` continues to update only the tabular and spatial results.
These generated fixtures need no downloads: one million rows for the join and
100,000 rows for each transfer. Use `--iterations=5` for more repetitions or
`--rows=10000` to override the fixture sizes for a quick run.

Core's public methods are compared with equivalent handwritten DuckDB
operations. Both use warm connections with one thread, a 1 GB memory limit, UTC,
compressed in-memory storage and disabled external-file caching. Duration
excludes startup, fixture creation, warm-up and correctness validation.
`loadArray()` starts with an already-created JS array; `getData()` includes
reading and JS object conversion. Batched updates increment a numeric column in
JavaScript on both implementations; the native baseline uses a row appender and
rowid ranges. This compares complete transfer operations, not an isolated SQL
overhead. Full output rows are checked after both the warm-up and measured
operation.

**Memory is whole-process peak RSS**, including setup, warm-up and validation,
not memory attributable solely to the timed operation. The tables report its
mean across fresh processes; duration variation is the population standard
deviation. Implementation order alternates between repetitions. Like the
existing benchmark command, this command requires macOS for `/usr/bin/time -l`.
Results are local warm-run measurements, not cross-platform guarantees. Raw
observations and runtime versions are retained in
`benchmarks/.work/operations.json`.
