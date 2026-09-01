import crypto from "node:crypto";
import type SimpleTable from "../class/SimpleTable.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import getTypes from "./getTypes.ts";

export default async function getHash(simpleTable: SimpleTable) {
  const types = await getTypes(simpleTable);
  const result = await queryDB(
    simpleTable,
    `WITH numbered AS (
      SELECT
        ROW_NUMBER() OVER () AS __sda_position,
        source AS __sda_row
      FROM ${quoteIdentifier(simpleTable.name)} AS source
    )
    SELECT
      CAST(COUNT(*) AS VARCHAR) AS row_count,
      CAST(
        COALESCE(BIT_XOR(MD5_NUMBER(numbered::VARCHAR)), 0)
        AS VARCHAR
      ) AS checksum
    FROM numbered`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getHash()",
      parameters: {},
    }),
  );

  if (result === null || result.length !== 1) {
    throw new Error("getHash() could not compute the table hash.");
  }
  const { row_count, checksum } = result[0];
  if (
    typeof row_count !== "string" || typeof checksum !== "string"
  ) {
    throw new Error("getHash() received an unexpected result from DuckDB.");
  }

  return crypto.createHash("sha256").update(JSON.stringify([
    "sda-table-hash-v1",
    Object.entries(types),
    row_count,
    checksum,
  ])).digest("hex");
}
