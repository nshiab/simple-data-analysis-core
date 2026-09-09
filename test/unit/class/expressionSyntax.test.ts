import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import type SimpleTable from "../../../src/class/SimpleTable.ts";

const rows = [
  { id: 1, active: true, admin: false, text: "a || b" },
  { id: 2, active: false, admin: true, text: "a || b" },
  { id: 3, active: false, admin: false, text: "a || b" },
  { id: 4, active: true, admin: false, text: "excluded" },
];
const selected = rows.slice(0, 2);

// Test public entry points, not just cleanSQL: each must respect the same mode.
// SQL concatenation and SQL null semantics make accidental normalization fail.
const entryPoints: {
  name: string;
  run: (table: SimpleTable, conditions: string) => Promise<unknown>;
  expected: unknown;
}[] = [
  {
    name: "clone",
    run: (t, conditions) => t.clone({ conditions }).getData(),
    expected: selected,
  },
  { name: "filter", run: (t, c) => t.filter(c).getData(), expected: selected },
  {
    name: "removeRows",
    run: (t, c) => t.removeRows(c).getData(),
    expected: rows.slice(2),
  },
  {
    name: "getRowCount",
    run: (t, conditions) => t.getRowCount({ conditions }),
    expected: 2,
  },
  {
    name: "getFirstRow",
    run: (t, conditions) => t.getFirstRow({ conditions }),
    expected: rows[0],
  },
  {
    name: "getLastRow",
    run: (t, conditions) => t.getLastRow({ conditions }),
    expected: rows[1],
  },
  {
    name: "getTop",
    run: (t, conditions) => t.getTop(1, { conditions }),
    expected: [rows[0]],
  },
  {
    name: "getBottom",
    run: (t, conditions) => t.getBottom(1, { conditions }),
    expected: [rows[1]],
  },
  {
    name: "getRow",
    run: (t, c) => t.getRow(`(${c}) AND id = 2`),
    expected: rows[1],
  },
  {
    name: "getData",
    run: (t, conditions) => t.getData({ conditions }),
    expected: selected,
  },
  {
    name: "getDataAsCSV",
    run: (t, conditions) => t.getDataAsCSV({ conditions, columns: ["id"] }),
    expected: "id\n1\n2",
  },
  {
    name: "stream",
    run: async (t, conditions) => {
      const result = [];
      for await (const row of t.stream({ conditions })) result.push(row);
      return result;
    },
    expected: selected,
  },
  {
    name: "addColumn",
    run: (t, c) => t.addColumn("selected", "boolean", c).getData(),
    expected: rows.map((row, i) => ({ ...row, selected: i < 2 })),
  },
  {
    name: "updateColumn",
    run: (t, c) => t.updateColumn("active", c).getData(),
    expected: rows.map((row, i) => ({ ...row, active: i < 2 })),
  },
  {
    name: "customQuery",
    run: async (t, c) => {
      // Flush a pending load through the public custom-query path.
      return await t.sdb.customQuery(
        `SELECT * FROM "${t.name}" WHERE ${c} ORDER BY id`,
        { returnData: true },
      );
    },
    expected: selected,
  },
  {
    name: "log",
    run: async (t, conditions) => {
      const logged: unknown[][] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        logged.push(args);
      };
      try {
        await t.log({ conditions });
        const actual = [...logged];
        logged.length = 0;
        const expectedTable = t.sdb.newTable().loadArray(selected);
        await expectedTable.log();
        assertEquals(actual[0], [`\nTable ${t.name}:`]);
        assertEquals(actual[1], [`Conditions: ${conditions}`]);
        // Compare rendered rows and counts, excluding the differing table headers.
        assertEquals(actual.slice(2), logged.slice(1));
      } finally {
        console.log = originalLog;
      }
      return true;
    },
    expected: true,
  },
];

for (const expressionSyntax of ["js", "sql"] as const) {
  const conditions = expressionSyntax === "js"
    ? "(active || admin) && id !== null && text === 'a || b'"
    : "(active OR admin) AND id IS NOT NULL AND text || '!' = 'a || b!' AND (NULL = NULL) IS NULL";
  for (const { name, run, expected } of entryPoints) {
    Deno.test(`${name} honors ${expressionSyntax} expressionSyntax`, async () => {
      const sdb = new SimpleDB({ expressionSyntax });
      try {
        assertEquals(
          await run(sdb.newTable().loadArray(rows), conditions),
          expected,
        );
      } finally {
        await sdb.close();
      }
    });
  }
  for (const format of ["json", "geojson"] as const) {
    Deno.test(`${format === "json" ? "loadData" : "loadGeoData"} honors ${expressionSyntax} expressionSyntax`, async () => {
      const sdb = new SimpleDB({ expressionSyntax });
      const directory = await Deno.makeTempDir();
      try {
        const file = `${directory}/rows.${format}`;
        await Deno.writeTextFile(
          file,
          JSON.stringify(
            format === "json" ? rows : {
              type: "FeatureCollection",
              features: rows.map((properties) => ({
                type: "Feature",
                properties,
                geometry: { type: "Point", coordinates: [0, 0] },
              })),
            },
          ),
        );
        const table = sdb.newTable();
        // The condition references columns omitted from the final projection.
        if (format === "json") {
          table.loadData(file, { conditions, columns: ["id"] });
        } else table.loadGeoData(file, { conditions, columns: ["id"] });
        assertEquals(await table.sort({ id: "asc" }).getData(), [{ id: 1 }, {
          id: 2,
        }]);
      } finally {
        await sdb.close();
        await Deno.remove(directory, { recursive: true });
      }
    });
  }
}
