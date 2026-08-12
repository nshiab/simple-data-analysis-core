import { randomUUID } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { createInterface } from "node:readline";
import {
  type DuckDBArrayType,
  type DuckDBConnection,
  type DuckDBListType,
  type DuckDBMapType,
  type DuckDBStructType,
  type DuckDBType,
  DuckDBTypeId,
  type DuckDBUnionType,
  type DuckDBValue,
} from "@duckdb/node-api";
import cleanPath from "./cleanPath.ts";
import createDirectory from "./createDirectory.ts";
import { makeConverter } from "./runQuery.ts";

export const resultTransportDirectory = ".tmp/result-transport";

const rawJsonNumber = Symbol("rawJsonNumber");

type ParsedJsonNumber = {
  [rawJsonNumber]: string;
};

type ParsedJsonValue =
  | null
  | boolean
  | string
  | ParsedJsonNumber
  | ParsedJsonValue[]
  | { [key: string]: ParsedJsonValue };

type FileQueryOptions = {
  table?: string | null;
  values?: DuckDBValue[];
  rejectGeometry?: boolean;
};

type FileQueryMetadata = {
  fileQuery: string;
  values: DuckDBValue[];
  fileColumnNames: readonly string[];
  columnNames: readonly string[];
  columnTypes: readonly DuckDBType[];
  tableName: string | null;
};

function leadingKeyword(query: string): string | undefined {
  const withoutLeadingComments = query.replace(
    /^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/,
    "",
  );
  return withoutLeadingComments.match(/^([A-Za-z]+)/)?.[1].toUpperCase();
}

function assertFileTransportQuery(query: string): void {
  const unsupportedKeywords = new Set([
    "ALTER",
    "ATTACH",
    "CALL",
    "CHECKPOINT",
    "COPY",
    "CREATE",
    "DELETE",
    "DESCRIBE",
    "DESC",
    "DETACH",
    "DROP",
    "EXPLAIN",
    "EXPORT",
    "IMPORT",
    "INSERT",
    "INSTALL",
    "LOAD",
    "MERGE",
    "PRAGMA",
    "SET",
    "SHOW",
    "TRUNCATE",
    "UPDATE",
    "USE",
  ]);
  const keyword = leadingKeyword(query);
  if (keyword !== undefined && unsupportedKeywords.has(keyword)) {
    throw new Error(
      `File data transport cannot materialize rows from a ${keyword} statement. Use dataTransport: "direct" for this custom query.`,
    );
  }
}

function directMetadataQuery(query: string): string {
  const trailingLimit =
    /\bLIMIT\s+(?:\d+|ALL|\?)(?=(?:\s+OFFSET\s+(?:\d+|\?))?\s*$)/i;
  return trailingLimit.test(query)
    ? query.replace(trailingLimit, "LIMIT 0")
    : `${query} LIMIT 0`;
}

function removeTemporaryResultFile(
  path: string,
  operationError?: unknown,
): void {
  try {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch (cleanupError) {
    if (operationError !== undefined) {
      throw new AggregateError(
        [operationError, cleanupError],
        "The result transport operation and scratch-file cleanup both failed.",
        { cause: operationError },
      );
    }
    throw cleanupError;
  }
}

/**
 * Runs an operation with a uniquely named scratch result file and always
 * removes that file afterward. If both the operation and cleanup fail, the
 * thrown `AggregateError` retains the operation error first.
 *
 * @param extension - The scratch file extension.
 * @param useFile - The operation that owns the scratch file.
 * @returns The value returned by the operation.
 * @internal
 *
 * @example
 * ```ts
 * const rows = await withTemporaryResultFile("json", async (path) => {
 *   await writeRows(path);
 *   return JSON.parse(await Deno.readTextFile(path));
 * });
 * ```
 */
export async function withTemporaryResultFile<Result>(
  extension: "json",
  useFile: (path: string) => Result | Promise<Result>,
): Promise<Result> {
  const path = `${resultTransportDirectory}/${randomUUID()}.${extension}`;
  let outcome:
    | { success: true; value: Result }
    | { success: false; error: unknown };

  try {
    createDirectory(path);
    outcome = { success: true, value: await useFile(path) };
  } catch (error) {
    outcome = { success: false, error };
  }

  let cleanupError: unknown;
  try {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch (error) {
    cleanupError = error;
  }

  if (!outcome.success) {
    if (cleanupError !== undefined) {
      throw new AggregateError(
        [outcome.error, cleanupError],
        "The result transport operation and scratch-file cleanup both failed.",
        { cause: outcome.error },
      );
    }
    throw outcome.error;
  }
  if (cleanupError !== undefined) {
    throw cleanupError;
  }
  return outcome.value;
}

function quoteNonFiniteJsonNumbers(json: string): string {
  let quoted = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < json.length; index++) {
    const character = json[index];
    if (inString) {
      quoted += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      quoted += character;
      continue;
    }

    const token = json.startsWith("-Infinity", index)
      ? "-Infinity"
      : json.startsWith("Infinity", index)
      ? "Infinity"
      : json.startsWith("NaN", index)
      ? "NaN"
      : null;
    if (token !== null) {
      quoted += `"${token}"`;
      index += token.length - 1;
    } else {
      quoted += character;
    }
  }

  return quoted;
}

function parseJson(json: string): ParsedJsonValue {
  const parseWithSource = JSON.parse as unknown as (
    text: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source: string },
    ) => unknown,
  ) => unknown;
  return parseWithSource(
    quoteNonFiniteJsonNumbers(json),
    (_key: string, value: unknown, context: { source: string }) =>
      typeof value === "number" ? { [rawJsonNumber]: context.source } : value,
  ) as ParsedJsonValue;
}

function isParsedJsonNumber(value: ParsedJsonValue): value is ParsedJsonNumber {
  return typeof value === "object" && value !== null &&
    rawJsonNumber in value;
}

function isParsedJsonObject(
  value: ParsedJsonValue,
): value is { [key: string]: ParsedJsonValue } {
  return typeof value === "object" && value !== null &&
    !Array.isArray(value) && !isParsedJsonNumber(value);
}

function numberText(value: ParsedJsonValue): string {
  if (isParsedJsonNumber(value)) {
    return value[rawJsonNumber];
  }
  if (typeof value === "string") {
    return value;
  }
  throw new Error(`Expected a JSON number, received ${String(value)}.`);
}

function numberValue(value: ParsedJsonValue): number {
  return Number(numberText(value));
}

function stringValue(value: ParsedJsonValue): string {
  if (typeof value === "string") {
    return value;
  }
  if (isParsedJsonNumber(value)) {
    return value[rawJsonNumber];
  }
  throw new Error(`Expected a JSON scalar, received ${String(value)}.`);
}

function dateValue(value: ParsedJsonValue, timestamp: boolean): Date {
  const text = stringValue(value);
  return new Date(
    timestamp ? `${text.replace(" ", "T")}Z` : `${text}T00:00:00Z`,
  );
}

function intervalValue(value: ParsedJsonValue): {
  months: number;
  days: number;
  micros: string;
} {
  const text = stringValue(value);
  let months = 0;
  let days = 0;

  for (const match of text.matchAll(/([+-]?\d+)\s+(years?|months?|days?)/g)) {
    const amount = Number(match[1]);
    if (match[2].startsWith("year")) {
      months += amount * 12;
    } else if (match[2].startsWith("month")) {
      months += amount;
    } else {
      days += amount;
    }
  }

  const time = text.match(/([+-])?(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (time === null) {
    throw new Error(`Could not parse DuckDB interval ${JSON.stringify(text)}.`);
  }
  const sign = time[1] === "-" ? -1n : 1n;
  const hours = BigInt(time[2]);
  const minutes = BigInt(time[3]);
  const seconds = BigInt(time[4]);
  const fraction = BigInt((time[5] ?? "").padEnd(6, "0").slice(0, 6) || "0");
  const micros = sign *
    (((hours * 60n + minutes) * 60n + seconds) * 1_000_000n + fraction);

  return { months, days, micros: String(micros) };
}

function mapKeyValue(value: string, type: DuckDBType): ParsedJsonValue {
  switch (type.typeId) {
    case DuckDBTypeId.BOOLEAN:
      return value === "true";
    case DuckDBTypeId.TINYINT:
    case DuckDBTypeId.SMALLINT:
    case DuckDBTypeId.INTEGER:
    case DuckDBTypeId.BIGINT:
    case DuckDBTypeId.UTINYINT:
    case DuckDBTypeId.USMALLINT:
    case DuckDBTypeId.UINTEGER:
    case DuckDBTypeId.UBIGINT:
    case DuckDBTypeId.FLOAT:
    case DuckDBTypeId.DOUBLE:
    case DuckDBTypeId.HUGEINT:
    case DuckDBTypeId.UHUGEINT:
    case DuckDBTypeId.DECIMAL:
    case DuckDBTypeId.BIGNUM:
      return { [rawJsonNumber]: value };
    default:
      return value;
  }
}

function convertVariantValue(value: ParsedJsonValue): unknown {
  if (isParsedJsonNumber(value)) {
    return numberValue(value);
  }
  if (Array.isArray(value)) {
    return value.map(convertVariantValue);
  }
  if (isParsedJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        convertVariantValue(entry),
      ]),
    );
  }
  return value;
}

function convertValue(
  value: ParsedJsonValue,
  type: DuckDBType,
  columnName: string,
  tableName: string | null,
  topLevel: boolean,
): unknown {
  if (value === null) {
    return null;
  }

  const typeString = type.toString();
  if (topLevel && typeString.toLowerCase().includes("geometry")) {
    return `GEOM(${typeString.replace("GEOMETRY('", "").replace("')", "")})`;
  }
  if (topLevel && typeString.includes("FLOAT[")) {
    return `<${typeString}>`;
  }

  switch (type.typeId) {
    case DuckDBTypeId.BOOLEAN:
      return value === true;
    case DuckDBTypeId.TINYINT:
    case DuckDBTypeId.SMALLINT:
    case DuckDBTypeId.INTEGER:
    case DuckDBTypeId.UTINYINT:
    case DuckDBTypeId.USMALLINT:
    case DuckDBTypeId.UINTEGER:
      return numberValue(value);
    case DuckDBTypeId.BIGINT:
    case DuckDBTypeId.HUGEINT: {
      const raw = numberText(value);
      return topLevel
        ? makeConverter(type, columnName, tableName)(BigInt(raw))
        : raw;
    }
    case DuckDBTypeId.UBIGINT:
    case DuckDBTypeId.UHUGEINT:
    case DuckDBTypeId.BIGNUM:
    case DuckDBTypeId.DECIMAL:
      return numberText(value);
    case DuckDBTypeId.FLOAT:
    case DuckDBTypeId.DOUBLE:
      return typeof value === "string" ? value : numberValue(value);
    case DuckDBTypeId.DATE:
      return topLevel ? dateValue(value, false) : stringValue(value);
    case DuckDBTypeId.TIMESTAMP:
      return topLevel ? dateValue(value, true) : stringValue(value);
    case DuckDBTypeId.TIMESTAMP_S:
    case DuckDBTypeId.TIMESTAMP_MS:
    case DuckDBTypeId.TIMESTAMP_NS:
    case DuckDBTypeId.TIME:
    case DuckDBTypeId.ENUM:
    case DuckDBTypeId.UUID:
    case DuckDBTypeId.BLOB:
    case DuckDBTypeId.BIT:
    case DuckDBTypeId.TIME_TZ:
    case DuckDBTypeId.TIMESTAMP_TZ:
    case DuckDBTypeId.TIME_NS:
    case DuckDBTypeId.GEOMETRY:
      return stringValue(value);
    case DuckDBTypeId.VARCHAR:
      return type.alias === "JSON"
        ? JSON.stringify(convertVariantValue(value))
        : typeof value === "string"
        ? value
        : JSON.stringify(convertVariantValue(value));
    case DuckDBTypeId.INTERVAL:
      return intervalValue(value);
    case DuckDBTypeId.LIST:
    case DuckDBTypeId.ARRAY: {
      if (!Array.isArray(value)) {
        throw new Error(`Expected a JSON array for DuckDB type ${type}.`);
      }
      const valueType = type.typeId === DuckDBTypeId.LIST
        ? (type as DuckDBListType).valueType
        : (type as DuckDBArrayType).valueType;
      return value.map((entry) =>
        convertValue(entry, valueType, columnName, tableName, false)
      );
    }
    case DuckDBTypeId.STRUCT: {
      if (!isParsedJsonObject(value)) {
        throw new Error(`Expected a JSON object for DuckDB type ${type}.`);
      }
      const objectValue = value as { [key: string]: ParsedJsonValue };
      const structType = type as DuckDBStructType;
      return Object.fromEntries(
        structType.entryNames.map((entryName, index) => [
          entryName,
          convertValue(
            objectValue[entryName],
            structType.entryTypes[index],
            columnName,
            tableName,
            false,
          ),
        ]),
      );
    }
    case DuckDBTypeId.MAP: {
      if (!isParsedJsonObject(value)) {
        throw new Error(`Expected a JSON object for DuckDB type ${type}.`);
      }
      const mapType = type as DuckDBMapType;
      return Object.entries(value).map(([key, entry]) => ({
        key: convertValue(
          mapKeyValue(key, mapType.keyType),
          mapType.keyType,
          columnName,
          tableName,
          false,
        ),
        value: convertValue(
          entry,
          mapType.valueType,
          columnName,
          tableName,
          false,
        ),
      }));
    }
    case DuckDBTypeId.UNION: {
      if (!isParsedJsonObject(value)) {
        throw new Error(`Expected a JSON object for DuckDB type ${type}.`);
      }
      const unionType = type as DuckDBUnionType;
      const entry = Object.entries(value)[0];
      if (entry === undefined) {
        throw new Error(`Expected a tagged value for DuckDB type ${type}.`);
      }
      return {
        tag: entry[0],
        value: convertValue(
          entry[1],
          unionType.memberTypeForTag(entry[0]),
          columnName,
          tableName,
          false,
        ),
      };
    }
    case DuckDBTypeId.SQLNULL:
      return null;
    case DuckDBTypeId.VARIANT:
      return convertVariantValue(value);
    default:
      throw new Error(`Unsupported DuckDB type ${type}.`);
  }
}

function parseRows(
  json: string,
  fileColumnNames: readonly string[],
  columnNames: readonly string[],
  columnTypes: readonly DuckDBType[],
  tableName: string | null,
): { [key: string]: unknown }[] {
  const parsed = parseJson(json);
  if (!Array.isArray(parsed)) {
    throw new Error("The scratch result file did not contain a row array.");
  }

  return parsed.map((row) =>
    parseRow(row, fileColumnNames, columnNames, columnTypes, tableName)
  );
}

function parseRow(
  row: ParsedJsonValue,
  fileColumnNames: readonly string[],
  columnNames: readonly string[],
  columnTypes: readonly DuckDBType[],
  tableName: string | null,
): { [key: string]: unknown } {
  if (!isParsedJsonObject(row)) {
    throw new Error("The scratch result file contained a non-object row.");
  }
  const objectRow = row as { [key: string]: ParsedJsonValue };
  return Object.fromEntries(columnNames.map((columnName, index) => {
    const fileColumnName = fileColumnNames[index];
    if (!(fileColumnName in objectRow)) {
      throw new Error(
        `The scratch result file is missing column ${
          JSON.stringify(fileColumnName)
        }.`,
      );
    }
    return [
      columnName,
      convertValue(
        objectRow[fileColumnName],
        columnTypes[index],
        columnName,
        tableName,
        true,
      ),
    ];
  }));
}

async function prepareFileQuery(
  query: string,
  connection: DuckDBConnection,
  options: FileQueryOptions,
): Promise<FileQueryMetadata> {
  assertFileTransportQuery(query);
  const values = options.values ?? [];
  const logicalQuery = query.replace(/;\s*$/, "");
  const fileQuery = `SELECT * FROM (${logicalQuery})`;
  const fileMetadata = await connection.run(`${fileQuery} LIMIT 0`, values);
  const directMetadata = await connection.run(
    directMetadataQuery(logicalQuery),
    values,
  );
  const columnNames = directMetadata.deduplicatedColumnNames();
  const columnTypes = directMetadata.columnTypes();
  if (
    options.rejectGeometry === true &&
    columnTypes.some((type) =>
      type.toString().toLowerCase().includes("geometry")
    )
  ) {
    throw new Error(
      "The query returns geometry columns. Use getGeoData() instead.",
    );
  }
  return {
    fileQuery,
    values,
    fileColumnNames: fileMetadata.deduplicatedColumnNames(),
    columnNames,
    columnTypes,
    tableName: options.table ?? null,
  };
}

/**
 * Executes a bulk query through a scratch JSON file without fetching its
 * result chunks through DuckDB's Node API.
 *
 * @param query - The logical query whose rows should be returned.
 * @param connection - The DuckDB connection used for metadata and export.
 * @param options - Query values and table attribution.
 * @returns Converted row objects matching the direct query transport.
 * @internal
 *
 * @example
 * ```ts
 * const rows = await runQueryFromFile(
 *   'SELECT * FROM "employees"',
 *   connection,
 *   { table: "employees" },
 * );
 * ```
 */
export default async function runQueryFromFile(
  query: string,
  connection: DuckDBConnection,
  options: FileQueryOptions,
): Promise<{ [key: string]: unknown }[]> {
  const metadata = await prepareFileQuery(query, connection, options);

  return await withTemporaryResultFile("json", async (path) => {
    await connection.run(
      `COPY (${metadata.fileQuery}) TO '${
        cleanPath(path)
      }' (FORMAT JSON, ARRAY TRUE)`,
      metadata.values,
    );
    return parseRows(
      readFileSync(path, "utf8"),
      metadata.fileColumnNames,
      metadata.columnNames,
      metadata.columnTypes,
      metadata.tableName,
    );
  });
}

/**
 * Streams a relational query through a newline-delimited scratch JSON file
 * without fetching result chunks through DuckDB's Node API.
 *
 * @param query - The logical query whose rows should be streamed.
 * @param connection - The DuckDB connection used for metadata and export.
 * @param options - Query values, table attribution, and geometry handling.
 * @returns An async generator yielding converted row objects.
 * @internal
 *
 * @example
 * ```ts
 * for await (const row of streamQueryFromFile(
 *   'SELECT * FROM "employees"',
 *   connection,
 *   { table: "employees" },
 * )) {
 *   console.log(row);
 * }
 * ```
 */
export async function* streamQueryFromFile(
  query: string,
  connection: DuckDBConnection,
  options: FileQueryOptions,
): AsyncGenerator<{ [key: string]: unknown }, void, undefined> {
  const metadata = await prepareFileQuery(query, connection, options);
  const path = `${resultTransportDirectory}/${randomUUID()}.json`;
  let operationError: unknown;

  try {
    createDirectory(path);
    await connection.run(
      `COPY (${metadata.fileQuery}) TO '${cleanPath(path)}' (FORMAT JSON)`,
      metadata.values,
    );
    const input = createReadStream(path, { encoding: "utf8" });
    const lines = createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (line.length === 0) {
          continue;
        }
        yield parseRow(
          parseJson(line),
          metadata.fileColumnNames,
          metadata.columnNames,
          metadata.columnTypes,
          metadata.tableName,
        );
      }
    } finally {
      lines.close();
      input.destroy();
    }
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    removeTemporaryResultFile(path, operationError);
  }
}
