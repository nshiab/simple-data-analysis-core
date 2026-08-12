import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import findGeoColumn from "../helpers/findGeoColumn.ts";
import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import resolveOutputTable from "../helpers/resolveOutputTable.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function aggregateGeo(
  simpleTable: SimpleTable,
  method: "union" | "intersection",
  options: {
    column?: string;
    categories?: string | string[];
    outputTable?: string | boolean;
  } = {},
): SimpleTable {
  options = structuredClone(options);
  options.outputTable = resolveOutputTable(simpleTable, options.outputTable);

  if (typeof options.outputTable === "string") {
    // The output table instance is created at call time so it can be
    // returned synchronously and chained on right away.
    const outputTable = simpleTable.sdb.newTable(options.outputTable);
    queueOp(outputTable, {
      kind: "barrier",
      method: "aggregateGeo()",
      parameters: { method, options },
      execute: async () => {
        const column = typeof options.column === "string"
          ? options.column
          : await findGeoColumn(simpleTable);
        await queryDB(
          simpleTable,
          `CREATE OR REPLACE TABLE ${quoteIdentifier(outputTable.name)} AS ${
            aggregateGeoSelect(
              `${quoteIdentifier(simpleTable.name)}`,
              column,
              method,
              options,
            )
          }`,
          mergeOptions(simpleTable, {
            table: outputTable.name,
            method: "aggregateGeo()",
            parameters: { column, method, options },
          }),
        );
      },
    });
    return outputTable;
  }

  queueOp(simpleTable, {
    kind: "fusable",
    method: "aggregateGeo()",
    parameters: { method, options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const column = typeof options.column === "string"
        ? options.column
        : findGeoColumnFromSchema(types);
      return aggregateGeoSelect(input, column, method, options);
    },
  });
  return simpleTable;
}

function aggregateGeoSelect(
  input: string,
  column: string,
  method: "union" | "intersection",
  options: {
    categories?: string | string[];
  } = {},
) {
  const categoriesOptions = options.categories ?? [];
  const categories = stringToArray(categoriesOptions);

  let query = `SELECT${
    categories.length > 0
      ? ` ${categories.map((d) => `${quoteIdentifier(d)}`).join(", ")},`
      : ""
  }`;

  if (method === "union") {
    query += ` CASE WHEN ST_IsEmpty(ST_Union_Agg(${
      quoteIdentifier(column)
    })) THEN NULL ELSE ST_Union_Agg(${quoteIdentifier(column)}) END AS ${
      quoteIdentifier(column)
    }`;
  } else if (method === "intersection") {
    query += ` ST_Intersection_Agg(${quoteIdentifier(column)}) AS ${
      quoteIdentifier(column)
    }`;
  } else {
    throw new Error(`aggregateGeo() received an unknown method: ${method}.`);
  }

  query += `\nFROM ${input}`;

  if (categories.length > 0) {
    query += `\nGROUP BY ${
      categories.map((d) => `${quoteIdentifier(d)}`).join(", ")
    }`;
    query += `\nORDER BY ${
      categories.map((d) => `${quoteIdentifier(d)} ASC`).join(", ")
    }`;
  }

  return query;
}
