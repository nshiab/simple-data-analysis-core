import type SimpleTable from "../class/SimpleTable.ts";

export default async function updateWithJS(
  simpleTable: SimpleTable,
  dataModifier:
    | ((
      rows: {
        [key: string]: unknown;
      }[],
    ) => Promise<
      {
        [key: string]: unknown;
      }[]
    >)
    | ((
      rows: {
        [key: string]: unknown;
      }[],
    ) => {
      [key: string]: unknown;
    }[]),
  options: { batchSize?: number } = {},
) {
  const types = await simpleTable.getTypes();
  if (Object.values(types).includes("GEOMETRY")) {
    throw new Error(
      "updateWithJS doesn't work with tables containing geometries.",
    );
  }

  if (options.batchSize === undefined) {
    const oldData = await simpleTable.getData();
    if (!oldData) {
      throw new Error("No data from getData.");
    }
    const newData = await dataModifier(oldData);
    await simpleTable.loadArray(newData);
    return;
  }

  const batchSize = options.batchSize;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("batchSize must be a positive integer.");
  }

  const nbRows = await simpleTable.getNbRows();
  if (nbRows === 0) {
    // Same behavior as the non-batched path on an empty table.
    const newData = await dataModifier([]);
    await simpleTable.loadArray(newData);
    return;
  }

  // Rows are pulled in batches by rowid, passed through the modifier, and
  // accumulated in a temporary table, so only one batch of rows is
  // materialized in JS memory at a time.
  const suffix = Math.random().toString(36).slice(2, 10);
  const scratch = simpleTable.sdb.newTable(`updateWithJS_scratch_${suffix}`);
  const accumulator = `updateWithJS_accumulator_${suffix}`;
  let first = true;
  let lastRowid: number | null = null;

  while (true) {
    const batch = (await simpleTable.sdb.customQuery(
      `SELECT *, rowid AS __sda_rowid FROM "${simpleTable.name}"${
        lastRowid === null ? "" : ` WHERE rowid > ${lastRowid}`
      } ORDER BY rowid LIMIT ${batchSize}`,
      { returnDataFrom: "query" },
    )) as { [key: string]: unknown }[];
    if (batch.length === 0) {
      break;
    }
    lastRowid = batch[batch.length - 1].__sda_rowid as number;
    for (const row of batch) {
      delete row.__sda_rowid;
    }

    const modified = await dataModifier(batch);
    await scratch.loadArray(modified);
    if (first) {
      await simpleTable.sdb.customQuery(
        `CREATE OR REPLACE TABLE "${accumulator}" AS SELECT * FROM "${scratch.name}"`,
      );
      first = false;
    } else {
      await simpleTable.sdb.customQuery(
        `INSERT INTO "${accumulator}" BY NAME SELECT * FROM "${scratch.name}"`,
      );
    }
  }

  await simpleTable.sdb.customQuery(
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * FROM "${accumulator}";
DROP TABLE "${accumulator}";`,
  );
  await simpleTable.sdb.removeTables(scratch);
}
