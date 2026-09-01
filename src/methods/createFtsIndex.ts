import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import camelCase from "../helpers/camelCase.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { FtsIndexDefinition } from "../helpers/indexDefinitions.ts";
import buildCreateIndexQuery from "../helpers/indexQueries.ts";

export default function createFtsIndex(
  simpleTable: SimpleTable,
  idColumn: string,
  textColumn: string,
  options: {
    stemmer?:
      | "arabic"
      | "basque"
      | "catalan"
      | "danish"
      | "dutch"
      | "english"
      | "finnish"
      | "french"
      | "german"
      | "greek"
      | "hindi"
      | "hungarian"
      | "indonesian"
      | "irish"
      | "italian"
      | "lithuanian"
      | "nepali"
      | "norwegian"
      | "porter"
      | "portuguese"
      | "romanian"
      | "russian"
      | "serbian"
      | "spanish"
      | "swedish"
      | "tamil"
      | "turkish"
      | "none";
    stopwords?: string;
    ignore?: string;
    stripAccents?: boolean;
    lower?: boolean;
    overwrite?: boolean;
    verbose?: boolean;
  } = {},
) {
  // Index creation is multi-statement by nature: it executes as a barrier.
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "createFtsIndex()",
    parameters: { idColumn, textColumn, options },
    execute: () =>
      executeCreateFtsIndex(simpleTable, idColumn, textColumn, options),
  });
}

/**
 * Creates the index immediately, without queueing. For use inside a
 * barrier's execute, which runs during a flush.
 */
export async function executeCreateFtsIndex(
  simpleTable: SimpleTable,
  idColumn: string,
  textColumn: string,
  options: {
    stemmer?: string;
    stopwords?: string;
    ignore?: string;
    stripAccents?: boolean;
    lower?: boolean;
    overwrite?: boolean;
    verbose?: boolean;
  },
): Promise<void> {
  const indexName = `fts_index_${camelCase(simpleTable.name)}`;
  const indexPosition = simpleTable.indexes.findIndex(({ name }) =>
    name === indexName
  );
  const indexExists = indexPosition >= 0;

  if (indexExists && options.overwrite) {
    options.verbose &&
      console.log(
        `\nDropping existing FTS index on ${
          quoteIdentifier(textColumn)
        } column...`,
      );

    await simpleTable.sdb.customQuery(
      `PRAGMA drop_fts_index(${quoteIdentifier(simpleTable.name)});`,
    );

    options.verbose && console.log("FTS index dropped.");
  }

  if (!indexExists || options.overwrite) {
    options.verbose &&
      console.log(
        `\nCreating FTS index on ${quoteIdentifier(textColumn)} column...`,
      );

    const indexOptions: FtsIndexDefinition["options"] = {};
    if (options.stemmer !== undefined) {
      indexOptions.stemmer = options.stemmer;
    }
    if (options.stopwords !== undefined) {
      indexOptions.stopwords = options.stopwords;
    }
    if (options.ignore !== undefined) {
      indexOptions.ignore = options.ignore;
    }
    if (options.stripAccents !== undefined) {
      indexOptions.stripAccents = options.stripAccents;
    }
    if (options.lower !== undefined) {
      indexOptions.lower = options.lower;
    }
    const definition: FtsIndexDefinition = {
      kind: "fts",
      name: indexName,
      idColumn,
      textColumn,
      options: indexOptions,
    };
    await simpleTable.sdb.customQuery(
      buildCreateIndexQuery(simpleTable.name, definition),
    );
    if (indexExists) {
      simpleTable.indexes[indexPosition] = definition;
    } else {
      simpleTable.indexes.push(definition);
    }

    options.verbose && console.log("FTS index created successfully.");
  } else {
    options.verbose && console.log("FTS index already exists.");
  }
}
