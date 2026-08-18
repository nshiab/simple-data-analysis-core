import SimpleTable from "../class/SimpleTable.ts";
import { getTableGeneration } from "./tableGeneration.ts";

/**
 * Converts cache inputs to a deterministic, type-tagged representation.
 * SimpleTable values are represented by their name and current generation.
 */
export default function serializeCacheInputs(
  inputs: readonly unknown[],
): string {
  if (!Array.isArray(inputs)) {
    throw new TypeError("cache() options.inputs must be an array.");
  }
  return serializeValue(
    inputs,
    "inputs",
    new Set<object>(),
  );
}

function serializeValue(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): string {
  if (value === null) {
    return JSON.stringify(["null"]);
  }

  switch (typeof value) {
    case "undefined":
      return JSON.stringify(["undefined"]);
    case "boolean":
      return JSON.stringify(["boolean", value]);
    case "string":
      return JSON.stringify(["string", value]);
    case "number":
      return serializeNumber(value);
    case "bigint":
      return JSON.stringify(["bigint", value.toString()]);
    case "function":
      return JSON.stringify([
        "function",
        Function.prototype.toString.call(value),
      ]);
    case "symbol":
      throw new TypeError(`cache() ${path} cannot be a symbol.`);
  }

  if (value instanceof SimpleTable) {
    return JSON.stringify([
      "SimpleTable",
      value.name,
      getTableGeneration(value),
    ]);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError(`cache() ${path} is an invalid Date.`);
    }
    return JSON.stringify(["Date", value.toISOString()]);
  }

  if (ancestors.has(value)) {
    throw new TypeError(`cache() ${path} is cyclic.`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const serializedItems: string[] = [];
      for (let i = 0; i < value.length; i++) {
        serializedItems.push(
          serializeValue(
            value[i],
            `${path}[${i}]`,
            ancestors,
          ),
        );
      }
      return JSON.stringify(["array", serializedItems]);
    }

    if (!isPlainObject(value)) {
      const name = value.constructor?.name || "unknown";
      throw new TypeError(
        `cache() ${path} is an unsupported ${name} instance. Pass its deterministic state instead.`,
      );
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError(`cache() ${path} cannot have symbol properties.`);
    }
    const serializedEntries: [string, string][] = [];
    for (const key of Object.keys(value).sort()) {
      serializedEntries.push([
        key,
        serializeValue(
          value[key],
          propertyPath(path, key),
          ancestors,
        ),
      ]);
    }
    return JSON.stringify(["object", serializedEntries]);
  } finally {
    ancestors.delete(value);
  }
}

function serializeNumber(value: number): string {
  if (Number.isNaN(value)) {
    return JSON.stringify(["number", "NaN"]);
  }
  if (value === Infinity) {
    return JSON.stringify(["number", "Infinity"]);
  }
  if (value === -Infinity) {
    return JSON.stringify(["number", "-Infinity"]);
  }
  if (Object.is(value, -0)) {
    return JSON.stringify(["number", "-0"]);
  }
  return JSON.stringify(["number", value.toString()]);
}

function isPlainObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function propertyPath(path: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}
