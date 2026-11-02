import type SimpleTable from "../class/SimpleTable.ts";
import logData from "../helpers/logData.ts";
import getData from "./getData.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import formatNumber from "../helpers/formatNumber.ts";

export default async function log(
  simpleTable: SimpleTable,
  options:
    | "all"
    | number
    | {
        count?: number | "all";
        types?: boolean;
        conditions?: string;
      } = {},
  source?: { query: string; title: string },
) {
  if (simpleTable.connection === undefined) {
    await simpleTable.sdb.start();
    simpleTable.db = simpleTable.sdb.db;
    simpleTable.connection = simpleTable.sdb.connection;
  }
  if (simpleTable.connection === undefined) {
    throw new Error("simpleTable.connection is undefined");
  }

  let count: number | undefined;
  if (typeof options === "number") {
    count = options;
  } else if (options === "all") {
    count = undefined;
  } else if (typeof options === "object") {
    if (options.count === "all") {
      count = undefined;
    } else if (typeof options.count === "number") {
      count = options.count;
    } else {
      count = simpleTable.rowsToLog;
    }
  } else {
    count = simpleTable.rowsToLog;
  }
  const types =
    typeof options === "object"
      ? (options.types ?? simpleTable.typesToLog)
      : simpleTable.typesToLog;
  const conditions = typeof options === "object" ? (options.conditions ?? undefined) : undefined;
  const relation = source
    ? `(${source.query}) AS ${quoteIdentifier(simpleTable.name)}`
    : quoteIdentifier(simpleTable.name);

  if (simpleTable.connection === undefined || !(await simpleTable.sdb.hasTable(simpleTable.name))) {
    console.log(`\nTable ${simpleTable.name}: no data`);
  } else {
    console.log(source?.title ?? `\nTable ${simpleTable.name}:`);
    if (conditions) {
      console.log(`Conditions: ${conditions}`);
    }
    const data = await getData(simpleTable, { limit: count, conditions }, "log()", relation);
    const columnTypes = types ? await simpleTable.getTypes() : null;
    logData(
      columnTypes && source
        ? Object.fromEntries(Object.keys(data[0] ?? {}).map((key) => [key, columnTypes[key]]))
        : columnTypes,
      data,
      simpleTable.charsToLog,
    );
    const rowCount =
      conditions || source
        ? parseInt(
            (
              (await simpleTable.sdb.customQuery(
                `select count(*) as count from ${relation}${conditions ? ` where ${conditions}` : ""}`,
                { returnData: true },
              )) as { count: string }[]
            )[0].count,
          )
        : await simpleTable.getRowCount();
    const displayedRows = data.length;
    const showing =
      displayedRows < rowCount ? ` / showing ${formatNumber(displayedRows)} rows` : "";
    console.log(`${formatNumber(rowCount)} rows in total${showing}`);
  }
  return;
}
