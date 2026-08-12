import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";

Deno.test("tableClass defaults to SimpleTable", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  assertEquals(sdb.tableClass, SimpleTable);
  await sdb.run();
  await sdb.close();
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
  await sdb.run();
  await sdb.close();
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
  await sdb.run();
  await sdb.close();
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

  // getTables() preserves the custom table type.
  const tables = sdb.getTables();

  assertEquals(tables.length, 2);
  assertEquals(tables.every((t) => t instanceof MyTable), true);
  await sdb.run();
  await sdb.close();
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
  original.loadArray([{ a: 1 }, { a: 2 }]);

  // cloneTable() now correctly returns Promise<this>, inferred as MyTable
  const cloned = original.cloneTable("cloned");

  assertEquals(cloned instanceof MyTable, true);
  // No cast needed - TypeScript knows cloned is MyTable
  assertEquals(cloned.customMethod(), "hello");

  // Verify data was actually cloned
  const data = await cloned.getData();
  assertEquals(data, [{ a: 1 }, { a: 2 }]);
  await sdb.run();
  await sdb.close();
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
  original.loadArray([{ a: 1 }]);

  const cloned = original.cloneTable();

  assertEquals(cloned instanceof MyTable, true);
  assertEquals(cloned.defaultTableName, true);
  await sdb.run();
  await sdb.close();
});

Deno.test("getTables() returns a snapshot of the table registry", async () => {
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

  assertEquals(tables.length, 2);
  assertEquals(sdb.getTables().map((table) => table.name), ["registered"]);

  await sdb.run();
  await sdb.close();
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
  await sdb.run();
  await sdb.close();
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
  tableA.loadArray([{ a: 1 }, { a: 2 }]);

  const tableB = sdb.newTable("tableB");
  tableB.loadArray([{ b: "x" }, { b: "y" }]);

  const result = tableA.crossJoin(tableB, { outputTable: "joined" });

  assertEquals(result instanceof MyTable, true);
  // No cast needed - TypeScript knows result is MyTable via Promise<this>
  assertEquals(result.customMethod(), "hello");
  await sdb.run();
  await sdb.close();
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
  table.loadArray([{ a: 1 }, { a: 2 }, { a: 3 }]);

  const result = table.selectRows(2, { outputTable: "selected" });

  assertEquals(result instanceof MyTable, true);
  assertEquals(result.customMethod(), "hello");
  const rowCount = await result.getRowCount();
  assertEquals(rowCount, 2);
  await sdb.run();
  await sdb.close();
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
  table.loadArray([{ a: 1 }, { a: 2 }, { a: 3 }]);

  const result = table.summarize({
    values: "a",
    summaries: "mean",
    outputTable: "summary",
  });

  assertEquals(result instanceof MyTable, true);
  assertEquals(result.customMethod(), "hello");
  await sdb.run();
  await sdb.close();
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
  tableA.loadArray([{ id: 1, a: "x" }, { id: 2, a: "y" }]);

  const tableB = sdb.newTable("tableB");
  tableB.loadArray([{ id: 1, b: 100 }, { id: 2, b: 200 }]);

  const result = tableA.join(tableB, {
    on: "id",
    outputTable: "joined",
  });

  assertEquals(result instanceof MyTable, true);
  assertEquals(result.customMethod(), "hello");
  await sdb.run();
  await sdb.close();
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
  table1.loadArray([{ a: 1 }]);
  const table2 = sdb.newTable("table2");
  table2.loadArray([{ a: 2 }]);

  // removeTables() accepts MyTable instances (typed as Table)
  await sdb.removeTables(table1);

  const remaining = sdb.getTables();
  assertEquals(remaining.length, 1);
  assertEquals(remaining[0].name, "table2");
  await sdb.run();
  await sdb.close();
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
  table.loadArray([{ a: 1 }]);

  // hasTable() accepts MyTable instances
  const exists = await sdb.hasTable(table);
  assertEquals(exists, true);
  await sdb.run();
  await sdb.close();
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
  const loaded = table.loadArray([{ a: 1 }, { a: 2 }]);

  assertEquals(loaded instanceof MyTable, true);
  // No cast needed - TypeScript knows loaded is MyTable
  assertEquals(loaded.customMethod(), "hello");
  await sdb.run();
  await sdb.close();
});
