import type { DuckDBValue } from "@duckdb/node-api";
import toDuckDBValue from "./toDuckDBValue.ts";

export type ValueFilter = {
  column: string;
  values: DuckDBValue[];
  includesNull: boolean;
};

/** Converts column filter values to bindable values while tracking nulls. */
export default function prepareValueFilters(
  columnsAndValues: { [key: string]: unknown },
): ValueFilter[] {
  return Object.entries(columnsAndValues).map(([column, value]) => {
    const boundValues = (Array.isArray(value) ? value : [value]).map(
      toDuckDBValue,
    );
    return {
      column,
      values: boundValues.filter((boundValue) => boundValue !== null),
      includesNull: boundValues.some((boundValue) => boundValue === null),
    };
  });
}
