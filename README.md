# Simple data analysis core (SDA-core)

This repository contains the core functionalities of the
[simple-data-analysis library](https://github.com/nshiab/simple-data-analysis),
an easy-to-use and high-performance TypeScript library for data analysis that
you can use with tabular, geospatial and vector data.

You'll find here a stripped-out version with only one dependency (DuckDB) that
is aimed to be light-weight and to be used in constrained environment.

The library is available on
[JSR](https://jsr.io/@nshiab/simple-data-analysis-core) with its
[documentation](https://jsr.io/@nshiab/simple-data-analysis-core/doc).

The documentation is also available as the markdown file
[llm.md](https://github.com/nshiab/simple-data-analysis-core/blob/main/llm.md),
which can be passed as context to improve the use of the library by AI coding
assistants or agents.

The library is maintained by [Nael Shiab](http://naelshiab.com/), computational
journalist and senior data producer for [CBC News](https://www.cbc.ca/news).

For the full-fledged library (with AI, dataviz, google sheet methods and more),
check the
[simple-data-analysis repository](https://github.com/nshiab/simple-data-analysis).

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

## Performance benchmarks

The benchmark suite compares this checkout with common Python and R tools and
with raw DuckDB. It runs equivalent tabular and spatial workloads in fresh
processes, checks that every implementation produces the same result, and
measures duration and peak memory. The tabular workload includes writing the
cleaned 1.6 GB dataset to disk, reflecting a common SDA workflow.

Run the complete suite and refresh the results below with one command:

```bash
deno task benchmark
```

The task expects `ahccd.csv`, `arbres-publics.csv`, and
`quartierreferencehabitation.geojson` in `benchmarks/data/`, Python with pandas
and GeoPandas, and R with tidyverse and sf. By default, it runs each
implementation three times after one warm-up and takes roughly 9–10 minutes on
an Apple M4 Max.

<!-- benchmark-results:start -->

### Tabular workload

| Library version                           | Runtime       |  Mean duration | Duration difference | Mean peak memory | Memory difference |
| ----------------------------------------- | ------------- | -------------: | ------------------: | ---------------: | ----------------: |
| @duckdb/node-api 1.5.5-r.4; DuckDB v1.5.5 | Deno 2.9.6    |  1.18 ± 0.03 s |              -63.4% |         2,457 MB |            -58.4% |
| SDA-core 2.0.0-rc.17                      | Deno 2.9.6    |  3.23 ± 0.11 s |            baseline |         5,903 MB |          baseline |
| pandas 3.0.3                              | Python 3.14.5 | 41.01 ± 0.69 s |            +1170.9% |         8,319 MB |            +40.9% |
| tidyverse 2.0.0                           | R 4.6.0       | 89.37 ± 0.74 s |            +2669.7% |         8,851 MB |            +49.9% |

### Spatial workload

| Library version                           | Runtime       | Mean duration | Duration difference | Mean peak memory | Memory difference |
| ----------------------------------------- | ------------- | ------------: | ------------------: | ---------------: | ----------------: |
| @duckdb/node-api 1.5.5-r.4; DuckDB v1.5.5 | Deno 2.9.6    | 0.75 ± 0.02 s |              -39.5% |           252 MB |            -89.0% |
| SDA-core 2.0.0-rc.17                      | Deno 2.9.6    | 1.24 ± 0.02 s |            baseline |         2,288 MB |          baseline |
| GeoPandas 1.1.3                           | Python 3.14.5 | 1.55 ± 0.02 s |              +24.7% |           865 MB |            -62.2% |
| sf 1.1.1                                  | R 4.6.0       | 4.50 ± 0.07 s |             +262.9% |           736 MB |            -67.8% |

<!-- benchmark-results:end -->

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
