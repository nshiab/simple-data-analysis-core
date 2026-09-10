import type SimpleDB from "../class/SimpleDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import { markTableChanged } from "./tableGeneration.ts";
import { recordCacheTableCreation } from "./cacheTableDependencies.ts";
import foldIdentifier from "./foldIdentifier.ts";

const registries = new WeakMap<object, SimpleTable[]>();

function getMutableTables<Table extends SimpleTable>(
  simpleDB: SimpleDB<Table>,
): Table[] {
  const tables = registries.get(simpleDB);
  if (tables === undefined) {
    throw new Error("The table registry has not been initialized.");
  }
  return tables as Table[];
}

export function initializeTableRegistry<Table extends SimpleTable>(
  simpleDB: SimpleDB<Table>,
): void {
  registries.set(simpleDB, []);
}

export function getRegisteredTables<Table extends SimpleTable>(
  simpleDB: SimpleDB<Table>,
): readonly Table[] {
  return getMutableTables(simpleDB);
}

export function listRegisteredTables<Table extends SimpleTable>(
  simpleDB: SimpleDB<Table>,
): readonly Table[] {
  return [...getMutableTables(simpleDB)];
}

export function registerTable<Table extends SimpleTable>(
  simpleDB: SimpleDB<Table>,
  table: Table,
): void {
  const TableClass = simpleDB.tableClass;
  if (!(table instanceof TableClass)) {
    throw new Error(
      `The table must be an instance of ${TableClass.name}.`,
    );
  }

  const tables = getMutableTables(simpleDB);
  assertTableNameAvailable(simpleDB, table.name);
  tables.push(table);
  recordCacheTableCreation(table);
}

export function ensureTableRegistered<Table extends SimpleTable>(
  simpleDB: SimpleDB<Table>,
  table: Table,
): void {
  const tables = getMutableTables(simpleDB);
  if (!tables.includes(table)) {
    registerTable(simpleDB, table);
  }
}

/** Prevents distinct handles from owning the same DuckDB table name. */
export function assertTableNameAvailable(
  simpleDB: SimpleDB,
  name: string,
  renamedTable?: SimpleTable,
): void {
  const normalizedName = foldIdentifier(name);
  if (
    getRegisteredTables(simpleDB).some((table) =>
      table !== renamedTable && foldIdentifier(table.name) === normalizedName
    )
  ) {
    throw new Error(`Table ${name} already exists.`);
  }
}

export function retainRegisteredTables<Table extends SimpleTable>(
  simpleDB: SimpleDB<Table>,
  predicate: (table: Table) => boolean,
): void {
  const tables = getMutableTables(simpleDB);
  const retained = tables.filter(predicate);
  const retainedSet = new Set(retained);
  for (const table of tables) {
    if (!retainedSet.has(table)) {
      markTableChanged(table);
    }
  }
  tables.splice(0, tables.length, ...retained);
}
