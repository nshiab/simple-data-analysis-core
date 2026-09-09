import { assertEquals } from "@std/assert";
import cleanSQL from "../../../src/helpers/cleanSQL.ts";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import queryDB from "../../../src/helpers/queryDB.ts";
import mergeOptions from "../../../src/helpers/mergeOptions.ts";

Deno.test("SQL normalization preserves opaque regions", () => {
  for (
    const opaque of [
      "'a == b && c !== null || d'",
      "'it''s == null'",
      '"a "" == b"',
      String.raw`E'it\'s == null'`,
      "$$a == b || null$$",
      "$tag$a == b || null$tag$",
      "/* == null /* nested */ || */",
      "-- == null ||\n",
    ]
  ) {
    assertEquals(
      cleanSQL(`SELECT ${opaque} WHERE x==1`),
      `SELECT ${opaque} WHERE x=1`,
    );
  }
});

Deno.test("SQL normalization preserves concatenation and assignment", () => {
  for (
    const sql of [
      "SELECT a || b FROM t WHERE a || b = 'xy'",
      "SELECT * FROM t WHERE 'xy' = (a || b)",
      "UPDATE t SET a = null WHERE b IS NULL",
      "SELECT * FROM t WHERE x >= null",
      "SELECT * FROM t WHERE EXISTS (SELECT a || b FROM t)",
    ]
  ) assertEquals(cleanSQL(sql), sql);
});

Deno.test("SQL shorthand works in nested predicates and across comments", async () => {
  const sdb = new SimpleDB();
  try {
    const result = await sdb.newTable("strings")
      .loadArray([{ text: "a == b", n: 1 }, { text: "a = b", n: 2 }])
      .filter("(text = 'a == b' && n==1) || (n===3)")
      .addColumn("joined", "string", "text || '!' ")
      .getData();
    assertEquals(result, [{ text: "a == b", n: 1, joined: "a == b!" }]);
    const data = await queryDB(
      sdb,
      `SELECT ? AS bound, 'it''s == null' AS escaped
      WHERE (((NULL==/* preserved */null) && (1===1)) || (2===3)) && ('a' || 'b' = 'ab')
      && (1!==2 || 2===3)`,
      mergeOptions(sdb, {
        table: null,
        method: null,
        parameters: null,
        returnData: true,
        values: ["a == b && c || d"],
      }),
    );
    assertEquals(data, [{
      bound: "a == b && c || d",
      escaped: "it's == null",
    }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("SQL normalization scopes nested queries and statement boundaries", async () => {
  const sdb = new SimpleDB();
  try {
    const rows = await queryDB(
      sdb,
      `
      SELECT 'a' || 'b' AS text
      WHERE EXISTS (SELECT 'x' || 'y' WHERE 1==1 || 2==3)
        || (1==2)
      ORDER BY 'x' || 'y';
      SELECT $$a == b$$ AS text WHERE TRUE || FALSE;
    `,
      mergeOptions(sdb, {
        table: null,
        method: null,
        parameters: null,
        returnData: true,
      }),
    );
    assertEquals(rows, [{ text: "ab" }]);
    assertEquals(
      cleanSQL("SELECT 1; SELECT 2 WHERE TRUE||FALSE"),
      "SELECT 1; SELECT 2 WHERE TRUE OR FALSE",
    );
  } finally {
    await sdb.close();
  }
});
