import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function clone(
  simpleTable: SimpleTable,
  nameOrOptions: string | {
    name?: string;
    conditions?: string;
    columns?: string | string[];
    limit?: number;
    offset?: number;
  } = {},
): SimpleTable {
  const columns = typeof nameOrOptions === "object" && nameOrOptions.columns
    ? stringToArray(nameOrOptions.columns)
    : [];

  // The cloned table instance is created at call time so it can be returned
  // synchronously and chained on right away. Delegating to sdb.newTable()
  // makes subclasses using tableClass work correctly.
  let clonedTable: SimpleTable;
  const options = typeof nameOrOptions === "string"
    ? { name: nameOrOptions }
    : { ...nameOrOptions };
  if (typeof options.name === "string") {
    clonedTable = simpleTable.sdb.newTable(options.name);
  } else {
    clonedTable = simpleTable.sdb.newTable(undefined);
  }

  const selectClause = columns.length > 0
    ? columns.map((col) => `${quoteIdentifier(col)}`).join(", ")
    : "*";

  queueOp(clonedTable, {
    kind: "source",
    method: "clone()",
    parameters: { options },
    // The clone reads simpleTable by name rather than through clonedTable's
    // own (nonexistent) chain, so simpleTable's pending work must close and
    // execute before this SELECT runs, as it would at this call position.
    rawSQL: [`${quoteIdentifier(simpleTable.name)}`],
    buildSelect: () =>
      `SELECT ${selectClause} FROM ${quoteIdentifier(simpleTable.name)}${
        options.conditions ? ` WHERE ${options.conditions}` : ""
      }${typeof options.limit === "number" ? ` LIMIT ${options.limit}` : ""}${
        typeof options.offset === "number" ? ` OFFSET ${options.offset}` : ""
      }`,
  });

  return clonedTable;
}
