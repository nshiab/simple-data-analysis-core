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

  class MyDB extends SimpleDB {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const table = sdb.newTable("myTable") as MyTable;

  assertEquals(table instanceof MyTable, true);
  assertEquals(table.customMethod(), "hello");
  await sdb.done();
});

Deno.test("cloneTable() returns instance of tableClass", async () => {
  class MyTable extends SimpleTable {
    customMethod(): string {
      return "hello";
    }
  }

  class MyDB extends SimpleDB {
    constructor() {
      super();
      this.tableClass = MyTable;
    }
  }

  const sdb = new MyDB();
  const original = sdb.newTable("original");
  await original.loadArray([{ a: 1 }, { a: 2 }]);

  const cloned = (await original.cloneTable("cloned")) as MyTable;

  assertEquals(cloned instanceof MyTable, true);
  assertEquals(cloned.customMethod(), "hello");

  // Verify data was actually cloned
  const data = await cloned.getData();
  assertEquals(data, [{ a: 1 }, { a: 2 }]);
  await sdb.done();
});

Deno.test("cloneTable() with default name returns instance of tableClass", async () => {
  class MyTable extends SimpleTable {
    customMethod(): string {
      return "hello";
    }
  }

  class MyDB extends SimpleDB {
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

  class MyDB extends SimpleDB {
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

  class MyDB extends SimpleDB {
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
