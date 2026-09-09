import type { DuckDBConnection } from "@duckdb/node-api";
import type SimpleDB from "../../src/class/SimpleDB.ts";

export const workloads = [
  {
    name: "join-aggregate",
    label: "Join → aggregate",
    rows: 1_000_000,
    batchSize: 0,
  },
  { name: "load-array", label: "loadArray()", rows: 100_000, batchSize: 0 },
  { name: "get-data", label: "getData()", rows: 100_000, batchSize: 0 },
  {
    name: "js-small-batches",
    label: "updateWithJS()",
    rows: 100_000,
    batchSize: 1_000,
  },
  {
    name: "js-large-batches",
    label: "updateWithJS()",
    rows: 100_000,
    batchSize: 10_000,
  },
] as const;
export type WorkloadName = typeof workloads[number]["name"];
type Row = Record<string, unknown>;

export async function prepareWorkload(
  name: WorkloadName,
  rows: number,
  connection: DuckDBConnection,
  sdb?: SimpleDB,
): Promise<{ execute: () => Promise<void>; validate: () => Promise<void> }> {
  const workload = workloads.find((candidate) => candidate.name === name)!;
  if (sdb && sdb.getTables().length) await sdb.removeTables("all");
  if (name !== "load-array") {
    await connection.run(`CREATE OR REPLACE TABLE input AS SELECT
    i::DOUBLE AS id, (i % 10)::DOUBLE AS category, (i % 97)::DOUBLE AS value
    FROM range(${rows}) t(i)`);
  }
  await connection.run("DROP TABLE IF EXISTS result");
  const array = name === "load-array" ? makeRows(rows) : [];
  if (name === "join-aggregate") {
    await connection.run(`CREATE OR REPLACE TABLE categories AS SELECT
      i::DOUBLE AS category, 'group-' || i AS label FROM range(10) t(i)`);
  }
  const table = sdb?.newTable(name === "load-array" ? "result" : "input");
  const categories = name === "join-aggregate"
    ? sdb?.newTable("categories")
    : undefined;
  let data: Row[] | undefined;

  async function execute() {
    if (name === "join-aggregate") {
      if (table && categories) {
        await table.join(categories, {
          on: "category",
          type: "inner",
          outputTable: "result",
        })
          .summarize({ columns: "value", by: "label", stats: "sum" }).run();
      } else {
        await connection.run(
          `CREATE OR REPLACE TABLE result AS SELECT label, SUM(value) AS sum
          FROM input INNER JOIN categories USING(category) GROUP BY label`,
        );
      }
    } else if (name === "load-array") {
      if (table) await table.loadArray(array).run();
      else {
        await createResult(connection);
        await appendRows(connection, array);
      }
    } else if (name === "get-data") {
      data = table
        ? await table.getData()
        : (await connection.runAndReadAll("FROM input")).getRowObjectsJS();
    } else if (table) {
      await table.updateWithJS(increment, { batchSize: workload.batchSize })
        .run();
    } else {
      await createResult(connection);
      for (let offset = 0; offset < rows; offset += workload.batchSize) {
        const batch = (await connection.runAndReadAll(`SELECT * FROM input
          WHERE rowid >= ${offset} AND rowid < ${
          offset + workload.batchSize
        } ORDER BY rowid`)).getRowObjectsJS();
        await appendRows(connection, increment(batch));
      }
    }
  }

  async function validate() {
    const outputTable = name === "get-data" || (workload.batchSize && sdb)
      ? "input"
      : "result";
    const actual = data ??
      (await connection.runAndReadAll(`FROM ${outputTable}`)).getRowObjectsJS();
    let expected: Row[];
    if (name === "join-aggregate") {
      const sums = Array<number>(10).fill(0);
      for (let i = 0; i < rows; i++) sums[i % 10] += i % 97;
      expected = sums.flatMap((sum, category) =>
        category < rows ? [{ label: `group-${category}`, sum }] : []
      );
    } else {
      expected = makeRows(rows);
      if (workload.batchSize) expected = increment(expected);
    }
    assertRowsEquivalent(expected, actual);
  }
  return { execute, validate };
}

function makeRows(rows: number): Row[] {
  return Array.from(
    { length: rows },
    (_, id) => ({ id, category: id % 10, value: id % 97 }),
  );
}
function increment(rows: Row[]): Row[] {
  return rows.map((row) => ({ ...row, value: Number(row.value) + 1 }));
}
async function createResult(connection: DuckDBConnection) {
  await connection.run(
    "CREATE OR REPLACE TABLE result(id DOUBLE, category DOUBLE, value DOUBLE)",
  );
}
async function appendRows(connection: DuckDBConnection, rows: Row[]) {
  const appender = await connection.createAppender("result");
  try {
    for (const row of rows) {
      appender.appendDouble(Number(row.id));
      appender.appendDouble(Number(row.category));
      appender.appendDouble(Number(row.value));
      appender.endRow();
    }
    appender.flushSync();
  } finally {
    appender.closeSync();
  }
}

// Exact comparison is appropriate for these integer-valued double fixtures.
// Sorting, serialization, and reference generation are all outside the timer.
export function assertRowsEquivalent(expected: Row[], actual: Row[]) {
  const canonical = (rows: Row[]) =>
    rows.map((row) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(row).sort(([a], [b]) => a.localeCompare(b)),
        ),
      )
    ).sort();
  const left = canonical(expected);
  const right = canonical(actual);
  if (left.length !== right.length || left.some((row, i) => row !== right[i])) {
    throw new Error("Benchmark produced different output rows.");
  }
}
