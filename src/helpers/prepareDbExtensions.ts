import queryDbFile from "./queryDbFile.ts";
import type SimpleDB from "../class/SimpleDB.ts";
import type { IndexDefinition } from "./indexDefinitions.ts";
import parseValue from "./parseValue.ts";

export default async function prepareDbExtensions(
  sdb: SimpleDB,
  database: string,
  indexes: Record<string, IndexDefinition[]>,
): Promise<void> {
  const definitions = Object.values(indexes).flat();
  const physicalIndexes = await queryDbFile(
    sdb,
    `SELECT sql FROM duckdb_indexes() WHERE database_name = ${
      parseValue(database)
    };`,
    { returnData: true },
  );
  if (
    definitions.some((index) => index.kind === "vss") ||
    physicalIndexes!.some((index) =>
      /\bUSING\s+HNSW\b/i.test(String(index.sql))
    )
  ) {
    await queryDbFile(
      sdb,
      "INSTALL vss; LOAD vss; SET hnsw_enable_experimental_persistence = true;",
    );
  }
  const ftsSchemas = await queryDbFile(
    sdb,
    `SELECT schema_name FROM duckdb_schemas() WHERE database_name = ${
      parseValue(database)
    } AND starts_with(schema_name, 'fts_');`,
    { returnData: true },
  );
  if (
    definitions.some((index) => index.kind === "fts") || ftsSchemas!.length > 0
  ) {
    await queryDbFile(sdb, "INSTALL fts; LOAD fts;");
  }
  if (!sdb.spatialLoaded) {
    const geometryColumns = await queryDbFile(
      sdb,
      `SELECT column_name FROM duckdb_columns()
       WHERE database_name = ${
        parseValue(database)
      } AND data_type ILIKE '%GEOMETRY%' LIMIT 1;`,
      { returnData: true },
    );
    if (geometryColumns!.length > 0) {
      await queryDbFile(
        sdb,
        "INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;",
      );
      sdb.spatialLoaded = true;
    }
  }
}
