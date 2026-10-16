[**Simple Data Analysis Core v2.1.16**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / removeColumns

# Method: removeColumns()

> **removeColumns**(`columns`): `this`

Removes one or more columns from this table.

## Parameters

### columns

`string` \| `string`[]

The name or an array of names of the columns to be removed.

## Returns

`this`

The table, so methods can be chained.

## Examples

```ts
// Remove 'column1' and 'column2' from the table
await table.removeColumns(["column1", "column2"]).log();
```

```ts
// Remove a single column named 'tempColumn'
await table.removeColumns("tempColumn").log();
```
