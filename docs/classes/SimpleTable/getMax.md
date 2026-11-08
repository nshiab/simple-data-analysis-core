[**Simple Data Analysis Core v2.1.21**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / getMax

# Method: getMax()

> **getMax**(`column`, `options?`): `Promise`\<`unknown`\>

Defined in: [src/class/SimpleTable.ts:7275](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.21/src/class/SimpleTable.ts#L7275)

Returns the maximum value from a specific column.
Temporal values use the same JavaScript representations as `getData()`.

## Parameters

### column

`string`

The name of the column from which to retrieve the maximum value.

### options?

Optional output rounding settings.

#### decimals?

`number`

A non-negative integer up to 2147483647 specifying decimal places. Rounds numeric results; integers, temporal values, and other nonnumeric values are unchanged. Defaults to `undefined` (no rounding).

## Returns

`Promise`\<`unknown`\>

A promise that resolves to the maximum value of the specified column.

## Examples

```ts
// Get the maximum value from the 'price' column
const maxPrice = await table.getMax("price");
console.log(maxPrice); // e.g., 99.99
```

```ts
console.log(await table.getMax("price", { decimals: 2 }));
```
