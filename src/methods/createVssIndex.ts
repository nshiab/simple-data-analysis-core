import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import camelCase from "../helpers/camelCase.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function createVssIndex(
  simpleTable: SimpleTable,
  column: string,
  options: {
    overwrite?: boolean;
    verbose?: boolean;
    efConstruction?: number;
    efSearch?: number;
    M?: number;
  } = {},
) {
  // Index creation is multi-statement by nature: it executes as a barrier.
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "createVssIndex()",
    parameters: { column, options },
    execute: () => executeCreateVssIndex(simpleTable, column, options),
  });
}

async function executeCreateVssIndex(
  simpleTable: SimpleTable,
  column: string,
  options: {
    overwrite?: boolean;
    verbose?: boolean;
    efConstruction?: number;
    efSearch?: number;
    M?: number;
  },
): Promise<void> {
  const indexName = `vss_cosine_index_${camelCase(simpleTable.name)}`;
  const indexExists = simpleTable.indexes.includes(indexName);

  if (indexExists && options.overwrite) {
    options.verbose &&
      console.log(
        `\nDropping existing VSS index on ${quoteIdentifier(column)} column...`,
      );

    await simpleTable.sdb.customQuery(
      `DROP INDEX IF EXISTS ${indexName};`,
    );

    options.verbose && console.log("VSS index dropped.");
  }

  if (!indexExists || options.overwrite) {
    options.verbose &&
      console.log(
        `\nCreating VSS index on ${quoteIdentifier(column)} column...`,
      );

    // Build the WITH clause with all options
    const withOptions: string[] = ["metric = 'cosine'"];
    if (options.efConstruction !== undefined) {
      withOptions.push(`ef_construction = ${options.efConstruction}`);
    }
    if (options.efSearch !== undefined) {
      withOptions.push(`ef_search = ${options.efSearch}`);
    }
    if (options.M !== undefined) {
      withOptions.push(`M = ${options.M}`);
    }

    await simpleTable.sdb.customQuery(
      `INSTALL vss; LOAD vss;${
        simpleTable.sdb.file !== ":memory:"
          ? "\nSET hnsw_enable_experimental_persistence=true;"
          : ""
      }
    CREATE INDEX ${indexName} ON ${
        quoteIdentifier(simpleTable.name)
      } USING HNSW (${quoteIdentifier(column)}) WITH (${
        withOptions.join(", ")
      });`,
    );

    if (!simpleTable.indexes.includes(indexName)) {
      simpleTable.indexes.push(indexName);
    }

    options.verbose && console.log("VSS index created successfully.");
  } else {
    options.verbose && console.log("VSS index already exists.");
  }
}
