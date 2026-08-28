import { DuckDBInstance } from "@duckdb/node-api";
import { requiredEnvironment } from "../environment.ts";

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const treesInput = sqlString(requiredEnvironment("BENCHMARK_INPUT"));
const neighbourhoodsInput = sqlString(
  requiredEnvironment("BENCHMARK_POLYGONS"),
);
const resultOutput = sqlString(requiredEnvironment("BENCHMARK_RESULT_OUTPUT"));
const instance = await DuckDBInstance.create(":memory:");
const connection = await instance.connect();

try {
  await connection.run(`
    INSTALL spatial;
    LOAD spatial;
    SET geometry_always_xy = true;

    CREATE TABLE trees AS
    SELECT
      ST_Point(
        CAST(Longitude AS DOUBLE),
        CAST(Latitude AS DOUBLE)
      )::GEOMETRY('EPSG:4326') AS geom
    FROM read_csv(${treesInput}, ignore_errors = true)
    WHERE Longitude IS NOT NULL AND Latitude IS NOT NULL;

    CREATE TABLE neighbourhoods AS
    SELECT nom_qr, geom
    FROM ST_Read(${neighbourhoodsInput});

    CREATE TABLE result AS
    SELECT neighbourhoods.nom_qr, CAST(COUNT(*) AS INTEGER) AS count
    FROM trees
    INNER JOIN neighbourhoods
      ON ST_Within(trees.geom, neighbourhoods.geom)
    GROUP BY neighbourhoods.nom_qr
    ORDER BY neighbourhoods.nom_qr;

    COPY result TO ${resultOutput} (HEADER, DELIMITER ',');
  `);
} finally {
  connection.closeSync();
  instance.closeSync();
}
