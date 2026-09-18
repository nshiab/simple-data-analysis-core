import { assert, assertEquals, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import {
  graphWorkloadEdgeCount,
  graphWorkloadQuery,
  graphWorkloads,
} from "../../../benchmarks/graphs/workloads.ts";

Deno.test("generated graph workloads stay separate from correctness fixtures", async () => {
  const sdb = new SimpleDB();
  try {
    for (const workload of graphWorkloads) {
      const nodes = 5;
      const rows = await sdb.customQuery(
        `SELECT * FROM (${graphWorkloadQuery(workload.name, nodes)}) generated
        ORDER BY edgeId`,
        { returnData: true },
      );
      assert(rows);
      assertEquals(rows.length, graphWorkloadEdgeCount(workload.name, nodes));
      assertEquals(
        new Set(rows.map((row) => row.edgeId)).size,
        rows.length,
      );
      assertEquals(
        rows.every((row) => row.source !== row.target),
        true,
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("generated graph workload shapes are deterministic", async () => {
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await sdb.customQuery(
        `SELECT edgeId, source, target FROM (${
          graphWorkloadQuery("deep-chain", 5)
        }) generated ORDER BY edgeId`,
        { returnData: true },
      ),
      [
        { edgeId: 0, source: 0, target: 1 },
        { edgeId: 1, source: 1, target: 2 },
        { edgeId: 2, source: 2, target: 3 },
        { edgeId: 3, source: 3, target: 4 },
      ],
    );
    assertEquals(
      await sdb.customQuery(
        `SELECT edgeId, source, target FROM (${
          graphWorkloadQuery("branching", 5)
        }) generated ORDER BY edgeId`,
        { returnData: true },
      ),
      [
        { edgeId: 0, source: 0, target: 1 },
        { edgeId: 1, source: 0, target: 2 },
        { edgeId: 2, source: 1, target: 3 },
        { edgeId: 3, source: 1, target: 4 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("generated graph workloads validate node counts without allocating data", () => {
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
    assertThrows(
      () => graphWorkloadQuery("deep-chain", value),
      TypeError,
      "non-negative safe integer",
    );
  }
  assertEquals(graphWorkloadEdgeCount("dense", 5), 20);
  assertEquals(graphWorkloadEdgeCount("deep-chain", 0), 0);
});
