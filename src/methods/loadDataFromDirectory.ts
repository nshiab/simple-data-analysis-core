import { readdirSync } from "node:fs";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import { loadDataQuery } from "./loadData.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function loadDataFromDirectory(
  simpleTable: SimpleTable,
  directory: string,
  options: {
    fileType?: "csv" | "dsv" | "json" | "parquet" | "excel";
    autoDetect?: boolean;
    limit?: number;
    fileName?: boolean;
    unifyColumns?: boolean;
    columnTypes?: { [key: string]: string };
    // column selection
    columns?: string[];
    // csv options
    header?: boolean;
    allText?: boolean;
    delim?: string;
    skip?: number;
    nullPadding?: boolean;
    ignoreErrors?: boolean;
    compression?: "none" | "gzip" | "zstd";
    encoding?: "utf-8" | "utf-16" | "latin-1";
    strict?: boolean;
    // json options
    jsonFormat?: "unstructured" | "newlineDelimited" | "array";
    records?: boolean;
    // excel options
    sheet?: string;
  } = {},
) {
  const files = readdirSync(directory).map(
    (file) =>
      `${directory.slice(-1) === "/" ? directory : directory + "/"}${file}`,
  );
  await queryDB(
    simpleTable,
    loadDataQuery(simpleTable.name, files, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "loadDataFromDirectory",
      parameters: { directory, options },
    }),
  );
}
