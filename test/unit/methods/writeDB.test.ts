import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";
import {
  writeFileSync as nodeWriteFileSync,
  readdirSync as nodeReaddirSync,
  linkSync as nodeLinkSync,
  symlinkSync as nodeSymlinkSync,
  readFileSync as nodeReadFileSync,
} from "node:fs";

import { existsSync } from "node:fs";
import { join } from "node:path";
import withDbFiles from "../../helpers/withDbFiles.ts";

test("writeDB exports queued work and types without changing the working file", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "memory.db");
    const source = db({ file: join(directory, "working.duckdb") });
    const rows = [
      {
        id: 1,
        name: "O'Brien",
        date: new Date("2024-01-01T00:00:00Z"),
      },
      { id: 2, name: "two", date: null },
    ];
    const table = source.newTable('some "table').loadArray(rows);
    source.newTable("other").loadArray([{ value: 42 }]);
    expect(await source.writeDB(file)).toBe(source);
    const expectedTypes = await table.getTypes();
    await table.filter("id = 1").run();
    const snapshot = db({ file, readOnly: true });
    const copied = await snapshot.getTable('some "table');
    expect(await copied.getData()).toStrictEqual(rows);
    expect(await copied.getTypes()).toStrictEqual(expectedTypes);
    expect(await snapshot.getTableNames()).toStrictEqual(["other", 'some "table']);
    expect(source.file).toStrictEqual(join(directory, "working.duckdb"));
    await source.close();
    const working = db({
      file: join(directory, "working.duckdb"),
      readOnly: true,
    });
    expect(await (await working.getTable('some "table')).getRowCount()).toStrictEqual(1);
  });
});

test("database file paths containing quotes and SQL-like text are preserved", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "O'Brien == original.db");
    const snapshot = join(directory, "WHERE a || b.duckdb");
    const source = db({ file });
    source.newTable("data").loadArray([{ id: 1 }]);
    await source.writeDB(snapshot);
    await source.close();
    expect(existsSync(file)).toStrictEqual(true);
    expect(existsSync(snapshot)).toStrictEqual(true);
    const restored = db();
    await restored.loadDB(snapshot);
    expect(await (await restored.getTable("data")).getData()).toStrictEqual([
      {
        id: 1,
      },
    ]);
  });
});

test("writeDB embeds queued FTS and VSS index definitions and physical indexes", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "indexed.db");
    const source = db();
    const articles = source
      .newTable("articles")
      .loadArray([
        { id: "pasta", text: "fresh tomato pasta" },
        { id: "cake", text: "chocolate cake" },
      ])
      .createFtsIndex("id", "text", {
        stemmer: "english",
        lower: true,
        stripAccents: false,
      });
    const vectors = source
      .newTable("vectors")
      .loadArray(
        [
          { id: 1, embedding: [0.1, 0.2, 0.3].map(Math.fround) },
          { id: 2, embedding: [0.9, 0.1, 0.2].map(Math.fround) },
        ],
        { columnTypes: { embedding: "FLOAT[3]" } },
      )
      .createVssIndex("embedding", {
        M: 8,
        efConstruction: 32,
      });
    await source.writeDB(file);
    const destination = db();
    await destination.loadDB(file);
    const restored = await destination.getTable("articles");
    expect(restored.indexes).toStrictEqual(articles.indexes);
    expect((await destination.getTable("vectors")).indexes).toStrictEqual(vectors.indexes);
    expect(
      await destination.customQuery(
        "SELECT index_name FROM duckdb_indexes() WHERE database_name = current_database();",
        { returnData: true },
      ),
    ).toStrictEqual([{ index_name: vectors.indexes[0].name }]);
    expect(await restored.bm25("tomato", "id", "text", 5).getValues("id")).toStrictEqual(["pasta"]);
  });
});

test("writeDB can omit logical index definitions", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "without-metadata.db");
    const source = db();
    source
      .newTable("articles")
      .loadArray([{ id: "one", text: "tomato" }])
      .createFtsIndex("id", "text");
    await source.writeDB(file, { metadata: false });
    const restored = db({ file, readOnly: true });
    expect((await restored.getTable("articles")).indexes).toStrictEqual([]);
  });
});

test("DuckDB files with physical vector indexes load without SDA index definitions", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "physical-index.db");
    const source = db();
    source
      .newTable("vectors")
      .loadArray(
        [
          {
            embedding: [1, 2, 3].map(Math.fround),
          },
        ],
        { columnTypes: { embedding: "FLOAT[3]" } },
      )
      .createVssIndex("embedding");
    await source.writeDB(file, { metadata: false });
    const destination = db();
    await destination.loadDB(file);
    expect((await destination.getTable("vectors")).indexes).toStrictEqual([]);
    expect(
      await destination.customQuery("SELECT index_name FROM duckdb_indexes();", {
        returnData: true,
      }),
    ).toStrictEqual([{ index_name: "vss_cosine_index_vectors" }]);
  });
});

test("writeDB requires overwrite and preserves destinations on validation errors", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const source = db();
    source.newTable("data").loadArray([{ id: 1 }]);
    for (const extension of ["db", "txt"]) {
      const file = join(directory, `existing.${extension}`);
      nodeWriteFileSync(file, "valuable contents");
      await assertRejects(() => source.writeDB(file));
      expect(nodeReadFileSync(file, "utf8")).toStrictEqual("valuable contents");
    }
    const file = join(directory, "existing.db");
    await source.writeDB(file, { overwrite: true });
    const restored = db({ file, readOnly: true });
    expect(await (await restored.getTable("data")).getData()).toStrictEqual([
      {
        id: 1,
      },
    ]);
  });
});

test("writeDB preserves an existing destination when queued work fails", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "previous.db");
    nodeWriteFileSync(file, "valuable contents");
    const source = db();
    source
      .newTable("data")
      .loadArray([{ id: 1 }])
      .filter("missing_column = 1");
    await assertRejects(() => source.writeDB(file, { overwrite: true }));
    expect(nodeReadFileSync(file, "utf8")).toStrictEqual("valuable contents");
  });
});

test("writeDB preserves a destination and cleans up after a copy failure", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "previous.sqlite");
    nodeWriteFileSync(file, "valuable contents");
    const source = db();
    await source.customQuery(
      "CREATE TABLE doomed(id INTEGER); CREATE VIEW broken AS SELECT * FROM doomed; DROP TABLE doomed;",
    );
    await assertRejects(() => source.writeDB(file, { overwrite: true }), Error, "does not exist");
    expect(nodeReadFileSync(file, "utf8")).toStrictEqual("valuable contents");
    expect(
      [...nodeReaddirSync(directory, { withFileTypes: true })].filter((entry) =>
        entry.name.startsWith(".sda-export-"),
      ),
    ).toStrictEqual([]);
    expect(
      await source.customQuery(
        "SELECT count(*)::INTEGER AS count FROM duckdb_databases() WHERE NOT internal;",
        { returnData: true },
      ),
    ).toStrictEqual([{ count: 1 }]);
    await source.customQuery("DROP VIEW broken;");
    source.newTable("data").loadArray([{ id: 2 }]);
    await source.writeDB(file, { overwrite: true });
    const restored = db();
    await restored.loadDB(file);
    expect(await (await restored.getTable("data")).getData()).toStrictEqual([
      {
        id: 2,
      },
    ]);
  });
});

test("writeDB refuses to overwrite its open source, aliases, and symbolic links", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "working.db");
    const source = db({ file });
    await source
      .newTable("data")
      .loadArray([{ id: 1 }])
      .run();
    await assertRejects(() => source.writeDB(file, { overwrite: true }), Error, "open database");
    const linked = join(directory, "hardlink.db");
    nodeLinkSync(file, linked);
    await assertRejects(() => source.writeDB(linked, { overwrite: true }), Error, "open database");
    const symlink = join(directory, "symlink.db");
    nodeSymlinkSync(file, symlink);
    await assertRejects(() => source.writeDB(symlink, { overwrite: true }), Error, "symbolic link");
    expect(await (await source.getTable("data")).getData()).toStrictEqual([{ id: 1 }]);
  });
});

test("writeDB exports from read-only files and SQLite contains table data only", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "source.db");
    const source = db({ file });
    source
      .newTable("articles")
      .loadArray([{ id: "one", text: "tomato" }])
      .createFtsIndex("id", "text");
    await source.customQuery("CREATE VIEW article_ids AS SELECT id FROM articles;");
    await source.close();
    const before = nodeReadFileSync(file);
    const readOnly = db({ file, readOnly: true });
    await readOnly.writeDB(join(directory, "snapshot.duckdb"));
    const sqlite = join(directory, "snapshot.sqlite");
    await readOnly.writeDB(sqlite);
    await readOnly.close();
    expect(nodeReadFileSync(file)).toStrictEqual(before);
    const destination = db();
    await destination.loadDB(sqlite);
    expect(await destination.getTableNames()).toStrictEqual(["article_ids", "articles"]);
    expect((await destination.getTable("articles")).indexes).toStrictEqual([]);
    expect(await (await destination.getTable("article_ids")).getData()).toStrictEqual([
      {
        id: "one",
      },
    ]);
  });
});
