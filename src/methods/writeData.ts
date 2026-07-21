import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import cleanPath from "../helpers/cleanPath.ts";
import createDirectory from "../helpers/createDirectory.ts";
import getExtension from "../helpers/getExtension.ts";
import hasGeometryColumn from "../helpers/hasGeometryColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import writeDataAsArrays from "../helpers/writeDataAsArrays.ts";
import { existsSync, rmSync } from "node:fs";

export default async function writeData(
  simpleTable: SimpleTable,
  file: string,
  options: {
    compression?: boolean;
    dataAsArrays?: boolean;
    formatDates?: boolean;
  } = {},
) {
  if (await hasGeometryColumn(simpleTable)) {
    throw new Error(
      "Table contains geometry columns. Use writeGeoData() instead.",
    );
  }

  createDirectory(file);

  const extension = getExtension(file);

  if (options.dataAsArrays) {
    await writeDataAsArrays(simpleTable, file);
  } else {
    await queryDB(
      simpleTable,
      writeDataQuery(simpleTable.name, file, extension, options),
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "writeData()",
        parameters: { file, options },
      }),
    );
  }
}

function writeDataQuery(
  table: string,
  file: string,
  fileExtension: string,
  options: { compression?: boolean; formatDates?: boolean },
) {
  const cleanedFile = cleanPath(file);
  if (fileExtension === "csv") {
    return `COPY ${quoteIdentifier(table)} TO '${
      options.compression ? cleanedFile + ".gz" : cleanedFile
    }' (DELIMITER ',', HEADER TRUE${
      options.compression ? ", COMPRESSION GZIP" : ""
    }${
      options.formatDates
        ? ", DATEFORMAT '%xT%X.%gZ', TIMESTAMPFORMAT '%xT%X.%gZ'"
        : ""
    });`;
  } else if (fileExtension === "json") {
    return `COPY ${quoteIdentifier(table)} TO '${
      options.compression ? cleanedFile + ".gz" : cleanedFile
    }' (FORMAT JSON, ARRAY TRUE${
      options.compression ? ", COMPRESSION GZIP" : ""
    }${
      options.formatDates
        ? ", DATEFORMAT '%xT%X.%gZ', TIMESTAMPFORMAT '%xT%X.%gZ'"
        : ""
    });`;
  } else if (fileExtension === "parquet") {
    if (options.compression) {
      return `COPY ${
        quoteIdentifier(table)
      } TO '${cleanedFile}' (FORMAT PARQUET, COMPRESSION ZSTD);`;
    } else {
      return `COPY ${
        quoteIdentifier(table)
      } TO '${cleanedFile}' (FORMAT PARQUET);`;
    }
  } else if (fileExtension === "db") {
    if (existsSync(file)) {
      rmSync(file);
    }
    const database = quoteIdentifier("my_database");
    return `ATTACH '${cleanedFile}' AS ${database};
COPY FROM DATABASE ${quoteIdentifier("memory")} TO ${database};
CREATE OR REPLACE TABLE ${database}.${
      quoteIdentifier(table)
    } AS SELECT * FROM ${quoteIdentifier(table)};
DETACH ${database};`;
  } else if (fileExtension === "sqlite") {
    if (existsSync(file)) {
      rmSync(file);
    }
    const database = quoteIdentifier("my_sqlite_db");
    return `INSTALL sqlite; LOAD sqlite;
    ATTACH '${cleanedFile}' AS ${database} (TYPE SQLITE);
    CREATE TABLE ${database}.${quoteIdentifier(table)} AS SELECT * FROM ${
      quoteIdentifier(table)
    };
    DETACH ${database};`;
  } else {
    throw new Error(`Unknown extension ${fileExtension}`);
  }
}
