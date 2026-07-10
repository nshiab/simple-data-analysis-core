import camelCase from "../helpers/camelCase.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import queryDB from "../helpers/queryDB.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queueOp from "../helpers/queueOp.ts";
import { executeCreateFtsIndex } from "./createFtsIndex.ts";

export default function bm25(
  simpleTable: SimpleTable,
  text: string,
  idColumn: string,
  textColumn: string,
  nbResults: number,
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
    k?: number;
    b?: number;
    minScore?: number;
    scoreColumn?: string;
    overwriteIndex?: boolean;
    conjunctive?: boolean;
    outputTable?: string;
    verbose?: boolean;
  } = {},
): SimpleTable {
  // This uses the fts extension
  // https://duckdb.org/docs/stable/core_extensions/full_text_search

  // The output table instance is created at call time so it can be returned
  // synchronously and chained on right away.
  const outputTable = typeof options.outputTable === "string"
    ? simpleTable.sdb.newTable(options.outputTable)
    : simpleTable;

  queueOp(outputTable, {
    kind: "barrier",
    method: "bm25()",
    parameters: { text, idColumn, textColumn, nbResults, options },
    execute: () =>
      executeBm25(
        simpleTable,
        outputTable,
        text,
        idColumn,
        textColumn,
        nbResults,
        options,
      ),
  });

  return outputTable;
}

async function executeBm25(
  simpleTable: SimpleTable,
  outputTable: SimpleTable,
  text: string,
  idColumn: string,
  textColumn: string,
  nbResults: number,
  options: {
    stemmer?: string;
    stopwords?: string;
    ignore?: string;
    stripAccents?: boolean;
    lower?: boolean;
    k?: number;
    b?: number;
    minScore?: number;
    scoreColumn?: string;
    overwriteIndex?: boolean;
    conjunctive?: boolean;
    outputTable?: string;
    verbose?: boolean;
  },
): Promise<void> {
  // The index creation runs directly (not with the sync createFtsIndex
  // builder, which would queue for the next flush).
  await executeCreateFtsIndex(simpleTable, idColumn, textColumn, {
    stemmer: options.stemmer,
    stopwords: options.stopwords,
    ignore: options.ignore,
    stripAccents: options.stripAccents,
    lower: options.lower,
    overwrite: options.overwriteIndex,
    verbose: options.verbose,
  });

  const minScoreCondition = typeof options.minScore === "number"
    ? ` AND score >= ${options.minScore}`
    : "";

  const selectClause = typeof options.scoreColumn === "string"
    ? `* EXCLUDE(score), score AS "${options.scoreColumn}"`
    : `* EXCLUDE(score)`;

  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${outputTable.name}" AS SELECT ${selectClause} FROM (SELECT *, fts_main_${
      camelCase(simpleTable.name)
    }.match_bm25(${idColumn}, '${text.replace(/'/g, "''")}'${
      typeof options.k === "number" ? `, k := ${options.k}` : ""
    }${typeof options.b === "number" ? `, b := ${options.b}` : ""}${
      options.conjunctive === true ? `, conjunctive := 1` : ""
    }) AS score FROM "${simpleTable.name}") sq WHERE score NOT NULL${minScoreCondition} ORDER BY score DESC LIMIT ${nbResults};`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "bm25",
      parameters: {
        text,
        idColumn,
        textColumn,
        nbResults,
        minScore: options.minScore,
        scoreColumn: options.scoreColumn,
        k: options.k,
        b: options.b,
        stemmer: options.stemmer,
        stopwords: options.stopwords,
        ignore: options.ignore,
        stripAccents: options.stripAccents,
        lower: options.lower,
        table: options.outputTable ?? simpleTable.name,
      },
    }),
  );
}
