import {
  type DuckDBConnection,
  type DuckDBDateValue,
  type DuckDBTimestampValue,
  type DuckDBType,
  DuckDBTypeId,
  type DuckDBValue,
  JsonDuckDBValueConverter,
} from "@duckdb/node-api";

const msPerDay = 24 * 60 * 60 * 1000;
const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);
const minSafeInteger = BigInt(Number.MIN_SAFE_INTEGER);

// Columns already warned about for precision loss, so each column warns only once.
const warnedUnsafeIntegerColumns = new Set<string>();

function makeIntegerConverter(columnName: string) {
  return (value: DuckDBValue) => {
    if (value === null) {
      return null;
    }
    const bigintValue = value as bigint;
    if (
      (bigintValue > maxSafeInteger || bigintValue < minSafeInteger) &&
      !warnedUnsafeIntegerColumns.has(columnName)
    ) {
      warnedUnsafeIntegerColumns.add(columnName);
      console.warn(
        `SDA: Column "${columnName}" has at least one value exceeding Number.MAX_SAFE_INTEGER. Converted numbers may lose precision.`,
      );
    }
    return Number(bigintValue);
  };
}

function makeConverter(
  type: DuckDBType,
  columnName: string,
): (value: DuckDBValue) => unknown {
  const typeString = type.toString();
  if (typeString.toLowerCase().includes("geometry")) {
    const placeholder = `GEOM(${
      typeString.replace("GEOMETRY('", "").replace("')", "")
    })`;
    return (value) => (value === null ? null : placeholder);
  }
  if (typeString.includes("FLOAT[")) {
    const placeholder = `<${typeString}>`;
    return (value) => (value === null ? null : placeholder);
  }
  switch (type.typeId) {
    case DuckDBTypeId.DATE:
      return (value) =>
        value === null
          ? null
          : new Date((value as DuckDBDateValue).days * msPerDay);
    case DuckDBTypeId.TIMESTAMP:
      return (value) => {
        if (value === null) {
          return null;
        }
        const micros = (value as DuckDBTimestampValue).micros;
        // Floor division, so sub-millisecond precision truncates toward
        // the past for dates before the epoch too.
        const ms = micros >= 0n ? micros / 1000n : (micros - 999n) / 1000n;
        return new Date(Number(ms));
      };
    case DuckDBTypeId.BIGINT:
    case DuckDBTypeId.HUGEINT:
      return makeIntegerConverter(columnName);
    default:
      return (value) =>
        JsonDuckDBValueConverter(value, type, JsonDuckDBValueConverter);
  }
}

export default async function runQuery(
  query: string,
  connection: DuckDBConnection,
  returnDataFromQuery: boolean,
  options: {
    debug: boolean;
    method: string | null;
    parameters: { [key: string]: unknown } | null;
  },
): Promise<
  | {
    [key: string]: number | string | Date | boolean | null;
  }[]
  | null
> {
  try {
    if (returnDataFromQuery) {
      const reader = await connection.runAndReadAll(query);
      const columnNames = reader.deduplicatedColumnNames();
      const columnTypes = reader.columnTypes();
      const converters = columnTypes.map((type, i) =>
        makeConverter(type, columnNames[i])
      );
      const nbColumns = columnNames.length;
      const rawRows = reader.getRows();
      const rows = new Array(rawRows.length);
      for (let i = 0; i < rawRows.length; i++) {
        const rawRow = rawRows[i];
        const row: { [key: string]: unknown } = {};
        for (let j = 0; j < nbColumns; j++) {
          row[columnNames[j]] = converters[j](rawRow[j]);
        }
        rows[i] = row;
      }
      return rows as {
        [key: string]: number | string | Date | boolean | null;
      }[];
    } else {
      await connection.run(query);
      return null;
    }
  } catch (error) {
    console.warn(error);
    if (options.debug === false) {
      console.log("SDA: method causing error =>", options.method);
      console.log("parameters:", options.parameters);
      console.log("query:", query);
    }
    throw error;
  }
}
