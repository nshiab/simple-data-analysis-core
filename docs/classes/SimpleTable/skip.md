[**Simple Data Analysis Core v2.1.23**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / skip

# Method: skip()

> **skip**(`count`): `this`

Defined in: src/class/SimpleTable.ts:1835

Skips the first `n` rows of the table, effectively removing them.

## Parameters

### count

`number`

The number of rows to skip from the beginning of the table.

## Returns

`this`

The table, so methods can be chained.

## Example

```ts
// Skip the first 10 rows of the table
await table.skip(10).log();
```
