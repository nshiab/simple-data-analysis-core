[**Simple Data Analysis Core v2.1.18**](../index.md)

***

[Simple Data Analysis Core](../globals.md) / queryDB

# Function: queryDB()

> **queryDB**(`simple`, `query`, `options`): `Promise`\<`object`[] \| `null`\>

Defined in: [src/helpers/queryDB.ts:55](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.18/src/helpers/queryDB.ts#L55)

Executes SQL for a table or database after flushing all queued operations.
Starts the database on first use and applies its SQL logging settings.
Extension authors can construct `options` with `mergeOptions()`.

## Parameters

### simple

[`SimpleTable`](../classes/SimpleTable.md) \| [`SimpleDB`](../classes/SimpleDB.md)\<[`SimpleTable`](../classes/SimpleTable.md)\>

The table or database that owns the query.

### query

`string`

The SQL statement to execute.

### options

Query execution and diagnostic settings.

#### charsToLog

`number` \| `undefined`

The caller's per-cell display limit, retained for compatibility.

#### method

`string` \| `null`

The calling method used for diagnostics, or `null`.

#### noClean?

`boolean`

Whether to preserve the SQL text without cleaning it.

#### parameters

\{\[`key`: `string`\]: `unknown`; \} \| `null`

Arguments included in error diagnostics, or `null`.

#### returnData

`boolean`

Whether to convert and return the result rows.

#### rowsToLog

`number`

The caller's row-display limit, retained for compatibility.

#### table

`string` \| `null`

The table name used for diagnostics, or `null`.

#### values?

`DuckDBValue`[]

DuckDB-native values bound to SQL placeholders, in order.

## Returns

`Promise`\<`object`[] \| `null`\>

Converted rows when `returnData` is true, otherwise `null`.

## Example

```ts
import { mergeOptions, queryDB, quoteIdentifier } from "@nshiab/simple-data-analysis-core/helpers";

await table.loadArray([{ answer: 0 }]).run();
const query = `UPDATE ${quoteIdentifier(table.name)} SET answer = ?`;
await queryDB(table, query, mergeOptions(table, {
  table: table.name,
  method: "example()",
  parameters: null,
  values: [42],
}));
await table.log();
```
