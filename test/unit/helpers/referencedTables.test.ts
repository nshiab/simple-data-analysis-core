import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import referencedTables from "../../../src/helpers/referencedTables.ts";

test("SQL references match complete decoded identifiers", async () => {
  const sdb = new SimpleDB();
  try {
    const names = ['quote"name', "plain", "with space", "a.b", "café", "CAFÉ"];
    for (const name of names) sdb.newTable(name);
    expect(
      referencedTables(
        ['SELECT * FROM main."QUOTE""NAME", PLAIN, "with space", "a.b", café'],
        sdb,
      ).map((table) => table.name),
    ).toStrictEqual(names.slice(0, -1));
    expect(
      referencedTables(['SELECT plain_suffix, $plain, "prefix plain", "a"."b"'], sdb),
    ).toStrictEqual([]);
    // Deliberately conservative: an identifier can be a column or alias.
    expect(
      referencedTables(['SELECT "plain" AS "with space"'], sdb).map((table) => table.name),
    ).toStrictEqual(["plain", "with space"]);
  } finally {
    await sdb.close();
  }
});

test("SQL references exclude all literal and comment forms", async () => {
  const sdb = new SimpleDB();
  try {
    sdb.newTable("plain");
    sdb.newTable('quote"name');
    expect(
      referencedTables(
        [
          `'plain and ''quote"name'`,
          String.raw`E'escaped \' plain'`,
          '$$plain "quote""name"$$',
          "$tag$plain$tag$",
          '-- plain "quote""name"',
          '/* plain /* "quote""name" */ plain */',
        ],
        sdb,
      ),
    ).toStrictEqual([]);
    expect(
      referencedTables(["-- ignored\nplain", '/* ignored */ "quote""name"'], sdb).map(
        (table) => table.name,
      ),
    ).toStrictEqual(["plain", 'quote"name']);
  } finally {
    await sdb.close();
  }
});
