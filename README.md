# Simple data analysis core (SDA-core)

SDA-core is a lightweight DuckDB-powered TypeScript library for tabular, SQL,
CSV, Parquet, and geospatial data analysis on Deno, Node.js, and Bun. It has one
runtime dependency: DuckDB.

Choose this package for core data loading, cleaning, joining, statistics, and
geospatial operations. For AI, vector search, Google Sheets, and data
visualization features, use the full
[simple-data-analysis library](https://github.com/nshiab/simple-data-analysis).

The library is available on
[JSR](https://jsr.io/@nshiab/simple-data-analysis-core) with its
[documentation](https://jsr.io/@nshiab/simple-data-analysis-core/doc).

AI coding assistants and agents can start with the concise
[llms.txt](https://github.com/nshiab/simple-data-analysis-core/blob/main/llms.txt)
index. The complete generated API reference is available in
[llm.md](https://github.com/nshiab/simple-data-analysis-core/blob/main/llm.md).

The library is maintained by [Nael Shiab](http://naelshiab.com/), computational
journalist and senior data producer for [CBC News](https://www.cbc.ca/news).

> [!TIP]
> To learn how to use SDA, check out
> [Code Like a Journalist](https://www.code-like-a-journalist.com/), a free and
> open-source data analysis and data visualization course in TypeScript.

## Installation

The library is available on
[JSR](https://jsr.io/@nshiab/simple-data-analysis-core) and
[NPM](https://www.npmjs.com/package/@nshiab/simple-data-analysis-core).

```bash
# Deno
deno add jsr:@nshiab/simple-data-analysis-core

# Node.js
npm i @nshiab/simple-data-analysis-core

# Bun
bun add @nshiab/simple-data-analysis-core
```

## Quick setup

To quickly set up a data project with essential folders, configurations, and
documentation for AI agents, you can use
[@nshiab/setup-data-project](https://github.com/nshiab/setup-data-project).

```bash
# Deno
deno run -A jsr:@nshiab/setup-data-project

# Node
npx @nshiab/setup-data-project

# Bun
bunx @nshiab/setup-data-project
```

## Running a data pipeline

Transformation methods are synchronous and chainable. SDA-core queues their work
and combines compatible operations into a single DuckDB statement. Async methods
such as `getData()`, `log()`, and `writeData()` execute pending work before
returning results, so only the final method in a chain needs to be awaited.

```ts
await table
  .filter("salary > 50000")
  .selectColumns(["name", "salary"])
  .log();
```

Use `await table.run()` or `await sdb.run()` to execute pending work without
reading or exporting a result. Both execute queued operations across all tables
in the database, in the order the methods were called.

## Performance benchmarks

These are end-to-end workflow comparisons.

These benchmarks compare SDA-core with raw DuckDB and popular Python and R
libraries, measuring duration and peak memory.

They were run on a MacBook Pro with an Apple M4 Max and 64 GB of memory.

<!-- benchmark-results:start -->

**Tabular versions:** @duckdb/node-api 1.5.5-r.4; DuckDB v1.5.5 (Deno 2.9.6);
SDA-core 2.0.5 (Deno 2.9.6); pandas 3.0.5 (Python 3.14.7); tidyverse 2.0.0 (R
4.6.1).

**Spatial versions:** @duckdb/node-api 1.5.5-r.4; DuckDB v1.5.5 (Deno 2.9.6);
SDA-core 2.0.5 (Deno 2.9.6); GeoPandas 1.1.4 (Python 3.14.7); sf 1.1.2 (R
4.6.1).

### Tabular workload

Using 22,051,025 temperature records (`ahccd.csv`, 1.77 GB, in
`benchmarks/data/`), we remove missing temperatures, convert dates and numbers,
save the cleaned data, then calculate average temperatures by station and decade
and export the sorted results.

| Library   |  Mean duration | Duration difference | Mean peak memory | Memory difference |
| --------- | -------------: | ------------------: | ---------------: | ----------------: |
| DuckDB    |  1.30 ± 0.03 s |               -9.7% |         2,457 MB |             -2.7% |
| SDA-core  |  1.44 ± 0.03 s |            baseline |         2,524 MB |          baseline |
| pandas    | 30.08 ± 0.07 s |            +1987.9% |         4,700 MB |            +86.2% |
| tidyverse | 82.62 ± 0.22 s |            +5634.4% |         8,178 MB |           +224.0% |

### Spatial workload

Using 335,024 Montreal public trees (`arbres-publics.csv`, 135.5 MB) and 91
neighbourhood boundaries (`quartierreferencehabitation.geojson`, 1.14 MB), both
in `benchmarks/data/`, we remove missing coordinates, create points, join trees
to neighbourhoods, then count trees per neighbourhood and export the sorted
results.

| Library   | Mean duration | Duration difference | Mean peak memory | Memory difference |
| --------- | ------------: | ------------------: | ---------------: | ----------------: |
| DuckDB    | 0.78 ± 0.00 s |               -5.1% |           255 MB |             -5.8% |
| SDA-core  | 0.82 ± 0.01 s |            baseline |           271 MB |          baseline |
| GeoPandas | 1.25 ± 0.01 s |              +51.4% |           294 MB |             +8.5% |
| sf        | 1.80 ± 0.01 s |             +118.9% |           490 MB |            +81.1% |

<!-- benchmark-results:end -->

### Focused operation benchmarks

These additional benchmarks compare Core and DuckDB on data transfer, joins,
aggregations, and JavaScript geometry updates to help track and improve
performance over time. Run `deno task benchmark-core` to regenerate these
tables. See the [benchmark methodology](benchmarks/operations/README.md) for
fixture sizes, validation, and measurement details. Peak process memory includes
setup, warm-up, the measured operation, and validation.

<!-- benchmark-operations:start -->

#### Join followed by aggregation

| Operation        |      Rows | Batch size | Implementation | Mean duration ± SD | Mean peak process memory |
| ---------------- | --------: | ---------: | -------------- | -----------------: | -----------------------: |
| Join → aggregate | 1,000,000 |          — | Core           |    12.11 ± 0.25 ms |                123.1 MiB |
| Join → aggregate | 1,000,000 |          — | DuckDB         |    11.29 ± 0.33 ms |                134.2 MiB |

#### JavaScript data transfer

`loadArray()` measures JavaScript → DuckDB; `getData()` measures DuckDB →
JavaScript. `updateWithJS()` measures the round trip with a simple numeric
increment, including Core's staging and table replacement.

| Operation      |    Rows | Batch size | Implementation | Mean duration ± SD | Mean peak process memory |
| -------------- | ------: | ---------: | -------------- | -----------------: | -----------------------: |
| loadArray()    | 100,000 |          — | Core           |     9.40 ± 0.68 ms |                202.3 MiB |
| loadArray()    | 100,000 |          — | DuckDB         |    19.80 ± 0.94 ms |                230.8 MiB |
| getData()      | 100,000 |          — | Core           |     9.29 ± 0.26 ms |                191.2 MiB |
| getData()      | 100,000 |          — | DuckDB         |    12.54 ± 0.27 ms |                209.0 MiB |
| updateWithJS() | 100,000 |       1000 | Core           |    92.45 ± 3.19 ms |                208.2 MiB |
| updateWithJS() | 100,000 |       1000 | DuckDB         |    65.89 ± 1.13 ms |                239.6 MiB |
| updateWithJS() | 100,000 |      10000 | Core           |    42.93 ± 1.05 ms |                218.6 MiB |
| updateWithJS() | 100,000 |      10000 | DuckDB         |    41.76 ± 0.81 ms |                233.5 MiB |

#### JavaScript geometry updates

Points have one position per geometry; polygons have one ring with 1,001
positions. Both implementations transfer GeoJSON through JavaScript and stage
writes. These updates add a label and shift every longitude by 0.01 degrees. A
batch size of — means all input rows at once. Attribute-only updates are also
measured and retained in the raw results; their similar timings are omitted here
to keep the table concise.

| Operation                 |    Rows | Batch size | Implementation | Mean duration ± SD | Mean peak process memory |
| ------------------------- | ------: | ---------: | -------------- | -----------------: | -----------------------: |
| Points: geometry update   | 100,000 |          — | Core           |   182.59 ± 1.02 ms |                402.4 MiB |
| Points: geometry update   | 100,000 |          — | DuckDB         |   180.20 ± 1.98 ms |                402.2 MiB |
| Points: geometry update   | 100,000 |       1000 | Core           |   252.07 ± 6.59 ms |                267.9 MiB |
| Points: geometry update   | 100,000 |       1000 | DuckDB         |   217.69 ± 2.43 ms |                245.4 MiB |
| Polygons: geometry update |   1,000 |          — | Core           |   403.35 ± 1.92 ms |                938.3 MiB |
| Polygons: geometry update |   1,000 |          — | DuckDB         |   408.62 ± 2.57 ms |               1104.8 MiB |
| Polygons: geometry update |   1,000 |        100 | Core           |   418.45 ± 2.45 ms |                747.0 MiB |
| Polygons: geometry update |   1,000 |        100 | DuckDB         |   416.90 ± 2.54 ms |                714.6 MiB |

<!-- benchmark-operations:end -->

## Building extensions

The full
[simple-data-analysis library](https://github.com/nshiab/simple-data-analysis)
is itself an extension of SDA-core. It subclasses `SimpleTable` to add AI,
Google Sheets and charting methods, then subclasses `SimpleDB` so every table
created by the database uses that extended table class.

Follow the same pattern when building an extension. To make new table methods
chainable, define them on a `SimpleTable` subclass, give them a return type of
`this` and return `this` after queuing their work. Then extend
`SimpleDB<YourTable>` and set its `tableClass` to your subclass. Methods that
create tables should always use `this.sdb.newTable()` so they also return your
extended table type.

```ts
import {
  SimpleDB as CoreDB,
  SimpleTable as CoreTable,
} from "@nshiab/simple-data-analysis-core";

class MyTable extends CoreTable {
  selectForPublication(columns: string[]): this {
    this.selectColumns(columns);
    return this;
  }
}

class MyDB extends CoreDB<MyTable> {
  constructor() {
    super();
    this.tableClass = MyTable;
  }
}

const sdb = new MyDB();
await sdb
  .newTable("articles")
  .loadData("articles.csv")
  .selectForPublication(["title", "author"])
  .log();
```

If an extension must perform asynchronous work before queuing table builders,
use `queueAsyncBarrier()`. The callback runs at the barrier's position in
database-wide program order, and builders it queues run before later chained
operations:

```ts
import { queueAsyncBarrier } from "@nshiab/simple-data-analysis-core/helpers";

class RemoteTable extends CoreTable {
  loadRemote(url: string): this {
    queueAsyncBarrier(this, {
      method: "loadRemote()",
      parameters: { url },
      execute: async () => {
        const rows = await fetch(url).then((response) => response.json()) as {
          [key: string]: unknown;
        }[];
        this.loadArray(rows);
      },
    });
    return this;
  }
}
```

The callback must await all asynchronous work that can queue builders. If it
rejects, captured builders that have not already run are discarded. Builders
already drained by an observer inside the callback remain applied;
`queueAsyncBarrier()` does not provide database rollback.

This differs from a failure while executing queued builders: during replay, the
failing table's remaining chain is aborted, but unexecuted work for other tables
is requeued for their next observation.
