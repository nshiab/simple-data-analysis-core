import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("addId adds numeric IDs to every row, including duplicate rows", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("numericIds").loadArray([
      { source: "A", target: "B" },
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ]);

    assertStrictEquals(table.addId("edgeId"), table);
    assertEquals(await table.getData(), [
      { source: "A", target: "B", edgeId: 0 },
      { source: "A", target: "B", edgeId: 1 },
      { source: "B", target: "C", edgeId: 2 },
    ]);
    assertEquals(await table.getTypes(), {
      source: "VARCHAR",
      target: "VARCHAR",
      edgeId: "BIGINT",
    });
  } finally {
    await sdb.close();
  }
});

Deno.test("addId accepts an empty options object", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ value: 1 }, { value: 2 }]);

    table.addId("id", {});

    assertEquals(await table.getValues("id"), [0, 1]);
    assertEquals((await table.getTypes()).id, "BIGINT");
  } finally {
    await sdb.close();
  }
});

Deno.test("addId adds exact prefixed string IDs and preserves other columns", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      { source: "A", target: "B", weight: 1.5 },
      { source: "B", target: "C", weight: 2.5 },
    ]);

    table.addId("edge id", {
      prefix: `vol d'été'; DROP TABLE flights; -- 🚀 `,
    });

    assertEquals(await table.getData(), [
      {
        source: "A",
        target: "B",
        weight: 1.5,
        "edge id": `vol d'été'; DROP TABLE flights; -- 🚀 0`,
      },
      {
        source: "B",
        target: "C",
        weight: 2.5,
        "edge id": `vol d'été'; DROP TABLE flights; -- 🚀 1`,
      },
    ]);
    assertEquals((await table.getTypes())["edge id"], "VARCHAR");
  } finally {
    await sdb.close();
  }
});

Deno.test("addId treats an empty prefix as supplied", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ value: "a" }, { value: "b" }]);

    table.addId("id", { prefix: "" });

    assertEquals(await table.getData(), [
      { value: "a", id: "0" },
      { value: "b", id: "1" },
    ]);
    assertEquals((await table.getTypes()).id, "VARCHAR");
  } finally {
    await sdb.close();
  }
});

Deno.test("addId adds its typed column to an empty table", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("emptyIds");
    await sdb.customQuery('CREATE TABLE "emptyIds" (value VARCHAR)');

    table.addId("id").addId("prefixedId", { prefix: "empty-" });

    assertEquals(await table.getData(), []);
    assertEquals(await table.getTypes(), {
      value: "VARCHAR",
      id: "BIGINT",
      prefixedId: "VARCHAR",
    });
  } finally {
    await sdb.close();
  }
});

Deno.test("addId chains across queued operations and subsequent reads", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      { value: 3 },
      { value: 1 },
      { value: 2 },
    ]);

    const result = table
      .filter("value >= 2")
      .addId("id", { prefix: "kept-" })
      .addColumn("label", "string", "concat('value-', value)")
      .selectColumns(["id", "value", "label"]);

    assertStrictEquals(result, table);
    assertEquals(await result.getData(), [
      { id: "kept-0", value: 3, label: "value-3.0" },
      { id: "kept-1", value: 2, label: "value-2.0" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("addId rejects an existing column", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ edgeId: "existing" }]);

    await assertRejects(
      () => table.addId("edgeId").run(),
      Error,
      'addId() the column "edgeId" already exists',
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("addId rejects invalid runtime argument types", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();

    assertThrows(
      () => table.addId(42 as unknown as string),
      TypeError,
      "addId() newColumn must be a string.",
    );
    assertThrows(
      () => table.addId("id", { prefix: 42 as unknown as string }),
      TypeError,
      "addId() options.prefix must be a string.",
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("addId rejects differently cased existing columns", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ edgeId: "existing" }]);

    await assertRejects(
      () => table.addId("EDGEID").run(),
      Error,
      'addId() the column "edgeId" already exists',
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("addId escapes quoted identifiers and snapshots queued options", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ value: "a" }]);
    const options = { prefix: "original-" };
    table.addId('edge "id"', options);
    options.prefix = "changed-";

    assertEquals(await table.getData(), [
      { value: "a", 'edge "id"': "original-0" },
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("addId preserves large integer input identities without rounding", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("largeIds");
    await sdb.customQuery(`CREATE TABLE "largeIds" AS
      SELECT value FROM (VALUES (9007199254740992::BIGINT),
        (9007199254740993::BIGINT)) input(value)`);
    table.addId("id").addId("prefixedId", { prefix: "edge-" });

    // Generation stays inside DuckDB: unsafe existing integers must not pass
    // through JavaScript numbers while rebuilding the table.
    await assertRejects(() => table.getData(), Error, "safe integer range");
    table.convert({ value: "string" });
    assertEquals(await table.getData(), [
      { value: "9007199254740992", id: 0, prefixedId: "edge-0" },
      { value: "9007199254740993", id: 1, prefixedId: "edge-1" },
    ]);
  } finally {
    await sdb.close();
  }
});
