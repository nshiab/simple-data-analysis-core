import { existsSync, readFileSync } from "node:fs";
import cleanPath from "../helpers/cleanPath.ts";
import getExtension from "../helpers/getExtension.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import setDbProps from "../helpers/setDbProps.ts";
import type SimpleDB from "../class/SimpleDB.ts";
import type { IndexDefinition } from "../helpers/indexDefinitions.ts";

export default async function loadDB(
  simpleDB: SimpleDB,
  file: string,
  options: {
    name?: string;
    detach?: boolean;
  } = {},
) {
  const name = options.name ?? "my_database";
  const quotedName = quoteIdentifier(name);
  const memory = quoteIdentifier("memory");
  const detach = options.detach ?? true;

  if (!existsSync(file)) {
    throw new Error(`The file ${file} does not exist.`);
  }
  const extension = getExtension(file);
  if (extension !== "db" && extension !== "sqlite") {
    throw new Error(
      `The extension ${extension} is not supported. Please use .db or .sqlite instead.`,
    );
  }

  const allIndexesFile = `${file.replace(`.${extension}`, "")}_indexes.json`;
  const indexes = existsSync(allIndexesFile)
    ? JSON.parse(readFileSync(allIndexesFile, "utf-8")) as {
      [table: string]: IndexDefinition[];
    }
    : {};
  const hasVssIndex = Object.values(indexes).some((definitions) =>
    definitions.some(({ kind }) => kind === "vss")
  );
  if (hasVssIndex) {
    await simpleDB.customQuery(`INSTALL vss; LOAD vss;`);
  }

  if (extension === "db") {
    if (detach) {
      await queryDB(
        simpleDB,
        `ATTACH '${cleanPath(file)}' AS ${quotedName};
COPY FROM DATABASE ${quotedName} TO ${memory};
DETACH ${quotedName};`,
        mergeOptions(simpleDB, {
          returnData: false,
          table: null,
          method: "loadDB()",
          parameters: {},
        }),
      );
    } else {
      await queryDB(
        simpleDB,
        `ATTACH '${cleanPath(file)}' AS ${quotedName};
          USE ${quotedName};`,
        mergeOptions(simpleDB, {
          returnData: false,
          table: null,
          method: "loadDB()",
          parameters: {},
        }),
      );
    }
  } else if (extension === "sqlite") {
    if (detach) {
      await queryDB(
        simpleDB,
        `INSTALL sqlite; LOAD sqlite;
        ATTACH '${cleanPath(file)}' AS ${quotedName} (TYPE SQLITE);
COPY FROM DATABASE ${quotedName} TO ${memory};
DETACH ${quotedName};`,
        mergeOptions(simpleDB, {
          returnData: false,
          table: null,
          method: "loadDB()",
          parameters: {},
        }),
      );
    } else {
      await queryDB(
        simpleDB,
        `INSTALL sqlite; LOAD sqlite;
        ATTACH '${cleanPath(file)}' AS ${quotedName} (TYPE SQLITE);
        USE ${quotedName};`,
        mergeOptions(simpleDB, {
          returnData: false,
          table: null,
          method: "loadDB()",
          parameters: {},
        }),
      );
    }
  }

  await setDbProps(simpleDB, indexes);
}
