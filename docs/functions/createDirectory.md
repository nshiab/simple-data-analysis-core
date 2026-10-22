[**Simple Data Analysis Core v2.1.16**](../index.md)

***

[Simple Data Analysis Core](../globals.md) / createDirectory

# Function: createDirectory()

> **createDirectory**(`path`): `void`

Defined in: [src/helpers/createDirectory.ts:17](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/helpers/createDirectory.ts#L17)

Creates missing directories in an output path, including parent directories.
Non-hidden path segments containing a dot are treated as filenames and omitted.

## Parameters

### path

`string`

An output file path or a directory path without dotted segments.

## Returns

`void`

Nothing. Existing directories are left unchanged.

## Example

```ts
import { createDirectory } from "@nshiab/simple-data-analysis-core/helpers";
createDirectory("output/tables/results.csv"); // Creates output/tables.
```
