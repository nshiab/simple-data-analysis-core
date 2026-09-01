import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

const explainableStatements = new Set([
  "CREATE",
  "DELETE",
  "FROM",
  "INSERT",
  "MERGE",
  "SELECT",
  "UPDATE",
  "WITH",
]);

/**
 * Logs optional SQL diagnostics without changing the statement that will run.
 */
export default async function observeQuery(
  connection: DuckDBConnection,
  query: string,
  values: DuckDBValue[],
  options: { logSQL: boolean; explainSQL: boolean },
): Promise<void> {
  if (options.explainSQL && await canExplain(connection, query)) {
    try {
      const explain = `EXPLAIN ${query}`;
      const result = values.length === 0
        ? await connection.run(explain)
        : await connection.run(explain, values);
      const rows = await result.getRowsJS();
      const plan = rows.map((row) => String(row[1] ?? row[0] ?? "")).join("\n");
      console.log(`EXPLAIN ${query}\n${plan}`);
    } catch (error) {
      console.warn(
        `SDA: Could not explain the following SQL; executing it normally.\n${query}\n${
          String(error)
        }`,
      );
    }
  }

  // Keep this immediately before connection.run()/stream() so the last SQL
  // diagnostic identifies the statement responsible for an execution error.
  if (options.logSQL) {
    console.log(query);
    if (values.length > 0) {
      console.log("Bound values:", values);
    }
  }
}

async function canExplain(
  connection: DuckDBConnection,
  query: string,
): Promise<boolean> {
  const keyword = query.trimStart().match(/^([A-Za-z]+)/)?.[1].toUpperCase();
  if (keyword === undefined || !explainableStatements.has(keyword)) {
    return false;
  }
  try {
    return (await connection.extractStatements(query)).count === 1;
  } catch {
    return false;
  }
}
