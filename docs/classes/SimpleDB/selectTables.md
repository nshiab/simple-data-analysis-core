[**Simple Data Analysis Core v2.1.14**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleDB](../SimpleDB.md) / selectTables

# Method: selectTables()

> **selectTables**(`tables`): `Promise`\<[`SimpleDB`](../SimpleDB.md)\<`Table`\>\>

Selects one or more tables to keep in the database, removing all others.

## Parameters

### tables

`string` \| `Table` \| (`string` \| `Table`)[]

A single table or an array of tables to select, specified by name or as SimpleTable instances.

## Returns

`Promise`\<[`SimpleDB`](../SimpleDB.md)\<`Table`\>\>

A promise that resolves to the database, so methods can be chained.

## Examples

```ts
// Select a single table by name, removing all other tables
await sdb.selectTables("employees");
```

```ts
// Select multiple tables by name, removing all other tables
await sdb.selectTables(["customers", "products"]);
```

```ts
// Select a single table using a SimpleTable instance
const employeesTable = sdb.newTable("employees");
// ... load data ...
await sdb.selectTables(employeesTable);
```
