import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import updateColumnsWithJS from "../../../src/helpers/updateColumnsWithJS.ts";

Deno.test("column generation preserves untouched SQL data and stable row identity", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("enriched");
  try {
    await sdb.customQuery(
      `CREATE TABLE enriched AS SELECT 'same' AS text, 7 AS rowid,
      9007199254740993::BIGINT AS id, DATE '2025-01-01' AS date,
      1234567890123456.789::DECIMAL(19,3) AS amount,
      {'ids': [9007199254740993::BIGINT]} AS nested FROM range(12)`,
    );
    await sdb.customQuery("CREATE TABLE expected AS SELECT * FROM enriched");
    for (const column of ["first", "second", "first"]) {
      await updateColumnsWithJS(table, ["text"], [column], (rows) => {
        assertEquals(
          rows,
          Array.from({ length: 12 }, () => ({ text: "same" })),
        );
        return Promise.resolve(rows.map((_, i) => ({ [column]: [i, 1] })));
      });
    }
    const data = await sdb.customQuery(
      "SELECT first[1] AS a, second[1] AS b FROM enriched",
      { returnData: true },
    );
    assertEquals(data, Array.from({ length: 12 }, (_, i) => ({ a: i, b: i })));
    assertEquals(
      await sdb.customQuery(
        "SELECT count(*) AS differences FROM ((SELECT * EXCLUDE(first, second) FROM enriched) EXCEPT ALL (SELECT * FROM expected))",
        { returnData: true },
      ),
      [{ differences: 0 }],
    );
    assertEquals((await table.getTypes()).first, "FLOAT[2]");
    assertEquals((await table.getTypes()).second, "FLOAT[2]");
    assertEquals(await sdb.getTableNames(), ["enriched", "expected"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("failed generation and staging leave existing data intact", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("unchanged");
  try {
    await table.loadArray([{ text: "a", vector: [1, 2] }, {
      text: "b",
      vector: [3, 4],
    }]).run();
    const types = await table.getTypes();
    for (
      const generate of [
        () => Promise.reject(new Error("provider failed")),
        () => Promise.resolve([]),
        () => Promise.resolve([{ vector: [1, 2] }, { vector: [3n, 4n] }]),
      ]
    ) {
      await assertRejects(() =>
        updateColumnsWithJS(table, ["text"], ["vector"], generate)
      );
      assertEquals(await table.getTypes(), types);
      assertEquals(
        await sdb.customQuery("SELECT vector[2] AS value FROM unchanged", {
          returnData: true,
        }),
        [{ value: 2 }, { value: 4 }],
      );
      assertEquals(await sdb.getTableNames(), ["unchanged"]);
    }
  } finally {
    await sdb.close();
  }
});
