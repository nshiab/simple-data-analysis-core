import { test, expect } from "vite-plus/test";
import { assertRejects, assertThrows } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("addId runs both JSDoc examples with complete ordered results", async () => {
  const sdb = new SimpleDB();
  try {
    // The examples reference existing tables without displaying their input.
    const input = [
      { source: "A", target: "B" },
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ];
    const table = sdb.newTable().loadArray(input);
    const flights = sdb.newTable().loadArray(input);

    await table.addId("edgeId").log();
    await flights.addId("edgeId", { prefix: "flight-" }).log();

    expect(await table.getData()).toStrictEqual([
      { source: "A", target: "B", edgeId: 0 },
      { source: "A", target: "B", edgeId: 1 },
      { source: "B", target: "C", edgeId: 2 },
    ]);
    expect(await flights.getData()).toStrictEqual([
      { source: "A", target: "B", edgeId: "flight-0" },
      { source: "A", target: "B", edgeId: "flight-1" },
      { source: "B", target: "C", edgeId: "flight-2" },
    ]);
  } finally {
    await sdb.close();
  }
});

test("addId restarts at zero in separate tables, including duplicate null rows", async () => {
  const sdb = new SimpleDB();
  try {
    for (const prefix of [undefined, "same-"]) {
      for (let tableIndex = 0; tableIndex < 2; tableIndex++) {
        const table = sdb
          .newTable()
          .loadArray([{ value: null }, { value: "present" }, { value: null }])
          .addId("id", { prefix });

        expect(await table.getData()).toStrictEqual([
          { value: null, id: prefix === undefined ? 0 : "same-0" },
          { value: "present", id: prefix === undefined ? 1 : "same-1" },
          { value: null, id: prefix === undefined ? 2 : "same-2" },
        ]);
      }
    }
  } finally {
    await sdb.close();
  }
});

test("addId adds numeric IDs to every row, including duplicate rows", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("numericIds").loadArray([
      { source: "A", target: "B" },
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ]);

    expect(table.addId("edgeId")).toBe(table);
    expect(await table.getData()).toStrictEqual([
      { source: "A", target: "B", edgeId: 0 },
      { source: "A", target: "B", edgeId: 1 },
      { source: "B", target: "C", edgeId: 2 },
    ]);
    expect(await table.getTypes()).toStrictEqual({
      source: "VARCHAR",
      target: "VARCHAR",
      edgeId: "BIGINT",
    });
  } finally {
    await sdb.close();
  }
});

test("addId accepts an empty options object", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ value: 1 }, { value: 2 }]);

    table.addId("id", {});

    expect(await table.getValues("id")).toStrictEqual([0, 1]);
    expect((await table.getTypes()).id).toStrictEqual("BIGINT");
  } finally {
    await sdb.close();
  }
});

test("addId adds exact prefixed string IDs and preserves other columns", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      { source: "A", target: "B", weight: 1.5 },
      { source: "B", target: "C", weight: 2.5 },
    ]);

    table.addId("edge id", {
      prefix: `vol d'été'; DROP TABLE flights; -- 🚀 `,
    });

    expect(await table.getData()).toStrictEqual([
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
    expect((await table.getTypes())["edge id"]).toStrictEqual("VARCHAR");
  } finally {
    await sdb.close();
  }
});

test("addId treats an empty prefix as supplied", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ value: "a" }, { value: "b" }]);

    table.addId("id", { prefix: "" });

    expect(await table.getData()).toStrictEqual([
      { value: "a", id: "0" },
      { value: "b", id: "1" },
    ]);
    expect((await table.getTypes()).id).toStrictEqual("VARCHAR");
  } finally {
    await sdb.close();
  }
});

test("addId adds its typed column to an empty table", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("emptyIds");
    await sdb.customQuery('CREATE TABLE "emptyIds" (value VARCHAR)');

    table.addId("id").addId("prefixedId", { prefix: "empty-" });

    expect(await table.getData()).toStrictEqual([]);
    expect(await table.getTypes()).toStrictEqual({
      value: "VARCHAR",
      id: "BIGINT",
      prefixedId: "VARCHAR",
    });
  } finally {
    await sdb.close();
  }
});

test("addId chains across queued operations and subsequent reads", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ value: 3 }, { value: 1 }, { value: 2 }]);

    const result = table
      .filter("value >= 2")
      .addId("id", { prefix: "kept-" })
      .addColumn("label", "string", "concat('value-', value)")
      .selectColumns(["id", "value", "label"]);

    expect(result).toBe(table);
    expect(await result.getData()).toStrictEqual([
      { id: "kept-0", value: 3, label: "value-3.0" },
      { id: "kept-1", value: 2, label: "value-2.0" },
    ]);
  } finally {
    await sdb.close();
  }
});

test("addId preserves sorted rows when an input column shadows rowid", async () => {
  const sdb = new SimpleDB();
  try {
    for (const column of ["rowid", "RoWiD"]) {
      for (const prefix of [undefined, "", "edge-"]) {
        const rows = Array.from({ length: 12 }, (_, value) => ({
          [column]: 12 - value,
          value,
        }));
        const table = sdb.newTable().loadArray([...rows].reverse());

        table.sort({ value: "asc" }).addId("id", { prefix });

        expect(await table.getData()).toStrictEqual(
          rows.map((row, index) => ({
            ...row,
            id: prefix === undefined ? index : `${prefix}${index}`,
          })),
        );
      }
    }
  } finally {
    await sdb.close();
  }
});

test("addId rejects an existing column", async () => {
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

test("addId rejects invalid runtime argument types", async () => {
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

test("addId rejects differently cased existing columns", async () => {
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

test("addId escapes quoted identifiers and snapshots queued options", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ value: "a" }]);
    const options = { prefix: "original-" };
    table.addId('edge "id"', options);
    options.prefix = "changed-";

    expect(await table.getData()).toStrictEqual([{ value: "a", 'edge "id"': "original-0" }]);
  } finally {
    await sdb.close();
  }
});

test("addId preserves large integer input identities without rounding", async () => {
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
    expect(await table.getData()).toStrictEqual([
      { value: "9007199254740992", id: 0, prefixedId: "edge-0" },
      { value: "9007199254740993", id: 1, prefixedId: "edge-1" },
    ]);
  } finally {
    await sdb.close();
  }
});
