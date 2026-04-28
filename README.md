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

```bash
# Deno >= 2.2.x
deno add jsr:@nshiab/simple-data-analysis-core

# Node.js
npx jsr add @nshiab/simple-data-analysis-core

# Bun
bunx jsr add @nshiab/simple-data-analysis-core
```
