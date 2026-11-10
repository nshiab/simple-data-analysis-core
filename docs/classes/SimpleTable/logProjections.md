[**Simple Data Analysis Core v2.1.23**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / logProjections

# Method: logProjections()

> **logProjections**(): `Promise`\<[`SimpleTable`](../SimpleTable.md)\>

Defined in: src/class/SimpleTable.ts:9391

Logs the projections of the geospatial data (if any) to the console.

## Returns

`Promise`\<[`SimpleTable`](../SimpleTable.md)\>

A promise that resolves to the SimpleTable instance after logging the projections.

## Example

```ts
// Log the geospatial projections of the table
await table.logProjections();
```
