import type {
  DuckDBConnection,
  DuckDBInstance,
  DuckDBValue,
} from "@duckdb/node-api";

/**
 * An abstract base class providing common properties for SimpleDB and SimpleTable. This class is not intended for direct instantiation.
 */
export default class Simple {
  /**
   * The number of rows to display when logging a table.
   *
   * @defaultValue `10`
   */
  rowsToLog: number;
  /**
   * A flag indicating whether to include data types when logging a table.
   *
   * @defaultValue `false`
   */
  typesToLog: boolean;
  /**
   * The maximum number of characters to display for text-based cells. If undefined, the entire text is shown.
   *
   * @defaultValue `undefined`
   */
  charsToLog: number | undefined;
  /**
   * A DuckDB database instance.
   */
  db!: DuckDBInstance;
  /**
   * A connection to a DuckDB database.
   */
  connection!: DuckDBConnection;
  /**
   * A flag indicating if the table name was assigned by default.
   *
   * @defaultValue `false`
   */
  defaultTableName: boolean;
  /**
   * A function for running SQL queries. Subclasses can wrap this seam to observe
   * execution while forwarding every argument. To run custom SQL, use
   * `SimpleDB.customQuery()` instead.
   *
   * @param query - The exact SQL statement to execute.
   * @param connection - The DuckDB connection that executes the statement.
   * @param returnData - Whether to convert and return result rows.
   * @param options - Error-attribution, binding, and observability options.
   * @param options.method - The SDA method responsible for the query, when available.
   * @param options.parameters - The method arguments recorded for error attribution.
   * @param options.table - The table associated with returned values and warnings.
   * @param options.values - Data values bound to placeholders in the SQL statement.
   * @param options.logSQL - Whether to log the SQL immediately before execution.
   * @param options.explainSQL - Whether to log a supported DuckDB query plan before execution.
   * @param options.rejectGeometry - Whether to reject geometry columns.
   * @returns The converted rows when requested, otherwise `null`.
   *
   * @example
   * ```ts
   * const original = table.runQuery;
   * table.runQuery = (query, connection, returnData, options) => {
   *   console.log(query);
   *   return original(query, connection, returnData, options);
   * };
   * ```
   */
  runQuery!: (
    query: string,
    connection: DuckDBConnection,
    returnData: boolean,
    options: {
      method: string | null;
      parameters: { [key: string]: unknown } | null;
      table?: string | null;
      values?: DuckDBValue[];
      logSQL: boolean;
      explainSQL: boolean;
      rejectGeometry?: boolean;
    },
  ) => Promise<
    | {
      [key: string]: unknown;
    }[]
    | null
  >;

  constructor(
    options: {
      rowsToLog?: number;
      charsToLog?: number;
      typesToLog?: boolean;
    } = {},
  ) {
    this.rowsToLog = options.rowsToLog ?? 10;
    this.charsToLog = options.charsToLog;
    this.typesToLog = options.typesToLog ?? false;
    this.defaultTableName = false;
  }
}
