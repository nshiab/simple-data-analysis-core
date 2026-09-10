/** Validates and snapshots a JavaScript JSON value without dropping information. */
export default function prepareJSON(
  value: unknown,
  column: string,
  row: number,
): string | null {
  if (value === null || value === undefined) return null;
  const active = new Set<object>();
  const fail = (path: string, message: string): never => {
    throw new Error(
      `Column ${JSON.stringify(column)}, row ${row}, ${path}: ${message}`,
    );
  };
  function serialize(value: unknown, path: string): string {
    if (value === null) return "null";
    if (typeof value === "string" || typeof value === "boolean") {
      return JSON.stringify(value);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return Object.is(value, -0) ? "-0.0" : JSON.stringify(value);
    }
    if (typeof value !== "object") {
      return fail(
        path,
        "Expected a JSON value: finite numbers, strings, booleans, null, arrays, or plain objects.",
      );
    }
    if (active.has(value)) {
      return fail(path, "Cyclic JSON values are unsupported.");
    }
    if (active.size >= 100) {
      return fail(path, "JSON values may nest at most 100 levels.");
    }
    const array = Array.isArray(value);
    if (
      !array && Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      return fail(
        path,
        "Expected a plain JSON object; convert class instances to JSON values first.",
      );
    }
    if (Object.getOwnPropertySymbols(value).length) {
      return fail(path, "JSON cannot represent symbol keys.");
    }
    active.add(value);
    try {
      if (array) {
        if (Object.keys(value).length !== value.length) {
          return fail(
            path,
            "JSON arrays must be dense and have no extra properties.",
          );
        }
        return `[${
          Array.from(value, (item: unknown, i) =>
            serialize(item, `${path}[${i}]`)).join(",")
        }]`;
      }
      return `{${
        Object.entries(value).map(([key, item]: [string, unknown]) =>
          `${JSON.stringify(key)}:${
            serialize(item, `${path}[${JSON.stringify(key)}]`)
          }`
        ).join(",")
      }}`;
    } finally {
      active.delete(value);
    }
  }
  return serialize(value, "$");
}
