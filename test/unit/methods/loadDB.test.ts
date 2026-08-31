import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import withDbFiles from "../../helpers/withDbFiles.ts";

for (const persistent of [false, true]) {
  Deno.test(`loadDB imports into a nonempty ${persistent ? "persistent" : "in-memory"} database`, async () => {
    await withDbFiles(async ({ directory, db }) => {
      const file = join(directory, "source.db");
      const source = db();
      source.newTable("imported").loadArray([{ id: 1 }, { id: 2 }]);
      await source.writeDB(file);
      const before = Deno.readFileSync(file);
      const destination = db(
        persistent ? { file: join(directory, "working.duckdb") } : {},
      );
      const existing = destination.newTable("existing").loadArray([{ id: 3 }]);
      assertStrictEquals(await destination.loadDB(file), destination);
      assertEquals(await destination.getTableNames(), ["existing", "imported"]);
      assertStrictEquals(await destination.getTable("existing"), existing);
      assertEquals(await existing.getData(), [{ id: 3 }]);
      const imported = await destination.getTable("imported");
      assertEquals(await imported.getData(), [{ id: 1 }, { id: 2 }]);
      await imported.filter("id = 1").run();
      await destination.close();
      assertEquals(Deno.readFileSync(file), before);
      const reopen = db({
        file: persistent ? join(directory, "working.duckdb") : file,
        readOnly: true,
      });
      assertEquals(
        await (await reopen.getTable("imported")).getRowCount(),
        persistent ? 1 : 2,
      );
    });
  });
}

Deno.test("loadDB rejects conflicts without changing tables or leaking attachments", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "conflicts.db");
    const source = db();
    source.newTable("conflict").loadArray([{ id: 1 }]);
    source.newTable("new_table").loadArray([{ id: 2 }]);
    await source.writeDB(file);
    const destination = db();
    const existing = destination.newTable("CONFLICT").loadArray([{ id: 3 }]);
    await existing.run();
    const attachments = await destination.customQuery("SHOW DATABASES;", {
      returnData: true,
    });
    await assertRejects(
      () => destination.loadDB(file),
      Error,
      "cannot import existing tables",
    );
    assertEquals(await destination.getTableNames(), ["CONFLICT"]);
    assertStrictEquals(await destination.getTable("CONFLICT"), existing);
    assertEquals(await existing.getData(), [{ id: 3 }]);
    assertEquals(
      await destination.customQuery("SHOW DATABASES;", { returnData: true }),
      attachments,
    );
    await destination.removeTables("CONFLICT");
    await destination.loadDB(file);
    assertEquals(await destination.getTableNames(), ["conflict", "new_table"]);
  });
});

Deno.test("loadDB rolls back catalog conflicts during the copy and can be retried", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "types.db");
    const source = db();
    await source.customQuery(
      "CREATE TYPE status AS ENUM ('new'); CREATE TABLE imported(id INTEGER);",
    );
    await source.writeDB(file);
    const destination = db();
    await destination.customQuery(
      "CREATE TYPE status AS ENUM ('existing'); CREATE TABLE existing(id INTEGER);",
    );
    await assertRejects(
      () => destination.loadDB(file),
      Error,
      "already exists",
    );
    assertEquals(await destination.getTableNames(), ["existing"]);
    assertEquals(
      await destination.customQuery(
        "SELECT count(*)::INTEGER AS count FROM duckdb_databases() WHERE NOT internal;",
        { returnData: true },
      ),
      [{ count: 1 }],
    );
    await destination.customQuery("DROP TYPE status;");
    await destination.loadDB(file);
    assertEquals(await destination.getTableNames(), ["existing", "imported"]);
  });
});

Deno.test("loadDB imports ordinary DuckDB files without SDA metadata", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "ordinary.DB");
    const source = await DuckDBInstance.create(file);
    const connection = await source.connect();
    try {
      await connection.run(
        "CREATE TABLE articles AS SELECT 'one' AS id, 'tomato pasta' AS text;",
      );
    } finally {
      connection.closeSync();
      source.closeSync();
    }
    const destination = db();
    await destination.loadDB(file);
    const table = await destination.getTable("articles");
    assertEquals(table.indexes, []);
    assertEquals(await table.getData(), [{ id: "one", text: "tomato pasta" }]);
  });
});

Deno.test("loadDB rejects malformed metadata before copying data", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "malformed.db");
    const source = db();
    source.newTable("records").loadArray([{ id: 1 }]);
    await source.writeDB(file);
    const edit = await DuckDBInstance.create(file);
    const connection = await edit.connect();
    try {
      await connection.run(
        'UPDATE __sda.metadata SET indexes = \'{"records":[{"kind":"bad"}]}\';',
      );
    } finally {
      connection.closeSync();
      edit.closeSync();
    }
    const destination = db();
    await assertRejects(
      () => destination.loadDB(file),
      Error,
      "Invalid SDA index definition",
    );
    assertEquals(await destination.getTableNames(), []);
    assertEquals(destination.getTables(), []);
  });
});

Deno.test("loadDB imports SQLite data and releases the source", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "source.sqlite");
    const source = db();
    source.newTable('quoted "table').loadArray([{ id: 1, name: "O'Brien" }]);
    await source.writeDB(file);
    const before = Deno.readFileSync(file);
    const destination = db();
    await destination.loadDB(file);
    assertEquals(
      await (await destination.getTable('quoted "table')).getData(),
      [{ id: 1, name: "O'Brien" }],
    );
    assertEquals(Deno.readFileSync(file), before);
    assertEquals(
      await destination.customQuery(
        "SELECT count(*)::INTEGER AS count FROM duckdb_databases() WHERE NOT internal;",
        { returnData: true },
      ),
      [{ count: 1 }],
    );
  });
});
