import type SimpleDB from "../class/SimpleDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { FusableOp, PendingOp, TableSchema } from "./pendingOps.ts";
import cleanSQL from "./cleanSQL.ts";
import ensureSpatial from "./ensureSpatial.ts";
import extractTypes from "./extractTypes.ts";
import mergeOptions from "./mergeOptions.ts";
import queryDB from "./queryDB.ts";

/**
 * Executes the pending operations of all tables in program order: every
 * queued operation carries a database-wide sequence number, so operations
 * on different tables replay exactly in the order the user queued them,
 * like immediate execution would. Consecutive fusable operations on the
 * same table are composed as CTEs into a single statement; barriers execute
 * in order between fused segments. When a table's `debug` flag is `true`,
 * its operations execute step by step, with the same logging as immediate
 * execution.
 *
 * Every query execution point goes through this (via queryDB). The
 * `flushing` flag prevents the queries run by the flush itself from
 * triggering a new flush. Operations queued while a flush is running (for
 * example by a barrier's execute) wait for the next flush.
 */
export default async function flushAllTables(sdb: SimpleDB): Promise<void> {
  if (sdb.flushing) {
    return;
  }
  sdb.flushing = true;
  try {
    // Take ownership of every queue upfront. If an operation throws, the
    // rest of the queued work is dropped, like a v1 script aborting at the
    // failing line.
    const entries: { table: SimpleTable; op: PendingOp }[] = [];
    for (const table of [...sdb.tables]) {
      for (const op of table.pendingOps.splice(0, table.pendingOps.length)) {
        entries.push({ table, op });
      }
    }
    entries.sort((a, b) => a.op.sequence - b.op.sequence);

    let segmentTable: SimpleTable | null = null;
    let segment: FusableOp[] = [];
    const runSegment = async () => {
      if (segmentTable !== null && segment.length > 0) {
        await runFused(segmentTable, segment);
      }
      segmentTable = null;
      segment = [];
    };

    for (const { table, op } of entries) {
      if (op.kind === "fusable" && !table.debug) {
        // An operation on another table between two fusable operations
        // splits the segment: it could depend on this table's state.
        if (segmentTable !== table) {
          await runSegment();
          segmentTable = table;
        }
        segment.push(op);
      } else {
        await runSegment();
        if (op.kind === "barrier") {
          await op.execute();
        } else {
          // A fusable operation on a table in debug mode: no fusion,
          // step-by-step execution with today's logging.
          await runStepwise(table, op);
        }
      }
    }
    await runSegment();
  } finally {
    sdb.flushing = false;
  }
}

async function runFused(
  table: SimpleTable,
  segment: FusableOp[],
): Promise<void> {
  if (segment.length === 1) {
    await runStepwise(table, segment[0]);
    return;
  }

  if (segment.some((op) => op.needsSpatial)) {
    await ensureSpatial(table);
  }

  // Each fragment is cleaned individually: cleanSQL's WHERE handling must not
  // cross fragment boundaries once they are composed into one statement.
  const ctes: { alias: string; select: string }[] = [];
  for (const op of segment) {
    const input = ctes.length === 0
      ? `"${table.name}"`
      : ctes[ctes.length - 1].alias;
    const schema = op.needsSchema ? await describeChain(table, ctes) : {};
    ctes.push({
      alias: `s${ctes.length + 1}`,
      select: cleanSQL(op.buildSelect(input, schema)),
    });
  }

  const query = `CREATE OR REPLACE TABLE "${table.name}" AS WITH ${
    ctes.map((c) => `${c.alias} AS (${c.select})`).join(", ")
  } SELECT * FROM ${ctes[ctes.length - 1].alias}`;

  try {
    await queryDB(
      table,
      query,
      mergeOptions(table, {
        table: table.name,
        method: segment.map((op) => op.method).join(" + "),
        parameters: Object.fromEntries(
          segment.map((op, i) => [`${i + 1}. ${op.method}`, op.parameters]),
        ),
        noClean: true,
      }),
    );
  } catch (fusedError) {
    // Re-run the segment step by step to pinpoint the culprit method and
    // report it exactly as immediate execution would have.
    for (const op of segment) {
      await runStepwise(table, op);
    }
    // Every step succeeded on its own: the failure came from the fusion
    // itself. The table now holds the correct stepwise result, so we warn
    // instead of throwing.
    console.warn(
      `The fused query for ${
        segment.map((op) => op.method).join(" + ")
      } failed, but running the methods one by one succeeded. Please report this as a bug to https://github.com/nshiab/simple-data-analysis-core/issues.\n${
        fusedError instanceof Error ? fusedError.message : String(fusedError)
      }`,
    );
  }
}

async function runStepwise(
  table: SimpleTable,
  op: FusableOp,
): Promise<void> {
  if (op.needsSpatial) {
    await ensureSpatial(table);
  }
  const schema = op.needsSchema ? await describeChain(table, []) : {};
  await queryDB(
    table,
    `CREATE OR REPLACE TABLE "${table.name}" AS ${
      op.buildSelect(`"${table.name}"`, schema)
    }`,
    mergeOptions(table, {
      table: table.name,
      method: op.method,
      parameters: op.parameters,
    }),
  );
}

/**
 * Returns the schema at the current point in the fused chain. With no CTEs
 * yet, this describes the table itself; otherwise it describes the output of
 * the last fragment. DESCRIBE is planning-only, so no data is computed.
 */
async function describeChain(
  table: SimpleTable,
  ctes: { alias: string; select: string }[],
): Promise<TableSchema> {
  const query = ctes.length === 0
    ? `DESCRIBE "${table.name}"`
    : `DESCRIBE WITH ${
      ctes.map((c) => `${c.alias} AS (${c.select})`).join(", ")
    } SELECT * FROM ${ctes[ctes.length - 1].alias}`;
  const types = await queryDB(
    table,
    query,
    mergeOptions(table, {
      table: table.name,
      method: null,
      parameters: null,
      returnDataFrom: "query",
      noClean: true,
    }),
  );
  return extractTypes(types);
}
