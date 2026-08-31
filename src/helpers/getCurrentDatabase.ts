import queryDbFile from "./queryDbFile.ts";
import type SimpleDB from "../class/SimpleDB.ts";

export default async function getCurrentDatabase(
  sdb: SimpleDB,
): Promise<string> {
  const rows = await queryDbFile(sdb, "SELECT current_database() AS name;", {
    returnData: true,
  });
  return rows![0].name as string;
}
