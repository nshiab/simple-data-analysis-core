import { existsSync, rmSync } from "node:fs";
import cleanPath from "../helpers/cleanPath.ts";
import createDirectory from "../helpers/createDirectory.ts";
import getExtension from "../helpers/getExtension.ts";
import getName from "../helpers/getName.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import writeIndexes from "../helpers/writeIndexes.ts";
import type SimpleDB from "../class/SimpleDB.ts";

export default async function writeDB(
  simpleDB: SimpleDB,
  file: string,
  options: { metadata?: boolean } = {},
) {
  const metadata = options.metadata ?? true;

  if (existsSync(file)) {
    rmSync(file);
  }
  createDirectory(file);
  const extension = getExtension(file);

  if (metadata) {
    writeIndexes(simpleDB, extension, file);
  }

  const name = getName(file);
  const quotedName = quoteIdentifier(name);
  const sourceName = quoteIdentifier(getName(simpleDB.file));
  if (extension === "db") {
    await queryDB(
      simpleDB,
      `ATTACH '${cleanPath(file)}' AS ${quotedName};
COPY FROM DATABASE ${sourceName} TO ${quotedName};
DETACH ${quotedName};`,
      mergeOptions(simpleDB, {
        returnData: false,
        table: null,
        method: "writeDB()",
        parameters: {},
      }),
    );
  } else if (extension === "sqlite") {
    await queryDB(
      simpleDB,
      `INSTALL sqlite; LOAD sqlite;
        ATTACH '${cleanPath(file)}' AS ${quotedName} (TYPE SQLITE);
COPY FROM DATABASE ${sourceName} TO ${quotedName};
DETACH ${quotedName};`,
      mergeOptions(simpleDB, {
        returnData: false,
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
