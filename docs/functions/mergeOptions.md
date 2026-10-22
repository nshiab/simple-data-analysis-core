[**Simple Data Analysis Core v2.1.16**](../index.md)

***

[Simple Data Analysis Core](../globals.md) / mergeOptions

# Function: mergeOptions()

> **mergeOptions**(`simple`, `options`): `object`

Defined in: [src/helpers/mergeOptions.ts:47](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/helpers/mergeOptions.ts#L47)

Combines a table or database's logging defaults with query-specific options.
Use this helper with `queryDB()` when implementing an extension.

## Parameters

### simple

The logging defaults from a table or database.

#### charsToLog

`number` \| `undefined`

The default maximum characters to display per cell.

#### rowsToLog

`number`

The default number of rows to display.

### options

Query-specific settings, which take precedence over defaults.

#### method

`string` \| `null`

The calling method used for diagnostics, or `null`.

#### noClean?

`boolean`

Whether to preserve the SQL text without cleaning it.

#### parameters

\{\[`key`: `string`\]: `unknown`; \} \| `null`

Arguments included in error diagnostics, or `null`.

#### returnData?

`boolean`

Whether to return converted rows. Defaults to false.

#### rowsToLog?

`number`

Overrides the default number of displayed rows.

#### table

`string` \| `null`

The table name used for diagnostics, or `null`.

#### values?

`DuckDBValue`[]

DuckDB-native values bound to SQL placeholders, in order.

## Returns

`object`

The merged query options without modifying either argument.

### charsToLog

> **charsToLog**: `number` \| `undefined`

### method

> **method**: `string` \| `null`

### noClean?

> `optional` **noClean?**: `boolean`

### parameters

> **parameters**: \{\[`key`: `string`\]: `unknown`; \} \| `null`

### returnData

> **returnData**: `boolean`

### rowsToLog

> **rowsToLog**: `number`

### table

> **table**: `string` \| `null`

### values?

> `optional` **values?**: `DuckDBValue`[]

## Example

```ts
import { mergeOptions } from "@nshiab/simple-data-analysis-core/helpers";

const options = mergeOptions(sdb, {
  table: null,
  method: "example()",
  parameters: null,
  returnData: true,
});
console.log(options.rowsToLog, options.returnData);
```
