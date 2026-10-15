import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";

test("tableClass defaults to SimpleTable", async () => {
  const sdb = new SimpleDB();
  expect(sdb.tableClass).toStrictEqual(SimpleTable);
  await sdb.run();
  await sdb.close();
});

test("newTable() respects tableClass", async () => {
  class MyTable extends SimpleTable {
    customMethod(): string {
      return "hello";
    }
  }

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  // newTable() now correctly returns MyTable without a cast
  const table = sdb.newTable("myTable");

  expect(table instanceof MyTable).toStrictEqual(true);
  expect(table.customMethod()).toStrictEqual("hello");
  await sdb.run();
  await sdb.close();
});

test("getTable() returns correct generic type", async () => {
  class MyTable extends SimpleTable {
    customMethod(): string {
      return "hello";
    }
  }

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  sdb.newTable("myTable");

  // getTable() now correctly returns Promise<MyTable>
  const table = await sdb.getTable("myTable");

  expect(table instanceof MyTable).toStrictEqual(true);
  expect(table.customMethod()).toStrictEqual("hello");
  await sdb.run();
  await sdb.close();
});

test("getTables() returns correct generic type", async () => {
  class MyTable extends SimpleTable {
    customMethod(): string {
      return "hello";
    }
  }

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  sdb.newTable("table1");
  sdb.newTable("table2");

  // getTables() preserves the custom table type.
  const tables = sdb.getTables();

  expect(tables.length).toStrictEqual(2);
  expect(tables.every((t) => t instanceof MyTable)).toStrictEqual(true);
  await sdb.run();
  await sdb.close();
});

test("clone() returns correct generic type", async () => {
  class MyTable extends SimpleTable {
    customMethod(): string {
      return "hello";
    }
  }

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const original = sdb.newTable("original");
  original.loadArray([{ a: 1 }, { a: 2 }]);

  // clone() returns this, inferred as MyTable.
  const cloned = original.clone("cloned");

  expect(cloned instanceof MyTable).toStrictEqual(true);
  // No cast needed - TypeScript knows cloned is MyTable
  expect(cloned.customMethod()).toStrictEqual("hello");

  // Verify data was actually cloned
  const data = await cloned.getData();
  expect(data).toStrictEqual([{ a: 1 }, { a: 2 }]);
  await sdb.run();
  await sdb.close();
});

test("clone() with default name returns correct generic type", async () => {
  class MyTable extends SimpleTable {
    customMethod(): string {
      return "hello";
    }
  }

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const original = sdb.newTable("original");
  original.loadArray([{ a: 1 }]);

  const cloned = original.clone();

  expect(cloned instanceof MyTable).toStrictEqual(true);
  expect(cloned.defaultTableName).toStrictEqual(true);
  await sdb.run();
  await sdb.close();
});

test("getTables() returns a snapshot of the table registry", async () => {
  class MyTable extends SimpleTable {}

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  sdb.newTable("registered");
  const tables = sdb.getTables();

  (tables as MyTable[]).push(new MyTable("notRegistered", sdb));

  expect(tables.length).toStrictEqual(2);
  expect(sdb.getTables().map((table) => table.name)).toStrictEqual(["registered"]);

  await sdb.run();
  await sdb.close();
});

test("sdb.newTable() from table returns correct type", async () => {
  class MyTable extends SimpleTable {
    customMethod(): string {
      return "hello";
    }
  }

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const table = sdb.newTable("original");

  // table.sdb.newTable() should return MyTable (typed as SimpleTable, but runtime is MyTable)
  const newTable = table.sdb.newTable("another");

  expect(newTable instanceof MyTable).toStrictEqual(true);
  // Type assertion needed because sdb is typed as SimpleDB (non-generic)
  expect((newTable as MyTable).customMethod()).toStrictEqual("hello");
  await sdb.run();
  await sdb.close();
});

test("crossJoin() returns correct generic type", async () => {
  class MyTable extends SimpleTable {
    customMethod(): string {
      return "hello";
    }
  }

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const tableA = sdb.newTable("tableA");
  tableA.loadArray([{ a: 1 }, { a: 2 }]);

  const tableB = sdb.newTable("tableB");
  tableB.loadArray([{ b: "x" }, { b: "y" }]);

  const result = tableA.crossJoin(tableB, { outputTable: "joined" });

  expect(result instanceof MyTable).toStrictEqual(true);
  // No cast needed - TypeScript knows result is MyTable via Promise<this>
  expect(result.customMethod()).toStrictEqual("hello");
  await sdb.run();
  await sdb.close();
});

test("selectRows() returns correct generic type", async () => {
  class MyTable extends SimpleTable {
    customMethod(): string {
      return "hello";
    }
  }

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const table = sdb.newTable("original");
  table.loadArray([{ a: 1 }, { a: 2 }, { a: 3 }]);

  const result = table.selectRows(2, { outputTable: "selected" });

  expect(result instanceof MyTable).toStrictEqual(true);
  expect(result.customMethod()).toStrictEqual("hello");
  const rowCount = await result.getRowCount();
  expect(rowCount).toStrictEqual(2);
  await sdb.run();
  await sdb.close();
});

test("summarize() returns correct generic type", async () => {
  class MyTable extends SimpleTable {
    customMethod(): string {
      return "hello";
    }
  }

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const table = sdb.newTable("original");
  table.loadArray([{ a: 1 }, { a: 2 }, { a: 3 }]);

  const result = table.summarize({
    columns: "a",
    stats: "mean",
    outputTable: "summary",
  });

  expect(result instanceof MyTable).toStrictEqual(true);
  expect(result.customMethod()).toStrictEqual("hello");
  await sdb.run();
  await sdb.close();
});

test("join() returns correct generic type", async () => {
  class MyTable extends SimpleTable {
    customMethod(): string {
      return "hello";
    }
  }

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const tableA = sdb.newTable("tableA");
  tableA.loadArray([
    { id: 1, a: "x" },
    { id: 2, a: "y" },
  ]);

  const tableB = sdb.newTable("tableB");
  tableB.loadArray([
    { id: 1, b: 100 },
    { id: 2, b: 200 },
  ]);

  const result = tableA.join(tableB, {
    on: "id",
    outputTable: "joined",
  });

  expect(result instanceof MyTable).toStrictEqual(true);
  expect(result.customMethod()).toStrictEqual("hello");
  await sdb.run();
  await sdb.close();
});

test("removeTables() accepts generic table type", async () => {
  class MyTable extends SimpleTable {}

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const table1 = sdb.newTable("table1");
  table1.loadArray([{ a: 1 }]);
  const table2 = sdb.newTable("table2");
  table2.loadArray([{ a: 2 }]);

  // removeTables() accepts MyTable instances (typed as Table)
  await sdb.removeTables(table1);

  const remaining = sdb.getTables();
  expect(remaining.length).toStrictEqual(1);
  expect(remaining[0].name).toStrictEqual("table2");
  await sdb.run();
  await sdb.close();
});

test("hasTable() accepts generic table type", async () => {
  class MyTable extends SimpleTable {}

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const table = sdb.newTable("myTable");
  table.loadArray([{ a: 1 }]);

  // hasTable() accepts MyTable instances
  const exists = await sdb.hasTable(table);
  expect(exists).toStrictEqual(true);
  await sdb.run();
  await sdb.close();
});

test("loadArray() returns this type for chaining", async () => {
  class MyTable extends SimpleTable {
    customMethod(): string {
      return "hello";
    }
  }

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const table = sdb.newTable("original");

  // loadArray() returns Promise<this>, inferred as MyTable
  const loaded = table.loadArray([{ a: 1 }, { a: 2 }]);

  expect(loaded instanceof MyTable).toStrictEqual(true);
  // No cast needed - TypeScript knows loaded is MyTable
  expect(loaded.customMethod()).toStrictEqual("hello");
  await sdb.run();
  await sdb.close();
});
