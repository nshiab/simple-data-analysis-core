import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";
import SimpleDB from "../../../src/class/SimpleDB.ts";

test("loadFilePaths queues a nonrecursive match without reading file contents", async () => {
  const sdb = new SimpleDB();
  try {
    const directory = "publisher's documents";
    const table = sdb.newTable().loadFilePaths(`./${directory}/*.pdf`);
    await mkdir(join(directory, "nested"), { recursive: true });
    await mkdir(join(directory, "folder.pdf"));
    await writeFile(join(directory, "report.pdf"), new Uint8Array([0xff, 0x00]));
    await writeFile(join(directory, "nested", "report.pdf"), "");

    expect(await table.getData()).toStrictEqual([{ path: resolve(directory, "report.pdf") }]);
  } finally {
    await sdb.close();
  }
});

test("loadFilePaths combines recursive patterns and deduplicates overlapping paths", async () => {
  const sdb = new SimpleDB();
  try {
    const directory = "archive";
    const patterns = [
      `./${directory}/**/*.pdf`,
      resolve(directory, "*.pdf"),
      `${directory}/**/*.jpg`,
    ];
    const table = sdb.newTable().loadFilePaths(patterns).sort({ path: "asc" });
    patterns.length = 0;
    await mkdir(join(directory, "2026", "November"), { recursive: true });
    await writeFile(join(directory, "index.pdf"), "");
    await writeFile(join(directory, "2026", "November", "photo.jpg"), "");
    await writeFile(join(directory, "2026", "November", "report.pdf"), "");
    await writeFile(join(directory, "2026", "notes.txt"), "");

    expect(await table.getData()).toStrictEqual([
      { path: resolve(directory, "2026", "November", "photo.jpg") },
      { path: resolve(directory, "2026", "November", "report.pdf") },
      { path: resolve(directory, "index.pdf") },
    ]);
  } finally {
    await sdb.close();
  }
});

test("loadFilePaths preserves the path column when there are no matches", async () => {
  const sdb = new SimpleDB();
  try {
    for (const patterns of ["./missing/**/*.pdf", []]) {
      const table = sdb.newTable().loadFilePaths(patterns);
      expect(await table.getData()).toStrictEqual([]);
      expect(await table.getTypes()).toStrictEqual({ path: "VARCHAR" });
    }
  } finally {
    await sdb.close();
  }
});
