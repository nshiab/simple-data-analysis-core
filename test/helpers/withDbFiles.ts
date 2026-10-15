import { mkdtempSync as nodeMkdtempSync, rmSync as nodeRmSync } from "node:fs";
import { join as nodeJoin } from "node:path";
import { tmpdir as nodeTmpdir } from "node:os";
import { join } from "node:path";
import SimpleDB from "../../src/class/SimpleDB.ts";

export default async function withDbFiles(
  test: (context: {
    directory: string;
    db: (options?: ConstructorParameters<typeof SimpleDB>[0]) => SimpleDB;
  }) => Promise<void>,
): Promise<void> {
  const directory = nodeMkdtempSync(nodeJoin(nodeTmpdir(), "sda-db-files-"));
  const databases: SimpleDB[] = [];
  const errors: unknown[] = [];
  try {
    await test({
      directory,
      db: (options = {}) => {
        const database = new SimpleDB({
          tempDir: join(directory, `tmp-${databases.length}`),
          ...options,
        });
        databases.push(database);
        return database;
      },
    });
  } catch (error) {
    errors.push(error);
  } finally {
    const results = await Promise.allSettled(
      databases.map((database) =>
        database.lifecycleState === "closed" ? Promise.resolve() : database.close(),
      ),
    );
    nodeRmSync(directory, { recursive: true });
    for (const result of results) {
      if (result.status === "rejected") {
        const reason: unknown = result.reason;
        errors.push(reason);
      }
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Database test or cleanup failed.");
  }
}
