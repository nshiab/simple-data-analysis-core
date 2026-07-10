import type SimpleTable from "../class/SimpleTable.ts";

export default async function getDescription(simpleTable: SimpleTable) {
  const types = await simpleTable.getTypes();
  const columns = await simpleTable.getColumns();
  const summaryForGetDescription = await simpleTable.summarize({
    values: columns,
    summaries: ["count", "countUnique", "countNull"],
    datesToMs: true,
    outputTable: "summaryForGetDescription",
  });
  const summaryData = await summaryForGetDescription.getData();

  await summaryForGetDescription.removeTable();

  // summarize adds the value column only when it summarizes more than one
  // column; for a single-column table the column name is already known.
  const description = summaryData.map((d) => {
    const column = columns.length > 1 ? d["value"] as string : columns[0];
    return {
      column,
      type: types[column],
      count: d["count"] as number,
      unique: d["countUnique"] as number,
      null: d["countNull"] as number,
    };
  });

  return description;
}
