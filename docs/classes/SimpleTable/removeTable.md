[**Simple Data Analysis Core v2.1.16**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / removeTable

# Method: removeTable()

> **removeTable**(): `Promise`\<[`SimpleTable`](../SimpleTable.md)\>

Defined in: [src/class/SimpleTable.ts:2421](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleTable.ts#L2421)

Removes the table from the database. After this operation, invoking methods on this SimpleTable instance will result in an error.

## Returns

`Promise`\<[`SimpleTable`](../SimpleTable.md)\>

A promise that resolves after the table is removed.

## Example

```ts
// Remove the current table from the database
await table.removeTable();
```
