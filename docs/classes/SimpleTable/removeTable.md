[**Simple Data Analysis Core v2.1.15**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / removeTable

# Method: removeTable()

> **removeTable**(): `Promise`\<[`SimpleTable`](../SimpleTable.md)\>

Removes the table from the database. After this operation, invoking methods on this SimpleTable instance will result in an error.

## Returns

`Promise`\<[`SimpleTable`](../SimpleTable.md)\>

A promise that resolves after the table is removed.

## Example

```ts
// Remove the current table from the database
await table.removeTable();
```
