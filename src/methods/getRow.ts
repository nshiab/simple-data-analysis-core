import type SimpleTable from "../class/SimpleTable.ts";

export default async function getRow(
  simpleTable: SimpleTable,
  conditions: string,
  options: { strict?: boolean } = {},
): Promise<{ [key: string]: unknown }> {
  const data = await simpleTable.getData({ conditions, limit: 2 });
  if (data.length === 0) {
    throw new Error(`No row found with condition \`${conditions}\`.`);
  }
  if (options.strict !== false && data.length > 1) {
    throw new Error(
      `More than one row found with condition \`${conditions}\`.`,
    );
  }
  return data[0];
}
