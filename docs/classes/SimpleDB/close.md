[**Simple Data Analysis Core v2.1.26**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleDB](../SimpleDB.md) / close

# Method: close()

> **close**(`options?`): `Promise`\<[`SimpleDB`](../SimpleDB.md)\<[`SimpleTable`](../SimpleTable.md)\>\>

Defined in: [src/class/SimpleDB.ts:1033](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.26/src/class/SimpleDB.ts#L1033)

Executes pending transformations, saves SDA metadata for writable persistent
databases, and closes the connection and instance. Also cleans up temporary
files and, by default, prunes unused table cache entries after a run that
uses the cache.

## Parameters

### options?

#### pruneCache?

`boolean`

Whether to prune unused table cache entries. Defaults to `true`.

## Returns

`Promise`\<[`SimpleDB`](../SimpleDB.md)\<[`SimpleTable`](../SimpleTable.md)\>\>

A promise that resolves to the SimpleDB instance after cleanup.

## Examples

```ts
// close() executes queued transformations before cleaning up resources.
table.loadData("data.csv").convert({ price: "number" });
await sdb.close();
```

```ts
// Preserve entries in a shared table cache when closing a test database.
await sdb.close({ pruneCache: false });
```

## Throws

An error after cleanup when pending execution or cleanup fails.
