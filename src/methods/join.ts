import type SimpleTable from "../class/SimpleTable.ts";
import getIdenticalColumns from "../helpers/getIdenticalColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import removeColumnsNow from "../helpers/removeColumnsNow.ts";

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

  let commonColumn: string[] | undefined;
  if (typeof options.on === "string") {
    commonColumn = [options.on];
  } else if (Array.isArray(options.on)) {
    commonColumn = options.on;
  } else {
    if (identicalColumns.length === 0) {
      throw new Error("No common column");
    } else if (identicalColumns.length === 1) {
      commonColumn = identicalColumns;
    } else {
      throw new Error(
        "Multiple columns with identical names in the tables. You need to pick the ones you want.",
      );
    }
  }

  const identicalColumnsForError = identicalColumns.filter(
    (d) => !commonColumn.includes(d),
  );
  if (identicalColumnsForError.length > 0) {
    if (identicalColumnsForError.length === 1) {
      throw new Error(
        `The tables have columns with identical names (excluding ${
          commonColumn.map((d) => `"${d}"`).join(", ")
        } used for the join). Rename or remove ${
          identicalColumnsForError.map((d) => `"${d}"`).join(", ")
        } in one of the two tables before doing the join. If relevant, you can also add it to the on option.`,
      );
    } else {
      throw new Error(
        `The tables have columns with identical names (excluding ${
          commonColumn.map((d) => `"${d}"`).join(", ")
        } used for the join). Rename or remove ${
          identicalColumnsForError.map((d) => `"${d}"`).join(", ")
        } in one of the two tables before doing the join. If relevant, you can also add them to the on option.`,
      );
    }
  }

  await queryDB(
    leftTable,
    joinQuery(
      leftTable.name,
      rightTable.name,
      commonColumn,
      options.type ?? "left",
      outputTable.name,
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

  const columns = await outputTable.getColumns();
  const extraCommonColumns = columns.filter(
    (d) => commonColumn.map((c) => `${c}_1`).includes(d),
  );
  if (extraCommonColumns.length > 0) {
    await removeColumnsNow(outputTable, extraCommonColumns, "join()");
  }
}

function joinQuery(
  leftTable: string,
  rightTable: string,
  commonColumn: string[],
  join: "inner" | "left" | "right" | "full",
  outputTable: string,
) {
  let query = `CREATE OR REPLACE TABLE "${outputTable}" AS SELECT *`;

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
    commonColumn.map((d) => `"${leftTable}"."${d}" = "${rightTable}"."${d}"`)
      .join(
        " AND ",
      )
  });\n`;

  return query;
}
