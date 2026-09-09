import {
  DOUBLE,
  type DuckDBConnection,
  DuckDBDataChunk,
  VARCHAR,
} from "@duckdb/node-api";
import type SimpleDB from "../../src/class/SimpleDB.ts";
import prepareGeometry from "../../src/helpers/prepareGeometry.ts";

type Geometry = { type: "Point"; coordinates: number[] } | {
  type: "Polygon";
  coordinates: number[][][];
};
type Row = Record<string, unknown>;

// Shared cell validation gives the handwritten baseline the same ingestion
// contract without importing the Core class or its update implementation.
export default async function prepareGeometryWorkload(
  shape: "point" | "polygon",
  edit: boolean,
  batchSize: number,
  rows: number,
  connection: DuckDBConnection,
  sdb?: SimpleDB,
): Promise<{ execute: () => Promise<void>; validate: () => Promise<void> }> {
  await connection.run(
    "INSTALL spatial; LOAD spatial; SET geometry_always_xy=true",
  );
  if (sdb) sdb.spatialLoaded = true;
  const ring = Array.from({ length: 1000 }, (_, i) => {
    const angle = i * 2 * Math.PI / 1000;
    return [-73 + Math.cos(angle), 45 + Math.sin(angle)];
  });
  ring.push([...ring[0]]);
  const geometry: Geometry = shape === "point"
    ? { type: "Point", coordinates: [-73, 45] }
    : { type: "Polygon", coordinates: [ring] };
  const json = JSON.stringify(geometry);
  await connection.run(`CREATE OR REPLACE TABLE input AS SELECT i::DOUBLE AS id,
    ST_GeomFromGeoJSON('${json}')::GEOMETRY('EPSG:4326') AS geom FROM range(${rows}) t(i)`);
  const table = sdb?.newTable("input");

  function modify(batch: Row[]): Row[] {
    return batch.map((row) => {
      if (edit) {
        const geom = row.geom as Geometry;
        if (geom.type === "Point") geom.coordinates[0] += 0.01;
        else for (const point of geom.coordinates[0]) point[0] += 0.01;
      }
      return { ...row, label: `station-${row.id}` };
    });
  }
  async function execute() {
    if (table) {
      await table.updateWithJS(modify, { batchSize: batchSize || undefined })
        .run();
      return;
    }
    const fidelity = await connection.runAndReadAll(`SELECT count(*) FROM input
      WHERE ST_AsWKB(geom) != ST_AsWKB(ST_GeomFromGeoJSON(ST_AsGeoJSON(geom)))`);
    if (fidelity.getRows()[0][0] !== 0n) {
      throw new Error("Geometry conversion loses information");
    }
    try {
      await connection.run(
        "CREATE TEMP TABLE staged(id DOUBLE, geom GEOMETRY('EPSG:4326'), label VARCHAR)",
      );
      const size = batchSize || rows;
      for (let offset = 0; offset < rows; offset += size) {
        const batch = (await connection.runAndReadAll(`SELECT id,
          ST_AsGeoJSON(geom)::VARCHAR AS geom FROM input${
          batchSize
            ? ` WHERE rowid >= ${offset} AND rowid < ${
              offset + size
            } ORDER BY rowid`
            : ""
        }`)).getRowObjectsJS();
        for (const [i, row] of batch.entries()) {
          row.geom = JSON.parse(row.geom as string);
          prepareGeometry(row.geom, "geom", offset + i + 1);
        }
        const modified = modify(batch);
        const geometryData = modified.map((row, i) =>
          prepareGeometry(row.geom, "geom", offset + i + 1)
        );
        await connection.run(
          "CREATE OR REPLACE TEMP TABLE transfer(id DOUBLE, geom VARCHAR, label VARCHAR)",
        );
        const appender = await connection.createAppender("transfer");
        try {
          for (let start = 0; start < modified.length; start += 2000) {
            const end = Math.min(start + 2000, modified.length);
            const chunk = DuckDBDataChunk.create(
              [DOUBLE, VARCHAR, VARCHAR],
              end - start,
            );
            chunk.setColumnValues(
              0,
              modified.slice(start, end).map((row) => row.id as number),
            );
            chunk.setColumnValues(1, geometryData.slice(start, end));
            chunk.setColumnValues(
              2,
              modified.slice(start, end).map((row) => row.label as string),
            );
            appender.appendDataChunk(chunk);
          }
          appender.flushSync();
        } finally {
          appender.closeSync();
        }
        await connection.run(`INSERT INTO staged SELECT id,
          ST_GeomFromGeoJSON(geom)::GEOMETRY('EPSG:4326'), label FROM transfer`);
      }
      await connection.run(
        "CREATE OR REPLACE TABLE input AS SELECT * FROM staged",
      );
    } finally {
      await connection.run(
        "DROP TABLE IF EXISTS staged; DROP TABLE IF EXISTS transfer",
      );
    }
  }

  // Validate every output cell and row multiplicity in SQL to avoid materializing
  // a second full copy of the polygon dataset in the worker's JavaScript heap.
  async function validate() {
    const expected = structuredClone(geometry);
    if (edit) {
      if (expected.type === "Point") expected.coordinates[0] += 0.01;
      else for (const point of expected.coordinates[0]) point[0] += 0.01;
    }
    const result = await connection.runAndReadAll(`WITH expected AS (
      SELECT i::DOUBLE AS id, ST_AsWKB(ST_GeomFromGeoJSON('${
      JSON.stringify(expected)
    }')) AS geom,
      'station-' || i AS label FROM range(${rows}) t(i)),
      actual AS (SELECT id, ST_AsWKB(geom) AS geom, label FROM input)
      SELECT count(*) FROM (
        (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
        UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual))`);
    if (result.getRows()[0][0] !== 0n) {
      throw new Error("Geometry benchmark produced different output rows");
    }
    const types = (await connection.runAndReadAll("DESCRIBE input"))
      .getRowObjectsJS();
    if (
      types.find((row) => row.column_name === "geom")?.column_type !==
        "GEOMETRY('EPSG:4326')"
    ) {
      throw new Error("Geometry benchmark lost the geometry SQL type or CRS");
    }
  }
  return { execute, validate };
}
