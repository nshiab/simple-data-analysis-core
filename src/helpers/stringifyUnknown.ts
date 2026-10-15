/**
 * Converts an unknown value to text with JavaScript's primitive-conversion
 * semantics. The default hint matches string concatenation; the string hint
 * matches String(value). Template mode uses the string hint but rejects symbols,
 * matching template interpolation. Explicit object conversion also preserves
 * custom valueOf, toString, and Symbol.toPrimitive implementations.
 */
export default function stringifyUnknown(
  value: unknown,
  mode: "string" | "default" | "template" = "string",
): string {
  const hint = mode === "default" ? "default" : "string";
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    const convert: unknown = Reflect.get(value, Symbol.toPrimitive);
    if (convert !== null && convert !== undefined) {
      if (typeof convert !== "function")
        throw new TypeError("Cannot convert object to primitive value");
      const primitive: unknown = Reflect.apply(convert, value, [hint]);
      return stringifyPrimitive(primitive, false);
    }
    const methods = hint === "string" ? ["toString", "valueOf"] : ["valueOf", "toString"];
    for (const name of methods) {
      const method: unknown = Reflect.get(value, name);
      if (typeof method === "function") {
        const primitive: unknown = Reflect.apply(method, value, []);
        if (
          primitive === null ||
          (typeof primitive !== "object" && typeof primitive !== "function")
        ) {
          return stringifyPrimitive(primitive, false);
        }
      }
    }
    throw new TypeError("Cannot convert object to primitive value");
  }
  return stringifyPrimitive(value, mode === "string");
}

function stringifyPrimitive(value: unknown, allowSymbol: boolean): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return value;
    case "undefined":
      return "undefined";
    case "number":
    case "bigint":
    case "boolean":
      return String(value);
    case "symbol":
      if (allowSymbol) return String(value);
      throw new TypeError("Cannot convert a Symbol value to a string");
    default:
      throw new TypeError("Cannot convert object to primitive value");
  }
}
