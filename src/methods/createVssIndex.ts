import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import camelCase from "../helpers/camelCase.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { VssIndexDefinition } from "../helpers/indexDefinitions.ts";
import buildCreateIndexQuery from "../helpers/indexQueries.ts";

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
  const indexPosition = simpleTable.indexes.findIndex(({ name }) =>
    name === indexName
  );
  const indexExists = indexPosition >= 0;

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

    const indexOptions: VssIndexDefinition["options"] = {};
    if (options.efConstruction !== undefined) {
      indexOptions.efConstruction = options.efConstruction;
    }
    if (options.efSearch !== undefined) {
      indexOptions.efSearch = options.efSearch;
    }
    if (options.M !== undefined) {
      indexOptions.M = options.M;
    }
    const definition: VssIndexDefinition = {
      kind: "vss",
      name: indexName,
      column,
      options: indexOptions,
    };
    await simpleTable.sdb.customQuery(
      `INSTALL vss; LOAD vss;${
        simpleTable.sdb.file !== ":memory:"
          ? "\nSET hnsw_enable_experimental_persistence=true;"
          : ""
      }
      ${buildCreateIndexQuery(simpleTable.name, definition)}`,
    );
    if (indexExists) {
      simpleTable.indexes[indexPosition] = definition;
    } else {
      simpleTable.indexes.push(definition);
    }

    options.verbose && console.log("VSS index created successfully.");
  } else {
    options.verbose && console.log("VSS index already exists.");
  }
}
