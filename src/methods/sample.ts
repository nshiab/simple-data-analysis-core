import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function sample(
  simpleTable: SimpleTable,
  quantity: number | string,
  options: {
    seed?: number;
  } = {},
) {
  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * FROM "${simpleTable.name}" USING SAMPLE RESERVOIR(${
      typeof quantity === "number" ? `${quantity} ROWS` : quantity
    })${
      typeof options.seed === "number" ? ` REPEATABLE(${options.seed})` : ""
    }`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "sample()",
      parameters: { quantity, options },
    }),
  );
}
