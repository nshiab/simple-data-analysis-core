[**Simple Data Analysis Core v2.1.16**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / logExtent

# Method: logExtent()

> **logExtent**(`column`): `Promise`\<[`SimpleTable`](../SimpleTable.md)\>

Logs the extent (minimum and maximum values) of a numeric column to the console.

## Parameters

### column

`string`

The name of the numeric column for which to log the extent.

## Returns

`Promise`\<[`SimpleTable`](../SimpleTable.md)\>

A promise that resolves to the table, so methods can be chained.

## Example

```ts
// Log the extent of the 'price' column
await table.logExtent("price");
```
