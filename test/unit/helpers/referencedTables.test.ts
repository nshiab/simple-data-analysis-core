import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import referencedTables from "../../../src/helpers/referencedTables.ts";

Deno.test("SQL references match complete decoded identifiers", async () => {
  const sdb = new SimpleDB();
  try {
    const names = ['quote"name', "plain", "with space", "a.b", "café", "CAFÉ"];
    for (const name of names) sdb.newTable(name);
    assertEquals(
      referencedTables([
        'SELECT * FROM main."QUOTE""NAME", PLAIN, "with space", "a.b", café',
      ], sdb).map((table) => table.name),
      names.slice(0, -1),
    );
    assertEquals(
      referencedTables(
        ['SELECT plain_suffix, $plain, "prefix plain", "a"."b"'],
        sdb,
      ),
      [],
    );
    // Deliberately conservative: an identifier can be a column or alias.
    assertEquals(
      referencedTables(['SELECT "plain" AS "with space"'], sdb)
        .map((table) => table.name),
      ["plain", "with space"],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("SQL references exclude all literal and comment forms", async () => {
  const sdb = new SimpleDB();
  try {
    sdb.newTable("plain");
    sdb.newTable('quote"name');
    assertEquals(
      referencedTables([
        `'plain and ''quote"name'`,
        String.raw`E'escaped \' plain'`,
        '$$plain "quote""name"$$',
        "$tag$plain$tag$",
        '-- plain "quote""name"',
        '/* plain /* "quote""name" */ plain */',
      ], sdb),
      [],
    );
    assertEquals(
      referencedTables(
        ["-- ignored\nplain", '/* ignored */ "quote""name"'],
        sdb,
      )
        .map((table) => table.name),
      ["plain", 'quote"name'],
    );
  } finally {
    await sdb.close();
  }
});
