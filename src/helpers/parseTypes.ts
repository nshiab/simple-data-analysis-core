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
    ].includes(typeLowerCase)
  ) {
    return type.toUpperCase();
  } else if (typeLowerCase.includes("geometry")) {
    return type.toUpperCase();
  } else {
    throw new Error(`Unknown type ${type}`);
  }
}
