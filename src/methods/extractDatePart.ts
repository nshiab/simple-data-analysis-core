import type SimpleTable from "../class/SimpleTable.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

type DatePart =
  | "year"
  | "quarter"
  | "month"
  | "week"
  | "day"
  | "dayOfWeek"
  | "dayOfYear"
  | "hour"
  | "minute"
  | "second";

const sqlParts: { [part in DatePart]: string } = {
  year: "year",
  quarter: "quarter",
  month: "month",
  week: "week",
  day: "day",
  dayOfWeek: "dayofweek",
  dayOfYear: "dayofyear",
  hour: "hour",
  minute: "minute",
  second: "second",
};

export default function extractDatePart(
  simpleTable: SimpleTable,
  column: string,
  parts: DatePart | { [newColumn: string]: DatePart },
) {
  const capturedParts = typeof parts === "string"
    ? parts
    : structuredClone(parts);
  const entries: [string, DatePart][] = typeof capturedParts === "string"
    ? [[capturedParts, capturedParts]]
    : Object.entries(capturedParts);

  if (entries.length === 0) {
    throw new Error("extractDatePart() requires at least one date part.");
  }

  queueOp(simpleTable, {
    kind: "fusable",
    method: "extractDatePart()",
    parameters: { column, parts: capturedParts },
    needsSchema: true,
    buildSelect: (input, schema) => {
      assertNewColumns(
        schema,
        entries.map(([newColumn]) => newColumn),
        "extractDatePart()",
      );
      const source = quoteIdentifier(column);
      const extractions = entries.map(([newColumn, part]) =>
        `date_part('${sqlParts[part]}', ${source}) AS ${
          quoteIdentifier(newColumn)
        }`
      );
      return `SELECT *, ${extractions.join(", ")} FROM ${input}`;
    },
  });
}
