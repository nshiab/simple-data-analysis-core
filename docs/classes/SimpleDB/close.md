[**Simple Data Analysis Core v2.1.16**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleDB](../SimpleDB.md) / close

# Method: close()

> **close**(): `Promise`\<[`SimpleDB`](../SimpleDB.md)\<[`SimpleTable`](../SimpleTable.md)\>\>

Defined in: [src/class/SimpleDB.ts:1025](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L1025)

Executes pending transformations, saves SDA metadata for writable persistent
databases, and closes the connection and instance. Also cleans up temporary
files and the cache. Does not copy, compact, or replace the database file.

## Returns

`Promise`\<[`SimpleDB`](../SimpleDB.md)\<[`SimpleTable`](../SimpleTable.md)\>\>

A promise that resolves to the SimpleDB instance after cleanup.

## Example

```ts
// close() executes queued transformations before cleaning up resources.
table.loadData("data.csv").convert({ price: "number" });
await sdb.close();
```

## Throws

An error after cleanup when pending execution or cleanup fails.
