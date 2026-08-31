import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import withDbFiles from "../../helpers/withDbFiles.ts";

Deno.test("writeDB exports queued work and types without changing the working file", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "memory.db");
    const source = db({ file: join(directory, "working.duckdb") });
    const rows = [{
      id: 1,
      name: "O'Brien",
      date: new Date("2024-01-01T00:00:00Z"),
    }, { id: 2, name: "two", date: null }];
    const table = source.newTable('some "table').loadArray(rows);
    source.newTable("other").loadArray([{ value: 42 }]);
    assertStrictEquals(await source.writeDB(file), source);
    const expectedTypes = await table.getTypes();
    await table.filter("id = 1").run();
    const snapshot = db({ file, readOnly: true });
    const copied = await snapshot.getTable('some "table');
    assertEquals(await copied.getData(), rows);
    assertEquals(await copied.getTypes(), expectedTypes);
    assertEquals(await snapshot.getTableNames(), ["other", 'some "table']);
    assertEquals(source.file, join(directory, "working.duckdb"));
    await source.close();
    const working = db({
      file: join(directory, "working.duckdb"),
      readOnly: true,
    });
    assertEquals(
      await (await working.getTable('some "table')).getRowCount(),
      1,
    );
  });
});

Deno.test("database file paths containing quotes and SQL-like text are preserved", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "O'Brien == original.db");
    const snapshot = join(directory, "WHERE a || b.duckdb");
    const source = db({ file });
    source.newTable("data").loadArray([{ id: 1 }]);
    await source.writeDB(snapshot);
    await source.close();
    assertEquals(existsSync(file), true);
    assertEquals(existsSync(snapshot), true);
    const restored = db();
    await restored.loadDB(snapshot);
    assertEquals(await (await restored.getTable("data")).getData(), [{
      id: 1,
    }]);
  });
});

Deno.test("writeDB embeds queued FTS and VSS index definitions and physical indexes", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "indexed.db");
    const source = db();
    const articles = source.newTable("articles").loadArray([
      { id: "pasta", text: "fresh tomato pasta" },
      { id: "cake", text: "chocolate cake" },
    ]).createFtsIndex("id", "text", {
      stemmer: "english",
      lower: true,
      stripAccents: false,
    });
    const vectors = source.newTable("vectors").loadArray([
      { id: 1, embedding: [0.1, 0.2, 0.3] },
      { id: 2, embedding: [0.9, 0.1, 0.2] },
    ]).createVssIndex("embedding", { M: 8, efConstruction: 32 });
    await source.writeDB(file);
    const destination = db();
    await destination.loadDB(file);
    const restored = await destination.getTable("articles");
    assertEquals(restored.indexes, articles.indexes);
    assertEquals(
      (await destination.getTable("vectors")).indexes,
      vectors.indexes,
    );
    assertEquals(
      await destination.customQuery(
        "SELECT index_name FROM duckdb_indexes() WHERE database_name = current_database();",
        { returnData: true },
      ),
      [{ index_name: vectors.indexes[0].name }],
    );
    assertEquals(
      await restored.bm25("tomato", "id", "text", 5).getValues("id"),
      ["pasta"],
    );
  });
});

Deno.test("writeDB can omit logical index definitions", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "without-metadata.db");
    const source = db();
    source.newTable("articles").loadArray([{ id: "one", text: "tomato" }])
      .createFtsIndex("id", "text");
    await source.writeDB(file, { metadata: false });
    const restored = db({ file, readOnly: true });
    assertEquals((await restored.getTable("articles")).indexes, []);
  });
});

Deno.test("DuckDB files with physical vector indexes load without SDA index definitions", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "physical-index.db");
    const source = db();
    source.newTable("vectors").loadArray([{ embedding: [1, 2, 3] }])
      .createVssIndex("embedding");
    await source.writeDB(file, { metadata: false });
    const destination = db();
    await destination.loadDB(file);
    assertEquals((await destination.getTable("vectors")).indexes, []);
    assertEquals(
      await destination.customQuery(
        "SELECT index_name FROM duckdb_indexes();",
        { returnData: true },
      ),
      [{ index_name: "vss_cosine_index_vectors" }],
    );
  });
});

Deno.test("writeDB requires overwrite and preserves destinations on validation errors", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const source = db();
    source.newTable("data").loadArray([{ id: 1 }]);
    for (const extension of ["db", "txt"]) {
      const file = join(directory, `existing.${extension}`);
      Deno.writeTextFileSync(file, "valuable contents");
      await assertRejects(() => source.writeDB(file));
      assertEquals(Deno.readTextFileSync(file), "valuable contents");
    }
    const file = join(directory, "existing.db");
    await source.writeDB(file, { overwrite: true });
    const restored = db({ file, readOnly: true });
    assertEquals(await (await restored.getTable("data")).getData(), [{
      id: 1,
    }]);
  });
});

Deno.test("writeDB preserves an existing destination when queued work fails", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "previous.db");
    Deno.writeTextFileSync(file, "valuable contents");
    const source = db();
    source.newTable("data").loadArray([{ id: 1 }]).filter("missing_column = 1");
    await assertRejects(() => source.writeDB(file, { overwrite: true }));
    assertEquals(Deno.readTextFileSync(file), "valuable contents");
  });
});

Deno.test("writeDB preserves a destination and cleans up after a copy failure", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "previous.sqlite");
    Deno.writeTextFileSync(file, "valuable contents");
    const source = db();
    await source.customQuery(
      "CREATE TABLE doomed(id INTEGER); CREATE VIEW broken AS SELECT * FROM doomed; DROP TABLE doomed;",
    );
    await assertRejects(
      () => source.writeDB(file, { overwrite: true }),
      Error,
      "does not exist",
    );
    assertEquals(Deno.readTextFileSync(file), "valuable contents");
    assertEquals(
      [...Deno.readDirSync(directory)].filter((entry) =>
        entry.name.startsWith(".sda-export-")
      ),
      [],
    );
    assertEquals(
      await source.customQuery(
        "SELECT count(*)::INTEGER AS count FROM duckdb_databases() WHERE NOT internal;",
        { returnData: true },
      ),
      [{ count: 1 }],
    );
    await source.customQuery("DROP VIEW broken;");
    source.newTable("data").loadArray([{ id: 2 }]);
    await source.writeDB(file, { overwrite: true });
    const restored = db();
    await restored.loadDB(file);
    assertEquals(await (await restored.getTable("data")).getData(), [{
      id: 2,
    }]);
  });
});

Deno.test("writeDB refuses to overwrite its open source, aliases, and symbolic links", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "working.db");
    const source = db({ file });
    await source.newTable("data").loadArray([{ id: 1 }]).run();
    await assertRejects(
      () => source.writeDB(file, { overwrite: true }),
      Error,
      "open database",
    );
    const linked = join(directory, "hardlink.db");
    Deno.linkSync(file, linked);
    await assertRejects(
      () => source.writeDB(linked, { overwrite: true }),
      Error,
      "open database",
    );
    const symlink = join(directory, "symlink.db");
    Deno.symlinkSync(file, symlink);
    await assertRejects(
      () => source.writeDB(symlink, { overwrite: true }),
      Error,
      "symbolic link",
    );
    assertEquals(await (await source.getTable("data")).getData(), [{ id: 1 }]);
  });
});

Deno.test("writeDB exports from read-only files and SQLite contains table data only", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "source.db");
    const source = db({ file });
    source.newTable("articles").loadArray([{ id: "one", text: "tomato" }])
      .createFtsIndex("id", "text");
    await source.customQuery(
      "CREATE VIEW article_ids AS SELECT id FROM articles;",
    );
    await source.close();
    const before = Deno.readFileSync(file);
    const readOnly = db({ file, readOnly: true });
    await readOnly.writeDB(join(directory, "snapshot.duckdb"));
    const sqlite = join(directory, "snapshot.sqlite");
    await readOnly.writeDB(sqlite);
    await readOnly.close();
    assertEquals(Deno.readFileSync(file), before);
    const destination = db();
    await destination.loadDB(sqlite);
    assertEquals(await destination.getTableNames(), [
      "article_ids",
      "articles",
    ]);
    assertEquals((await destination.getTable("articles")).indexes, []);
    assertEquals(await (await destination.getTable("article_ids")).getData(), [{
      id: "one",
    }]);
  });
});
