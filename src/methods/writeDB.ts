import queryDbFile from "../helpers/queryDbFile.ts";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type SimpleDB from "../class/SimpleDB.ts";
import cleanPath from "../helpers/cleanPath.ts";
import createDirectory from "../helpers/createDirectory.ts";
import getCurrentDatabase from "../helpers/getCurrentDatabase.ts";
import getDbFileType from "../helpers/getDbFileType.ts";
import getDbIndexes from "../helpers/getDbIndexes.ts";
import parseValue from "../helpers/parseValue.ts";
import prepareDbExtensions from "../helpers/prepareDbExtensions.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import readDbMetadata from "../helpers/readDbMetadata.ts";
import writeDbMetadata from "../helpers/writeDbMetadata.ts";

export default async function writeDB(
  sdb: SimpleDB,
  file: string,
  options: { overwrite?: boolean; metadata?: boolean } = {},
) {
  const type = getDbFileType(file);
  const output = resolve(file);
  assertDestination(output, options.overwrite ?? false);
  const database = await getCurrentDatabase(sdb);
  const source = quoteIdentifier(database);
  const databases = await queryDbFile(
    sdb,
    "SELECT path FROM duckdb_databases() WHERE path IS NOT NULL;",
    { returnData: true },
  );
  for (const { path } of databases!) {
    if (typeof path !== "string" || !existsSync(path)) continue;
    const original = statSync(path);
    const target = existsSync(output) ? statSync(output) : undefined;
    if (
      resolve(path) === output ||
      (target?.dev === original.dev && target?.ino === original.ino)
    ) {
      throw new Error(
        "writeDB() cannot replace an open database file. Export to a different path.",
      );
    }
  }

  const indexes = getDbIndexes(sdb);
  await readDbMetadata(sdb, database);
  await prepareDbExtensions(sdb, database, indexes);
  if (type === "sqlite") await queryDbFile(sdb, "INSTALL sqlite; LOAD sqlite;");
  createDirectory(output);
  const directory = mkdtempSync(join(dirname(output), ".sda-export-"));
  const temporary = join(directory, "snapshot.db");
  const name = `__sda_export_${crypto.randomUUID().replaceAll("-", "")}`;
  const target = quoteIdentifier(name);
  let attached = false;
  try {
    await queryDbFile(
      sdb,
      `ATTACH '${
        cleanPath(temporary)
      }' AS ${target} (TYPE ${type}, READ_WRITE);`,
    );
    attached = true;
    if (type === "duckdb") {
      await queryDbFile(sdb, `COPY FROM DATABASE ${source} TO ${target};`);
      await writeDbMetadata(
        sdb,
        name,
        options.metadata === false ? {} : indexes,
      );
      await queryDbFile(sdb, `CHECKPOINT ${target};`);
    } else {
      // SQLite is an interchange format: materialize main-schema relations,
      // without DuckDB extension schemas, indexes, or SDA metadata.
      const tables = await queryDbFile(
        sdb,
        `SELECT table_name FROM information_schema.tables
         WHERE table_catalog = ${
          parseValue(database)
        } AND table_schema = 'main';`,
        { returnData: true },
      );
      for (const { table_name } of tables!) {
        const table = quoteIdentifier(String(table_name));
        await queryDbFile(
          sdb,
          `CREATE TABLE ${target}.${table} AS SELECT * FROM ${source}.main.${table};`,
        );
      }
    }
    await queryDbFile(sdb, `DETACH ${target};`);
    attached = false;
    assertDestination(output, options.overwrite ?? false);
    if (options.overwrite) {
      // Do not fall back to unlinking the original if atomic replacement fails.
      renameSync(temporary, output);
    } else {
      // An exclusive link also protects a destination created during the export.
      linkSync(temporary, output);
    }
  } finally {
    try {
      if (attached) await queryDbFile(sdb, `DETACH ${target};`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

function assertDestination(file: string, overwrite: boolean): void {
  let existing: ReturnType<typeof lstatSync>;
  try {
    existing = lstatSync(file);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  if (!existing.isFile()) {
    throw new Error(
      `The output path ${file} must be a regular file, not a directory or symbolic link.`,
    );
  }
  if (!overwrite) {
    throw new Error(
      `The file ${file} already exists. Set overwrite to true to replace it.`,
    );
  }
}
