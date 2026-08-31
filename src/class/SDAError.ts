/**
 * An error thrown when a SQL query fails. It carries the SDA method that
 * triggered the query, the parameters passed to it, the SQL query itself,
 * and the original error as `cause`.
 *
 * @example
 * ```ts
 * try {
 *   await table.selectColumns("aColumnThatDoesNotExist").run();
 * } catch (error) {
 *   if (error instanceof SDAError) {
 *     console.log(error.method); // "selectColumns()"
 *     console.log(error.query); // The SQL query that failed
 *     console.log(error.cause); // The original DuckDB error
 *   }
 * }
 * ```
 */
export default class SDAError extends Error {
  /**
   * The SDA method that triggered the failing query.
   */
  method: string | null;
  /**
   * The parameters passed to the method.
   */
  parameters: { [key: string]: unknown } | null;
  /**
   * The SQL query that failed.
   */
  query: string;

  /**
   * Creates an error that preserves the failing query and its original cause.
   *
   * @param options - Details of the failed query.
   * @param options.method - The SDA method that triggered the query, or `null`.
   * @param options.parameters - The method's arguments, or `null`.
   * @param options.query - The SQL statement that failed.
   * @param options.cause - The original error thrown while executing the query.
   *
   * @example
   * ```ts
   * const error = new SDAError({
   *   method: "example()",
   *   parameters: { column: "missing" },
   *   query: "SELECT missing FROM data",
   *   cause: new Error("Column not found"),
   * });
   * console.log(error.method, error.cause);
   * ```
   */
  constructor(
    options: {
      method: string | null;
      parameters: { [key: string]: unknown } | null;
      query: string;
      cause: unknown;
    },
  ) {
    let causeMessage = options.cause instanceof Error
      ? options.cause.message
      : String(options.cause);
    if (causeMessage.includes("connection disconnected")) {
      causeMessage =
        "Database connection closed before all operations finished. Did you forget to add `await`?";
    }
    super(
      options.method === null
        ? causeMessage
        : `${causeMessage}\nSDA method: ${options.method}`,
      { cause: options.cause },
    );
    this.name = "SDAError";
    this.method = options.method;
    this.parameters = options.parameters;
    this.query = options.query;
  }
}
