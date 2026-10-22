[**Simple Data Analysis Core v2.1.16**](../index.md)

***

[Simple Data Analysis Core](../globals.md) / SimpleDB

# Class: SimpleDB\<Table\>

Defined in: [src/class/SimpleDB.ts:69](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L69)

Manages a DuckDB database instance, providing a simplified interface for database operations.

## Examples

```ts
// Create an in-memory database instance
const sdb = new SimpleDB();
// Create a table, load a CSV file, and log its first few rows
const employees = await sdb
  .newTable("employees")
  .loadData("./employees.csv")
  .log();
// Close the database connection and clean up resources
await sdb.close();
```

```ts
// Open or create a persistent DuckDB database. Changes persist in this file.
const sdb = new SimpleDB({ file: "./my_database.db" });
// Perform database operations...
// Execute pending work, save SDA metadata, and close the database connection
await sdb.close();
```

```ts
// Create a database instance with custom options
const sdb = new SimpleDB({
  logSQL: true, // Log SQL immediately before it runs
  rowsToLog: 20 // Set the number of rows to log by default
});
```

## Extends

- `default`

## Type Parameters

### Table

`Table` *extends* [`SimpleTable`](SimpleTable.md) = [`SimpleTable`](SimpleTable.md)

## Constructors

### Constructor

> **new SimpleDB**\<`Table`\>(`options?`): `SimpleDB`\<`Table`\>

Defined in: [src/class/SimpleDB.ts:396](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L396)

Creates a new SimpleDB instance.

DuckDB sessions use UTC so temporal parsing, extraction, and returned
`TIMESTAMP WITH TIME ZONE` strings are consistent across environments.

Existing tables and SDA index metadata are restored on first use. The
`__sda` schema is reserved for versioned SDA metadata. SQLite files can be
imported with `loadDB()` but cannot be used as the persistent database.

#### Parameters

##### options?

Configuration options for the SimpleDB instance.

###### cacheVerbose?

`boolean`

Whether to log cache hits and misses, code and input changes, TTL status, and cache read/write timing.

###### charsToLog?

`number`

The maximum characters to display for text and stringified nested cells, including truncation markers (default: 75). Independent of column width. Use Infinity for unlimited text.

###### duckDbCache?

`boolean` \| `null`

A flag indicating whether to use DuckDB's external file cache.

###### explainSQL?

`boolean`

A flag indicating whether to log DuckDB query plans for supported statements.

###### expressionSyntax?

`"sql"` \| `"js"`

Operator syntax for expressions and custom queries: `"js"` (default) translates JavaScript-style operators in SQL expressions; `"sql"` preserves SQL unchanged.

###### file?

`string`

A `.db` or `.duckdb` file to open or create. Defaults to an in-memory database.

###### logDuration?

`boolean`

A flag indicating whether to log the total execution duration.

###### logSQL?

`boolean`

A flag indicating whether to log SQL immediately before execution.

###### memoryLimit?

`string`

The maximum amount of memory DuckDB is allowed to use (e.g., `'4GB'`). Defaults to 80% of system RAM.

###### overwrite?

`boolean`

If true, replaces an existing file on first use. Defaults to false, which opens the existing file.

###### progressBar?

`boolean`

A flag indicating whether to display a progress bar for long-running operations.

###### readOnly?

`boolean`

Opens an existing DuckDB file read-only. Defaults to false. Requires a file and cannot be combined with overwrite.

###### rowsToLog?

`number`

The number of rows to display when logging a table.

###### tempDir?

`string`

The path to the directory used for temporary files when data exceeds the memory limit (e.g., `'/tmp/duckdb_swap'`). Defaults to `.tmp` for in-memory databases or `<file>.tmp` for file-based databases. Automatically removed when calling `close()`.

###### typesToLog?

`boolean`

A flag indicating whether to include data types when logging a table.

#### Returns

`SimpleDB`\<`Table`\>

#### Example

```ts
const sdb = new SimpleDB({
  logSQL: true,
  explainSQL: true,
});
```

#### Overrides

`Simple.constructor`

## DuckDB

- [customQuery](SimpleDB/customQuery.md)
- [getExtensions](SimpleDB/getExtensions.md)

## File Operations

- [loadDB](SimpleDB/loadDB.md)
- [writeDB](SimpleDB/writeDB.md)

## Lifecycle

- [close](SimpleDB/close.md)
- [run](SimpleDB/run.md)

## Other

### charsToLog

> **charsToLog**: `number` \| `undefined`

Defined in: [src/class/Simple.ts:32](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/Simple.ts#L32)

The maximum number of characters to display for text and stringified nested cells, including the truncation marker. This does not control column width. Set to Infinity to show the entire text.

#### Example

```ts
const sdb = new SimpleDB({ charsToLog: 150 });
await sdb.newTable().loadArray([{ text: "x".repeat(200) }]).log();
```

#### Default Value

`75`

#### Inherited from

`Simple.charsToLog`

***

### connection

> **connection**: `DuckDBConnection`

Defined in: [src/class/Simple.ts:40](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/Simple.ts#L40)

A connection to a DuckDB database.

#### Inherited from

`Simple.connection`

***

### db

> **db**: `DuckDBInstance`

Defined in: [src/class/Simple.ts:36](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/Simple.ts#L36)

A DuckDB database instance.

#### Inherited from

`Simple.db`

***

### defaultTableName

> **defaultTableName**: `boolean`

Defined in: [src/class/Simple.ts:46](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/Simple.ts#L46)

A flag indicating if the table name was assigned by default.

#### Default Value

`false`

#### Inherited from

`Simple.defaultTableName`

***

### rowsToLog

> **rowsToLog**: `number`

Defined in: [src/class/Simple.ts:14](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/Simple.ts#L14)

The number of rows to display when logging a table.

#### Default Value

`10`

#### Inherited from

`Simple.rowsToLog`

***

### runQuery

> **runQuery**: (`query`, `connection`, `returnData`, `options`) => `Promise`\<`object`[] \| `null`\>

Defined in: [src/class/Simple.ts:73](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/Simple.ts#L73)

A function for running SQL queries. Subclasses can wrap this seam to observe
execution while forwarding every argument. To run custom SQL, use
`SimpleDB.customQuery()` instead.

#### Parameters

##### query

`string`

The exact SQL statement to execute.

##### connection

`DuckDBConnection`

The DuckDB connection that executes the statement.

##### returnData

`boolean`

Whether to convert and return result rows.

##### options

Error-attribution, binding, and observability options.

###### explainSQL

`boolean`

Whether to log a supported DuckDB query plan before execution.

###### logSQL

`boolean`

Whether to log the SQL immediately before execution.

###### method

`string` \| `null`

The SDA method responsible for the query, when available.

###### parameters

\{\[`key`: `string`\]: `unknown`; \} \| `null`

The method arguments recorded for error attribution.

###### table?

`string` \| `null`

The table associated with returned values and warnings.

###### values?

`DuckDBValue`[]

Data values bound to placeholders in the SQL statement.

#### Returns

`Promise`\<`object`[] \| `null`\>

The converted rows when requested, otherwise `null`.

#### Example

```ts
const original = table.runQuery;
table.runQuery = (query, connection, returnData, options) => {
  console.log(query);
  return original(query, connection, returnData, options);
};
```

#### Inherited from

`Simple.runQuery`

***

### typesToLog

> **typesToLog**: `boolean`

Defined in: [src/class/Simple.ts:20](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/Simple.ts#L20)

A flag indicating whether to include data types when logging a table.

#### Default Value

`false`

#### Inherited from

`Simple.typesToLog`

## Properties

### cacheSourcesUsed

> **cacheSourcesUsed**: `string`[]

Defined in: [src/class/SimpleDB.ts:168](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L168)

An array of paths to the data sources used in the cache.

#### Default Value

`[]`

***

### cacheTimeSaved

> **cacheTimeSaved**: `number`

Defined in: [src/class/SimpleDB.ts:204](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L204)

The total time saved by using the cache, in milliseconds.

#### Default Value

`0`

***

### cacheTimeWriting

> **cacheTimeWriting**: `number`

Defined in: [src/class/SimpleDB.ts:211](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L211)

The total time spent writing to the cache, in milliseconds.

#### Default Value

`0`

***

### cacheVerbose

> **cacheVerbose**: `boolean`

Defined in: [src/class/SimpleDB.ts:197](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L197)

Whether to log cache hits and misses, code and input changes, TTL status,
and cache read/write timing.

#### Default Value

`false`

***

### duckDbCache

> **duckDbCache**: `boolean` \| `null`

Defined in: [src/class/SimpleDB.ts:269](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L269)

A flag indicating whether to use DuckDB's external file cache.

#### Default Value

`false`

***

### durationStart

> **durationStart**: `number` \| `undefined`

Defined in: [src/class/SimpleDB.ts:175](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L175)

A timestamp marking the start of a duration measurement.

#### Default Value

`undefined`

***

### explainSQL

> **explainSQL**: `boolean`

Defined in: [src/class/SimpleDB.ts:161](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L161)

Whether to log DuckDB query plans before supported statements execute.

#### Example

```ts
const sdb = new SimpleDB({ explainSQL: true });
```

#### Default Value

`false`

***

### expressionSyntax

> `readonly` **expressionSyntax**: `"sql"` \| `"js"`

Defined in: [src/class/SimpleDB.ts:137](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L137)

The operator syntax used by expressions and custom queries in this database.
`"js"` translates JavaScript-style operators (`&&`, `||`, `==`, `===`,
`!==`) and null comparisons within SQL expressions. It does not evaluate
arbitrary JavaScript. `||` remains concatenation when string literals, list
literals, explicit text casts, or `concat()` results make that intent clear.
Otherwise `||` becomes OR; column types are not inferred. Use `concat()`
when concatenation would otherwise be ambiguous, such as `first || last`.
`"sql"` passes SQL through unchanged, including `||` and null comparisons.
Choose the syntax when constructing the database; it applies to all tables.

#### Examples

```ts
const sdb = new SimpleDB({ expressionSyntax: "js" }); // The default mode
// || becomes SQL OR: keep rows where at least one condition is true.
await sdb.newTable().loadArray([{ active: true, admin: false }])
  .filter("active || admin").log();
```

```ts
const sdb = new SimpleDB({ expressionSyntax: "js" });
// && becomes SQL AND: both conditions must be true.
// === becomes SQL =: compare the age with 18.
await sdb.newTable().loadArray([{ active: true, age: 18 }])
  .filter("active && age === 18").log();
```

```ts
const sdb = new SimpleDB({ expressionSyntax: "js" });
// SQL AND and OR also work in JS mode; they pass through unchanged.
// Keep active adults, or anyone who is an admin.
await sdb.newTable().loadArray([{ active: true, age: 18, admin: false }])
  .filter("(active AND age >= 18) OR admin").log();
```

```ts
const sdb = new SimpleDB({ expressionSyntax: "js" });
// Bare column names do not establish concatenation. Use concat() explicitly.
await sdb.newTable().loadArray([{ first: "Jane", last: "Doe" }])
  .addColumn("name", "string", "concat(first, ' ', last)").log();
```

```ts
const sdb = new SimpleDB(); // JS mode is the default
// The string literal ' ' makes concatenation clear, so both || stay unchanged.
await sdb.newTable().loadArray([{ first: "Jane", last: "Doe" }])
  .addColumn("name", "string", "first || ' ' || last").log();
```

```ts
const sdb = new SimpleDB({ expressionSyntax: "sql" });
// SQL mode preserves || as concatenation: the name becomes "Jane Doe".
await sdb.newTable().loadArray([{ first: "Jane", last: "Doe" }])
  .addColumn("name", "string", "first || ' ' || last").log();
```

```ts
const sdb = new SimpleDB({ expressionSyntax: "sql" });
// Use SQL AND and OR for logical conditions; && and || are not translated.
// Both active and adult must be true, unless admin is true.
await sdb.newTable().loadArray([{ active: true, age: 18, admin: false }])
  .filter("(active AND age >= 18) OR admin").log();
```

#### Default Value

`"js"`

***

### file

> **file**: `string`

Defined in: [src/class/SimpleDB.ts:291](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L291)

The path to the persistent DuckDB database, opened or created on first use.
If not provided, an in-memory database is used. Imports and exports do not change this path.

#### Default Value

`:memory:`

***

### logDuration

> **logDuration**: `boolean`

Defined in: [src/class/SimpleDB.ts:189](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L189)

A flag indicating whether to log the total execution duration.

#### Default Value

`false`

***

### logSQL

> **logSQL**: `boolean`

Defined in: [src/class/SimpleDB.ts:149](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L149)

Whether to log each SQL statement immediately before execution.

#### Example

```ts
const sdb = new SimpleDB({ logSQL: true });
```

#### Default Value

`false`

***

### memoryLimit

> **memoryLimit**: `string` \| `undefined`

Defined in: [src/class/SimpleDB.ts:276](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L276)

The maximum amount of memory DuckDB is allowed to use (e.g., `'4GB'`). Defaults to 80% of system RAM.

#### Default Value

`undefined`

***

### overwrite

> **overwrite**: `boolean`

Defined in: [src/class/SimpleDB.ts:298](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L298)

Whether to replace an existing DuckDB file on first use instead of opening it.

#### Default Value

`false`

***

### progressBar

> **progressBar**: `boolean`

Defined in: [src/class/SimpleDB.ts:218](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L218)

A flag indicating whether to display a progress bar for long-running operations.

#### Default Value

`false`

***

### readOnly

> **readOnly**: `boolean`

Defined in: [src/class/SimpleDB.ts:314](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L314)

Whether the persistent DuckDB file is opened read-only. Requires an existing
file and cannot be combined with `overwrite`. DuckDB rejects writes to it.

#### Example

```ts
const sdb = new SimpleDB({ file: "./archive.duckdb", readOnly: true });
const table = await sdb.getTable("employees");
await table.log();
await sdb.close();
```

#### Default Value

`false`

***

### tableClass

> **tableClass**: (`name`, `sdb`, `options?`) => `Table`

Defined in: [src/class/SimpleDB.ts:342](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L342)

The class used to create table instances. Defaults to `SimpleTable`.
Override this property when subclassing to ensure all table-creating
methods (e.g., `newTable()`, `clone()`) return instances of your
custom table class.

The class used to create table instances. Defaults to `SimpleTable`.
Override this property when subclassing to ensure all table-creating
methods (e.g., `newTable()`, `clone()`) return instances of your
custom table class.

#### Parameters

##### name

`string`

##### sdb

`SimpleDB`

##### options?

###### charsToLog?

`number`

###### rowsToLog?

`number`

###### typesToLog?

`boolean`

#### Returns

`Table`

#### Example

```ts
class MyTable extends SimpleTable {
  customMethod() { return "hello"; }
}

class MyDB extends SimpleDB {
  constructor(options?: SimpleDBOptions) {
    super(options);
    this.tableClass = MyTable;
  }
}

const db = new MyDB();
const table = db.newTable("myTable");
console.log(table.customMethod()); // "hello"
```

#### Default Value

`SimpleTable`

#### Example

```ts
class MyTable extends SimpleTable {
  customMethod() { return "hello"; }
}

class MyDB extends SimpleDB {
  constructor(options?: SimpleDBOptions) {
    super(options);
    this.tableClass = MyTable;
  }
}

const db = new MyDB();
const table = db.newTable("myTable");
console.log(table.customMethod()); // "hello"
```

#### Default Value

`SimpleTable`

***

### tableIncrement

> **tableIncrement**: `number`

Defined in: [src/class/SimpleDB.ts:182](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L182)

A counter for incrementing default table names.

#### Default Value

`1`

***

### tempDir

> **tempDir**: `string` \| `undefined`

Defined in: [src/class/SimpleDB.ts:283](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L283)

The path to the directory used for temporary files when data exceeds the memory limit (e.g., `'/tmp/duckdb_swap'`). Defaults to `.tmp` for in-memory databases or `<file>.tmp` for file-based databases. Temporary directories are automatically removed when calling `close()`.

#### Default Value

`undefined`

## Table Management

- [getTable](SimpleDB/getTable.md)
- [getTableNames](SimpleDB/getTableNames.md)
- [getTables](SimpleDB/getTables.md)
- [hasTable](SimpleDB/hasTable.md)
- [logTableNames](SimpleDB/logTableNames.md)
- [newTable](SimpleDB/newTable.md)
- [removeTables](SimpleDB/removeTables.md)
- [selectTables](SimpleDB/selectTables.md)
