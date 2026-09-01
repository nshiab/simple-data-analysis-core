import { existsSync, mkdirSync } from "node:fs";

/**
 * Creates missing directories in an output path, including parent directories.
 * Non-hidden path segments containing a dot are treated as filenames and omitted.
 *
 * @param path - An output file path or a directory path without dotted segments.
 * @returns Nothing. Existing directories are left unchanged.
 *
 * @example
 * ```ts
 * import { createDirectory } from "@nshiab/simple-data-analysis-core/helpers";
 * createDirectory("output/tables/results.csv"); // Creates output/tables.
 * ```
 */
export default function createDirectory(path: string): void {
  path = path
    .split("/")
    .filter((d) => (d.startsWith(".") ? true : !d.includes(".")))
    .join("/");

  if (path !== "" && !existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}
