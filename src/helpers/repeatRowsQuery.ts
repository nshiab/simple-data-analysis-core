export default function repeatRowsQuery(
  table: string,
  column: string,
  options: {
    index?: string;
  } = {},
) {
  if (options.index) {
    return `CREATE OR REPLACE TABLE "${table}" AS SELECT *, UNNEST(range(CAST("${column}" AS BIGINT))) AS "${options.index}" FROM "${table}"`;
  } else {
    return `CREATE OR REPLACE TABLE "${table}" AS SELECT * EXCLUDE (_index) FROM (SELECT *, UNNEST(range(CAST("${column}" AS BIGINT))) AS _index FROM "${table}")`;
  }
}
