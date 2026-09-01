import queryDbFile from "../helpers/queryDbFile.ts";
import { existsSync } from "node:fs";
import type SimpleDB from "../class/SimpleDB.ts";
import cleanPath from "../helpers/cleanPath.ts";
import getDbFileType from "../helpers/getDbFileType.ts";
import getCurrentDatabase from "../helpers/getCurrentDatabase.ts";
import getDbIndexes from "../helpers/getDbIndexes.ts";
import parseValue from "../helpers/parseValue.ts";
import prepareDbExtensions from "../helpers/prepareDbExtensions.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import readDbMetadata from "../helpers/readDbMetadata.ts";
import setDbProps from "../helpers/setDbProps.ts";
import writeDbMetadata from "../helpers/writeDbMetadata.ts";

export default async function loadDB(sdb: SimpleDB, file: string) {
  const type = getDbFileType(file);
  if (!existsSync(file)) throw new Error(`The file ${file} does not exist.`);
  if (sdb.readOnly) {
    throw new Error("loadDB() cannot import into a read-only database.");
  }

  const destination = await getCurrentDatabase(sdb);
  const target = quoteIdentifier(destination);
  const name = `__sda_import_${crypto.randomUUID().replaceAll("-", "")}`;
  const source = quoteIdentifier(name);
  if (type === "sqlite") await queryDbFile(sdb, "INSTALL sqlite; LOAD sqlite;");
  await queryDbFile(
    sdb,
    `ATTACH '${cleanPath(file)}' AS ${source} (TYPE ${type}, READ_ONLY);`,
  );

  let inTransaction = false;
  try {
    const indexes = type === "duckdb" ? await readDbMetadata(sdb, name) : {};
    await readDbMetadata(sdb, destination);
    await prepareDbExtensions(sdb, name, indexes);
    const conflicts = await queryDbFile(
      sdb,
      `SELECT incoming.table_schema, incoming.table_name
       FROM information_schema.tables incoming
       JOIN information_schema.tables existing
         ON lower(incoming.table_schema) = lower(existing.table_schema)
         AND lower(incoming.table_name) = lower(existing.table_name)
       WHERE incoming.table_catalog = ${parseValue(name)}
         AND existing.table_catalog = ${parseValue(destination)}
         AND incoming.table_schema <> '__sda';`,
      { returnData: true },
    );
    // Also protect registered table handles that have no physical table yet.
    const incoming = await queryDbFile(
      sdb,
      `SELECT table_name FROM information_schema.tables
       WHERE table_catalog = ${parseValue(name)} AND table_schema = 'main';`,
      { returnData: true },
    );
    const registered = new Set(
      sdb.getTables().map((table) => table.name.toLowerCase()),
    );
    const names = new Set([
      ...conflicts!.map((row) => `${row.table_schema}.${row.table_name}`),
      ...incoming!.filter((row) =>
        registered.has(String(row.table_name).toLowerCase())
      )
        .map((row) => `main.${row.table_name}`),
    ]);
    if (names.size > 0) {
      throw new Error(
        `loadDB() cannot import existing tables: ${[...names].join(", ")}.`,
      );
    }
    const mergedIndexes = { ...getDbIndexes(sdb), ...indexes };
    await queryDbFile(sdb, "BEGIN TRANSACTION;");
    inTransaction = true;
    await queryDbFile(
      sdb,
      `DROP TABLE IF EXISTS ${target}.__sda.metadata;
       COPY FROM DATABASE ${source} TO ${target};`,
    );
    await writeDbMetadata(sdb, destination, mergedIndexes);
    await queryDbFile(sdb, "COMMIT;");
    inTransaction = false;
    await setDbProps(sdb, indexes);
  } catch (error) {
    if (inTransaction) await queryDbFile(sdb, "ROLLBACK;");
    throw error;
  } finally {
    await queryDbFile(sdb, `DETACH ${source};`);
  }
}
