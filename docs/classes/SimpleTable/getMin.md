[**Simple Data Analysis Core v2.1.21**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / getMin

# Method: getMin()

> **getMin**(`column`, `options?`): `Promise`\<`unknown`\>

Defined in: [src/class/SimpleTable.ts:7250](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.21/src/class/SimpleTable.ts#L7250)

Returns the minimum value from a specific column.
Temporal values use the same JavaScript representations as `getData()`.

## Parameters

### column

`string`

The name of the column from which to retrieve the minimum value.

### options?

Optional output rounding settings.

#### decimals?

`number`

A non-negative integer up to 2147483647 specifying decimal places. Rounds numeric results; integers, temporal values, and other nonnumeric values are unchanged. Defaults to `undefined` (no rounding).

## Returns

`Promise`\<`unknown`\>

A promise that resolves to the minimum value of the specified column.

## Examples

```ts
// Get the minimum value from the 'price' column
const minPrice = await table.getMin("price");
console.log(minPrice); // e.g., 10.50
```

```ts
console.log(await table.getMin("price", { decimals: 2 }));
```
