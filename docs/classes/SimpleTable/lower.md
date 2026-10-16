[**Simple Data Analysis Core v2.1.16**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / lower

# Method: lower()

> **lower**(`columns`): `this`

Converts string values in the specified columns to lowercase.

## Parameters

### columns

`string` \| `string`[]

The column name or an array of column names to be converted to lowercase.

## Returns

`this`

The table, so methods can be chained.

## Examples

```ts
// Convert strings in 'column1' to lowercase
await table.lower("column1").log();
```

```ts
// Convert strings in 'column1' and 'column2' to lowercase
await table.lower(["column1", "column2"]).log();
```
