import { extname } from "node:path";

export default function getDbFileType(file: string): "duckdb" | "sqlite" {
  const extension = extname(file).slice(1).toLowerCase();
  if (extension === "db" || extension === "duckdb") return "duckdb";
  if (extension === "sqlite") return "sqlite";
  throw new Error(
    `The extension ${extension} is not supported. Please use .db, .duckdb or .sqlite instead.`,
  );
}
