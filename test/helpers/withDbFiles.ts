import { join } from "node:path";
import SimpleDB from "../../src/class/SimpleDB.ts";

export default async function withDbFiles(
  test: (context: {
    directory: string;
    db: (options?: ConstructorParameters<typeof SimpleDB>[0]) => SimpleDB;
  }) => Promise<void>,
): Promise<void> {
  const directory = Deno.makeTempDirSync({ prefix: "sda-db-files-" });
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
        database.lifecycleState === "closed"
          ? Promise.resolve()
          : database.close()
      ),
    );
    Deno.removeSync(directory, { recursive: true });
    errors.push(
      ...results.filter((result) => result.status === "rejected").map((
        result,
      ) => result.reason),
    );
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Database test or cleanup failed.");
  }
}
