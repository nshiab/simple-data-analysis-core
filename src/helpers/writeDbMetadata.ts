import queryDbFile from "./queryDbFile.ts";
import type SimpleDB from "../class/SimpleDB.ts";
import type { IndexDefinition } from "./indexDefinitions.ts";
import quoteIdentifier from "./quoteIdentifier.ts";
import parseValue from "./parseValue.ts";

export default async function writeDbMetadata(
  sdb: SimpleDB,
  database: string,
  indexes: Record<string, IndexDefinition[]>,
): Promise<void> {
  const catalog = quoteIdentifier(database);
  await queryDbFile(
    sdb,
    `CREATE SCHEMA IF NOT EXISTS ${catalog}.__sda;
     CREATE OR REPLACE TABLE ${catalog}.__sda.metadata AS
     SELECT 1 AS version, ${
      parseValue(JSON.stringify(indexes))
    }::VARCHAR AS indexes;`,
  );
}
