import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import parseValue from "../helpers/parseValue.ts";
import queueOp from "../helpers/queueOp.ts";
import getExtension from "../helpers/getExtension.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function loadData(
  simpleTable: SimpleTable,
  files: string | string[],
  options: {
    fileType?: "csv" | "dsv" | "json" | "parquet" | "excel";
    autoDetect?: boolean;
    limit?: number;
    filename?: boolean;
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
    encoding?: string;
    strict?: boolean;
    // json options
    jsonFormat?: "unstructured" | "newlineDelimited" | "array";
    records?: boolean;
    // excel options
    sheet?: string;
  } = {},
) {
  files = Array.isArray(files) ? [...files] : files;
  options = structuredClone(options);
  // Building the SELECT doesn't need the database, so invalid arguments
  // (like the columns option with an Excel file) throw at call time.
  const select = loadDataSelect(stringToArray(files), options);

  queueOp(simpleTable, {
    kind: "source",
    method: "loadData()",
    parameters: { files, options },
    buildSelect: () => select,
  });
}

type LoadDataOptions = {
  fileType?: "csv" | "dsv" | "json" | "parquet" | "excel";
  autoDetect?: boolean;
  limit?: number;
  filename?: boolean;
  unifyColumns?: boolean;
  columnTypes?: { [key: string]: string };
  columns?: string[];
  header?: boolean;
  allText?: boolean;
  delim?: string;
  skip?: number;
  nullPadding?: boolean;
  ignoreErrors?: boolean;
  compression?: "none" | "gzip" | "zstd";
  encoding?: string;
  strict?: boolean;
  jsonFormat?: "unstructured" | "newlineDelimited" | "array";
  records?: boolean;
  sheet?: string;
};

export function loadDataQuery(
  table: string,
  files: string[],
  options: LoadDataOptions = {},
) {
  return `CREATE OR REPLACE TABLE ${quoteIdentifier(table)} AS ${
    loadDataSelect(files, options)
  };`;
}

function loadDataSelect(
  files: string[],
  options: LoadDataOptions = {},
) {
  const fileExtension = getExtension(files[0]);
  if (
    options.fileType !== undefined &&
    !["csv", "dsv", "json", "parquet", "excel"].includes(options.fileType)
  ) {
    throw unsupportedFileTypeError(
      files[0],
      options.fileType,
      fileExtension,
    );
  }
  const filesAsString = "[" +
    files.map((file) => parseValue(file)).join(", ") +
    "]";

  // Column selection: throw for Excel, build SELECT list for others
  const isExcel = options.fileType === "excel" || fileExtension === "xlsx";
  if (options.columns && options.columns.length > 0 && isExcel) {
    throw new Error(
      "The 'columns' option is not supported for Excel files.",
    );
  }
  const selectColumns = options.columns && options.columns.length > 0
    ? options.columns.map((c) => `${quoteIdentifier(c)}`).join(", ")
    : "*";

  // General options, except for parquet
  const autoDetect = typeof options.autoDetect === "boolean"
    ? `, auto_detect=${String(options.autoDetect).toUpperCase()}`
    : ", auto_detect=TRUE";
  const columnTypes = options.columnTypes
    ? `, columns={${
      Object.entries(options.columnTypes).map(([column, type]) =>
        `${parseValue(column)}: ${parseValue(type)}`
      ).join(", ")
    }}`
    : "";
  const filename = typeof options.filename === "boolean"
    ? `, filename=${String(options.filename).toUpperCase()}`
    : "";
  const unifyColumns = typeof options.unifyColumns === "boolean"
    ? `, union_by_name=${String(options.unifyColumns).toUpperCase()}`
    : "";
  const generalOptions =
    `${autoDetect}${columnTypes}${filename}${unifyColumns}`;

  const limit = typeof options.limit === "number"
    ? ` LIMIT ${options.limit}`
    : "";

  if (
    options.fileType === "csv" ||
    fileExtension === "csv" ||
    options.fileType === "dsv" ||
    typeof options.delim === "string"
  ) {
    const header = typeof options.header === "boolean"
      ? `, header=${String(options.header).toUpperCase()}`
      : ", header=TRUE";
    const allText = typeof options.allText === "boolean"
      ? `, all_varchar=${String(options.allText).toUpperCase()}`
      : "";
    const delim = options.delim ? `, delim=${parseValue(options.delim)}` : "";
    const skip = options.skip ? `, skip=${options.skip}` : "";
    const ignoreErrors = options.ignoreErrors
      ? `, ignore_errors	=${options.ignoreErrors}`
      : "";
    const nullPadding = options.nullPadding
      ? `, null_padding=${options.nullPadding}`
      : "";
    const compression = options.compression
      ? `, compression=${parseValue(options.compression)}`
      : "";
    const encoding = options.encoding
      ? `, encoding=${parseValue(options.encoding)}`
      : "";
    const strict = options.strict === false ? `, strict_mode=FALSE` : "";

    return `SELECT ${selectColumns} FROM read_csv_auto(${filesAsString}${generalOptions}${header}${allText}${delim}${skip}${compression}${encoding}${strict}${nullPadding}${ignoreErrors})${limit}`;
  } else if (options.fileType === "json" || fileExtension === "json") {
    // DuckDB expects "newline_delimited" (snake_case), unlike the other two
    // format values, which already match the public camelCase option.
    const jsonFormat = options.jsonFormat
      ? `, format=${
        parseValue(
          options.jsonFormat === "newlineDelimited"
            ? "newline_delimited"
            : options.jsonFormat,
        )
      }`
      : "";
    const records = typeof options.records === "boolean"
      ? `, records=${String(options.records).toUpperCase()}`
      : "";
    return `SELECT ${selectColumns} FROM read_json_auto(${filesAsString}${generalOptions}${jsonFormat}${records})${limit}`;
  } else if (options.fileType === "parquet" || fileExtension === "parquet") {
    return `SELECT ${selectColumns} FROM read_parquet(${filesAsString}${filename}${unifyColumns})${limit}`;
  } else if (options.fileType === "excel" || fileExtension === "xlsx") {
    if (files.length > 1) {
      throw new Error(
        "For excel files or files with extension .xlsx, you can pass only one file at the time.",
      );
    }

    const header = typeof options.header === "boolean"
      ? `, header=${String(options.header).toUpperCase()}`
      : ", header=TRUE";
    const allText = typeof options.allText === "boolean"
      ? `, all_varchar=${String(options.allText).toUpperCase()}`
      : "";

    return `SELECT ${selectColumns} FROM read_xlsx(${parseValue(files[0])}${
      options.sheet ? `, sheet=${parseValue(options.sheet)}` : ""
    }${header}${allText})`;
  } else {
    throw unsupportedFileTypeError(
      files[0],
      options.fileType,
      fileExtension,
    );
  }
}

function unsupportedFileTypeError(
  file: string,
  fileType: string | undefined,
  fileExtension: string,
): Error {
  const receivedFileType = JSON.stringify(fileType) ?? String(fileType);
  return new Error(
    `loadData() could not determine a supported file type for ${
      JSON.stringify(file)
    }. options.fileType: ${receivedFileType}. Detected extension: ${
      JSON.stringify(`.${fileExtension}`)
    }. Supported file types: "csv", "dsv", "json", "parquet", and "excel" (for .xlsx files).`,
  );
}
