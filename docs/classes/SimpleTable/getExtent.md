[**Simple Data Analysis Core v2.1.21**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / getExtent

# Method: getExtent()

> **getExtent**(`column`, `options?`): `Promise`\<\[`unknown`, `unknown`\]\>

Defined in: [src/class/SimpleTable.ts:7300](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.21/src/class/SimpleTable.ts#L7300)

Returns the extent (minimum and maximum values) of a specific column as an array.
Temporal values use the same JavaScript representations as `getData()`.

## Parameters

### column

`string`

The name of the column from which to retrieve the extent.

### options?

Optional output rounding settings.

#### decimals?

`number`

A non-negative integer up to 2147483647 specifying decimal places. Rounds both numeric endpoints; integers, temporal values, and other nonnumeric values are unchanged. Defaults to `undefined` (no rounding).

## Returns

`Promise`\<\[`unknown`, `unknown`\]\>

A promise that resolves to an array `[min, max]` containing the minimum and maximum values of the specified column.

## Examples

```ts
// Get the extent of the 'temperature' column
const tempExtent = await table.getExtent("temperature");
console.log(tempExtent); // e.g., [15.2, 30.1]
```

```ts
console.log(await table.getExtent("price", { decimals: 2 }));
```
