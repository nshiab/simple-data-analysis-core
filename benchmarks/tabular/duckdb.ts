import { DuckDBInstance } from "@duckdb/node-api";
import { requiredEnvironment } from "../environment.ts";

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const input = sqlString(requiredEnvironment("BENCHMARK_INPUT"));
const cleanOutput = sqlString(requiredEnvironment("BENCHMARK_CLEAN_OUTPUT"));
const resultOutput = sqlString(requiredEnvironment("BENCHMARK_RESULT_OUTPUT"));
const instance = await DuckDBInstance.create(":memory:");
const connection = await instance.connect();

try {
  await connection.run(`
    CREATE TABLE temperatures AS
    SELECT
      CAST(time AS DATE) AS time,
      station,
      station_name,
      CAST(tas AS DOUBLE) AS tas,
      CAST(FLOOR(YEAR(CAST(time AS DATE)) / 10) * 10 AS INTEGER) AS decade
    FROM read_csv(${input}, all_varchar = true)
    WHERE tas IS NOT NULL;

    COPY temperatures TO ${cleanOutput} (HEADER, DELIMITER ',');

    CREATE TABLE result AS
    SELECT station, station_name, decade, AVG(tas) AS mean
    FROM temperatures
    GROUP BY station, station_name, decade
    ORDER BY station, station_name, decade;

    COPY result TO ${resultOutput} (HEADER, DELIMITER ',');
  `);
} finally {
  connection.closeSync();
  instance.closeSync();
}
