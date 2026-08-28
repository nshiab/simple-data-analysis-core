/**
 * @module
 *
 * The Simple Data Analysis (Core) Library
 *
 * To install the library with Deno, use:
 * ```bash
 * deno add jsr:@nshiab/simple-data-analysis-core
 * ```
 *
 * To install the library with Node.js, use:
 * ```bash
 * npx jsr add @nshiab/simple-data-analysis-core
 * ```
 *
 * To start, create a SimpleDB instance and then a SimpleTable from this instance:
 * ```ts
 * import { SimpleDB } from "@nshiab/simple-data-analysis-core";
 *
 * const sdb = new SimpleDB();
 * const table = await sdb
 *   .newTable("myTable")
 *   .loadData("path/to/your/data.csv")
 *   .log();
 *
 * // You can now perform various data analysis operations on the table.
 *
 * await sdb.close(); // Ensure to close the database when you're finished.
 * ```
 */

export { default as SimpleDB } from "./class/SimpleDB.ts";
export { default as SimpleTable } from "./class/SimpleTable.ts";
export { default as SDAError } from "./class/SDAError.ts";
