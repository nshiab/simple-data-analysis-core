import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";
import { readFileSync as nodeReadFileSync } from "node:fs";

import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import withDbFiles from "../../helpers/withDbFiles.ts";

for (const persistent of [false, true]) {
  test(`loadDB imports into a nonempty ${persistent ? "persistent" : "in-memory"} database`, async () => {
    await withDbFiles(async ({ directory, db }) => {
      const file = join(directory, "source.db");
      const source = db();
      source.newTable("imported").loadArray([{ id: 1 }, { id: 2 }]);
      await source.writeDB(file);
      const before = nodeReadFileSync(file);
      const destination = db(persistent ? { file: join(directory, "working.duckdb") } : {});
      const existing = destination.newTable("existing").loadArray([{ id: 3 }]);
      expect(await destination.loadDB(file)).toBe(destination);
      expect(await destination.getTableNames()).toStrictEqual(["existing", "imported"]);
      expect(await destination.getTable("existing")).toBe(existing);
      expect(await existing.getData()).toStrictEqual([{ id: 3 }]);
      const imported = await destination.getTable("imported");
      expect(await imported.getData()).toStrictEqual([{ id: 1 }, { id: 2 }]);
      await imported.filter("id = 1").run();
      await destination.close();
      expect(nodeReadFileSync(file)).toStrictEqual(before);
      const reopen = db({
        file: persistent ? join(directory, "working.duckdb") : file,
        readOnly: true,
      });
      expect(await (await reopen.getTable("imported")).getRowCount()).toStrictEqual(
        persistent ? 1 : 2,
      );
    });
  });
}

test("loadDB rejects conflicts without changing tables or leaking attachments", async () => {
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
    await assertRejects(() => destination.loadDB(file), Error, "cannot import existing tables");
    expect(await destination.getTableNames()).toStrictEqual(["CONFLICT"]);
    expect(await destination.getTable("CONFLICT")).toBe(existing);
    expect(await existing.getData()).toStrictEqual([{ id: 3 }]);
    expect(await destination.customQuery("SHOW DATABASES;", { returnData: true })).toStrictEqual(
      attachments,
    );
    await destination.removeTables("CONFLICT");
    await destination.loadDB(file);
    expect(await destination.getTableNames()).toStrictEqual(["conflict", "new_table"]);
  });
});

test("loadDB reports catalog conflicts and detaches the source", async () => {
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
    await assertRejects(() => destination.loadDB(file), Error, "already exists");
    expect(
      await destination.customQuery(
        "SELECT count(*)::INTEGER AS count FROM duckdb_databases() WHERE NOT internal;",
        { returnData: true },
      ),
    ).toStrictEqual([{ count: 1 }]);
  });
});

test("loadDB imports ordinary DuckDB files without SDA metadata", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "ordinary.DB");
    const source = await DuckDBInstance.create(file);
    const connection = await source.connect();
    try {
      await connection.run("CREATE TABLE articles AS SELECT 'one' AS id, 'tomato pasta' AS text;");
    } finally {
      connection.closeSync();
      source.closeSync();
    }
    const destination = db();
    await destination.loadDB(file);
    const table = await destination.getTable("articles");
    expect(table.indexes).toStrictEqual([]);
    expect(await table.getData()).toStrictEqual([{ id: "one", text: "tomato pasta" }]);
  });
});

test("loadDB rejects malformed metadata before copying data", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "malformed.db");
    const source = db();
    source.newTable("records").loadArray([{ id: 1 }]);
    await source.writeDB(file);
    const edit = await DuckDBInstance.create(file);
    const connection = await edit.connect();
    try {
      await connection.run('UPDATE __sda.metadata SET indexes = \'{"records":[{"kind":"bad"}]}\';');
    } finally {
      connection.closeSync();
      edit.closeSync();
    }
    const destination = db();
    await assertRejects(() => destination.loadDB(file), Error, "Invalid SDA index definition");
    expect(await destination.getTableNames()).toStrictEqual([]);
    expect(destination.getTables()).toStrictEqual([]);
  });
});

test("loadDB imports SQLite data and releases the source", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "source.sqlite");
    const source = db();
    source.newTable('quoted "table').loadArray([{ id: 1, name: "O'Brien" }]);
    await source.writeDB(file);
    const before = nodeReadFileSync(file);
    const destination = db();
    await destination.loadDB(file);
    expect(await (await destination.getTable('quoted "table')).getData()).toStrictEqual([
      { id: 1, name: "O'Brien" },
    ]);
    expect(nodeReadFileSync(file)).toStrictEqual(before);
    expect(
      await destination.customQuery(
        "SELECT count(*)::INTEGER AS count FROM duckdb_databases() WHERE NOT internal;",
        { returnData: true },
      ),
    ).toStrictEqual([{ count: 1 }]);
  });
});
