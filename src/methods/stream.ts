import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import hasGeometryColumn from "../helpers/hasGeometryColumn.ts";
import { makeConverter } from "../helpers/runQuery.ts";
import SDAError from "../class/SDAError.ts";
import flushAllTables from "../helpers/flushAllTables.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import observeQuery from "../helpers/observeQuery.ts";
import { streamQueryFromFile } from "../helpers/runQueryFromFile.ts";

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

  // stream() reads directly from the connection instead of going through
  // queryDB, so it must flush the pending chains itself before yielding.
  await flushAllTables(simpleTable.sdb);

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
    columns ? columns.map((d) => `${quoteIdentifier(d)}`).join(", ") : "*"
  } FROM ${quoteIdentifier(simpleTable.name)}${
    options.conditions ? ` WHERE ${options.conditions}` : ""
  };`;
  try {
    await observeQuery(simpleTable.connection, query, [], {
      logSQL: simpleTable.sdb.logSQL,
      explainSQL: simpleTable.sdb.explainSQL,
    });
    if (simpleTable.sdb.dataTransport === "file") {
      for await (
        const row of streamQueryFromFile(query, simpleTable.connection, {
          table: simpleTable.name,
          rejectGeometry: true,
        })
      ) {
        yield row;
      }
      return;
    }
    const result = await simpleTable.connection.stream(query);
    const columnNames = result.deduplicatedColumnNames();
    const columnTypes = result.columnTypes();
    const converters = columnTypes.map((type, i) =>
      makeConverter(type, columnNames[i], simpleTable.name)
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
    throw new SDAError({
      method: "stream()",
      parameters: { options },
      query,
      cause: error,
    });
  }
}
