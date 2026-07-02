import hasGeometryColumn from "../helpers/hasGeometryColumn.ts";
import { makeConverter } from "../helpers/runQuery.ts";
import SDAError from "../class/SDAError.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function* stream(
  simpleTable: SimpleTable,
  options: {
    columns?: string | string[];
    conditions?: string;
  } = {},
): AsyncGenerator<{ [key: string]: unknown }, void, undefined> {
  if (simpleTable.connection === undefined) {
    await simpleTable.sdb.start();
    simpleTable.db = simpleTable.sdb.db;
    simpleTable.connection = simpleTable.sdb.connection;
  }

  if (await hasGeometryColumn(simpleTable)) {
    throw new Error(
      "Table contains geometry columns. Use getGeoData() instead.",
    );
  }

  const columns = options.columns
    ? (typeof options.columns === "string"
      ? [options.columns]
      : options.columns)
    : undefined;
  const query = `SELECT ${
    columns ? columns.map((d) => `"${d}"`).join(", ") : "*"
  } FROM "${simpleTable.name}"${
    options.conditions ? ` WHERE ${options.conditions}` : ""
  };`;
  if (simpleTable.debug) {
    console.log(query);
  }

  try {
    const result = await simpleTable.connection.stream(query);
    const columnNames = result.deduplicatedColumnNames();
    const columnTypes = result.columnTypes();
    const converters = columnTypes.map((type, i) =>
      makeConverter(type, columnNames[i])
    );
    const nbColumns = columnNames.length;

    while (true) {
      const chunk = await result.fetchChunk();
      if (!chunk || chunk.rowCount === 0) {
        break;
      }
      for (const rawRow of chunk.getRows()) {
        const row: { [key: string]: unknown } = {};
        for (let i = 0; i < nbColumns; i++) {
          row[columnNames[i]] = converters[i](rawRow[i]);
        }
        yield row;
      }
    }
  } catch (error) {
    if (error instanceof SDAError) {
      throw error;
    }
    if (simpleTable.debug) {
      console.warn(error);
    }
    throw new SDAError({
      method: "stream()",
      parameters: { options },
      query,
      cause: error,
    });
  }
}
