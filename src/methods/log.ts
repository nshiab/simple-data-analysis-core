import type SimpleTable from "../class/SimpleTable.ts";
import logData from "../helpers/logData.ts";
import getData from "./getData.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import formatNumber from "../helpers/formatNumber.ts";

export default async function log(
  simpleTable: SimpleTable,
  options: "all" | number | {
    count?: number | "all";
    types?: boolean;
    conditions?: string;
  } = {},
) {
  if (
    simpleTable.connection === undefined
  ) {
    await simpleTable.sdb.start();
    simpleTable.db = simpleTable.sdb.db;
    simpleTable.connection = simpleTable.sdb.connection;
  }
  if (simpleTable.connection === undefined) {
    throw new Error("simpleTable.connection is undefined");
  }

  let count: number;
  if (typeof options === "number") {
    count = options;
  } else if (options === "all") {
    count = await simpleTable.getRowCount();
  } else if (typeof options === "object") {
    if (options.count === "all") {
      count = await simpleTable.getRowCount();
    } else if (typeof options.count === "number") {
      count = options.count;
    } else {
      count = simpleTable.rowsToLog;
    }
  } else {
    count = simpleTable.rowsToLog;
  }
  const types = typeof options === "object"
    ? options.types ?? simpleTable.typesToLog
    : simpleTable.typesToLog;
  const conditions = typeof options === "object"
    ? options.conditions ?? undefined
    : undefined;

  if (
    simpleTable.connection === undefined ||
    !(await simpleTable.sdb.hasTable(simpleTable.name))
  ) {
    console.log(`\nTable ${simpleTable.name}: no data`);
  } else {
    console.log(`\nTable ${simpleTable.name}:`);
    conditions && console.log(`Conditions: ${conditions}`);
    const data = await getData(
      simpleTable,
      { limit: count, conditions },
      "log()",
    );
    logData(
      types ? await simpleTable.getTypes() : null,
      data,
      simpleTable.charsToLog,
    );
    const rowCount = conditions
      ? parseInt(
        (await simpleTable.sdb.customQuery(
          `select count(*) as count from ${
            quoteIdentifier(simpleTable.name)
          } where ${conditions}`,
          { returnData: true },
        ) as { count: string }[])[0].count,
      )
      : await simpleTable.getRowCount();
    console.log(
      `${formatNumber(rowCount)} rows in total ${`(count: ${count}${
        typeof simpleTable.charsToLog === "number"
          ? `, charsToLog: ${simpleTable.charsToLog}`
          : ""
      })`}`,
    );
  }
  return;
}
