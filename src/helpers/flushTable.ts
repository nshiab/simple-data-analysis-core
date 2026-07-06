import type SimpleTable from "../class/SimpleTable.ts";
import type { FusableOp, PendingOp, TableSchema } from "./pendingOps.ts";
import cleanSQL from "./cleanSQL.ts";
import extractTypes from "./extractTypes.ts";
import mergeOptions from "./mergeOptions.ts";
import queryDB from "./queryDB.ts";

/**
 * Executes the pending chain of a table. Consecutive fusable operations are
 * composed as CTEs into a single statement; barriers execute in order between
 * fused segments. When `debug` is `true`, fusion is disabled and every
 * operation executes step by step, with the same logging as immediate
 * execution.
 *
 * Must be called with `sdb.flushing` set to `true` (see flushAllTables),
 * otherwise the queries it runs would trigger a new flush.
 */
export default async function flushTable(table: SimpleTable): Promise<void> {
  if (table.pendingOps.length === 0) {
    return;
  }
  // Take ownership of the queue. If an operation throws, the chain is
  // dropped, like a v1 script aborting at the failing line.
  const ops = table.pendingOps.splice(0, table.pendingOps.length);

  if (table.debug) {
    for (const op of ops) {
      await runStepwise(table, op);
    }
    return;
  }

  let segment: FusableOp[] = [];
  for (const op of ops) {
    if (op.kind === "fusable") {
      segment.push(op);
    } else {
      await runFused(table, segment);
      segment = [];
      await op.execute();
    }
  }
  await runFused(table, segment);
}

async function runFused(
  table: SimpleTable,
  segment: FusableOp[],
): Promise<void> {
  if (segment.length === 0) {
    return;
  }
  if (segment.length === 1) {
    await runStepwise(table, segment[0]);
    return;
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
  op: PendingOp,
): Promise<void> {
  if (op.kind === "barrier") {
    await op.execute();
    return;
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
