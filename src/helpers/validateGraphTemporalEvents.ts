import type SimpleTable from "../class/SimpleTable.ts";
import mergeOptions from "./mergeOptions.ts";
import prepareGraphTemporalSql, {
  type PreparedGraphTemporalOptions,
} from "./prepareGraphTemporalSql.ts";
import queryDB from "./queryDB.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

/** Rejects invalid selected timestamps before a chronological graph runs. */
export default async function validateGraphTemporalEvents(
  simpleTable: SimpleTable,
  options: PreparedGraphTemporalOptions,
  method: string,
  parameters: { [key: string]: unknown },
): Promise<void> {
  const schema = await simpleTable.getTypes();
  const temporal = prepareGraphTemporalSql(schema, options, method);
  const q = quoteIdentifier;
  const eventsName = "__graph_temporal_events";
  const events = q(eventsName);
  const eventStart = `${events}.${q("__event_start")}`;
  const eventEnd = `${events}.${q("__event_end")}`;
  const rows = await queryDB(
    simpleTable,
    `SELECT CASE
      WHEN ${eventStart} IS NULL THEN 1
      WHEN ${eventEnd} IS NULL THEN 2
      WHEN NOT isfinite(${eventStart}) THEN 3
      WHEN NOT isfinite(${eventEnd}) THEN 4
      ELSE 5
    END AS ${q("reason")}
    FROM (
      SELECT ${temporal.eventSelections().join(", ")}
      FROM ${q(simpleTable.name)}
    ) AS ${events}
    WHERE (${temporal.eventValidity(eventsName)}) IS NOT TRUE
    LIMIT 1`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method,
      parameters,
      returnData: true,
    }),
  );
  const reason = rows?.[0]?.reason;
  if (reason === undefined) return;

  const startColumn = temporal.startTimeColumn ?? temporal.endTimeColumn!;
  const endColumn = temporal.endTimeColumn ?? temporal.startTimeColumn!;
  const message = reason === 1
    ? `selected start-time column ${q(startColumn)} contains a null timestamp.`
    : reason === 2
    ? `selected end-time column ${q(endColumn)} contains a null timestamp.`
    : reason === 3
    ? `selected start-time column ${
      q(startColumn)
    } contains an infinite timestamp.`
    : reason === 4
    ? `selected end-time column ${q(endColumn)} contains an infinite timestamp.`
    : `selected end-time column ${
      q(endColumn)
    } contains a timestamp before its start in ${q(startColumn)}.`;
  throw new TypeError(`${method} ${message}`);
}
