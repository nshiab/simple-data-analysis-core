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

### Tabular workload

Using 22,051,025 temperature records (`ahccd.csv`, 1.77 GB, in
`benchmarks/data/`), we remove missing temperatures, convert dates and numbers,
save the cleaned data, then calculate average temperatures by station and decade
and export the sorted results.

| Library version                           | Runtime       |  Mean duration | Duration difference | Mean peak memory | Memory difference |
| ----------------------------------------- | ------------- | -------------: | ------------------: | ---------------: | ----------------: |
| @duckdb/node-api 1.5.5-r.4; DuckDB v1.5.5 | Deno 2.9.6    |  1.14 ± 0.01 s |               -8.2% |         2,372 MB |             -7.1% |
| SDA-core 2.0.0                            | Deno 2.9.6    |  1.24 ± 0.03 s |            baseline |         2,554 MB |          baseline |
| pandas 3.0.5                              | Python 3.14.7 | 28.21 ± 0.01 s |            +2168.6% |         4,699 MB |            +84.0% |
| tidyverse 2.0.0                           | R 4.6.1       | 78.81 ± 0.17 s |            +6236.7% |         8,178 MB |           +220.2% |

### Spatial workload

Using 335,024 Montreal public trees (`arbres-publics.csv`, 135.5 MB) and 91
neighbourhood boundaries (`quartierreferencehabitation.geojson`, 1.14 MB), both
in `benchmarks/data/`, we remove missing coordinates, create points, join trees
to neighbourhoods, then count trees per neighbourhood and export the sorted
results.

| Library version                           | Runtime       | Mean duration | Duration difference | Mean peak memory | Memory difference |
| ----------------------------------------- | ------------- | ------------: | ------------------: | ---------------: | ----------------: |
| @duckdb/node-api 1.5.5-r.4; DuckDB v1.5.5 | Deno 2.9.6    | 0.72 ± 0.01 s |               -3.4% |           255 MB |             -7.2% |
| SDA-core 2.0.0                            | Deno 2.9.6    | 0.75 ± 0.01 s |            baseline |           275 MB |          baseline |
| GeoPandas 1.1.4                           | Python 3.14.7 | 1.11 ± 0.00 s |              +48.7% |           292 MB |             +6.0% |
| sf 1.1.2                                  | R 4.6.1       | 1.58 ± 0.00 s |             +111.2% |           489 MB |            +78.0% |

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
| Join → aggregate | 1,000,000 |          — | Core           |    10.65 ± 0.12 ms |                120.6 MiB |
| Join → aggregate | 1,000,000 |          — | DuckDB         |     9.92 ± 0.09 ms |                135.4 MiB |

#### JavaScript data transfer

| Operation      |    Rows | Batch size | Implementation | Mean duration ± SD | Mean peak process memory |
| -------------- | ------: | ---------: | -------------- | -----------------: | -----------------------: |
| loadArray()    | 100,000 |          — | Core           |     5.35 ± 0.05 ms |                201.9 MiB |
| loadArray()    | 100,000 |          — | DuckDB         |    17.49 ± 0.33 ms |                230.4 MiB |
| getData()      | 100,000 |          — | Core           |     8.14 ± 0.03 ms |                189.5 MiB |
| getData()      | 100,000 |          — | DuckDB         |    11.39 ± 0.21 ms |                207.6 MiB |
| updateWithJS() | 100,000 |       1000 | Core           |   104.51 ± 0.52 ms |                203.1 MiB |
| updateWithJS() | 100,000 |       1000 | DuckDB         |    54.32 ± 0.49 ms |                238.8 MiB |
| updateWithJS() | 100,000 |      10000 | Core           |    69.33 ± 0.17 ms |                248.1 MiB |
| updateWithJS() | 100,000 |      10000 | DuckDB         |    34.68 ± 1.49 ms |                194.5 MiB |

#### JavaScript geometry updates

Points have one position per geometry; polygons have one ring with 1,001
positions. Both implementations transfer GeoJSON through JavaScript and stage
writes. Attribute updates add a label; geometry updates also shift every
longitude by 0.01 degrees. A batch size of — means all input rows at once.

| Operation                  |    Rows | Batch size | Implementation | Mean duration ± SD | Mean peak process memory |
| -------------------------- | ------: | ---------: | -------------- | -----------------: | -----------------------: |
| Points: attribute update   | 100,000 |          — | Core           |   154.94 ± 3.02 ms |                416.8 MiB |
| Points: attribute update   | 100,000 |          — | DuckDB         |   151.04 ± 1.23 ms |                383.1 MiB |
| Points: attribute update   | 100,000 |       1000 | Core           |   233.66 ± 4.40 ms |                256.1 MiB |
| Points: attribute update   | 100,000 |       1000 | DuckDB         |   178.60 ± 3.19 ms |                240.4 MiB |
| Points: geometry update    | 100,000 |          — | Core           |   161.77 ± 1.30 ms |                395.4 MiB |
| Points: geometry update    | 100,000 |          — | DuckDB         |   161.38 ± 2.21 ms |                394.1 MiB |
| Points: geometry update    | 100,000 |       1000 | Core           |   243.26 ± 2.19 ms |                274.4 MiB |
| Points: geometry update    | 100,000 |       1000 | DuckDB         |   193.11 ± 4.12 ms |                247.4 MiB |
| Polygons: attribute update |   1,000 |          — | Core           |   368.42 ± 3.01 ms |                931.7 MiB |
| Polygons: attribute update |   1,000 |          — | DuckDB         |   369.60 ± 3.25 ms |               1058.3 MiB |
| Polygons: attribute update |   1,000 |        100 | Core           |   516.56 ± 4.61 ms |                724.7 MiB |
| Polygons: attribute update |   1,000 |        100 | DuckDB         |   372.24 ± 2.06 ms |                671.7 MiB |
| Polygons: geometry update  |   1,000 |          — | Core           |   373.57 ± 1.22 ms |                944.4 MiB |
| Polygons: geometry update  |   1,000 |          — | DuckDB         |   371.63 ± 4.41 ms |               1043.6 MiB |
| Polygons: geometry update  |   1,000 |        100 | Core           |   518.79 ± 1.63 ms |                730.9 MiB |
| Polygons: geometry update  |   1,000 |        100 | DuckDB         |   377.91 ± 2.83 ms |                673.6 MiB |

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
