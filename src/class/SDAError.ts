/**
 * An error thrown when a SQL query fails. It carries the SDA method that
 * triggered the query, the parameters passed to it, the SQL query itself,
 * and the original error as `cause`.
 *
 * @example
 * ```ts
 * try {
 *   await table.selectColumns("aColumnThatDoesNotExist");
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

  constructor(
    options: {
      method: string | null;
      parameters: { [key: string]: unknown } | null;
      query: string;
      cause: unknown;
    },
  ) {
    const causeMessage = options.cause instanceof Error
      ? options.cause.message
      : String(options.cause);
    let parameters;
    try {
      parameters = JSON.stringify(options.parameters);
    } catch {
      parameters = String(options.parameters);
    }
    super(
      `${causeMessage}\nSDA method: ${options.method}\nparameters: ${parameters}\nquery: ${options.query}`,
      { cause: options.cause },
    );
    this.name = "SDAError";
    this.method = options.method;
    this.parameters = options.parameters;
    this.query = options.query;
  }
}
