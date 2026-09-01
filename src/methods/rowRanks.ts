import assertColumnsExist from "../helpers/assertColumnsExist.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import keepNumericalColumns from "../helpers/keepNumericalColumns.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function rowRanks(
  simpleTable: SimpleTable,
  columns: string[],
  options: {
    nameColumn?: string;
    valueColumn?: string;
    rank?: number;
    order?: "asc" | "desc";
    ties?: "strict" | "first" | "all";
  },
) {
  columns = [...columns];
  options = structuredClone(options);
  const rank = options.rank ?? 1;
  const order = options.order ?? "desc";
  const ties = options.ties ?? "strict";

  if (columns.length === 0) {
    throw new Error("rowRanks() requires at least one column.");
  }

  const duplicateColumns = columns.filter((column, index) =>
    columns.indexOf(column) !== index
  );
  if (duplicateColumns.length > 0) {
    const duplicates = [...new Set(duplicateColumns)];
    throw new Error(
      `rowRanks() received duplicate column${
        duplicates.length === 1 ? "" : "s"
      } ${
        duplicates.map(quoteIdentifier).join(", ")
      }. Include each column only once.`,
    );
  }

  if (options.nameColumn === undefined && options.valueColumn === undefined) {
    throw new Error("rowRanks() requires nameColumn, valueColumn, or both.");
  }

  if (
    options.nameColumn !== undefined &&
    options.nameColumn === options.valueColumn
  ) {
    throw new Error(
      `rowRanks() cannot use ${
        quoteIdentifier(options.nameColumn)
      } for both output columns.`,
    );
  }

  if (!Number.isInteger(rank) || rank < 1) {
    throw new Error("rowRanks() options.rank must be a positive integer.");
  }

  if (rank > columns.length) {
    throw new Error(
      `rowRanks() options.rank is ${rank}, but only ${columns.length} column${
        columns.length === 1 ? " was" : "s were"
      } provided. Use a rank between 1 and ${columns.length}.`,
    );
  }

  if (order !== "asc" && order !== "desc") {
    throw new Error('rowRanks() options.order must be "asc" or "desc".');
  }

  if (ties !== "strict" && ties !== "first" && ties !== "all") {
    throw new Error(
      'rowRanks() options.ties must be "strict", "first", or "all".',
    );
  }

  queueOp(simpleTable, {
    kind: "fusable",
    method: "rowRanks()",
    parameters: { columns, options },
    needsSchema: true,
    values: columns,
    buildSelect: (input, schema) =>
      rowRanksSelect(input, schema, columns, options, rank, order, ties),
  });
}

function rowRanksSelect(
  input: string,
  schema: TableSchema,
  columns: string[],
  options: {
    nameColumn?: string;
    valueColumn?: string;
  },
  rank: number,
  order: "asc" | "desc",
  ties: "strict" | "first" | "all",
): string {
  assertColumnsExist(schema, columns, "rowRanks()");

  const outputColumns = [options.nameColumn, options.valueColumn].filter(
    (column): column is string => column !== undefined,
  );
  assertNewColumns(schema, outputColumns, "rowRanks()");

  const numericalColumns = new Set(keepNumericalColumns(schema));
  const nonNumericalColumns = columns.filter((column) =>
    !numericalColumns.has(column)
  );
  if (nonNumericalColumns.length > 0) {
    throw new Error(
      `rowRanks() requires numeric columns, but ${
        nonNumericalColumns.map((column) =>
          `${quoteIdentifier(column)} has type ${schema[column]}`
        ).join(", ")
      }. Convert ${
        nonNumericalColumns.length === 1 ? "it" : "them"
      } to a numeric type first.`,
    );
  }

  const candidates = columns.map((column, index) =>
    `(?, ${quoteIdentifier(column)}, ${index})`
  ).join(",\n      ");
  const selections: string[] = [];
  if (options.nameColumn !== undefined) {
    selections.push(
      `selected.selected_name AS ${quoteIdentifier(options.nameColumn)}`,
    );
  }
  if (options.valueColumn !== undefined) {
    selections.push(
      `selected.selected_value AS ${quoteIdentifier(options.valueColumn)}`,
    );
  }

  const tied = `WITH candidates(name, value, position) AS (
    VALUES ${candidates}
  ),
  selected_value AS (
    SELECT value
    FROM candidates
    WHERE value IS NOT NULL
    ORDER BY value ${order.toUpperCase()}, position
    LIMIT 1 OFFSET ${rank - 1}
  ),
  tied AS (
    SELECT name, value, position
    FROM candidates
    WHERE value = (SELECT value FROM selected_value)
  )`;

  let selection: string;
  if (ties === "all") {
    selection = `${tied}
  SELECT name AS selected_name, value AS selected_value
  FROM tied
  ORDER BY position`;
  } else if (ties === "strict") {
    selection = `${tied}
  SELECT FIRST(name ORDER BY position) AS selected_name,
  FIRST(value ORDER BY position) AS selected_value
  FROM tied
  HAVING CASE
    WHEN COUNT(*) > 1 THEN error(CONCAT(
      'rowRanks() found a tie at rank ${rank} between columns ',
      STRING_AGG(CONCAT('"', REPLACE(name, '"', '""'), '"'), ', ' ORDER BY position),
      '. Use { ties: "first" } to select the first tied column, or { ties: "all" } to produce one row for each tied column.'
    ))
    ELSE TRUE
  END`;
  } else {
    selection = `${tied}
  SELECT name AS selected_name, value AS selected_value
  FROM tied
  ORDER BY position
  LIMIT 1`;
  }

  return `SELECT source.*, ${selections.join(", ")}
FROM ${input} AS source
LEFT JOIN LATERAL (
  ${selection}
) AS selected ON TRUE`;
}
