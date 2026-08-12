import { assertEquals, assertRejects } from "@std/assert";
import { existsSync, writeFileSync } from "node:fs";
import { withTemporaryResultFile } from "../../../src/helpers/runQueryFromFile.ts";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("result transport removes its scratch file after success", async () => {
  let scratchPath = "";
  const result = await withTemporaryResultFile("json", (path) => {
    scratchPath = path;
    writeFileSync(path, "[]");
    assertEquals(existsSync(path), true);
    return 42;
  });

  assertEquals(result, 42);
  assertEquals(existsSync(scratchPath), false);
});

Deno.test("result transport removes its scratch file after failure", async () => {
  let scratchPath = "";
  await assertRejects(
    () =>
      withTemporaryResultFile("json", (path) => {
        scratchPath = path;
        writeFileSync(path, "not json");
        throw new Error("read failed");
      }),
    Error,
    "read failed",
  );

  assertEquals(existsSync(scratchPath), false);
});

Deno.test("concurrent result transports use different scratch files", async () => {
  const scratchPaths: string[] = [];
  let releaseBoth: () => void = () => {};
  const bothStarted = new Promise<void>((resolve) => {
    releaseBoth = resolve;
  });

  const operations = [1, 2].map((value) =>
    withTemporaryResultFile("json", async (path) => {
      scratchPaths.push(path);
      writeFileSync(path, JSON.stringify([{ value }]));
      if (scratchPaths.length === 2) {
        releaseBoth();
      }
      await bothStarted;
      return path;
    })
  );
  const returnedPaths = await Promise.all(operations);

  assertEquals(new Set(returnedPaths).size, 2);
  assertEquals(returnedPaths.every((path) => !existsSync(path)), true);
});

Deno.test("concurrent file-backed retrievals return independent rows", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const first = sdb.newTable("firstConcurrentResult");
  const second = sdb.newTable("secondConcurrentResult");
  first.loadArray([{ value: 1 }]);
  second.loadArray([{ value: 2 }]);

  const [firstRows, secondRows] = await Promise.all([
    first.getData(),
    second.getData(),
  ]);
  assertEquals(firstRows, [{ value: 1 }]);
  assertEquals(secondRows, [{ value: 2 }]);
  await sdb.close();
});
