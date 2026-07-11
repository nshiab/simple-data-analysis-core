import type SimpleTable from "../class/SimpleTable.ts";
import getIdenticalColumns from "../helpers/getIdenticalColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";

export default function join(
  leftTable: SimpleTable,
  rightTable: SimpleTable,
  options: {
    on?: string | string[];
    type?: "inner" | "left" | "right" | "full";
    outputTable?: string | boolean;
  } = {},
): SimpleTable {
  // The output table instance is created at call time so it can be returned
  // synchronously and chained on right away.
  const outputTable = typeof options.outputTable === "string"
    ? leftTable.sdb.newTable(options.outputTable)
    : leftTable;

  queueOp(outputTable, {
    kind: "barrier",
    method: "join()",
    parameters: { rightTable: rightTable.name, options },
    execute: () => executeJoin(leftTable, rightTable, outputTable, options),
  });

  return outputTable;
}

async function executeJoin(
  leftTable: SimpleTable,
  rightTable: SimpleTable,
  outputTable: SimpleTable,
  options: {
    on?: string | string[];
    type?: "inner" | "left" | "right" | "full";
  },
): Promise<void> {
  const leftTableColumns = await leftTable.getColumns();
  const rightTableColumns = await rightTable.getColumns();
  const identicalColumns = getIdenticalColumns(
    leftTableColumns,
    rightTableColumns,
  );

  let on: string[] | undefined;
  if (typeof options.on === "string") {
    on = [options.on];
  } else if (Array.isArray(options.on)) {
    on = options.on;
  } else {
    if (identicalColumns.length === 0) {
      throw new Error("No common column");
    } else if (identicalColumns.length === 1) {
      on = identicalColumns;
    } else {
      throw new Error(
        "Multiple columns with identical names in the tables. You need to pick the ones you want.",
      );
    }
  }

  const identicalColumnsForError = identicalColumns.filter(
    (d) => !on.includes(d),
  );
  if (identicalColumnsForError.length > 0) {
    if (identicalColumnsForError.length === 1) {
      throw new Error(
        `The tables have columns with identical names (excluding ${
          on.map((d) => `"${d}"`).join(", ")
        } used for the join). Rename or remove ${
          identicalColumnsForError.map((d) => `"${d}"`).join(", ")
        } in one of the two tables before doing the join. If relevant, you can also add it to the on option.`,
      );
    } else {
      throw new Error(
        `The tables have columns with identical names (excluding ${
          on.map((d) => `"${d}"`).join(", ")
        } used for the join). Rename or remove ${
          identicalColumnsForError.map((d) => `"${d}"`).join(", ")
        } in one of the two tables before doing the join. If relevant, you can also add them to the on option.`,
      );
    }
  }

  // The right table's copies of the join columns are excluded from the
  // SELECT directly, instead of dropping them with a rewrite after the join.
  // The join columns come from the side that has a value for every row of
  // the result: the left table for inner and left joins, the right table for
  // right joins, and whichever side matched for full joins.
  const type = options.type ?? "left";
  const joinColumn = (d: string) => {
    if (type === "right") {
      return `"${rightTable.name}"."${d}" AS "${d}"`;
    }
    if (type === "full") {
      return `COALESCE("${leftTable.name}"."${d}", "${rightTable.name}"."${d}") AS "${d}"`;
    }
    return `"${leftTable.name}"."${d}"`;
  };
  const selectList = [
    ...leftTableColumns.map((d) =>
      on.includes(d) ? joinColumn(d) : `"${leftTable.name}"."${d}"`
    ),
    ...rightTableColumns
      .filter((d) => !on.includes(d))
      .map((d) => `"${rightTable.name}"."${d}"`),
  ].join(", ");

  await queryDB(
    leftTable,
    joinQuery(
      leftTable.name,
      rightTable.name,
      on,
      type,
      outputTable.name,
      selectList,
    ),
    mergeOptions(leftTable, {
      table: outputTable.name,
      method: "join()",
      parameters: {
        rightTable: rightTable.name,
        options,
      },
    }),
  );
}

function joinQuery(
  leftTable: string,
  rightTable: string,
  on: string[],
  join: "inner" | "left" | "right" | "full",
  outputTable: string,
  selectList: string,
) {
  let query =
    `CREATE OR REPLACE TABLE "${outputTable}" AS SELECT ${selectList}`;

  if (join === "inner") {
    query += ` FROM "${leftTable}" JOIN "${rightTable}"`;
  } else if (join === "left") {
    query += ` FROM "${leftTable}" LEFT JOIN "${rightTable}"`;
  } else if (join === "right") {
    query += ` FROM "${leftTable}" RIGHT JOIN "${rightTable}"`;
  } else if (join === "full") {
    query += ` FROM "${leftTable}" FULL JOIN "${rightTable}"`;
  } else {
    throw new Error(`Unknown ${join} join.`);
  }

  query += ` ON (${
    on.map((d) => `"${leftTable}"."${d}" = "${rightTable}"."${d}"`)
      .join(
        " AND ",
      )
  });\n`;

  return query;
}
