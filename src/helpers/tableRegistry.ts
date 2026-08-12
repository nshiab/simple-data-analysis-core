import type SimpleDB from "../class/SimpleDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

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
  if (tables.some((registeredTable) => registeredTable.name === table.name)) {
    throw new Error(`Table ${table.name} already exists.`);
  }
  tables.push(table);
}

export function ensureTableRegistered<Table extends SimpleTable>(
  simpleDB: SimpleDB<Table>,
  table: Table,
): void {
  const tables = getMutableTables(simpleDB);
  if (!tables.includes(table)) {
    tables.push(table);
  }
}

export function retainRegisteredTables<Table extends SimpleTable>(
  simpleDB: SimpleDB<Table>,
  predicate: (table: Table) => boolean,
): void {
  const tables = getMutableTables(simpleDB);
  const retained = tables.filter(predicate);
  tables.splice(0, tables.length, ...retained);
}
