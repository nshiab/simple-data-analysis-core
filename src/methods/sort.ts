import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

export default function sort(
  simpleTable: SimpleTable,
  order: { [key: string]: "asc" | "desc" } | null = null,
  options: {
    lang?: { [key: string]: string };
  } = {},
) {
  const capturedOrder = order === null ? null : { ...order };
  const capturedOptions = {
    ...options,
    lang: options.lang === undefined ? undefined : { ...options.lang },
  };
  queueOp(simpleTable, {
    kind: "fusable",
    method: "sort()",
    parameters: { order: capturedOrder, options: capturedOptions },
    needsSchema: false,
    preservesSchema: true,
    buildSelect: (input) => sortSelect(input, capturedOrder, capturedOptions),
  });
}

function sortSelect(
  input: string,
  order: { [key: string]: "asc" | "desc" } | null,
  options: {
    lang?: { [key: string]: string };
  } = {},
) {
  let query = `SELECT * FROM ${input}
    ORDER BY`;

  if (order === null) {
    query += " ALL,";
  } else {
    for (const column of Object.keys(order)) {
      if (options.lang && options.lang[column]) {
        query += `\n${quoteIdentifier(column)} COLLATE ${
          options.lang[column]
        } ${
          order[
            column
          ].toUpperCase()
        },`;
      } else {
        query += `\n${quoteIdentifier(column)} ${order[column].toUpperCase()},`;
      }
    }
  }

  return query.slice(0, query.length - 1);
}
