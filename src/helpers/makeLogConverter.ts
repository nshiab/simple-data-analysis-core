import {
  type DuckDBType,
  DuckDBTypeId,
  type DuckDBValue,
} from "@duckdb/node-api";
import LogValue from "./LogValue.ts";

/** Formats native temporal values before extraction can discard precision. */
export default function makeLogConverter(
  type: DuckDBType,
  convert: (value: DuckDBValue) => unknown,
): (value: DuckDBValue) => LogValue {
  const sqlType = type.toString();
  const floatArray = sqlType.includes("FLOAT[");
  const placeholder = sqlType.toLowerCase().includes("geometry") ||
    floatArray;
  const temporal = [
    DuckDBTypeId.DATE,
    DuckDBTypeId.TIME,
    DuckDBTypeId.TIME_TZ,
    DuckDBTypeId.TIME_NS,
    DuckDBTypeId.TIMESTAMP,
    DuckDBTypeId.TIMESTAMP_TZ,
    DuckDBTypeId.TIMESTAMP_S,
    DuckDBTypeId.TIMESTAMP_MS,
    DuckDBTypeId.TIMESTAMP_NS,
  ].includes(type.typeId);
  const numeric = !placeholder &&
    /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|DOUBLE|DECIMAL|BIGNUM)(\(|$)/
      .test(sqlType);
  const jsType = placeholder ? "string" : type.typeId === DuckDBTypeId.DATE ||
      type.typeId === DuckDBTypeId.TIMESTAMP
    ? "object"
    : temporal
    ? "string"
    : type.typeId === DuckDBTypeId.BOOLEAN
    ? "boolean"
    : numeric
    ? (/^(DECIMAL|BIGNUM)/.test(sqlType) ? "string" : "number")
    : [
        DuckDBTypeId.LIST,
        DuckDBTypeId.ARRAY,
        DuckDBTypeId.STRUCT,
        DuckDBTypeId.MAP,
        DuckDBTypeId.UNION,
        DuckDBTypeId.INTERVAL,
      ].includes(type.typeId)
    ? "object"
    : "string";
  return (value) => {
    if (value === null) return new LogValue("null", jsType, "null");
    // TIMESTAMPTZ uses the existing UTC converter, independent of process timezone.
    const converted = floatArray
      ? `<${sqlType}>`
      : temporal && type.typeId !== DuckDBTypeId.TIMESTAMP_TZ
      ? String(value)
      : convert(value);
    const text = typeof converted === "object" && converted !== null
      ? JSON.stringify(converted)
      : String(converted);
    return new LogValue(
      text,
      // NaN and infinities are strings in the public JSON conversion.
      temporal ? jsType : typeof converted,
      temporal
        ? "date"
        : numeric
        ? "number"
        : jsType === "boolean"
        ? "boolean"
        : "string",
    );
  };
}
