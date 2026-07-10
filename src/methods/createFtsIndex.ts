import camelCase from "../helpers/camelCase.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

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
  const indexExists = simpleTable.indexes.includes(indexName);

  if (indexExists && options.overwrite) {
    options.verbose &&
      console.log(
        `\nDropping existing FTS index on "${textColumn}" column...`,
      );

    await simpleTable.sdb.customQuery(
      `PRAGMA drop_fts_index("${simpleTable.name}");`,
    );

    options.verbose && console.log("FTS index dropped.");
  }

  if (!indexExists || options.overwrite) {
    options.verbose &&
      console.log(
        `\nCreating FTS index on "${textColumn}" column...`,
      );

    await simpleTable.sdb.customQuery(
      `PRAGMA create_fts_index("${simpleTable.name}", "${idColumn}", "${textColumn}"${
        options.stemmer ? `, stemmer = '${options.stemmer}'` : ""
      }${options.stopwords ? `, stopwords = '${options.stopwords}'` : ""}${
        options.ignore ? `, ignore = '${options.ignore}'` : ""
      }${
        typeof options.stripAccents === "boolean"
          ? `, strip_accents = ${options.stripAccents ? 1 : 0}`
          : ""
      }${
        typeof options.lower === "boolean"
          ? `, lower = ${options.lower ? 1 : 0}`
          : ""
      });`,
    );

    if (!simpleTable.indexes.includes(indexName)) {
      simpleTable.indexes.push(indexName);
    }

    options.verbose && console.log("FTS index created successfully.");
  } else {
    options.verbose && console.log("FTS index already exists.");
  }
}
