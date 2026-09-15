# Local graph benchmark observations

Measured 2026-09-12 with Deno 2.9.6, DuckDB v1.5.5, darwin aarch64, one DuckDB
thread, and a 1 GB memory limit. Each case has 3 warm repetitions. Profiling is
enabled during timing. See [the methodology](README.md) for included work and
memory limitations. These are small diagnostic workloads, not scalability or
cross-library claims.

The dense graph has two differently identified, oppositely stored connections
per unordered node pair. In `findCycles(..., "both")`, these remain distinct
undirected connections, so its output can be much larger than outgoing cycles.
Topological sorting uses a dense DAG instead of that cyclic graph.

| Method              | Variant   | Shape      | Nodes | Result rows | Median ms | Max engine buffer MiB | Median scanned rows |
| ------------------- | --------- | ---------- | ----: | ----------: | --------: | --------------------: | ------------------: |
| neighbors           | default   | deep-chain |   128 |           1 |      1.49 |                  3.24 |                 127 |
| neighbors           | default   | branching  |   127 |           2 |      1.23 |                  3.24 |                 126 |
| neighbors           | default   | dense      |     7 |           6 |      1.15 |                  3.24 |                  42 |
| reachable           | default   | deep-chain |   128 |         128 |     10.55 |                  5.02 |                 127 |
| reachable           | default   | branching  |   127 |         127 |      2.13 |                  7.73 |                 126 |
| reachable           | default   | dense      |     7 |           7 |      1.47 |                  4.99 |                  42 |
| distances           | default   | deep-chain |   128 |         128 |     26.93 |                 11.78 |                 127 |
| distances           | default   | branching  |   127 |         127 |      3.03 |                 15.53 |                 126 |
| distances           | default   | dense      |     7 |           7 |      2.05 |                  7.78 |                  42 |
| distances           | weighted  | deep-chain |   128 |         128 |     26.97 |                 11.78 |                 127 |
| distances           | weighted  | branching  |   127 |         127 |      3.03 |                 15.53 |                 126 |
| distances           | weighted  | dense      |     7 |           7 |      2.07 |                  7.78 |                  42 |
| shortestPath        | default   | deep-chain |   128 |         127 |    104.08 |                 46.60 |                 127 |
| shortestPath        | default   | branching  |   127 |           6 |      9.18 |                 36.79 |                 126 |
| shortestPath        | default   | dense      |     7 |           1 |      5.33 |                 31.54 |                  42 |
| shortestPath        | weighted  | deep-chain |   128 |         127 |    103.07 |                 38.06 |                 127 |
| shortestPath        | weighted  | branching  |   127 |           6 |      8.98 |                 32.79 |                 126 |
| shortestPath        | weighted  | dense      |     7 |           1 |      5.38 |                 28.78 |                  42 |
| paths               | default   | deep-chain |   128 |         127 |     48.61 |                 30.95 |                 127 |
| paths               | default   | branching  |   127 |           6 |      5.45 |                 25.70 |                 126 |
| paths               | default   | dense      |     7 |       1,631 |      6.70 |                 22.96 |                  42 |
| paths               | weighted  | deep-chain |   128 |         127 |     48.56 |                 30.95 |                 127 |
| paths               | weighted  | branching  |   127 |           6 |      5.27 |                 25.70 |                 126 |
| paths               | weighted  | dense      |     7 |       1,631 |      6.41 |                 22.96 |                  42 |
| connectedComponents | default   | deep-chain |   128 |         128 |     26.28 |                 16.67 |                 127 |
| connectedComponents | default   | branching  |   127 |         127 |      2.96 |                 20.42 |                 126 |
| connectedComponents | default   | dense      |     7 |           7 |      2.00 |                  9.89 |                  42 |
| connectedComponents | strong    | deep-chain |   128 |         128 |     11.89 |                 15.97 |                 127 |
| connectedComponents | strong    | branching  |   127 |         127 |      2.21 |                 15.55 |                 126 |
| connectedComponents | strong    | dense      |     7 |           7 |      1.78 |                  6.74 |                  42 |
| degree              | default   | deep-chain |   128 |         128 |      1.22 |                 19.30 |                 127 |
| degree              | default   | branching  |   127 |         127 |      1.29 |                 14.04 |                 126 |
| degree              | default   | dense      |     7 |           7 |      1.15 |                  6.82 |                  42 |
| degree              | neighbors | deep-chain |   128 |         128 |      1.32 |                 19.32 |                 127 |
| degree              | neighbors | branching  |   127 |         127 |      1.47 |                 13.83 |                 126 |
| degree              | neighbors | dense      |     7 |           7 |      1.45 |                  6.83 |                  42 |
| degree              | weighted  | deep-chain |   128 |         128 |      1.72 |                 19.30 |                 127 |
| degree              | weighted  | branching  |   127 |         127 |      1.57 |                 14.04 |                 126 |
| degree              | weighted  | dense      |     7 |           7 |      1.29 |                  6.82 |                  42 |
| commonNeighbors     | default   | deep-chain |   128 |           0 |      1.20 |                  5.74 |                 127 |
| commonNeighbors     | default   | branching  |   127 |           0 |      1.24 |                  5.74 |                 126 |
| commonNeighbors     | default   | dense      |     7 |           5 |      1.13 |                  5.76 |                  42 |
| findCycles          | default   | deep-chain |   128 |           0 |     28.59 |                 18.34 |                 127 |
| findCycles          | default   | branching  |   127 |           0 |      3.12 |                 17.12 |                 126 |
| findCycles          | default   | dense      |     7 |      13,692 |     14.87 |                 25.11 |                  42 |
| findCycles          | incoming  | deep-chain |   128 |           0 |      1.99 |                  7.81 |                 127 |
| findCycles          | incoming  | branching  |   127 |           0 |      1.68 |                  7.81 |                 126 |
| findCycles          | incoming  | dense      |     7 |      13,692 |     15.59 |                 25.11 |                  42 |
| findCycles          | both      | deep-chain |   128 |           0 |     29.66 |                 19.65 |                 127 |
| findCycles          | both      | branching  |   127 |           0 |      3.27 |                 18.43 |                 126 |
| findCycles          | both      | dense      |     7 |     531,762 |    456.77 |                321.89 |                  42 |
| findCycles          | weighted  | deep-chain |   128 |           0 |     28.50 |                 18.34 |                 127 |
| findCycles          | weighted  | branching  |   127 |           0 |      2.86 |                 17.12 |                 126 |
| findCycles          | weighted  | dense      |     7 |      13,692 |     15.07 |                 25.11 |                  42 |
| topologicalSort     | default   | deep-chain |   128 |         128 |     51.82 |                 26.87 |                 127 |
| topologicalSort     | default   | branching  |   127 |         127 |     50.84 |                 26.87 |                 126 |
| topologicalSort     | default   | dense-dag  |     7 |           7 |      4.56 |                 12.71 |                  21 |

## Query-plan observations

The following operator names come from the actual dense materialization
profiles, not from counting SQL calls. Full trees, timings, and cardinalities
are retained in the generated JSON profiles described in the methodology.

| Method              | Variant   | Selected observed operators                                                                                                                                                                                                                                                                                        |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| neighbors           | default   | `COLUMN_DATA_SCAN` ×1, `HASH_GROUP_BY` ×1, `HASH_JOIN` ×1, `ORDER_BY` ×1, `TABLE_SCAN` ×1                                                                                                                                                                                                                          |
| reachable           | default   | `COLUMN_DATA_SCAN` ×1, `CTE_SCAN` ×3, `HASH_GROUP_BY` ×1, `HASH_JOIN` ×2, `ORDER_BY` ×1, `RECURSIVE_CTE` ×1, `RECURSIVE_CTE_SCAN` ×1, `TABLE_SCAN` ×1                                                                                                                                                              |
| distances           | default   | `COLUMN_DATA_SCAN` ×1, `CTE_SCAN` ×3, `HASH_GROUP_BY` ×2, `HASH_JOIN` ×3, `ORDER_BY` ×1, `RECURSIVE_CTE` ×1, `RECURSIVE_CTE_SCAN` ×1, `RECURSIVE_RECURRING_CTE_SCAN` ×1, `TABLE_SCAN` ×1                                                                                                                           |
| distances           | weighted  | `COLUMN_DATA_SCAN` ×1, `CTE_SCAN` ×3, `HASH_GROUP_BY` ×2, `HASH_JOIN` ×3, `ORDER_BY` ×1, `RECURSIVE_CTE` ×1, `RECURSIVE_CTE_SCAN` ×1, `RECURSIVE_RECURRING_CTE_SCAN` ×1, `TABLE_SCAN` ×1                                                                                                                           |
| shortestPath        | default   | `CTE_SCAN` ×19, `DELIM_SCAN` ×1, `DUMMY_SCAN` ×2, `HASH_GROUP_BY` ×3, `HASH_JOIN` ×13, `NESTED_LOOP_JOIN` ×1, `ORDER_BY` ×1, `RECURSIVE_CTE` ×3, `RECURSIVE_CTE_SCAN` ×3, `RECURSIVE_RECURRING_CTE_SCAN` ×1, `RIGHT_DELIM_JOIN` ×1, `STREAMING_WINDOW` ×1, `TABLE_SCAN` ×1, `WINDOW` ×1                            |
| shortestPath        | weighted  | `CTE_SCAN` ×17, `DELIM_SCAN` ×1, `DUMMY_SCAN` ×2, `HASH_GROUP_BY` ×3, `HASH_JOIN` ×12, `NESTED_LOOP_JOIN` ×1, `ORDER_BY` ×1, `PIECEWISE_MERGE_JOIN` ×1, `RECURSIVE_CTE` ×3, `RECURSIVE_CTE_SCAN` ×3, `RECURSIVE_RECURRING_CTE_SCAN` ×1, `RIGHT_DELIM_JOIN` ×1, `STREAMING_WINDOW` ×1, `TABLE_SCAN` ×1, `WINDOW` ×1 |
| paths               | default   | `CTE_SCAN` ×10, `DELIM_SCAN` ×1, `DUMMY_SCAN` ×2, `HASH_GROUP_BY` ×2, `HASH_JOIN` ×7, `NESTED_LOOP_JOIN` ×1, `ORDER_BY` ×1, `RECURSIVE_CTE` ×2, `RECURSIVE_CTE_SCAN` ×2, `RIGHT_DELIM_JOIN` ×1, `STREAMING_WINDOW` ×1, `TABLE_SCAN` ×1, `WINDOW` ×1                                                                |
| paths               | weighted  | `CTE_SCAN` ×10, `DELIM_SCAN` ×1, `DUMMY_SCAN` ×2, `HASH_GROUP_BY` ×2, `HASH_JOIN` ×7, `NESTED_LOOP_JOIN` ×1, `ORDER_BY` ×1, `RECURSIVE_CTE` ×2, `RECURSIVE_CTE_SCAN` ×2, `RIGHT_DELIM_JOIN` ×1, `STREAMING_WINDOW` ×1, `TABLE_SCAN` ×1, `WINDOW` ×1                                                                |
| connectedComponents | default   | `CTE_SCAN` ×7, `HASH_GROUP_BY` ×3, `HASH_JOIN` ×3, `ORDER_BY` ×1, `RECURSIVE_CTE` ×1, `RECURSIVE_CTE_SCAN` ×1, `RECURSIVE_RECURRING_CTE_SCAN` ×1, `TABLE_SCAN` ×1, `WINDOW` ×1                                                                                                                                     |
| connectedComponents | strong    | `CTE_SCAN` ×9, `HASH_GROUP_BY` ×3, `HASH_JOIN` ×4, `ORDER_BY` ×1, `RECURSIVE_CTE` ×1, `RECURSIVE_CTE_SCAN` ×1, `TABLE_SCAN` ×1, `WINDOW` ×1                                                                                                                                                                        |
| degree              | default   | `CTE_SCAN` ×4, `HASH_GROUP_BY` ×3, `HASH_JOIN` ×2, `ORDER_BY` ×1, `TABLE_SCAN` ×1                                                                                                                                                                                                                                  |
| degree              | neighbors | `CTE_SCAN` ×4, `HASH_GROUP_BY` ×3, `HASH_JOIN` ×2, `ORDER_BY` ×1, `TABLE_SCAN` ×1                                                                                                                                                                                                                                  |
| degree              | weighted  | `CTE_SCAN` ×4, `HASH_GROUP_BY` ×3, `HASH_JOIN` ×2, `ORDER_BY` ×1, `TABLE_SCAN` ×1                                                                                                                                                                                                                                  |
| commonNeighbors     | default   | `COLUMN_DATA_SCAN` ×1, `HASH_GROUP_BY` ×1, `HASH_JOIN` ×1, `ORDER_BY` ×1, `TABLE_SCAN` ×1                                                                                                                                                                                                                          |
| findCycles          | default   | `CTE_SCAN` ×2, `DELIM_SCAN` ×1, `DUMMY_SCAN` ×1, `HASH_GROUP_BY` ×2, `HASH_JOIN` ×2, `ORDER_BY` ×1, `RECURSIVE_CTE` ×1, `RECURSIVE_CTE_SCAN` ×1, `RIGHT_DELIM_JOIN` ×1, `STREAMING_WINDOW` ×1, `TABLE_SCAN` ×1, `WINDOW` ×1                                                                                        |
| findCycles          | incoming  | `CTE_SCAN` ×2, `DELIM_SCAN` ×1, `DUMMY_SCAN` ×1, `HASH_GROUP_BY` ×2, `HASH_JOIN` ×2, `ORDER_BY` ×1, `RECURSIVE_CTE` ×1, `RECURSIVE_CTE_SCAN` ×1, `RIGHT_DELIM_JOIN` ×1, `STREAMING_WINDOW` ×1, `TABLE_SCAN` ×1, `WINDOW` ×1                                                                                        |
| findCycles          | both      | `CTE_SCAN` ×4, `DELIM_SCAN` ×1, `DUMMY_SCAN` ×1, `HASH_GROUP_BY` ×2, `HASH_JOIN` ×2, `ORDER_BY` ×1, `RECURSIVE_CTE` ×1, `RECURSIVE_CTE_SCAN` ×1, `RIGHT_DELIM_JOIN` ×1, `STREAMING_WINDOW` ×1, `TABLE_SCAN` ×1, `WINDOW` ×1                                                                                        |
| findCycles          | weighted  | `CTE_SCAN` ×2, `DELIM_SCAN` ×1, `DUMMY_SCAN` ×1, `HASH_GROUP_BY` ×2, `HASH_JOIN` ×2, `ORDER_BY` ×1, `RECURSIVE_CTE` ×1, `RECURSIVE_CTE_SCAN` ×1, `RIGHT_DELIM_JOIN` ×1, `STREAMING_WINDOW` ×1, `TABLE_SCAN` ×1, `WINDOW` ×1                                                                                        |
| topologicalSort     | default   | `COLUMN_DATA_SCAN` ×2, `CTE_SCAN` ×7, `DELIM_SCAN` ×2, `HASH_GROUP_BY` ×4, `HASH_JOIN` ×4, `LEFT_DELIM_JOIN` ×2, `ORDER_BY` ×1, `RECURSIVE_CTE` ×1, `RECURSIVE_CTE_SCAN` ×1, `STREAMING_WINDOW` ×2, `TABLE_SCAN` ×1, `UNGROUPED_AGGREGATE` ×3                                                                      |

Scanned-row metrics alone do not measure recursive state or output growth.
Inspect grouping, recursive state, sort/window work, result cardinality, and
engine memory together. No timing threshold is asserted by unit tests.
