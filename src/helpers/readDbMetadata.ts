import queryDbFile from "./queryDbFile.ts";
import type SimpleDB from "../class/SimpleDB.ts";
import type { IndexDefinition } from "./indexDefinitions.ts";
import quoteIdentifier from "./quoteIdentifier.ts";
import parseValue from "./parseValue.ts";

/** Reads embedded SDA metadata when present. */
export default async function readDbMetadata(
  sdb: SimpleDB,
  database: string,
): Promise<Record<string, IndexDefinition[]>> {
  const schemas = await queryDbFile(
    sdb,
    `SELECT schema_name FROM duckdb_schemas()
     WHERE database_name = ${parseValue(database)} AND schema_name = '__sda';`,
    { returnData: true },
  );
  if (schemas!.length > 0) {
    const rows = await queryDbFile(
      sdb,
      `SELECT version, indexes FROM ${
        quoteIdentifier(database)
      }.__sda.metadata;`,
      { returnData: true },
    );
    if (
      rows!.length !== 1 || rows![0].version !== 1 ||
      typeof rows![0].indexes !== "string"
    ) {
      throw new Error(
        "Unsupported SDA database metadata in the reserved __sda schema.",
      );
    }
    return validateIndexes(JSON.parse(rows![0].indexes));
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateIndexes(value: unknown): Record<string, IndexDefinition[]> {
  if (!isRecord(value)) throw new Error("Invalid SDA index metadata.");
  for (const definitions of Object.values(value)) {
    if (!Array.isArray(definitions)) {
      throw new Error("Invalid SDA index metadata.");
    }
    for (const definition of definitions) {
      if (
        !isRecord(definition) || typeof definition.name !== "string" ||
        !isRecord(definition.options)
      ) {
        throw new Error("Invalid SDA index definition.");
      }
      const options = definition.options;
      if (definition.kind === "fts") {
        if (
          typeof definition.idColumn !== "string" ||
          typeof definition.textColumn !== "string" ||
          ["stemmer", "stopwords", "ignore"].some((key) =>
            options[key] !== undefined && typeof options[key] !== "string"
          ) ||
          ["stripAccents", "lower"].some((key) =>
            options[key] !== undefined && typeof options[key] !== "boolean"
          )
        ) {
          throw new Error("Invalid SDA FTS index definition.");
        }
      } else if (definition.kind === "vss") {
        if (
          typeof definition.column !== "string" ||
          ["efConstruction", "efSearch", "M"].some((key) =>
            options[key] !== undefined &&
            (typeof options[key] !== "number" || !Number.isFinite(options[key]))
          )
        ) {
          throw new Error("Invalid SDA VSS index definition.");
        }
      } else {
        throw new Error("Unsupported SDA index definition.");
      }
    }
  }
  return value as Record<string, IndexDefinition[]>;
}
