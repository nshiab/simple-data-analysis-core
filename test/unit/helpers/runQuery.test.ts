import { assertEquals } from "@std/assert";
import type { DuckDBConnection } from "@duckdb/node-api";
import runQuery from "../../../src/helpers/runQuery.ts";

Deno.test("runQuery omits the bindings argument when there are no values", async () => {
  const argumentCounts: number[] = [];
  const connection = {
    run: (...args: unknown[]) => {
      argumentCounts.push(args.length);
      return Promise.resolve({});
    },
  } as unknown as DuckDBConnection;
  const options = {
    method: null,
    parameters: null,
    logSQL: false,
    explainSQL: false,
  };

  await runQuery(
    "CREATE TABLE empty_values(value INTEGER)",
    connection,
    false,
    {
      ...options,
      values: [],
    },
  );
  await runQuery("INSERT INTO empty_values VALUES (?)", connection, false, {
    ...options,
    values: [1],
  });

  assertEquals(argumentCounts, [1, 2]);
});
