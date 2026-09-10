export default function parseType(
  type:
    | "integer"
    | "float"
    | "number"
    | "string"
    | "date"
    | "time"
    | "datetime"
    | "datetimeTz"
    | "bigint"
    | "double"
    | "varchar"
    | "timestamp"
    | "timestamp with time zone"
    | "boolean"
    | "json"
    | "JSON"
    | `float[${number}]`
    | `FLOAT[${number}]`
    | `geometry('${string}')`
    | `GEOMETRY('${string}')`,
) {
  const typeLowerCase = type.toLowerCase();
  if (typeLowerCase === "integer") {
    return "INTEGER";
  } else if (typeLowerCase === "float" || typeLowerCase === "number") {
    return "DOUBLE";
  } else if (typeLowerCase === "string") {
    return "VARCHAR";
  } else if (typeLowerCase === "datetime") {
    return "TIMESTAMP";
  } else if (typeLowerCase === "datetimetz") {
    return "TIMESTAMP WITH TIME ZONE";
  } else if (
    [
      "date",
      "time",
      "bigint",
      "hugeint",
      "double",
      "varchar",
      "timestamp",
      "timestamp with time zone",
      "boolean",
      "json",
    ].includes(typeLowerCase)
  ) {
    return type.toUpperCase();
  } else if (/^float\[[1-9]\d*\]$/.test(typeLowerCase)) {
    return type.toUpperCase();
  } else if (typeLowerCase.includes("geometry")) {
    return type.toUpperCase();
  } else {
    throw new Error(`Unknown type ${type}`);
  }
}
