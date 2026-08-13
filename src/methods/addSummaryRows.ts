import assertColumnsExist from "../helpers/assertColumnsExist.ts";
import getSummaryExpression, {
  allSummaries,
  type Summary,
} from "../helpers/getSummaryExpression.ts";
import keepNumericalColumns from "../helpers/keepNumericalColumns.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

type SummaryRowOperation = Exclude<Summary, "count">;
type SummaryRow =
  | SummaryRowOperation
  | { summary: SummaryRowOperation; label?: string };
type NormalizedSummaryRow = { summary: SummaryRowOperation; label: string };

const allSummaryRowOperations = allSummaries.filter(
  (summary): summary is SummaryRowOperation => summary !== "count",
);

export default function addSummaryRows(
  simpleTable: SimpleTable,
  columns: "all" | string | string[],
  labelColumn: string,
  summaries?: SummaryRow | SummaryRow[],
) {
  const selectedColumns = columns === "all" ? "all" : stringToArray(columns);
  if (selectedColumns !== "all" && selectedColumns.length === 0) {
    throw new Error(
      'addSummaryRows() requires at least one column or "all".',
    );
  }
  if (selectedColumns !== "all") {
    const duplicates = selectedColumns.filter((column, index) =>
      selectedColumns.indexOf(column) !== index
    );
    if (duplicates.length > 0) {
      throw new Error(
        `addSummaryRows() received duplicate column${
          new Set(duplicates).size === 1 ? "" : "s"
        } ${[...new Set(duplicates)].map(quoteIdentifier).join(", ")}.`,
      );
    }
    if (selectedColumns.includes(labelColumn)) {
      throw new Error(
        `addSummaryRows() label column ${
          quoteIdentifier(labelColumn)
        } cannot also be summarized.`,
      );
    }
  }

  const summaryRows = normalizeSummaryRows(summaries);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "addSummaryRows()",
    parameters: { columns, labelColumn, summaries },
    needsSchema: true,
    values: summaryRows.map((row) => row.label),
    buildSelect: (input, schema) =>
      addSummaryRowsSelect(
        input,
        schema,
        selectedColumns,
        labelColumn,
        summaryRows,
      ),
  });
}

function normalizeSummaryRows(
  summaries?: SummaryRow | SummaryRow[],
): NormalizedSummaryRow[] {
  const rows = summaries === undefined
    ? [...allSummaryRowOperations]
    : Array.isArray(summaries)
    ? summaries
    : [summaries];
  if (rows.length === 0) {
    throw new Error(
      "addSummaryRows() summaries cannot be an empty array. Omit summaries to add every supported summary.",
    );
  }

  return rows.map((row) => {
    if (typeof row === "string") {
      assertSummary(row);
      return { summary: row, label: row };
    }
    if (row === null || typeof row !== "object") {
      throw new Error(
        "addSummaryRows() summaries must contain summary names or objects with a summary property.",
      );
    }
    assertSummary(row.summary);
    if (row.label !== undefined && typeof row.label !== "string") {
      throw new Error("addSummaryRows() summary labels must be strings.");
    }
    return { summary: row.summary, label: row.label ?? row.summary };
  });
}

function assertSummary(
  summary: string,
): asserts summary is SummaryRowOperation {
  if (!(allSummaryRowOperations as readonly string[]).includes(summary)) {
    throw new Error(
      `addSummaryRows() summary ${
        JSON.stringify(summary)
      } is not supported. Use ${
        allSummaryRowOperations.map((value) => JSON.stringify(value)).join(", ")
      }.`,
    );
  }
}

function addSummaryRowsSelect(
  input: string,
  schema: TableSchema,
  columns: "all" | string[],
  labelColumn: string,
  summaryRows: NormalizedSummaryRow[],
): string {
  const method = "addSummaryRows()";
  const tableColumns = Object.keys(schema);
  assertColumnsExist(schema, [labelColumn], method);
  if (schema[labelColumn] !== "VARCHAR") {
    throw new Error(
      `${method} label column ${
        quoteIdentifier(labelColumn)
      } must have type VARCHAR, but has type ${schema[labelColumn]}.`,
    );
  }

  const numericalColumns = keepNumericalColumns(schema);
  const selectedColumns = columns === "all" ? numericalColumns : columns;
  if (selectedColumns.length === 0) {
    throw new Error(
      `${method} could not find any numeric columns. Select numeric columns explicitly or convert columns to numeric types first.`,
    );
  }
  if (columns !== "all") {
    assertColumnsExist(schema, selectedColumns, method);
    const numericalColumnSet = new Set(numericalColumns);
    const nonNumericalColumns = selectedColumns.filter((column) =>
      !numericalColumnSet.has(column)
    );
    if (nonNumericalColumns.length > 0) {
      throw new Error(
        `${method} requires numeric columns, but ${
          nonNumericalColumns.map((column) =>
            `${quoteIdentifier(column)} has type ${schema[column]}`
          ).join(", ")
        }. Convert ${
          nonNumericalColumns.length === 1 ? "it" : "them"
        } to a numeric type first.`,
      );
    }
  }

  const selectedColumnSet = new Set(selectedColumns);
  const kindColumn = unusedColumn(schema, "_sda_summary_kind");
  const orderColumn = unusedColumn(
    { ...schema, [kindColumn]: "INTEGER" },
    "_sda_summary_order",
  );
  const projectedColumns = tableColumns.map(quoteIdentifier).join(", ");
  const branches = [
    `SELECT ${projectedColumns}, 0 AS ${
      quoteIdentifier(kindColumn)
    }, ROW_NUMBER() OVER () AS ${quoteIdentifier(orderColumn)} FROM ${input}`,
    ...summaryRows.map((row, index) => {
      const projections = tableColumns.map((column) => {
        if (column === labelColumn) {
          return `CAST(? AS VARCHAR) AS ${quoteIdentifier(column)}`;
        }
        if (!selectedColumnSet.has(column)) {
          return `NULL AS ${quoteIdentifier(column)}`;
        }
        const expression = getSummaryExpression(
          row.summary,
          schema[column],
          quoteIdentifier(column),
          undefined,
        );
        if (expression === null) {
          throw new Error(
            `${method} summary ${
              JSON.stringify(row.summary)
            } cannot be computed for column ${
              quoteIdentifier(column)
            } with type ${schema[column]}.`,
          );
        }
        return `${expression} AS ${quoteIdentifier(column)}`;
      });
      return `SELECT ${projections.join(", ")}, 1 AS ${
        quoteIdentifier(kindColumn)
      }, ${index} AS ${quoteIdentifier(orderColumn)} FROM ${input}`;
    }),
  ];

  return `SELECT ${projectedColumns}
FROM (${branches.join("\nUNION ALL\n")}) AS ${quoteIdentifier("summaries")}
ORDER BY ${quoteIdentifier(kindColumn)}, ${quoteIdentifier(orderColumn)}`;
}

function unusedColumn(schema: TableSchema, base: string): string {
  let column = base;
  while (schema[column] !== undefined) {
    column += "_";
  }
  return column;
}
