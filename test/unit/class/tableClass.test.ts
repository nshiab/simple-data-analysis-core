import { assertEquals, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";

Deno.test("tableClass defaults to SimpleTable", async () => {
  const sdb = new SimpleDB();
  assertEquals(sdb.tableClass, SimpleTable);
  await sdb.done();
});

Deno.test("newTable() respects tableClass", async () => {
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

  assertEquals(table instanceof MyTable, true);
  assertEquals(table.customMethod(), "hello");
  await sdb.done();
});

Deno.test("getTable() returns correct generic type", async () => {
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

  assertEquals(table instanceof MyTable, true);
  assertEquals(table.customMethod(), "hello");
  await sdb.done();
});

Deno.test("getTables() returns correct generic type", async () => {
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

  // getTables() now correctly returns Promise<MyTable[]>
  const tables = await sdb.getTables();

  assertEquals(tables.length, 2);
  assertEquals(tables.every((t) => t instanceof MyTable), true);
  await sdb.done();
});

Deno.test("cloneTable() returns correct generic type", async () => {
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
  await original.loadArray([{ a: 1 }, { a: 2 }]);

  // cloneTable() now correctly returns Promise<this>, inferred as MyTable
  const cloned = await original.cloneTable("cloned");

  assertEquals(cloned instanceof MyTable, true);
  // No cast needed - TypeScript knows cloned is MyTable
  assertEquals(cloned.customMethod(), "hello");

  // Verify data was actually cloned
  const data = await cloned.getData();
  assertEquals(data, [{ a: 1 }, { a: 2 }]);
  await sdb.done();
});

Deno.test("cloneTable() with default name returns correct generic type", async () => {
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
  await original.loadArray([{ a: 1 }]);

  const cloned = await original.cloneTable();

  assertEquals(cloned instanceof MyTable, true);
  assertEquals(cloned.defaultTableName, true);
  await sdb.done();
});

Deno.test("pushTable() respects tableClass", async () => {
  class MyTable extends SimpleTable {}

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();

  // Should accept MyTable instances
  const myTable = new MyTable("test", {}, sdb);
  sdb.pushTable(myTable);

  // Should reject core SimpleTable instances
  const coreTable = new SimpleTable("core", {}, sdb);
  assertThrows(
    () => sdb.pushTable(coreTable),
    Error,
    "MyTable",
  );

  await sdb.done();
});

Deno.test("pushTable() error message includes custom class name", async () => {
  class MyTable extends SimpleTable {}

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const coreTable = new SimpleTable("core", {}, sdb);

  let errorMessage = "";
  try {
    sdb.pushTable(coreTable);
  } catch (e) {
    errorMessage = (e as Error).message;
  }

  assertEquals(errorMessage.includes("MyTable"), true);
  await sdb.done();
});

Deno.test("sdb.newTable() from table returns correct type", async () => {
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

  assertEquals(newTable instanceof MyTable, true);
  // Type assertion needed because sdb is typed as SimpleDB (non-generic)
  assertEquals((newTable as MyTable).customMethod(), "hello");
  await sdb.done();
});

Deno.test("crossJoin() returns correct generic type", async () => {
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
  await tableA.loadArray([{ a: 1 }, { a: 2 }]);

  const tableB = sdb.newTable("tableB");
  await tableB.loadArray([{ b: "x" }, { b: "y" }]);

  const result = await tableA.crossJoin(tableB, { outputTable: "joined" });

  assertEquals(result instanceof MyTable, true);
  // No cast needed - TypeScript knows result is MyTable via Promise<this>
  assertEquals(result.customMethod(), "hello");
  await sdb.done();
});

Deno.test("selectRows() returns correct generic type", async () => {
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
  await table.loadArray([{ a: 1 }, { a: 2 }, { a: 3 }]);

  const result = await table.selectRows(2, { outputTable: "selected" });

  assertEquals(result instanceof MyTable, true);
  assertEquals(result.customMethod(), "hello");
  const nbRows = await result.getNbRows();
  assertEquals(nbRows, 2);
  await sdb.done();
});

Deno.test("summarize() returns correct generic type", async () => {
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
  await table.loadArray([{ a: 1 }, { a: 2 }, { a: 3 }]);

  const result = await table.summarize({
    values: "a",
    summaries: "mean",
    outputTable: "summary",
  });

  assertEquals(result instanceof MyTable, true);
  assertEquals(result.customMethod(), "hello");
  await sdb.done();
});

Deno.test("join() returns correct generic type", async () => {
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
  await tableA.loadArray([{ id: 1, a: "x" }, { id: 2, a: "y" }]);

  const tableB = sdb.newTable("tableB");
  await tableB.loadArray([{ id: 1, b: 100 }, { id: 2, b: 200 }]);

  const result = await tableA.join(tableB, {
    commonColumn: "id",
    outputTable: "joined",
  });

  assertEquals(result instanceof MyTable, true);
  assertEquals(result.customMethod(), "hello");
  await sdb.done();
});

Deno.test("removeTables() accepts generic table type", async () => {
  class MyTable extends SimpleTable {}

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const table1 = sdb.newTable("table1");
  await table1.loadArray([{ a: 1 }]);
  const table2 = sdb.newTable("table2");
  await table2.loadArray([{ a: 2 }]);

  // removeTables() accepts MyTable instances (typed as Table)
  await sdb.removeTables(table1);

  const remaining = await sdb.getTables();
  assertEquals(remaining.length, 1);
  assertEquals(remaining[0].name, "table2");
  await sdb.done();
});

Deno.test("hasTable() accepts generic table type", async () => {
  class MyTable extends SimpleTable {}

  class MyDB extends SimpleDB<MyTable> {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const table = sdb.newTable("myTable");
  await table.loadArray([{ a: 1 }]);

  // hasTable() accepts MyTable instances
  const exists = await sdb.hasTable(table);
  assertEquals(exists, true);
  await sdb.done();
});

Deno.test("loadArray() returns this type for chaining", async () => {
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
  const loaded = await table.loadArray([{ a: 1 }, { a: 2 }]);

  assertEquals(loaded instanceof MyTable, true);
  // No cast needed - TypeScript knows loaded is MyTable
  assertEquals(loaded.customMethod(), "hello");
  await sdb.done();
});
