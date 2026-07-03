import { existsSync, rmSync } from "node:fs";
import cleanPath from "../helpers/cleanPath.ts";
import createDirectory from "../helpers/createDirectory.ts";
import getExtension from "../helpers/getExtension.ts";
import getName from "../helpers/getName.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import writeIndexes from "../helpers/writeIndexes.ts";
import type SimpleDB from "../class/SimpleDB.ts";

export default async function writeDB(
  simpleDB: SimpleDB,
  file: string,
  options: { noMetaData?: boolean } = {},
) {
  const noMetaData = options.noMetaData ?? false;

  if (existsSync(file)) {
    rmSync(file);
  }
  createDirectory(file);
  const extension = getExtension(file);

  if (!noMetaData) {
    writeIndexes(simpleDB, extension, file);
  }

  const name = getName(file);
  if (extension === "db") {
    await queryDB(
      simpleDB,
      `ATTACH '${cleanPath(file)}' AS ${name};
COPY FROM DATABASE ${getName(simpleDB.file)} TO ${name};
DETACH ${name};`,
      mergeOptions(simpleDB, {
        returnDataFrom: "none",
        table: null,
        method: "writeDB()",
        parameters: {},
      }),
    );
  } else if (extension === "sqlite") {
    await queryDB(
      simpleDB,
      `INSTALL sqlite; LOAD sqlite;
        ATTACH '${cleanPath(file)}' AS ${name} (TYPE SQLITE);
COPY FROM DATABASE ${getName(simpleDB.file)} TO ${name};
DETACH ${name};`,
      mergeOptions(simpleDB, {
        returnDataFrom: "none",
        table: null,
        method: "writeDB()",
        parameters: {},
      }),
    );
  } else {
    throw new Error(
      `The extension ${extension} is not supported. Please use .db or .sqlite instead.`,
    );
  }
}
