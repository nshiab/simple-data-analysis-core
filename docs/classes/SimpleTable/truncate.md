[**Simple Data Analysis Core v2.1.17**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / truncate

# Method: truncate()

> **truncate**(`column`, `length`): `this`

Defined in: [src/class/SimpleTable.ts:5002](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.17/src/class/SimpleTable.ts#L5002)

Truncates string values in a specified column to a maximum number of characters.

## Parameters

### column

`string`

The column name containing strings to be truncated.

### length

`number`

The maximum number of characters to keep.

## Returns

`this`

The table, so methods can be chained.

## Examples

```ts
// Truncate strings in 'description' column to 50 characters
await table.truncate("description", 50).log();
```

```ts
// Truncate strings in 'name' column to 10 characters
await table.truncate("name", 10).log();
```
