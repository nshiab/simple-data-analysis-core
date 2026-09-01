import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import { DuckDBInstance } from "@duckdb/node-api";
import runQuery from "../helpers/runQuery.ts";
import SimpleTable from "./SimpleTable.ts";
import cleanCache from "../helpers/cleanCache.ts";
import prettyDuration from "../helpers/prettyDuration.ts";
import Simple from "./Simple.ts";
import queryDB from "../helpers/queryDB.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import getTableNames from "../methods/getTableNames.ts";
import { existsSync, rmSync } from "node:fs";
import createDirectory from "../helpers/createDirectory.ts";
import getDbFileType from "../helpers/getDbFileType.ts";
import getCurrentDatabase from "../helpers/getCurrentDatabase.ts";
import getDbIndexes from "../helpers/getDbIndexes.ts";
import readDbMetadata from "../helpers/readDbMetadata.ts";
import writeDbMetadata from "../helpers/writeDbMetadata.ts";
import prepareDbExtensions from "../helpers/prepareDbExtensions.ts";
import setDbProps from "../helpers/setDbProps.ts";
import queryDbFile from "../helpers/queryDbFile.ts";
import removeTables from "../methods/removeTables.ts";
import selectTables from "../methods/selectTables.ts";
import loadDB from "../methods/loadDB.ts";
import writeDB from "../methods/writeDB.ts";
import flushAllTables, {
  runExemptFromFlush,
} from "../helpers/flushAllTables.ts";
import { discardAllPending } from "../helpers/queueOp.ts";
import {
  initializeTableRegistry,
  listRegisteredTables,
  registerTable,
} from "../helpers/tableRegistry.ts";
import formatMissingTables from "../helpers/formatMissingTables.ts";

/**
 * Manages a DuckDB database instance, providing a simplified interface for database operations.
 *
 * @example
 * ```ts
 * // Create an in-memory database instance
 * const sdb = new SimpleDB();
 * // Create a table, load a CSV file, and log its first few rows
 * const employees = await sdb
 *   .newTable("employees")
 *   .loadData("./employees.csv")
 *   .log();
 * // Close the database connection and clean up resources
 * await sdb.close();
 * ```
 *
 * @example
 * ```ts
 * // Open or create a persistent DuckDB database. Changes persist in this file.
 * const sdb = new SimpleDB({ file: "./my_database.db" });
 * // Perform database operations...
 * // Execute pending work, save SDA metadata, and close the database connection
 * await sdb.close();
 * ```
 *
 * @example
 * ```ts
 * // Create a database instance with custom options
 * const sdb = new SimpleDB({
 *   logSQL: true, // Log SQL immediately before it runs
 *   rowsToLog: 20 // Set the number of rows to log by default
 * });
 * ```
 */

export default class SimpleDB<Table extends SimpleTable = SimpleTable>
  extends Simple {
  /**
   * Whether to log each SQL statement immediately before execution.
   *
   * @defaultValue `false`
   * @category Properties
   * @example
   * ```ts
   * const sdb = new SimpleDB({ logSQL: true });
   * ```
   */
  logSQL: boolean;
  /**
   * Whether to log DuckDB query plans before supported statements execute.
   *
   * @defaultValue `false`
   * @category Properties
   * @example
   * ```ts
   * const sdb = new SimpleDB({ explainSQL: true });
   * ```
   */
  explainSQL: boolean;
  /**
   * An array of paths to the data sources used in the cache.
   *
   * @defaultValue `[]`
   * @category Properties
   */
  cacheSourcesUsed: string[];
  /**
   * A timestamp marking the start of a duration measurement.
   *
   * @defaultValue `undefined`
   * @category Properties
   */
  durationStart: number | undefined;
  /**
   * A counter for incrementing default table names.
   *
   * @defaultValue `1`
   * @category Properties
   */
  tableIncrement: number;
  /**
   * A flag indicating whether to log the total execution duration.
   *
   * @defaultValue `false`
   * @category Properties
   */
  logDuration: boolean;
  /**
   * Whether to log cache hits and misses, code and input changes, TTL status,
   * and cache read/write timing.
   *
   * @defaultValue `false`
   * @category Properties
   */
  cacheVerbose: boolean;
  /**
   * The total time saved by using the cache, in milliseconds.
   *
   * @defaultValue `0`
   * @category Properties
   */
  cacheTimeSaved: number;
  /**
   * The total time spent writing to the cache, in milliseconds.
   *
   * @defaultValue `0`
   * @category Properties
   */
  cacheTimeWriting: number;
  /**
   * A flag indicating whether to display a progress bar for long-running operations.
   *
   * @defaultValue `false`
   * @category Properties
   */
  progressBar: boolean;
  /**
   * The in-flight flush of the pending chains, if one is running. Concurrent
   * observers await it instead of reading mid-flush state. This is for
   * internal use only.
   *
   * @defaultValue `null`
   * @internal
   */
  flushPromise: Promise<void> | null;
  #closePromise: Promise<SimpleDB> | null = null;
  #startPromise: Promise<SimpleDB> | null = null;
  #initialized = false;
  /**
   * The database lifecycle state. This is for internal use only.
   *
   * @internal
   */
  lifecycleState: "open" | "closing" | "closed";
  /**
   * The number of queued operations across all tables, so query execution
   * points skip the flush entirely when nothing is pending. This is for
   * internal use only.
   *
   * @defaultValue `0`
   * @internal
   */
  pendingCount: number;
  /**
   * A counter stamping queued operations with their position in program
   * order across all tables, so flushes replay them in the order they were
   * queued. This is for internal use only.
   *
   * @defaultValue `0`
   * @internal
   */
  opSequence: number;
  /**
   * A flag indicating that the spatial extension has been loaded on this
   * connection, so it's only loaded once. This is for internal use only.
   *
   * @defaultValue `false`
   * @internal
   */
  spatialLoaded: boolean;
  /**
   * A flag indicating whether to use DuckDB's external file cache.
   *
   * @defaultValue `false`
   * @category Properties
   */
  duckDbCache: boolean | null;
  /**
   * The maximum amount of memory DuckDB is allowed to use (e.g., `'4GB'`). Defaults to 80% of system RAM.
   *
   * @defaultValue `undefined`
   * @category Properties
   */
  memoryLimit: string | undefined;
  /**
   * The path to the directory used for temporary files when data exceeds the memory limit (e.g., `'/tmp/duckdb_swap'`). Defaults to `.tmp` for in-memory databases or `<file>.tmp` for file-based databases. Temporary directories are automatically removed when calling `close()`.
   *
   * @defaultValue `undefined`
   * @category Properties
   */
  tempDir: string | undefined;
  /**
   * The path to the persistent DuckDB database, opened or created on first use.
   * If not provided, an in-memory database is used. Imports and exports do not change this path.
   *
   * @defaultValue `:memory:`
   * @category Properties
   */
  file: string;
  /**
   * Whether to replace an existing DuckDB file on first use instead of opening it.
   *
   * @defaultValue `false`
   * @category Properties
   */
  overwrite: boolean;
  /**
   * Whether the persistent DuckDB file is opened read-only. Requires an existing
   * file and cannot be combined with `overwrite`. DuckDB rejects writes to it.
   *
   * @defaultValue `false`
   * @category Properties
   * @example
   * ```ts
   * const sdb = new SimpleDB({ file: "./archive.duckdb", readOnly: true });
   * const table = await sdb.getTable("employees");
   * await table.log();
   * await sdb.close();
   * ```
   */
  readOnly: boolean;
  /**
   * The class used to create table instances. Defaults to `SimpleTable`.
   * Override this property when subclassing to ensure all table-creating
   * methods (e.g., `newTable()`, `clone()`) return instances of your
   * custom table class.
   *
   * @defaultValue `SimpleTable`
   * @category Properties
   *
   * @example
   * ```ts
   * class MyTable extends SimpleTable {
   *   customMethod() { return "hello"; }
   * }
   *
   * class MyDB extends SimpleDB {
   *   constructor(options?: SimpleDBOptions) {
   *     super(options);
   *     this.tableClass = MyTable;
   *   }
   * }
   *
   * const db = new MyDB();
   * const table = db.newTable("myTable");
   * console.log(table.customMethod()); // "hello"
   * ```
   */
  tableClass: new (
    name: string,
    sdb: SimpleDB,
    options?: {
      rowsToLog?: number;
      charsToLog?: number;
      typesToLog?: boolean;
    },
  ) => Table = SimpleTable as new (
    name: string,
    sdb: SimpleDB,
    options?: {
      rowsToLog?: number;
      charsToLog?: number;
      typesToLog?: boolean;
    },
  ) => Table;

  /**
   * Creates a new SimpleDB instance.
   *
   * DuckDB sessions use UTC so temporal parsing, extraction, and returned
   * `TIMESTAMP WITH TIME ZONE` strings are consistent across environments.
   *
   * Existing tables and SDA index metadata are restored on first use. The
   * `__sda` schema is reserved for versioned SDA metadata. SQLite files can be
   * imported with `loadDB()` but cannot be used as the persistent database.
   *
   * @param options - Configuration options for the SimpleDB instance.
   * @param options.file - A `.db` or `.duckdb` file to open or create. Defaults to an in-memory database.
   * @param options.overwrite - If true, replaces an existing file on first use. Defaults to false, which opens the existing file.
   * @param options.readOnly - Opens an existing DuckDB file read-only. Defaults to false. Requires a file and cannot be combined with overwrite.
   * @param options.logDuration - A flag indicating whether to log the total execution duration.
   * @param options.rowsToLog - The number of rows to display when logging a table.
   * @param options.charsToLog - The maximum number of characters to display for text-based cells.
   * @param options.typesToLog - A flag indicating whether to include data types when logging a table.
   * @param options.cacheVerbose - Whether to log cache hits and misses, code and input changes, TTL status, and cache read/write timing.
   * @param options.logSQL - A flag indicating whether to log SQL immediately before execution.
   * @param options.explainSQL - A flag indicating whether to log DuckDB query plans for supported statements.
   * @param options.duckDbCache - A flag indicating whether to use DuckDB's external file cache.
   * @param options.progressBar - A flag indicating whether to display a progress bar for long-running operations.
   * @param options.memoryLimit - The maximum amount of memory DuckDB is allowed to use (e.g., `'4GB'`). Defaults to 80% of system RAM.
   * @param options.tempDir - The path to the directory used for temporary files when data exceeds the memory limit (e.g., `'/tmp/duckdb_swap'`). Defaults to `.tmp` for in-memory databases or `<file>.tmp` for file-based databases. Automatically removed when calling `close()`.
   * @category Constructor
   *
   * @example
   * ```ts
   * const sdb = new SimpleDB({
   *   logSQL: true,
   *   explainSQL: true,
   * });
   * ```
   */
  constructor(
    options: {
      file?: string;
      overwrite?: boolean;
      readOnly?: boolean;
      logDuration?: boolean;
      rowsToLog?: number;
      charsToLog?: number;
      typesToLog?: boolean;
      cacheVerbose?: boolean;
      logSQL?: boolean;
      explainSQL?: boolean;
      duckDbCache?: boolean | null;
      progressBar?: boolean;
      memoryLimit?: string;
      tempDir?: string;
    } = {},
  ) {
    super(options);
    this.file = options.file ?? ":memory:";
    this.logSQL = options.logSQL ?? false;
    this.explainSQL = options.explainSQL ?? false;
    this.overwrite = options.overwrite ?? false;
    this.readOnly = options.readOnly ?? false;
    this.logDuration = options.logDuration ?? false;
    this.tableIncrement = 1;
    initializeTableRegistry(this);
    this.cacheSourcesUsed = [];
    this.cacheVerbose = options.cacheVerbose ?? false;
    this.cacheTimeSaved = 0;
    this.cacheTimeWriting = 0;
    this.progressBar = options.progressBar ?? false;
    this.duckDbCache = options.duckDbCache === undefined
      ? false
      : options.duckDbCache;
    this.memoryLimit = options.memoryLimit;
    this.tempDir = options.tempDir;
    this.flushPromise = null;
    this.lifecycleState = "open";
    this.pendingCount = 0;
    this.opSequence = 0;
    this.spatialLoaded = false;
    this.runQuery = runQuery;
    if (this.cacheVerbose || this.logDuration) {
      this.durationStart = Date.now();
    }
  }

  /**
   * Initializes the DuckDB database instance and connection.
   *
   * @returns A promise that resolves to the SimpleDB instance after initialization.
   * @internal
   * @category Lifecycle
   */
  async start(): Promise<SimpleDB> {
    if (this.lifecycleState === "closed") {
      throw new Error(
        `start() cannot use a SimpleDB that is ${this.lifecycleState}.`,
      );
    }
    if (this.#startPromise === null) {
      // The setup queries below must run before any queued operation, so
      // they must not trigger a flush.
      this.#startPromise = runExemptFromFlush(this, async () => {
        await this.#setup();
        this.#initialized = true;
        return this;
      });
    }
    return await this.#startPromise;
  }

  async #setup(): Promise<void> {
    if (this.readOnly && (this.file === ":memory:" || this.overwrite)) {
      throw new Error(
        "readOnly requires an existing database file and cannot be combined with overwrite.",
      );
    }
    if (this.file !== ":memory:") {
      if (getDbFileType(this.file) !== "duckdb") {
        throw new Error(
          "Persistent databases must use .db or .duckdb. Use loadDB() to import SQLite files.",
        );
      }
      if (this.readOnly && !existsSync(this.file)) {
        throw new Error(`The file ${this.file} does not exist.`);
      }
      if (existsSync(this.file) && this.overwrite) {
        rmSync(this.file);
        // A WAL belongs to the database being explicitly replaced.
        rmSync(`${this.file}.wal`, { force: true });
      }
      if (!this.readOnly) createDirectory(this.file);
    }

    this.db = await DuckDBInstance.create(
      this.file,
      this.readOnly ? { access_mode: "READ_ONLY" } : {},
    );
    this.connection = await this.db.connect();

    // Keep temporal parsing, extraction, and serialization deterministic
    // across machines. DuckDB otherwise inherits the process timezone.
    await this.customQuery("SET TimeZone = 'UTC';");

    // By default, DuckDB does not compress in-memory databases, so we enable it here.
    if (this.file === ":memory:") {
      await this.customQuery(
        `ATTACH OR REPLACE ':memory:' AS ${
          quoteIdentifier("memory")
        } (COMPRESS);`,
      );
    }

    if (this.duckDbCache === true) {
      await this.customQuery("SET enable_external_file_cache=true;");
    } else if (this.duckDbCache === false) {
      await this.customQuery("SET enable_external_file_cache=false;");
    }

    if (this.progressBar) {
      await this.customQuery(
        `SET enable_progress_bar = TRUE; SET progress_bar_time = 0;`,
      );
    }

    if (this.memoryLimit !== undefined) {
      await this.customQuery(`SET memory_limit = '${this.memoryLimit}';`);
    }
    if (this.tempDir !== undefined) {
      await this.customQuery(
        `SET temp_directory = '${this.tempDir}';`,
      );
    }
    if (this.file !== ":memory:") {
      const database = await getCurrentDatabase(this);
      const indexes = await readDbMetadata(this, database);
      await prepareDbExtensions(this, database, indexes);
      const existingNames = new Set(
        (await this.getTableNames()).map((name) => name.toLowerCase()),
      );
      const conflicts = this.getTables().filter((table) =>
        existingNames.has(table.name.toLowerCase())
      );
      if (conflicts.length > 0) {
        throw new Error(
          `Tables already exist in ${this.file}: ${
            conflicts.map((table) => table.name).join(", ")
          }. Use getTable() to access them.`,
        );
      }
      await setDbProps(this, indexes);
    }
  }

  /**
   * Creates a new SimpleTable instance within the database.
   *
   * @param name - The name of the new table. If not provided, a default name is generated (e.g., "table1").
   * @returns A new table instance.
   * @category Table Management
   *
   * @example
   * ```ts
   * // Create a table with a default name (e.g., "table1", "table2", etc.)
   * const dataTable = await sdb
   *   .newTable()
   *   .loadArray([{ value: 1 }])
   *   .log();
   * ```
   *
   * @example
   * ```ts
   * // Create a table with a specific name
   * const employees = await sdb
   *   .newTable("employees")
   *   .loadData("employees.csv")
   *   .log();
   * ```
   */
  newTable(
    name?: string,
  ): Table {
    if (this.lifecycleState !== "open") {
      throw new Error(
        `newTable() cannot use a SimpleDB that is ${this.lifecycleState}.`,
      );
    }
    const TableClass = this.tableClass;

    // SHOULD MATCH clone
    let table;
    if (typeof name === "string") {
      table = new TableClass(name, this, {
        rowsToLog: this.rowsToLog,
        charsToLog: this.charsToLog,
        typesToLog: this.typesToLog,
      });
      table.defaultTableName = false;
    } else {
      while (
        this.getTables().some((table) =>
          table.name.toLowerCase() === `table${this.tableIncrement}`
        )
      ) {
        this.tableIncrement++;
      }
      table = new TableClass(`table${this.tableIncrement}`, this, {
        rowsToLog: this.rowsToLog,
        charsToLog: this.charsToLog,
        typesToLog: this.typesToLog,
      });
      table.defaultTableName = true;
      this.tableIncrement += 1;
    }

    registerTable(this, table);

    return table;
  }

  /**
   * Retrieves an existing SimpleTable instance from the database.
   *
   * @param name - The name of the table to retrieve.
   * @returns A promise that resolves to the SimpleTable instance if found.
   * @category Table Management
   *
   * @example
   * ```ts
   * // Retrieve the "employees" table
   * const employees = await sdb.getTable("employees");
   * await employees.log();
   * ```
   */
  async getTable(name: string): Promise<Table> {
    await this.start();
    const tables = this.getTables();
    const table = tables.find((t) => t.name === name);
    if (table) {
      return await table;
    } else {
      throw new Error(
        formatMissingTables(
          "getTable()",
          [name],
          tables.map((availableTable) => availableTable.name),
        ),
      );
    }
  }

  /**
   * Removes one or more tables from the database.
   *
   * @param tables - A single table or an array of tables to remove, specified by name or as SimpleTable instances. Pass `"all"` to remove all tables.
   * @returns A promise that resolves to the database, so methods can be chained.
   * @category Table Management
   *
   * @example
   * ```ts
   * // Remove a single table by name
   * await sdb.removeTables("employees");
   * ```
   *
   * @example
   * ```ts
   * // Remove multiple tables by name
   * await sdb.removeTables(["customers", "products"]);
   * ```
   *
   * @example
   * ```ts
   * // Remove a single table using a SimpleTable instance
   * const employeesTable = sdb.newTable("employees");
   * // ... load data ...
   * await sdb.removeTables(employeesTable);
   * ```
   *
   * @example
   * ```ts
   * // Remove all tables
   * await sdb.removeTables("all");
   * ```
   */
  async removeTables(
    tables: Table | string | (Table | string)[],
  ): Promise<this> {
    await removeTables(this, tables);
    return this;
  }

  /**
   * Selects one or more tables to keep in the database, removing all others.
   *
   * @param tables - A single table or an array of tables to select, specified by name or as SimpleTable instances.
   * @returns A promise that resolves to the database, so methods can be chained.
   * @category Table Management
   *
   * @example
   * ```ts
   * // Select a single table by name, removing all other tables
   * await sdb.selectTables("employees");
   * ```
   *
   * @example
   * ```ts
   * // Select multiple tables by name, removing all other tables
   * await sdb.selectTables(["customers", "products"]);
   * ```
   *
   * @example
   * ```ts
   * // Select a single table using a SimpleTable instance
   * const employeesTable = sdb.newTable("employees");
   * // ... load data ...
   * await sdb.selectTables(employeesTable);
   * ```
   */
  async selectTables(
    tables: Table | string | (Table | string)[],
  ): Promise<this> {
    await selectTables(this, tables);
    return this;
  }

  /**
   * Returns an array of all table names in the database, sorted alphabetically.
   *
   * @returns A promise that resolves to an array of table names.
   * @category Table Management
   *
   * @example
   * ```ts
   * // Get all table names
   * const tableNames = await sdb.getTableNames();
   * console.log(tableNames); // Output: ["employees", "customers"]
   * ```
   */
  async getTableNames(): Promise<string[]> {
    return await getTableNames(this);
  }

  /**
   * Logs the names of all tables in the database to the console, sorted alphabetically.
   *
   * @returns A promise that resolves to the database, so methods can be chained.
   * @category Table Management
   *
   * @example
   * ```ts
   * // Log all table names to the console
   * await sdb.logTableNames();
   * // Example output: SimpleDB - Tables:  ["employees","customers"]
   * ```
   */
  async logTableNames(): Promise<this> {
    const tables = await this.getTableNames();
    if (tables.length > 0) {
      console.log(
        `\nSimpleDB - Tables:  ${JSON.stringify(tables)}`,
      );
    } else {
      console.log(`\nSimpleDB - No tables found.`);
    }
    return this;
  }

  /**
   * Returns an array of all SimpleTable instances in the database.
   *
   * The returned array is a snapshot and cannot mutate the database's internal
   * table registry.
   *
   * @returns A read-only array of SimpleTable instances.
   * @category Table Management
   *
   * @example
   * ```ts
   * // Get all SimpleTable instances
   * const tables = sdb.getTables();
   * ```
   */
  getTables(): readonly Table[] {
    return listRegisteredTables(this);
  }

  /**
   * Checks if a table exists in the database.
   *
   * @param table - The name of the table or a SimpleTable instance.
   * @returns A promise that resolves to `true` if the table exists, `false` otherwise.
   * @category Table Management
   *
   * @example
   * ```ts
   * // Check if a table named "employees" exists
   * const exists = await sdb.hasTable("employees");
   * console.log(exists); // Output: true or false
   * ```
   *
   * @example
   * ```ts
   * // Check if a SimpleTable instance exists in the database
   * const myTable = sdb.newTable("my_data");
   * const existsInstance = await sdb.hasTable(myTable);
   * console.log(existsInstance); // Output: true or false
   * ```
   */
  async hasTable(table: Table | string): Promise<boolean> {
    const tableName = typeof table === "string" ? table : table.name;
    const result = (await this.getTableNames()).includes(tableName);
    return result;
  }

  /**
   * Returns a list of installed DuckDB extensions.
   *
   * @returns A promise that resolves to an array of objects, each representing an installed extension.
   * @category DuckDB
   *
   * @example
   * ```ts
   * // Get a list of all installed extensions
   * const extensions = await sdb.getExtensions();
   * console.log(extensions); // Output: [{ extension_name: "spatial", loaded: true, ... }]
   * ```
   */
  async getExtensions(): Promise<
    {
      [key: string]: unknown;
    }[]
  > {
    return (await queryDB(
      this,
      `FROM duckdb_extensions();`,
      mergeOptions(this, {
        returnData: true,
        table: null,
        method: "getExtensions()",
        parameters: {},
      }),
    )) as {
      [key: string]: unknown;
    }[];
  }

  /**
   * Executes a custom SQL query directly against the DuckDB instance.
   * Queries run in UTC. When data is returned, temporal values use the same
   * JavaScript representations as `SimpleTable.getData()`.
   *
   * `customQuery()` bypasses the dependency and table-generation tracking used
   * by `SimpleTable.cache()`. Reading or changing a table with `customQuery()`
   * can therefore cause `cache()` to return stale data. Include a value that
   * identifies the custom query's dependencies in the cache's `options.inputs`
   * (such as a table content hash), or use tracked `SimpleTable` methods.
   *
   * @param query - The SQL query string to execute.
   * @param options - Configuration options for the query.
   * @param options.returnData - If `true`, the query result is returned. Defaults to `false`.
   * @param options.table - The name of the table associated with the query, primarily used for debugging and logging.
   * @returns A promise that resolves to the query result as an array of objects if `returnData` is `true`, otherwise `null`.
   * @category DuckDB
   *
   * @example
   * ```ts
   * // Execute a query without returning data
   * await sdb.customQuery("CREATE TABLE young_employees AS SELECT * FROM employees WHERE age > 30");
   * ```
   *
   * @example
   * ```ts
   * // Execute a query and return the results
   * const youngEmployees = await sdb.customQuery(
   *   "SELECT * FROM employees WHERE age < 30",
   *   { returnData: true }
   * );
   * console.log(youngEmployees);
   * ```
   */
  async customQuery(
    query: string,
    options: {
      returnData?: boolean;
      table?: string;
    } = {},
  ): Promise<
    | {
      [key: string]: unknown;
    }[]
    | null
  > {
    return await queryDB(
      this,
      query,
      mergeOptions(this, {
        returnData: options.returnData ?? false,
        table: options.table ?? null,
        method: "customQuery()",
        parameters: { query, options },
      }),
    );
  }

  /**
   * Imports a copy of a `.db` or `.duckdb` (DuckDB) or `.sqlite` (SQLite)
   * file into the current database. The source is opened read-only and detached
   * after importing; subsequent transformations do not modify the source file.
   * Imports work with in-memory and writable persistent databases. Existing
   * table-name conflicts are rejected and a failed copy is rolled back.
   *
   * DuckDB files restore embedded SDA index definitions when present. SQLite
   * imports copy data without SDA index metadata. The `__sda` schema is reserved
   * for SDA metadata.
   * To edit an existing DuckDB file in place, use `new SimpleDB({ file })`.
   *
   * @param file - The relative or absolute path to the database file.
   * @returns A promise that resolves to the database, so methods can be chained.
   * @category File Operations
   *
   * @example
   * ```ts
   * // Load a DuckDB database file
   * await sdb.loadDB("./my_database.db");
   * ```
   *
   * @example
   * ```ts
   * // Import SQLite tables without modifying the original file
   * await sdb.loadDB("./my_database.sqlite");
   * ```
   *
   * @example
   * ```ts
   * // Import a copy into a persistent DuckDB database
   * const sdb = new SimpleDB({ file: "./analysis.duckdb" });
   * await sdb.loadDB("./archive.db");
   * await sdb.close();
   * ```
   */
  async loadDB(file: string): Promise<this> {
    await loadDB(this, file);
    return this;
  }

  /**
   * Exports a snapshot of the current database after executing pending work.
   * Does not change the working database or where subsequent changes persist.
   * DuckDB outputs (`.db` and `.duckdb`) preserve database objects and embed SDA
   * index definitions in the reserved `__sda` schema.
   *
   * SQLite output (`.sqlite`) materializes main-schema tables and views as
   * tables. It does not preserve DuckDB schemas, indexes, constraints, or SDA
   * metadata, and SQLite type conversion may lose type information. Unsupported
   * conversions fail without replacing an existing destination.
   *
   * Existing files require explicit overwrite permission. The completed export
   * is published only after its connection is detached. Database files attached
   * to this instance, directories, and symbolic links cannot be replaced.
   *
   * @param file - The relative or absolute path to the output file.
   * @param options - Configuration options for writing the database.
   * @param options.overwrite - If true, permits atomic replacement of an existing output file. Defaults to false.
   * @param options.metadata - If false, omits logical SDA index definitions from DuckDB exports. Defaults to true. Does not control physical indexes; SQLite exports never include SDA metadata.
   * @returns A promise that resolves to the database, so methods can be chained.
   * @category File Operations
   *
   * @example
   * ```ts
   * // Write the current database to a DuckDB file
   * await sdb.writeDB("./my_exported_database.db");
   * ```
   *
   * @example
   * ```ts
   * // Explicitly replace an earlier snapshot
   * await sdb.writeDB("./my_exported_database.duckdb", { overwrite: true });
   * ```
   *
   * @example
   * ```ts
   * // Export table data for use with SQLite
   * await sdb.writeDB("./my_exported_database.sqlite");
   * ```
   */
  async writeDB(
    file: string,
    options: { overwrite?: boolean; metadata?: boolean } = {},
  ): Promise<this> {
    await writeDB(this, file, options);
    return this;
  }

  /**
   * Executes all queued methods across every table in the database. Sync
   * builder methods (like `filter()` or `convert()`) only queue their
   * operation; execution happens when an async observer method (like
   * `getData()`, `log()`, or `writeData()`) is awaited. Use `run()` when
   * your script ends in pure mutations with nothing to observe and you want
   * the work done now.
   *
   * The whole database is flushed in program order, so operations on
   * different tables execute exactly in the order they were queued. This is
   * the database-level counterpart to `SimpleTable.run()`.
   *
   * @returns A promise that resolves to the SimpleDB instance once the queued methods have been executed.
   * @category Lifecycle
   *
   * @example
   * ```ts
   * // Nothing is observed after the mutations, so run() executes them.
   * table1.loadData("data1.csv").convert({ price: "number" });
   * table2.loadData("data2.csv").filter(`price > 0`);
   * await sdb.run();
   * ```
   */
  async run(): Promise<SimpleDB> {
    if (this.lifecycleState !== "open") {
      throw new Error(
        `run() cannot use a SimpleDB that is ${this.lifecycleState}.`,
      );
    }
    await flushAllTables(this);
    return this;
  }

  /**
   * Executes pending transformations, saves SDA metadata for writable persistent
   * databases, and closes the connection and instance. Also cleans up temporary
   * files and the cache. Does not copy, compact, or replace the database file.
   *
   * @returns A promise that resolves to the SimpleDB instance after cleanup.
   * @throws An error after cleanup when pending execution or cleanup fails.
   * @category Lifecycle
   *
   * @example
   * ```ts
   * // close() executes queued transformations before cleaning up resources.
   * table.loadData("data.csv").convert({ price: "number" });
   * await sdb.close();
   * ```
   */
  async close(): Promise<SimpleDB> {
    if (this.#closePromise !== null) {
      return await this.#closePromise;
    }
    this.lifecycleState = "closing";
    const closePromise = this.#close();
    this.#closePromise = closePromise;
    return await closePromise;
  }

  async #close(): Promise<SimpleDB> {
    let operationError: unknown;
    try {
      await flushAllTables(this);
      if (this.file !== ":memory:" && !this.readOnly && this.#initialized) {
        const database = await getCurrentDatabase(this);
        await readDbMetadata(this, database);
        await writeDbMetadata(this, database, getDbIndexes(this));
        await queryDbFile(this, `CHECKPOINT ${quoteIdentifier(database)};`);
      }
    } catch (error) {
      operationError = error;
      // A failed flush can requeue work belonging to other tables. The
      // connection is about to close, so release those captured values.
      discardAllPending(this);
    }

    const cleanupErrors: unknown[] = [];
    if (this.db instanceof DuckDBInstance) {
      try {
        this.connection.closeSync();
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        this.db.closeSync();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      const tmpDir = this.tempDir ??
        (this.file === ":memory:" ? ".tmp" : `${this.file}.tmp`);
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true });
      }
      cleanCache(this);
    } catch (error) {
      cleanupErrors.push(error);
    }
    this.lifecycleState = "closed";

    if (operationError !== undefined && cleanupErrors.length > 0) {
      throw new AggregateError(
        [operationError, ...cleanupErrors],
        "Pending execution and database cleanup both failed.",
        { cause: operationError },
      );
    }
    if (operationError !== undefined) {
      throw operationError;
    }
    if (cleanupErrors.length === 1) {
      throw cleanupErrors[0];
    }
    if (cleanupErrors.length > 1) {
      throw new AggregateError(
        cleanupErrors,
        "Multiple errors occurred while cleaning up the database.",
        { cause: cleanupErrors[0] },
      );
    }

    if (typeof this.durationStart === "number") {
      let string = prettyDuration(this.durationStart, {
        prefix: "\n\nSimpleDB ran for ",
      });

      if (this.cacheTimeSaved > 0) {
        string += ` / ${
          prettyDuration(0, {
            end: this.cacheTimeSaved,
          })
        } saved by using the cache`;
      }
      if (this.cacheTimeWriting > 0) {
        string += ` / ${
          prettyDuration(0, {
            end: this.cacheTimeWriting,
          })
        } spent writing the cache`;
      }

      console.log(`${string}\n`);
    }

    return await this;
  }
}
