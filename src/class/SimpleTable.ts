import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import csvFormat from "../helpers/csvFormat.ts";
import getDescription from "../methods/getDescription.ts";
import removeMissing from "../methods/removeMissing.ts";
import getColumns from "../methods/getColumns.ts";
import getRowCount from "../methods/getRowCount.ts";
import getCharacterCount from "../methods/getCharacterCount.ts";
import getTypes from "../methods/getTypes.ts";
import getHash from "../methods/getHash.ts";
import getValues from "../methods/getValues.ts";
import getUniques from "../methods/getUniques.ts";
import getFirstRow from "../methods/getFirstRow.ts";
import getLastRow from "../methods/getLastRow.ts";
import getTop from "../methods/getTop.ts";
import getBottom from "../methods/getBottom.ts";
import getMin from "../methods/getMin.ts";
import getMax from "../methods/getMax.ts";
import getMean from "../methods/getMean.ts";
import getMedian from "../methods/getMedian.ts";
import getSum from "../methods/getSum.ts";
import getSkew from "../methods/getSkew.ts";
import getStdDev from "../methods/getStdDev.ts";
import getVariance from "../methods/getVariance.ts";
import getQuantile from "../methods/getQuantile.ts";
import cloneColumn from "../methods/cloneColumn.ts";
import getGeoData from "../methods/getGeoData.ts";
import writeGeoData from "../helpers/writeGeoData.ts";
import splitSpread from "../methods/splitSpread.ts";
import type SimpleDB from "./SimpleDB.ts";
import runQuery from "../helpers/runQuery.ts";
import summarize from "../methods/summarize.ts";
import addSummaryRows from "../methods/addSummaryRows.ts";
import correlations from "../methods/correlations.ts";
import linearRegressions from "../methods/linearRegressions.ts";
import joinGeo from "../methods/joinGeo.ts";
import cache from "../methods/cache.ts";
import camelCase from "../helpers/camelCase.ts";
import formatNumber from "../helpers/formatNumber.ts";
import logData from "../helpers/logData.ts";
import fill from "../methods/fill.ts";
import loadArray from "../methods/loadArray.ts";
import Simple from "./Simple.ts";
import join from "../methods/join.ts";
import fuzzyJoin from "../methods/fuzzyJoin.ts";
import fuzzyClean from "../methods/fuzzyClean.ts";
import findGeoColumn from "../helpers/findGeoColumn.ts";
import createFtsIndex from "../methods/createFtsIndex.ts";
import createVssIndex from "../methods/createVssIndex.ts";
import bm25 from "../methods/bm25.ts";
import loadSample from "../methods/loadSample.ts";
import normalizeString from "../methods/normalizeString.ts";
import distance from "../methods/distance.ts";
import extractLatLon from "../methods/extractLatLon.ts";
import coveredBy from "../methods/coveredBy.ts";
import intersects from "../methods/intersects.ts";
import normalize from "../methods/normalize.ts";
import indexValues from "../methods/indexValues.ts";
import zScore from "../methods/zScore.ts";
import rolling from "../methods/rolling.ts";
import accumulate from "../methods/accumulate.ts";
import columnProportions from "../methods/columnProportions.ts";
import rowProportions from "../methods/rowProportions.ts";
import rowRanks from "../methods/rowRanks.ts";
import quantiles from "../methods/quantiles.ts";
import ranks from "../methods/ranks.ts";
import updateColumn from "../methods/updateColumn.ts";
import nest from "../methods/nest.ts";
import repeatRows from "../methods/repeatRows.ts";
import unnest from "../methods/unnest.ts";
import concatenate from "../methods/concatenate.ts";
import lastChars from "../methods/lastChars.ts";
import firstChars from "../methods/firstChars.ts";
import splitExtract from "../methods/splitExtract.ts";
import truncate from "../methods/truncate.ts";
import capitalize from "../methods/capitalize.ts";
import upper from "../methods/upper.ts";
import lower from "../methods/lower.ts";
import removeTable from "../methods/removeTable.ts";
import wider from "../methods/wider.ts";
import removeRows from "../methods/removeRows.ts";
import removeValues from "../methods/removeValues.ts";
import keepValues from "../methods/keepValues.ts";
import filter from "../methods/filter.ts";
import removeDuplicates from "../methods/removeDuplicates.ts";
import sample from "../methods/sample.ts";
import skip from "../methods/skip.ts";
import selectColumns from "../methods/selectColumns.ts";
import sort from "../methods/sort.ts";
import loadData from "../methods/loadData.ts";
import renameTable from "../methods/renameTable.ts";
import writeData from "../methods/writeData.ts";
import getBoundingBox from "../methods/getBoundingBox.ts";
import linesToPolygons from "../methods/linesToPolygons.ts";
import aggregateGeo from "../methods/aggregateGeo.ts";
import addBoundingBox from "../methods/addBoundingBox.ts";
import unnestGeo from "../methods/unnestGeo.ts";
import randomPoint from "../methods/randomPoint.ts";
import centroid from "../methods/centroid.ts";
import simplify from "../methods/simplify.ts";
import union from "../methods/union.ts";
import fillHoles from "../methods/fillHoles.ts";
import difference from "../methods/difference.ts";
import intersection from "../methods/intersection.ts";
import buffer from "../methods/buffer.ts";
import perimeter from "../methods/perimeter.ts";
import length from "../methods/length.ts";
import area from "../methods/area.ts";
import reproject from "../methods/reproject.ts";
import reducePrecision from "../methods/reducePrecision.ts";
import flipCoordinates from "../methods/flipCoordinates.ts";
import addGeoType from "../methods/addGeoType.ts";
import addGeoClosedStatus from "../methods/addGeoClosedStatus.ts";
import fixGeo from "../methods/fixGeo.ts";
import addVertexCount from "../methods/addVertexCount.ts";
import addGeoValidity from "../methods/addGeoValidity.ts";
import createPoints from "../methods/createPoints.ts";
import getData from "../methods/getData.ts";
import stream from "../methods/stream.ts";
import updateWithJS from "../methods/updateWithJS.ts";
import getSchema from "../methods/getSchema.ts";
import outliersIQR from "../methods/outliersIQR.ts";
import bins from "../methods/bins.ts";
import round from "../methods/round.ts";
import rowToText from "../methods/rowToText.ts";
import replaceNulls from "../methods/replaceNulls.ts";
import pad from "../methods/pad.ts";
import replace from "../methods/replace.ts";
import crossJoin from "../methods/crossJoin.ts";
import addRowNumber from "../methods/addRowNumber.ts";
import addColumn from "../methods/addColumn.ts";
import extractDatePart from "../methods/extractDatePart.ts";
import removeColumns from "../methods/removeColumns.ts";
import convert from "../methods/convert.ts";
import longer from "../methods/longer.ts";
import renameColumns from "../methods/renameColumns.ts";
import trim from "../methods/trim.ts";
import selectRows from "../methods/selectRows.ts";
import cloneColumnWithOffset from "../methods/cloneColumnWithOffset.ts";
import clone from "../methods/clone.ts";
import insertTables from "../methods/insertTables.ts";
import insertRows from "../methods/insertRows.ts";
import loadGeoData from "../methods/loadGeoData.ts";
import loadOpenStreetMap from "../methods/loadOpenStreetMap.ts";
import loadStatCanData from "../methods/loadStatCanData.ts";
import setTypes from "../methods/setTypes.ts";
import flushAllTables from "../helpers/flushAllTables.ts";
import queueOp from "../helpers/queueOp.ts";
import type { PendingOp } from "../helpers/pendingOps.ts";

/**
 * IMPORTANT: When extending this class, always use `this.sdb.newTable()` to
 * create new tables instead of `new SimpleTable(...)` directly. This ensures
 * subclasses that override `tableClass` on their parent `SimpleDB` get their
 * own table type back.
 *
 * Represents a table within a SimpleDB database, capable of handling tabular, geospatial, and vector data.
 * SimpleTable instances are typically created via a SimpleDB instance.
 *
 * @category Main
 * @example
 * ```ts
 * // Create a SimpleDB instance (in-memory by default)
 * const sdb = new SimpleDB();
 *
 * // Create a table, load a CSV file, and log its first few rows
 * const employees = await sdb
 *   .newTable("employees")
 *   .loadData("./employees.csv")
 *   .log();
 *
 * // Close the database connection and free up resources
 * await sdb.close();
 * ```
 *
 * @example
 * ```ts
 * // Handling geospatial data
 * // Create a SimpleDB instance
 * const sdb = new SimpleDB();
 *
 * // Create a table and load geospatial data from a GeoJSON file
 * const boundaries = await sdb
 *   .newTable("boundaries")
 *   .loadGeoData("./boundaries.geojson")
 *   .log();
 *
 * // Close the database connection
 * await sdb.close();
 * ```
 */

export default class SimpleTable extends Simple {
  #name: string;

  /**
   * Name of the table in the database.
   *
   * @category Properties
   *
   * @example
   * ```ts
   * console.log(table.name); // e.g., "employees"
   * ```
   */
  get name(): string {
    return this.#name;
  }
  /**
   * The definitions of the indexes belonging to the table, if any. Do not
   * mutate this array directly.
   *
   * @defaultValue `[]`
   * @category Properties
   *
   * @example
   * ```ts
   * console.log(table.indexes);
   * // [{ kind: "vss", name: "vss_cosine_index_articles", ... }]
   * ```
   */
  indexes: (
    | {
      kind: "vss";
      name: string;
      column: string;
      options: {
        efConstruction?: number;
        efSearch?: number;
        M?: number;
      };
    }
    | {
      kind: "fts";
      name: string;
      idColumn: string;
      textColumn: string;
      options: {
        stemmer?: string;
        stopwords?: string;
        ignore?: string;
        stripAccents?: boolean;
        lower?: boolean;
      };
    }
  )[];
  /**
   * The operations queued by sync builder methods, waiting to be executed at
   * the next observation point. This is for internal use only.
   *
   * @defaultValue `[]`
   * @internal
   */
  pendingOps: PendingOp[];
  /**
   * The SimpleDB instance that created this table.
   *
   * @category Properties
   */
  declare sdb: SimpleDB;

  /**
   * Creates an instance of SimpleTable.
   *
   * @param name - The name of the table.
   * @param simpleDB - The SimpleDB instance that this table belongs to.
   * @param options - An optional object with configuration options:
   * @param options.rowsToLog - The number of rows to log when displaying table data.
   * @param options.charsToLog - The maximum number of characters to log for strings. Useful to avoid logging large text content.
   * @param options.typesToLog - A boolean indicating whether to include data types when logging a table.
   * @category Constructor
   */
  constructor(
    name: string,
    simpleDB: SimpleDB,
    options: {
      rowsToLog?: number;
      charsToLog?: number;
      typesToLog?: boolean;
    } = {},
  ) {
    super(options);
    this.#name = name;
    this.sdb = simpleDB;
    this.runQuery = runQuery;
    this.indexes = [];
    this.pendingOps = [];
  }

  /**
   * Executes all queued methods across every table in the database, not just
   * this table. Sync builder methods (like `filter()` or `convert()`) only
   * queue their operation; execution happens when an async observer method
   * (like `getData()`, `log()`, or `writeData()`) is awaited. Use `run()`
   * when a chain ends in pure mutations with nothing to observe and you want
   * the work done now.
   *
   * Because the whole database is flushed in program order, this behaves
   * identically to `SimpleDB.run()`; call `sdb.run()` when your intent is to
   * flush the database rather than this specific table.
   *
   * @returns A promise that resolves to the table once the queued methods have been executed.
   * @category Table Management
   *
   * @example
   * ```ts
   * // Nothing is observed after convert(), so run() executes the chain.
   * await table
   *   .loadData("data.csv")
   *   .convert({ price: "number" })
   *   .run();
   * await table.log();
   * ```
   */
  async run(): Promise<this> {
    await flushAllTables(this.sdb);
    return this;
  }

  /**
   * Renames the current table.
   *
   * @param name - The new name for the table.
   * @returns A promise that resolves to the renamed table.
   * @category Table Management
   *
   * @example
   * ```ts
   * // Rename the table to "new_employees"
   * await table.renameTable("new_employees");
   * await table.log();
   * ```
   */
  async renameTable(name: string): Promise<this> {
    await renameTable(this, name);
    this.#name = name;
    return this;
  }

  /**
   * Sets the data types for columns in a new table. If the table already exists, it will be replaced.
   * To convert the types of an existing table, use the `.convert()` method instead.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param types - An object specifying the column names and their target data types (JavaScript or SQL types).
   * @returns The table, so methods can be chained.
   * @category Table Management
   *
   * @example
   * ```ts
   * // Set types for a new table
   * await table.setTypes({
   *   name: "string",
   *   salary: "integer",
   *   raise: "float",
   * }).log();
   * ```
   */
  setTypes(types: {
    [key: string]:
      | "integer"
      | "float"
      | "number"
      | "string"
      | "date"
      | "time"
      | "datetime"
      | "datetimeTz"
      | "bigint"
      | "double"
      | "varchar"
      | "timestamp"
      | "timestamp with time zone"
      | "boolean"
      | `geometry('${string}')`
      | `GEOMETRY('${string}')`;
  }): this {
    setTypes(this, types);
    return this;
  }

  /**
   * Loads an array of JavaScript objects into the table. This method queues the load; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * JavaScript `Date` values are inferred as DuckDB `TIMESTAMP` values. Their
   * instant is preserved, but JavaScript `Date` does not retain the timezone or
   * offset originally used to construct it. String values remain `VARCHAR`;
   * use `convert()` to parse them as temporal values.
   *
   * @param rows - An array of objects, where each object represents a row and its properties represent columns.
   * @returns The table, so methods can be chained.
   * @category Importing Data
   *
   * @example
   * ```ts
   * // Load data from an array of objects
   * const data = [
   *   { letter: "a", number: 1 },
   *   { letter: "b", number: 2 }
   * ];
   * await table.loadArray(data).log();
   * ```
   *
   * @example
   * ```ts
   * // The offset determines the instant; the loaded TIMESTAMP is returned as
   * // the equivalent UTC JavaScript Date.
   * await table.loadArray([{
   *   observedAt: new Date("2024-04-07T13:00:00-04:00"),
   * }]).log();
   * ```
   */
  loadArray(
    rows: { [key: string]: unknown }[],
  ): this {
    loadArray(this, rows);

    return this;
  }

  /**
   * Loads data from one or more local or remote files into the table.
   * Supported file formats include CSV, JSON, Parquet, and Excel.
   * This method queues the load; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param files - The path(s) or URL(s) of the file(s) containing the data to be loaded.
   * @param options - An optional object with configuration options:
   * @param options.fileType - The type of file to load ("csv", "dsv", "json", "parquet", "excel"). Defaults to being inferred from the file extension.
   * @param options.autoDetect - A boolean indicating whether to automatically detect the data format. Defaults to `true`.
   * @param options.conditions - A SQL `WHERE` clause expression, without the `WHERE` keyword, to filter source rows before applying `limit`. Uses the same syntax as `filter()`, including JavaScript operators. Can reference source columns excluded from `columns`. Defaults to no filtering; an empty string behaves the same as omitting this option.
   * @param options.limit - A number indicating the maximum number of matching rows to load, after applying `conditions` if provided. Defaults to all matching rows.
   * @param options.includeFilename - A boolean indicating whether to include the filename as a new column in the loaded data. Defaults to `false`.
   * @param options.unifyColumns - A boolean indicating whether to unify columns across multiple files when their structures differ. Missing columns will be filled with `NULL` values. Defaults to `false`.
   * @param options.columnTypes - An object mapping column names to their expected data types. By default, types are inferred.
   * @param options.columns - An array of column names to load. When provided, only the specified columns are loaded, reducing memory usage and improving load times. Not supported for Excel files — combining `columns` with Excel files throws an error. If an invalid column name is provided, DuckDB will throw its native error. An empty array behaves the same as omitting the option (loads all columns). Defaults to loading all columns.
   * @param options.header - A boolean indicating whether the file has a header row. Applicable to CSV files. Defaults to `true`.
   * @param options.allText - A boolean indicating whether all columns should be treated as text. Applicable to CSV files. Defaults to `false`.
   * @param options.delim - The delimiter used in the file. Applicable to CSV and DSV files. By default, the delimiter is inferred.
   * @param options.skip - The number of lines to skip at the beginning of the file. Applicable to CSV files. Defaults to `0`.
   * @param options.nullPadding - If `true`, when a row has fewer columns than expected, the remaining columns on the right will be padded with `NULL` values. Defaults to `false`.
   * @param options.ignoreErrors - If `true`, parsing errors encountered will be ignored, and rows with errors will be skipped. Defaults to `false`.
   * @param options.compression - The compression type of the file. Applicable to CSV files. Defaults to `none`.
   * @param options.strict - If `true`, an error will be thrown when encountering any issues. If `false`, structurally incorrect files will be parsed tentatively. Defaults to `true`.
   * @param options.encoding - The encoding of the file. Applicable to CSV files. Defaults to `utf-8`.
   * @param options.jsonFormat - The format of JSON files ("unstructured", "newlineDelimited", "array"). By default, the format is inferred.
   * @param options.records - A boolean indicating whether each line in a newline-delimited JSON file represents a record. Applicable to JSON files. By default, it's inferred.
   * @param options.sheet - A string indicating a specific sheet to import from an Excel file. By default, the first sheet is imported.
   * @returns The table, so methods can be chained.
   * @category Importing Data
   *
   * @example
   * ```ts
   * // Load data from a single local CSV file
   * await table.loadData("./some-data.csv").log();
   * ```
   *
   * @example
   * ```ts
   * // Load data from a remote Parquet file
   * await table.loadData("https://some-website.com/some-data.parquet").log();
   * ```
   *
   * @example
   * ```ts
   * // Load data from multiple local JSON files
   * await table.loadData([
   *   "./some-data1.json",
   *   "./some-data2.json",
   *   "./some-data3.json"
   * ]).log();
   * ```
   *
   * @example
   * ```ts
   * // Load multiple CSV files and unify columns that differ between files
   * await table.loadData("./data/*.csv", { unifyColumns: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Keep the source filename when loading multiple files
   * await table
   *   .loadData("./data/*.csv", { includeFilename: true })
   *   .log();
   * ```
   *
   * @example
   * ```ts
   * // Load only specific columns from a CSV file
   * await table.loadData("./employees.csv", { columns: ["name", "salary"] }).log();
   * ```
   *
   * @example
   * ```ts
   * // Load up to 100 matching employees, keeping only their names
   * await table
   *   .loadData("./employees.parquet", {
   *     conditions: "salary > 100000",
   *     columns: ["name"],
   *     limit: 100,
   *   })
   *   .log();
   * ```
   */
  loadData(
    files: string | string[],
    options: {
      fileType?: "csv" | "dsv" | "json" | "parquet" | "excel";
      autoDetect?: boolean;
      conditions?: string;
      limit?: number;
      includeFilename?: boolean;
      unifyColumns?: boolean;
      columnTypes?: { [key: string]: string };
      // column selection
      columns?: string[];
      // csv options
      header?: boolean;
      allText?: boolean;
      delim?: string;
      skip?: number;
      nullPadding?: boolean;
      ignoreErrors?: boolean;
      compression?: "none" | "gzip" | "zstd";
      encoding?: string;
      strict?: boolean;
      // json options
      jsonFormat?: "unstructured" | "newlineDelimited" | "array";
      records?: boolean;
      // excel options
      sheet?: string;
    } = {},
  ): this {
    loadData(this, files, options);
    return this;
  }

  /**
   * Downloads a complete Statistics Canada table and loads it into this table.
   * The method queues the download and load; they run when an async observer
   * method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * Results are cached as Parquet files in `.sda-cache/statcan` by default.
   * Cached data does not expire unless a TTL is provided.
   *
   * @param pid - The Statistics Canada Product ID. Eight-digit PIDs, ten-digit view PIDs, and hyphenated table identifiers are accepted.
   * @param options - Optional retrieval and cache settings.
   * @param options.lang - The language of the table data. Defaults to `"en"`.
   * @param options.cache - Whether to read and write the cache. Defaults to `true`.
   * @param options.ttl - Cache lifetime in seconds. Omit for no expiration, use `0` to refresh the matching cache entry immediately, or provide a positive value to refresh once the entry reaches that age.
   * @returns The table, so methods can be chained.
   * @category Importing Data
   *
   * @example
   * ```ts
   * await sdb
   *   .newTable("population")
   *   .loadStatCanData("17-10-0005-01")
   *   .filter("GEO = 'Canada'")
   *   .log();
   * ```
   *
   * @example
   * ```ts
   * // Refresh French data when the cached table is at least one day old.
   * await table
   *   .loadStatCanData("17-10-0005", {
   *     lang: "fr",
   *     ttl: 24 * 60 * 60,
   *   })
   *   .log();
   * ```
   */
  loadStatCanData(
    pid: string,
    options: {
      lang?: "en" | "fr";
      cache?: boolean;
      ttl?: number;
    } = {},
  ): this {
    loadStatCanData(this, pid, options);
    return this;
  }

  /**
   * Loads geospatial data from an external file or URL into the table.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param file - The path or URL of the external file containing the geospatial data.
   * @param options - An optional object with configuration options:
   * @param options.toEPSG4326 - If `true`, the method will attempt to reproject the data to EPSG:4326 (WGS84).
   * @param options.columns - The columns to load. Include the geometry column that should remain in the resulting table, usually `"geom"`. By default, all columns are loaded.
   * @param options.conditions - A SQL `WHERE` clause expression, without the `WHERE` keyword, to filter source rows before materialization and reprojection. Uses the same syntax as `filter()`, including JavaScript operators. Can reference source columns excluded from `columns`. Geometry conditions use the source coordinate system. Defaults to no filtering; an empty string behaves the same as omitting this option.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Load geospatial data from a URL
   * await table.loadGeoData("https://some-website.com/some-data.geojson").log();
   * ```
   *
   * @example
   * ```ts
   * // Load geospatial data from a local file
   * await table.loadGeoData("./some-data.geojson").log();
   * ```
   *
   * @example
   * ```ts
   * // Load only the name and geometry columns
   * await table
   *   .loadGeoData("./boundaries.geojson", {
   *     columns: ["name", "geom"],
   *   })
   *   .log();
   * ```
   *
   * @example
   * ```ts
   * // Load geospatial data from a shapefile (with relevant files in the same folder) and reproject to EPSG:4326 (WGS84)
   * await table.loadGeoData("./some-data/some-data.shp", { toEPSG4326: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Load geospatial data from a zipped shapefile and reproject to EPSG:4326 (WGS84)
   * await table.loadGeoData("./some-data.shp.zip", { toEPSG4326: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Filter on a source property without retaining it in the table
   * await table
   *   .loadGeoData("./boundaries.geojson", {
   *     conditions: "population > 100000",
   *     columns: ["name", "geom"],
   *   })
   *   .log();
   * ```
   */
  loadGeoData(
    file: string,
    options: {
      toEPSG4326?: boolean;
      columns?: string[];
      conditions?: string;
    } = {},
  ): this {
    loadGeoData(this, file, options);
    return this;
  }

  /**
   * Loads OpenStreetMap data into the table from a local `.osm` or `.osm.pbf` file, a remote file URL, or an Overpass bounding-box query. Pass a path or URL string to load an existing file, or pass a bounding box with `filters` to download matching features. The method queues the load; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * DuckDB's [Osmium community extension](https://duckdb.org/community_extensions/extensions/osmium) materializes the complete result and reconstructs `geom` as EPSG:4326. By default, that canonical result is cached as GeoParquet in `.sda-cache/osm`. Distinct paths, local file fingerprints, normalized URLs, endpoints, queries, and bounding boxes retain independent entries. The cache has no expiration unless `ttl` is set and can be cleared by removing `.sda-cache/osm`. Immutable URLs can safely use the default indefinite cache; mutable URLs should set a TTL.
   *
   * Bounding-box filters use the standard [Overpass QL filter syntax](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#Filters). Equality filters are passed as `[key, value]` tuples and serialized by the method. A raw filter fragment string can be used for advanced Overpass filters.
   *
   * The default Overpass endpoint is a shared public service. Follow the [Overpass public-instance usage guidelines](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html), and configure another endpoint or run your own instance for high-volume usage.
   *
   * OpenStreetMap data is licensed under the [Open Data Commons Open Database License](https://www.openstreetmap.org/copyright). Public use requires [OpenStreetMap attribution](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines), and distributing OSM or derivative databases can trigger the licence's share-alike requirements.
   *
   * @param source - The local path or remote URL of an existing `.osm` or `.osm.pbf` file, or a bounding box to query through Overpass.
   * @param source.west - The western longitude, between -180 and 180 and less than `east`.
   * @param source.south - The southern latitude, between -90 and 90 and less than `north`.
   * @param source.east - The eastern longitude, between -180 and 180 and greater than `west`.
   * @param source.north - The northern latitude, between -90 and 90 and greater than `south`.
   * @param options - Loading options. When `source` is a bounding box, `options.filters` must be provided.
   * @param options.filters - For a bounding-box query, one `[key, value]` tuple or an array of tuples. Array entries are combined as a union. A raw Overpass QL filter fragment string is also accepted.
   * @param options.endpoint - The Overpass interpreter endpoint. Defaults to `https://overpass-api.de/api/interpreter`.
   * @param options.timeout - A positive integer timeout in seconds, applied to both the Overpass query and HTTP request. If omitted, the endpoint's default query timeout applies and no HTTP request timeout is set.
   * @param options.cache - Whether to read and write the processed GeoParquet cache. Defaults to `true`.
   * @param options.ttl - Cache lifetime in seconds. Omit for no expiration, use `0` to refresh the matching cache entry immediately, or provide a positive value to refresh once the processed entry reaches that age. Cannot be combined with `cache: false`.
   * @param options.retries - Additional network retries after the initial request. Defaults to `3`, for up to four attempts. Network-only; passing it for a local path throws an error.
   * @param options.retryDelay - Base retry delay in seconds. Defaults to `5`, producing deterministic delays of 5, 10, and 20 seconds. A longer valid `Retry-After` value takes precedence. Network-only; passing it for a local path throws an error.
   * @param options.verbose - Whether to log OpenStreetMap cache, network, Osmium, cleanup, and timing lifecycle details. Defaults to `false`. `SimpleDB({ cacheVerbose: true })` also enables these messages and is not overridden by `verbose: false`.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Load an existing local OpenStreetMap PBF file
   * await table.loadOpenStreetMap("./montreal.osm.pbf").log();
   * ```
   *
   * @example
   * ```ts
   * // Filter and project after the complete canonical source has loaded
   * await table
   *   .loadOpenStreetMap("./montreal.osm.pbf", { verbose: true })
   *   .filter("tags['amenity'] = 'school'")
   *   .selectColumns(["id", "tags", "geom"])
   *   .log();
   * ```
   *
   * @example
   * ```ts
   * // Download features matching one equality filter within a bounding box
   * await table
   *   .loadOpenStreetMap(
   *     { west: -73.587799, south: 45.445078, east: -73.552265, north: 45.471086 },
   *     { filters: ["amenity", "school"] },
   *   )
   *   .log();
   * ```
   *
   * @example
   * ```ts
   * // Download features matching either equality filter
   * await table.loadOpenStreetMap(
   *   { west: -73.587799, south: 45.445078, east: -73.552265, north: 45.471086 },
   *   {
   *     filters: [["amenity", "school"], ["amenity", "college"]],
   *   },
   * ).log();
   * ```
   *
   * @example
   * ```ts
   * // Use a raw Overpass filter fragment for an advanced filter
   * await table.loadOpenStreetMap(
   *   { west: -73.587799, south: 45.445078, east: -73.552265, north: 45.471086 },
   *   { filters: `["amenity"~"school|college"]` },
   * ).log();
   * ```
   */
  loadOpenStreetMap(
    source: string | {
      west: number;
      south: number;
      east: number;
      north: number;
    },
    options: {
      filters?: string | [string, string] | [string, string][];
      endpoint?: string;
      timeout?: number;
      cache?: boolean;
      ttl?: number;
      retries?: number;
      retryDelay?: number;
      verbose?: boolean;
    } = {},
  ): this {
    loadOpenStreetMap(this, source, options);
    return this;
  }

  /**
   * Creates a full-text search (FTS) index on a specified text column using DuckDB's [FTS extension](https://duckdb.org/docs/stable/core_extensions/full_text_search).
   *
   * If an FTS index already exists on the table, this method will skip creation and log a message (when verbose is enabled), unless the `overwrite` option is set to `true`.
   * The index definition is recorded in {@link indexes}. The {@link bm25}
   * method requires an FTS index and creates one automatically when needed.
   * DuckDB FTS indexes do not update automatically when the table changes; use
   * `overwrite: true` to rebuild the index after modifying the table.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param idColumn - The column containing the document identifiers.
   * @param textColumn - The column containing the text to search.
   * @param options - An optional object with configuration options:
   * @param options.stemmer - The stemmer to use for the FTS index. Supports multiple languages or "none" to disable stemming. Defaults to "porter".
   * @param options.stopwords - The table containing the stopwords to use for the FTS index. Supports multiple languages or "none" to disable stopwords. Defaults to "english".
   * @param options.ignore - The regular expression of patterns to be ignored. Defaults to "(\\.|[^a-z])+".
   * @param options.stripAccents - A boolean indicating whether to remove accents. Defaults to true.
   * @param options.lower - A boolean indicating whether to convert all text to lowercase. Defaults to true.
   * @param options.overwrite - A boolean indicating whether to overwrite the existing FTS index. Defaults to false.
   * @param options.verbose - If `true`, logs FTS index creation status. Defaults to `false`.
   * @returns The table, so methods can be chained.
   * @category Text Search
   *
   * @example
   * ```ts
   * // Load a dataset and create an FTS index for later searches
   * await table
   *   .loadData("recipes.parquet")
   *   .createFtsIndex("Dish", "Recipe").log();
   * ```
   *
   * @example
   * ```ts
   * // Create an index with a specific language stemmer
   * await table.createFtsIndex("Dish", "Recipe", {
   *   stemmer: "french",
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Recreate an existing index with different settings
   * await table.createFtsIndex("Dish", "Recipe", {
   *   stemmer: "english",
   *   overwrite: true,
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Create index with verbose logging
   * await table.createFtsIndex("Dish", "Recipe", {
   *   verbose: true,
   * }).log();
   * // Logs: 'Creating FTS index on "Recipe" column...'
   * // Logs: "FTS index created successfully."
   * ```
   */
  createFtsIndex(
    idColumn: string,
    textColumn: string,
    options: {
      stemmer?:
        | "arabic"
        | "basque"
        | "catalan"
        | "danish"
        | "dutch"
        | "english"
        | "finnish"
        | "french"
        | "german"
        | "greek"
        | "hindi"
        | "hungarian"
        | "indonesian"
        | "irish"
        | "italian"
        | "lithuanian"
        | "nepali"
        | "norwegian"
        | "porter"
        | "portuguese"
        | "romanian"
        | "russian"
        | "serbian"
        | "spanish"
        | "swedish"
        | "tamil"
        | "turkish"
        | "none";
      stopwords?: string;
      ignore?: string;
      stripAccents?: boolean;
      lower?: boolean;
      overwrite?: boolean;
      verbose?: boolean;
    } = {},
  ): this {
    createFtsIndex(this, idColumn, textColumn, options);
    return this;
  }

  /**
   * Creates a vector similarity search (VSS) index on a specified column using DuckDB's [VSS extension](https://duckdb.org/docs/stable/extensions/vss).
   *
   * If a VSS index already exists on the table, this method will skip creation and log a message (when verbose is enabled), unless the `overwrite` option is set to `true`.
   * The index definition is recorded in {@link indexes}.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column containing vector embeddings (must be FLOAT array type).
   * @param options - An optional object with configuration options:
   * @param options.overwrite - If `true`, drops and recreates the index even if it already exists. Defaults to `false`.
   * @param options.verbose - If `true`, logs VSS index creation status. Defaults to `false`.
   * @param options.efConstruction - The number of candidate vertices to consider during index construction. Higher values result in more accurate indexes but increase build time. Defaults to 128.
   * @param options.efSearch - The number of candidate vertices to consider during search. Higher values result in more accurate searches but increase search time. Defaults to 64.
   * @param options.M - The maximum number of neighbors to keep for each vertex in the graph. Higher values result in more accurate indexes but increase build time and memory usage. Defaults to 16.
   * @returns The table, so methods can be chained.
   * @category Vector Search
   *
   * @example
   * ```ts
   * // Load data that already contains an embedding column
   * await table
   *   .loadData("data.csv")
   *   .createVssIndex("embedding_column").log();
   * ```
   *
   * @example
   * ```ts
   * // Recreate an existing index
   * await table.createVssIndex("embedding_column", {
   *   overwrite: true,
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Create index with verbose logging
   * await table.createVssIndex("embedding_column", {
   *   verbose: true,
   * }).log();
   * // Logs: 'Creating VSS index on "embedding_column" column...'
   * // Logs: "VSS index created successfully."
   * ```
   *
   * @example
   * ```ts
   * // Create index with custom HNSW parameters for higher accuracy
   * await table.createVssIndex("embedding_column", {
   *   efConstruction: 256,
   *   efSearch: 128,
   *   M: 32,
   * }).log();
   * ```
   */
  createVssIndex(
    column: string,
    options: {
      overwrite?: boolean;
      verbose?: boolean;
      efConstruction?: number;
      efSearch?: number;
      M?: number;
    } = {},
  ): this {
    createVssIndex(this, column, options);
    return this;
  }

  /**
   * Searches a text column using DuckDB's BM25 ranking function, which scores
   * matches using factors including term frequency and document length.
   *
   * This method creates the required index with DuckDB's [FTS extension](https://duckdb.org/docs/stable/core_extensions/full_text_search).
   * It reuses the table's existing FTS index unless `overwriteIndex` is `true`.
   * DuckDB FTS indexes do not update automatically when the source table
   * changes; use `overwriteIndex: true` to rebuild the index after modifying
   * the table.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param text - The search query text to match against the text column.
   * @param idColumn - The name of the column containing unique identifiers for each row.
   * @param textColumn - The name of the column containing the text to search.
   * @param count - The number of top-ranked results to return.
   * @param options - An optional object with configuration options:
   * @param options.outputTable - The name of a new table where the results will be stored. If not provided, the current table will be replaced with the search results.
   * @param options.verbose - If `true`, logs FTS index creation status. Defaults to `false`.
   * @param options.k - The BM25 k parameter controlling term frequency saturation. Defaults to 1.2.
   * @param options.b - The BM25 b parameter controlling document length normalization (0-1 range). Defaults to 0.75.
   * @param options.stemmer - The language stemmer to apply for word normalization. Supports multiple languages or "none" to disable stemming. Defaults to 'porter'.
   * @param options.stopwords - The table containing the stopwords to use for the FTS index. Supports multiple languages or "none" to disable stopwords. Defaults to "english".
   * @param options.ignore - The regular expression of patterns to be ignored. Defaults to "(\\.|[^a-z])+".
   * @param options.stripAccents - A boolean indicating whether to remove accents. Defaults to true.
   * @param options.lower - A boolean indicating whether to convert all text to lowercase. Defaults to true.
   * @param options.overwriteIndex - If `true`, drops and recreates the FTS index even if it already exists. Defaults to `false`.
   * @param options.conjunctive - If `true`, all terms in the query string must be present in order for a document to be retrieved. Defaults to `false`.
   * @param options.minScore - A threshold to filter out results with a BM25 score below this value.
   * @param options.scoreColumn - If provided, the BM25 score will be included in the output table under this column name.
   * @returns A table instance containing the search results, ordered by relevance (best matches first), so methods can be chained.
   * @category Text Search
   *
   * @example
   * ```ts
   * // Load a dataset of recipes
   * const dishes = await table
   *   .loadData("recipes.parquet")
   *   .bm25("italian food", "Dish", "Recipe", 5)
   *   .log();
   * // Logs the five most relevant dishes.
   * ```
   *
   * @example
   * ```ts
   * // Search with a specific language stemmer
   * await table.bm25("french food", "Dish", "Recipe", 5, {
   *   stemmer: "french",
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Recreate the index with different settings and perform search
   * await table.bm25("italian food", "Dish", "Recipe", 5, {
   *   stemmer: "english",
   *   overwriteIndex: true,
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Save results to a new table without modifying the original
   * const italianDishes = await table.bm25("italian food", "Dish", "Recipe", 5, {
   *   outputTable: "italian_results",
   * }).log();
   *
   * // Original table remains unchanged
   * const allDishes = await table.getValues("Dish");
   * console.log(allDishes.length); // 336 (all dishes)
   *
   * // New table contains only search results
   * const italianOnly = await italianDishes.getValues("Dish");
   * console.log(italianOnly.length); // 5 (top results)
   * ```
   *
   * @example
   * ```ts
   * // Multiple searches reuse the same index for better performance
   * // The first search creates the index
   * const italian = await table.bm25("italian food", "Dish", "Recipe", 5, {
   *   outputTable: "italian",
   * }).log();
   *
   * // The second search reuses the existing index, so it's faster
   * const french = await table.bm25("french food", "Dish", "Recipe", 5, {
   *   outputTable: "french",
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Filter results by a minimum BM25 score and include the score in the output
   * await table.bm25("spicy noodles", "Dish", "Recipe", 10, {
   *   minScore: 5.5,
   *   scoreColumn: "bm25_score",
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Use the conjunctive option to require all terms
   * await table.bm25("italian sauce", "Dish", "Recipe", 5, {
   *   conjunctive: true,
   * }).log();
   * ```
   */
  bm25(
    text: string,
    idColumn: string,
    textColumn: string,
    count: number,
    options: {
      outputTable?: string;
      verbose?: boolean;
      k?: number;
      b?: number;
      stemmer?:
        | "arabic"
        | "basque"
        | "catalan"
        | "danish"
        | "dutch"
        | "english"
        | "finnish"
        | "french"
        | "german"
        | "greek"
        | "hindi"
        | "hungarian"
        | "indonesian"
        | "irish"
        | "italian"
        | "lithuanian"
        | "nepali"
        | "norwegian"
        | "porter"
        | "portuguese"
        | "romanian"
        | "russian"
        | "serbian"
        | "spanish"
        | "swedish"
        | "tamil"
        | "turkish"
        | "none";
      stopwords?: string;
      ignore?: string;
      stripAccents?: boolean;
      lower?: boolean;
      overwriteIndex?: boolean;
      conjunctive?: boolean;
      minScore?: number;
      scoreColumn?: string;
    } = {},
  ): this {
    return bm25(
      this,
      text,
      idColumn,
      textColumn,
      count,
      options,
    ) as this;
  }

  /**
   * Inserts rows, provided as an array of JavaScript objects, into the table.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param rows - An array of objects, where each object represents a row to be inserted and its properties correspond to column names.
   * @returns The table, so methods can be chained.
   * @category Importing Data
   *
   * @example
   * ```ts
   * // Insert new rows into the table
   * const newRows = [
   *   { letter: "c", number: 3 },
   *   { letter: "d", number: 4 }
   * ];
   * await table.insertRows(newRows).log();
   * ```
   */
  insertRows(rows: { [key: string]: unknown }[]): this {
    insertRows(this, rows);
    return this;
  }

  /**
   * Inserts all rows from one or more other tables into this table. If tables do not have the same columns, an error will be thrown unless the `unifyColumns` option is set to `true`. This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param tables - The name(s) of the table(s) or SimpleTable instance(s) from which rows will be inserted.
   * @param options - An optional object with configuration options:
   * @param options.unifyColumns - A boolean indicating whether to unify the columns of the tables. If `true`, missing columns in a table will be filled with `NULL` values. Defaults to `false`.
   * @returns The table, so methods can be chained.
   * @category Importing Data
   *
   * @example
   * ```ts
   * // Insert all rows from 'tableB' into 'tableA'.
   * await tableA.insertTables("tableB").log();
   * ```
   *
   * @example
   * ```ts
   * // Insert all rows from 'tableB' and 'tableC' into 'tableA'.
   * await tableA.insertTables(["tableB", "tableC"]).log();
   * ```
   *
   * @example
   * ```ts
   * // Insert rows from multiple tables, unifying columns. Missing columns will be filled with NULL.
   * await tableA.insertTables(["tableB", "tableC"], { unifyColumns: true }).log();
   * ```
   */
  insertTables(
    tables: SimpleTable | SimpleTable[],
    options: { unifyColumns?: boolean } = {},
  ): this {
    insertTables(this, tables, options);
    return this;
  }

  /**
   * Fetches sample data from the simple-data-analysis-core GitHub repository.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param sample - The name of the sample to load.
   *
   * Tabular data:
   * - "fires": [firesCanada2023.csv](https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/geodata/files/firesCanada2023.csv)
   * - "recipes": [recipes.parquet](https://github.com/nshiab/simple-data-analysis-core/raw/refs/heads/main/test/data/files/recipes.parquet)
   * - "temperatures": [dailyTemperatures.csv](https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/data/files/dailyTemperatures.csv)
   * - "temperaturesCities": [cities.csv](https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/data/files/cities.csv)
   *
   * Geospatial data:
   * - "canada": [CanadianProvincesAndTerritories.json](https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/geodata/files/CanadianProvincesAndTerritories.json)
   * - "firesGeo": [firesCanada2023.geojson](https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/geodata/files/firesCanada2023.geojson)
   *
   * @category Importing Data
   *
   * @example
   * ```ts
   * // Load the fires sample data
   * await table.loadSample("fires").log();
   * ```
   */
  loadSample(
    sample:
      | "fires"
      | "recipes"
      | "temperatures"
      | "temperaturesCities"
      | "canada"
      | "firesGeo",
  ): this {
    return loadSample(this, sample) as this;
  }

  /**
   * Returns a new table with the same structure and data as this table. The data can be optionally filtered, limited to a specific number of rows, and offset.
   *
   * If `conditions`, `limit`, and `offset` are all used, they are applied in this order: `conditions` (WHERE clause) first, then `offset`, and finally `limit` (LIMIT).
   *
   * Note that cloning large tables can be a slow operation.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param nameOrOptions - Either a string specifying the name of the new table, or an optional object with configuration options. If not provided, a default name (e.g., "table1", "table2") will be generated.
   * @param nameOrOptions.name - The name of the new table to be created in the database. If not provided, a default name (e.g., "table1", "table2") will be generated.
   * @param nameOrOptions.conditions - A SQL `WHERE` clause condition to filter the data during cloning. Defaults to no condition (clones all rows).
   * @param nameOrOptions.columns - An array of column names to include in the cloned table. If not provided, all columns will be included.
   * @param nameOrOptions.limit - The number of rows to include in the cloned table. If provided, only the first X rows (potentially after filtering and offset) will be cloned.
   * @param nameOrOptions.offset - The number of rows to skip before starting to clone rows.
   * @returns A new table instance containing the cloned data, so methods can be chained.
   * @category Table Management
   *
   * @example
   * ```ts
   * // Clone tableA to a new table with a default generated name (e.g., "table1")
   * const tableB = await tableA.clone().log();
   * ```
   *
   * @example
   * ```ts
   * // Clone tableA to a new table named "my_cloned_table" using string parameter
   * const tableB = await tableA.clone("my_cloned_table").log();
   * ```
   *
   * @example
   * ```ts
   * // Clone tableA to a new table named "my_cloned_table" using options object
   * const tableB = await tableA.clone({ name: "my_cloned_table" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Clone tableA, including only rows where 'column1' is greater than 10
   * const tableB = await tableA.clone({ conditions: `column1 > 10` }).log();
   * ```
   *
   * @example
   * ```ts
   * // Clone tableA with only specific columns
   * const tableB = await tableA.clone({ columns: ["name", "age", "city"] }).log();
   * ```
   *
   * @example
   * ```ts
   * // Clone only the first 10 rows of tableA
   * const tableB = await tableA.clone({ limit: 10 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Clone 10 rows after skipping the first 5 rows
   * const tableB = await tableA.clone({ limit: 10, offset: 5 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Clone tableA to a specific table name with filtered data, specific columns, and limited rows
   * const tableB = await tableA.clone({
   *   name: "filtered_data",
   *   conditions: `status = 'active' AND created_date >= '2023-01-01'`,
   *   columns: ["name", "status", "created_date"],
   *   limit: 100
   * }).log();
   * ```
   */
  clone(
    nameOrOptions: string | {
      name?: string;
      conditions?: string;
      columns?: string | string[];
      limit?: number;
      offset?: number;
    } = {},
  ): this {
    return clone(this, nameOrOptions) as this;
  }

  /**
   * Clones an existing column in this table, creating a new column with identical values.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the original column to clone.
   * @param newColumn - The name of the new column to be created.
   * @returns The table, so methods can be chained.
   * @category Column Operations
   *
   * @example
   * ```ts
   * // Clone 'firstName' column as 'contactName'
   * await table.cloneColumn("firstName", "contactName").log();
   * ```
   */
  cloneColumn(column: string, newColumn: string): this {
    cloneColumn(this, column, newColumn);
    return this;
  }

  /**
   * Clones a column in the table and offsets its values by a specified number of rows.
   * This is useful for time-series analysis or comparing values across different time points.
   *
   * **Important:** The offset is applied based on the current row order in the table. For meaningful results, ensure your data is sorted appropriately (e.g., by date/time for time-series analysis) before calling this method.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the original column.
   * @param newColumn - The name of the new column to be created with offset values.
   * @param options - An optional object with configuration options:
   * @param options.offset - The number of rows to offset the values. A positive number shifts values downwards (later rows), a negative number shifts values upwards (earlier rows). Defaults to `1`.
   * @param options.by - A column name or an array of column names to partition by. The offset is applied independently within each group.
   * @returns The table, so methods can be chained.
   * @category Column Operations
   *
   * @example
   * ```ts
   * // Clone 'value' as 'previous_value', offsetting by 1 row (value of row N-1 goes to row N)
   * await table.cloneColumnWithOffset("value", "previous_value").log();
   * ```
   *
   * @example
   * ```ts
   * // Clone 'sales' as 'sales_2_days_ago', offsetting by 2 rows
   * await table.cloneColumnWithOffset("sales", "sales_2_days_ago", { offset: 2 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Clone 'temperature' as 'prev_temp_by_city', offsetting by 1 row within each 'city' category
   * await table.cloneColumnWithOffset("temperature", "prev_temp_by_city", {
   *   offset: 1,
   *   by: "city",
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Clone 'stock_price' as 'prev_price_by_stock_and_exchange', offsetting by 1 row within each 'stock_symbol' and 'exchange' category
   * await table.cloneColumnWithOffset("stock_price", "prev_price_by_stock_and_exchange", {
   *   offset: 1,
   *   by: ["stock_symbol", "exchange"],
   * }).log();
   * ```
   */
  cloneColumnWithOffset(
    column: string,
    newColumn: string,
    options: {
      offset?: number;
      by?: string | string[];
    } = {},
  ): this {
    cloneColumnWithOffset(this, column, newColumn, options);
    return this;
  }

  /**
   * Fills `NULL` values in specified columns. By default, each `NULL` is replaced with the last non-`NULL` value from the preceding row. When `interpolate` is `true`, `NULL` values are replaced using linear interpolation (or extrapolation at the ends). Pass `interpolateBy` with a real numeric or date column name to use it as the X-axis, so that interpolated values are proportional to the actual distances between X-axis values rather than treating every row as equidistant. When `interpolateBy` is set, `interpolate` is automatically assumed `true`.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - The column(s) for which to fill `NULL` values.
   * @param options - An optional object with configuration options:
   * @param options.by - A column name or an array of column names to partition by. The fill is applied independently within each group.
   * @param options.interpolate - If `true`, replaces `NULL` values with linearly interpolated values using DuckDB's `fill()` window function. When `interpolateBy` is not set, row positions are used as the X-axis, treating rows as equidistant. For `NULL` values at the ends, linear extrapolation is used. Both the column values and the X-axis values must support arithmetic. If `false` or omitted, the previous non-`NULL` value is used instead. Automatically assumed `true` when `interpolateBy` is set.
   * @param options.interpolateBy - A column name to use as the X-axis for interpolation instead of equidistant row positions. When provided, `interpolate` is automatically assumed `true`. Use this when rows are not evenly spaced (e.g., timestamps or non-uniform numeric indices) so that interpolated values are proportional to the actual distance between X-axis values.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Fill NULL values in 'column1' with the previous non-NULL value
   * await table.fill("column1").log();
   * ```
   *
   * @example
   * ```ts
   * // Fill NULL values in multiple columns
   * await table.fill(["columnA", "columnB"]).log();
   * ```
   *
   * @example
   * ```ts
   * // Fill NULL values in 'value' independently within each 'group'
   * await table.fill("value", { by: "group" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Fill NULL values in 'value' using linear interpolation
   * await table.fill("value", { interpolate: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Fill NULL values in 'value' using linear interpolation, independently within each 'group'
   * await table.fill("value", { by: "group", interpolate: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Fill NULL values in 'value' using linear interpolation proportional to 'x' distances
   * await table.fill("value", { interpolate: true, interpolateBy: "x" }).log();
   * ```
   *
   * @example
   * ```ts
   * // interpolateBy implies interpolate: true, so this is equivalent to the previous example
   * await table.fill("value", { interpolateBy: "x" }).log();
   * ```
   */
  fill(
    columns: string | string[],
    options: {
      by?: string | string[];
      interpolate?: boolean;
      interpolateBy?: string;
    } = {},
  ): this {
    fill(this, columns, options);
    return this;
  }

  /**
   * Sorts the rows of the table based on specified column(s) and order(s).
   * If no columns are specified, all columns are sorted from left to right in ascending order.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called. Order-preserving transformations queued after a sort retain that order. Operations such as joins, grouping, aggregation, and sampling do not guarantee input order; chain `sort()` after them when deterministic output order matters.
   *
   * @param order - An object mapping column names to their sorting order: `"asc"` for ascending or `"desc"` for descending. If `null`, all columns are sorted ascendingly.
   * @param options - An optional object with configuration options:
   * @param options.lang - An object mapping column names to language codes for collation (e.g., `{ column1: "fr" }`). See DuckDB Collations documentation for more details: https://duckdb.org/docs/sql/expressions/collations.
   * @returns The table, so methods can be chained.
   * @category Restructuring Data
   *
   * @example
   * ```ts
   * // Sort all columns from left to right in ascending order
   * await table.sort().log();
   * ```
   *
   * @example
   * ```ts
   * // Sort 'column1' in ascending order
   * await table.sort({ column1: "asc" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Sort 'column1' ascendingly, then 'column2' descendingly
   * await table.sort({ column1: "asc", column2: "desc" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Sort 'column1' considering French accents
   * await table.sort({ column1: "asc" }, { lang: { column1: "fr" } }).log();
   * ```
   */
  sort(
    order: { [key: string]: "asc" | "desc" } | null = null,
    options: {
      lang?: { [key: string]: string };
    } = {},
  ): this {
    sort(this, order, options);
    return this;
  }

  /**
   * Selects specific columns in the table, removing all others. This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - The name or an array of names of the columns to be selected.
   * @returns The table, so methods can be chained.
   * @category Selecting or Filtering Data
   *
   * @example
   * ```ts
   * // Select only the 'firstName' and 'lastName' columns, removing all other columns.
   * await table.selectColumns(["firstName", "lastName"]).log();
   * ```
   *
   * @example
   * ```ts
   * // Select only the 'productName' column.
   * await table.selectColumns("productName").log();
   * ```
   */
  selectColumns(columns: string | string[]): this {
    selectColumns(this, columns);
    return this;
  }

  /**
   * Skips the first `n` rows of the table, effectively removing them.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param count - The number of rows to skip from the beginning of the table.
   * @returns The table, so methods can be chained.
   * @category Selecting or Filtering Data
   *
   * @example
   * ```ts
   * // Skip the first 10 rows of the table
   * await table.skip(10).log();
   * ```
   */
  skip(count: number): this {
    skip(this, count);
    return this;
  }

  /**
   * Checks if a column with the specified name exists in the table.
   *
   * @param column - The name of the column to check.
   * @returns A promise that resolves to `true` if the column exists, `false` otherwise.
   * @category Column Operations
   *
   * @example
   * ```ts
   * // Check if the table has a column named "age"
   * const hasAgeColumn = await table.hasColumn("age");
   * console.log(hasAgeColumn); // Output: true or false
   * ```
   */
  async hasColumn(column: string): Promise<boolean> {
    const columns = await this.getColumns();
    return columns.includes(column);
  }

  /**
   * Selects random rows from the table, removing all others. You can optionally specify a seed to ensure repeatable sampling.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param count - The number of rows to select (e.g., `100`) or a percentage string (e.g., `"10%"`) specifying the sampling size.
   * @param options - An optional object with configuration options:
   * @param options.seed - A number specifying the seed for repeatable sampling. Using the same seed will always yield the same random rows. Defaults to a random seed.
   * @returns The table, so methods can be chained.
   * @category Selecting or Filtering Data
   *
   * @example
   * ```ts
   * // Select 100 random rows from the table
   * await table.sample(100).log();
   * ```
   *
   * @example
   * ```ts
   * // Select 10% of the rows randomly
   * await table.sample("10%").log();
   * ```
   *
   * @example
   * ```ts
   * // Select random rows with a specific seed for repeatable results
   * await table.sample("10%", { seed: 123 }).log();
   * ```
   */
  sample(
    count: number | string,
    options: {
      seed?: number;
    } = {},
  ): this {
    sample(this, count, options);
    return this;
  }

  /**
   * Selects a specified number of rows from this table. An offset can be applied to skip initial rows, and the results can be output to a new table.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param count - The number of rows to select.
   * @param options - An optional object with configuration options:
   * @param options.offset - The number of rows to skip from the beginning of the table before selecting. Defaults to `0`.
   * @param options.outputTable - If `true`, the selected rows will be stored in a new table with a generated name. If a string, it will be used as the name for the new table. If `false` or omitted, the current table will be modified. Defaults to `false`.
   * @returns A table instance containing the selected rows (either the current table or a new table), so methods can be chained.
   * @category Selecting or Filtering Data
   *
   * @example
   * ```ts
   * // Select the first 100 rows of the current table
   * await table.selectRows(100).log();
   * ```
   *
   * @example
   * ```ts
   * // Select 100 rows after skipping the first 50 rows
   * await table.selectRows(100, { offset: 50 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Select 50 rows and store them in a new table with a generated name
   * const newTable = await table.selectRows(50, { outputTable: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Select 75 rows and store them in a new table named "top_customers"
   * const topCustomersTable = await table.selectRows(75, { outputTable: "top_customers" }).log();
   * ```
   */
  selectRows(
    count: number | string,
    options: { offset?: number; outputTable?: string | boolean } = {},
  ): this {
    return selectRows(this, count, options) as this;
  }

  /**
   * Removes duplicate rows from this table, keeping only unique rows.
   * Note that the resulting data order might differ from the original.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param options - An optional object with configuration options:
   * @param options.on - A column name or an array of column names to consider when identifying duplicates. If specified, duplicates are determined based only on the values in these columns. If omitted, all columns are considered.
   * @returns The table, so methods can be chained.
   * @category Selecting or Filtering Data
   *
   * @example
   * ```ts
   * // Remove duplicate rows based on all columns
   * await table.removeDuplicates().log();
   * ```
   *
   * @example
   * ```ts
   * // Remove duplicate rows based only on the 'email' column
   * await table.removeDuplicates({ on: "email" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Remove duplicate rows based on 'firstName' and 'lastName' columns
   * await table.removeDuplicates({ on: ["firstName", "lastName"] }).log();
   * ```
   */
  removeDuplicates(
    options: {
      on?: string | string[];
    } = {},
  ): this {
    removeDuplicates(this, options);
    return this;
  }

  /**
   * Removes rows with missing values from this table.
   * By default, missing values include SQL `NULL`, as well as string representations like `"NULL"`, `"null"`, `"NaN"`, `"undefined"`, and empty strings `""`.
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param options - An optional object with configuration options:
   * @param options.columns - A string or an array of strings specifying the columns to consider for missing values. If omitted, all columns are considered.
   * @param options.missingValues - An array of values to be treated as missing values instead of the default ones. Defaults to `["undefined", "NaN", "null", "NULL", ""]`.
   * @param options.invert - A boolean indicating whether to invert the condition. If `true`, only rows containing missing values will be kept. Defaults to `false`.
   * @returns The table, so methods can be chained.
   * @category Selecting or Filtering Data
   *
   * @example
   * ```ts
   * // Remove rows with missing values in any column
   * await table.removeMissing().log();
   * ```
   *
   * @example
   * ```ts
   * // Remove rows with missing values only in 'firstName' or 'lastName' columns
   * await table.removeMissing({ columns: ["firstName", "lastName"] }).log();
   * ```
   *
   * @example
   * ```ts
   * // Keep only rows with missing values in any column
   * await table.removeMissing({ invert: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Remove rows where 'age' is missing or is equal to -1
   * await table.removeMissing({ columns: "age", missingValues: [-1] }).log();
   * ```
   */
  removeMissing(
    options: {
      columns?: string | string[];
      missingValues?: (string | number)[];
      invert?: boolean;
    } = {},
  ): this {
    removeMissing(this, options);
    return this;
  }

  /**
   * Trims specified characters from the beginning, end, or both sides of string values in the given columns. This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - The column name or an array of column names to trim.
   * @param options - An optional object with configuration options:
   * @param options.character - The string to trim. Defaults to whitespace characters.
   * @param options.side - The side to trim: `"left"` (removes from the beginning), `"right"` (removes from the end), or `"both"` (removes from both sides). Defaults to `"both"`.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Trim whitespace from 'column1'
   * await table.trim("column1").log();
   * ```
   *
   * @example
   * ```ts
   * // Trim leading and trailing asterisks from 'productCode'
   * await table.trim("productCode", { character: "*" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Right-trim whitespace from 'description' and 'notes' columns
   * await table.trim(["description", "notes"], { side: "right" }).log();
   * ```
   */
  trim(
    columns: string | string[],
    options: {
      character?: string;
      side?: "left" | "right" | "both";
    } = {},
  ): this {
    trim(this, columns, options);
    return this;
  }

  /**
   * Filters rows from this table based on SQL conditions. Note that it's often faster to use the `removeRows` method for simple removals.
   * You can also use JavaScript syntax for conditions (e.g., `&&`, `||`, `===`, `!==`).
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param conditions - The filtering conditions specified as a SQL `WHERE` clause (e.g., `"column1 > 10 AND column2 = 'value'"`).
   * @returns The table, so methods can be chained.
   * @category Selecting or Filtering Data
   *
   * @example
   * ```ts
   * // Keep only rows where the 'fruit' column is not 'apple'
   * await table.filter(`fruit != 'apple'`).log();
   * ```
   *
   * @example
   * ```ts
   * // Keep rows where 'price' is greater than 100 AND 'quantity' is greater than 0
   * await table.filter(`price > 100 && quantity > 0`).log(); // Using JS syntax
   * ```
   *
   * @example
   * ```ts
   * // Keep rows where 'category' is 'Electronics' OR 'Appliances'
   * await table.filter(`category === 'Electronics' || category === 'Appliances'`).log(); // Using JS syntax
   * ```
   *
   * @example
   * ```ts
   * // Keep rows where 'lastPurchaseDate' is on or after '2023-01-01'
   * await table.filter(`lastPurchaseDate >= '2023-01-01'`).log();
   * ```
   */
  filter(conditions: string): this {
    filter(this, conditions);
    return this;
  }

  /**
   * Keeps rows in this table that have specific values in specified columns, removing all other rows.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columnsAndValues - An object where keys are column names and values are the specific values (or an array of values) to keep in those columns. Use `null` to keep rows where a column is `NULL`.
   * @returns The table, so methods can be chained.
   * @category Selecting or Filtering Data
   *
   * @example
   * ```ts
   * // Keep only rows where 'job' is 'accountant' or 'developer', AND 'city' is 'Montreal'
   * await table.keepValues({ job: ["accountant", "developer"], city: "Montreal" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Keep only rows where 'status' is 'active'
   * await table.keepValues({ status: "active" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Keep only rows where 'status' is NULL
   * await table.keepValues({ status: null }).log();
   * ```
   */
  keepValues(
    columnsAndValues: { [key: string]: unknown },
  ): this {
    keepValues(this, columnsAndValues);
    return this;
  }

  /**
   * Removes rows from this table that have specific values in specified columns.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columnsAndValues - An object where keys are column names and values are the specific values (or an array of values) to remove from those columns. Use `null` to remove rows where a column is `NULL`; otherwise, `NULL` rows are retained.
   * @returns The table, so methods can be chained.
   * @category Selecting or Filtering Data
   *
   * @example
   * ```ts
   * // Remove rows where 'job' is 'accountant' or 'developer', AND 'city' is 'Montreal'
   * await table.removeValues({ job: ["accountant", "developer"], city: "Montreal" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Remove rows where 'status' is 'inactive'
   * await table.removeValues({ status: "inactive" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Remove rows where 'status' is NULL
   * await table.removeValues({ status: null }).log();
   * ```
   */
  removeValues(
    columnsAndValues: { [key: string]: unknown },
  ): this {
    removeValues(this, columnsAndValues);
    return this;
  }

  /**
   * Removes rows from this table based on SQL conditions. This method is similar to `filter()`, but removes rows instead of keeping them.
   * You can also use JavaScript syntax for conditions (e.g., `&&`, `||`, `===`, `!==`).
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param conditions - The filtering conditions specified as a SQL `WHERE` clause (e.g., `"fruit = 'apple'"`).
   * @returns The table, so methods can be chained.
   * @category Selecting or Filtering Data
   *
   * @example
   * ```ts
   * // Remove rows where the 'fruit' column is 'apple'
   * await table.removeRows(`fruit = 'apple'`).log();
   * ```
   *
   * @example
   * ```ts
   * // Remove rows where 'quantity' is less than 5
   * await table.removeRows(`quantity < 5`).log();
   * ```
   *
   * @example
   * ```ts
   * // Remove rows where 'price' is less than 100 AND 'quantity' is 0
   * await table.removeRows(`price < 100 && quantity === 0`).log(); // Using JS syntax
   * ```
   *
   * @example
   * ```ts
   * // Remove rows where 'category' is 'Electronics' OR 'Appliances'
   * await table.removeRows(`category === 'Electronics' || category === 'Appliances'`).log(); // Using JS syntax
   * ```
   */
  removeRows(conditions: string): this {
    removeRows(this, conditions);
    return this;
  }

  /**
   * Renames one or more columns in the table. Throws if a source column does
   * not exist, so a typo fails loudly instead of being silently ignored.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param names - An object mapping old column names to their new column names (e.g., `{ "oldName": "newName", "anotherOld": "anotherNew" }`).
   * @param options - Configuration options.
   * @param options.strict - Whether to verify the source columns exist before renaming. Defaults to `true`. Set to `false` to skip the check and its schema lookup when you know the columns exist and are renaming across many tables where the extra round-trip adds up.
   * @returns The table, so methods can be chained.
   * @category Column Operations
   *
   * @example
   * ```ts
   * // Rename "How old?" to "age" and "Man or woman?" to "sex"
   * await table.renameColumns({ "How old?": "age", "Man or woman?": "sex" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Rename a single column
   * await table.renameColumns({ "product_id": "productId" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Skip the existence check when renaming across many tables
   * await table.renameColumns({ "product_id": "productId" }, { strict: false }).log();
   * ```
   */
  renameColumns(
    names: { [key: string]: string },
    options: { strict?: boolean } = {},
  ): this {
    renameColumns(this, names, options);
    return this;
  }

  /**
   * Cleans column names by removing non-alphanumeric characters and formatting them to camel case.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @returns The table, so methods can be chained.
   * @category Column Operations
   *
   * @example
   * ```ts
   * // Clean all column names in the table
   * // e.g., "First Name" becomes "firstName", "Product ID" becomes "productId"
   * await table.cleanColumnNames().log();
   * ```
   */
  cleanColumnNames(): this {
    queueOp(this, {
      kind: "fusable",
      method: "cleanColumnNames()",
      parameters: {},
      // The schema provides the column names to clean.
      needsSchema: true,
      buildSelect: (input, schema) =>
        `SELECT * RENAME (${
          Object.keys(schema)
            .map((col) =>
              `${quoteIdentifier(col)} AS ${quoteIdentifier(camelCase(col))}`
            )
            .join(", ")
        }) FROM ${input}`,
    });
    return this;
  }

  /**
   * Restructures this table by stacking (unpivoting) columns. This is useful for tidying up data from a wide format to a long format.
   *
   * For example, given a table showing employee counts per department per year:
   *
   * | Department | 2021 | 2022 | 2023 |
   * | :--------- | :--- | :--- | :--- |
   * | Accounting | 10   | 9    | 15   |
   * | Sales      | 52   | 75   | 98   |
   *
   * We can restructure it by putting all year columns into a new column named `Year` and their corresponding employee counts into a new column named `Employees`.
   *
   * @example
   * ```ts
   * // Restructure the table by stacking year columns into 'year' and 'employees'
   * await table.longer(["2021", "2022", "2023"], "year", "employees").log();
   * ```
   *
   * The table will then look like this:
   *
   * | Department | Year | Employees |
   * | :--------- | :--- | :-------- |
   * | Accounting | 2021 | 10        |
   * | Accounting | 2022 | 9         |
   * | Accounting | 2023 | 15        |
   * | Sales      | 2021 | 52        |
   * | Sales      | 2022 | 75        |
   * | Sales      | 2023 | 98        |
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - An array of strings representing the names of the columns to be stacked (unpivoted).
   * @param namesTo - The name of the new column that will contain the original column names (e.g., "Year").
   * @param valuesTo - The name of the new column that will contain the values from the stacked columns (e.g., "Employees").
   * @returns The table, so methods can be chained.
   * @category Restructuring Data
   */
  longer(
    columns: string[],
    namesTo: string,
    valuesTo: string,
  ): this {
    longer(this, columns, namesTo, valuesTo);
    return this;
  }

  /**
   * Restructures this table by unstacking (pivoting) values, transforming data from a long format to a wide format.
   *
   * For example, given a table showing employee counts per department per year:
   *
   * | Department | Year | Employees |
   * | :--------- | :--- | :-------- |
   * | Accounting | 2021 | 10        |
   * | Accounting | 2022 | 9         |
   * | Accounting | 2023 | 15        |
   * | Sales      | 2021 | 52        |
   * | Sales      | 2022 | 75        |
   * | Sales      | 2023 | 98        |
   *
   * We can restructure it by creating new columns for each year, with the associated employee counts as values.
   *
   * @example
   * ```ts
   * // Restructure the table by pivoting 'Year' into new columns with 'Employees' as values
   * await table.wider("Year", "Employees").log();
   * ```
   *
   * The table will then look like this:
   *
   * | Department | 2021 | 2022 | 2023 |
   * | :--------- | :--- | :--- | :--- |
   * | Accounting | 10   | 9    | 15   |
   * | Sales      | 52   | 75   | 98   |
   *
   * When multiple rows share the same `namesFrom`/grouping combination, their `valuesFrom` values are combined with the `options.stat` function (`"sum"` by default).
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param namesFrom - The name of the column containing the values that will be transformed into new column headers (e.g., "Year").
   * @param valuesFrom - The name of the column containing the values to be spread across the new columns (e.g., "Employees").
   * @param options - An optional object with configuration options:
   * @param options.stat - The stat function applied when multiple rows share the same `namesFrom`/grouping combination: `"sum"`, `"count"`, `"min"`, `"max"`, `"mean"`, `"median"`, or `"first"`. Defaults to `"sum"`.
   * @returns The table, so methods can be chained.
   * @category Restructuring Data
   */
  wider(
    namesFrom: string,
    valuesFrom: string,
    options: {
      stat?:
        | "sum"
        | "count"
        | "min"
        | "max"
        | "mean"
        | "median"
        | "first";
    } = {},
  ): this {
    wider(this, namesFrom, valuesFrom, options);
    return this;
  }

  /**
   * Converts data types of specified columns to target types (JavaScript or SQL types).
   *
   * When converting non-standard timestamp, date, or time strings, provide a `datetimeFormat` option using [DuckDB's format specifiers](https://duckdb.org/docs/sql/functions/dateformat).
   * Strings converted to `datetimeTz` or `timestamp with time zone` use an
   * explicit `Z` or numeric offset when present; strings without an offset are
   * interpreted as UTC. Returned `TIMESTAMP WITH TIME ZONE` values are rendered
   * as UTC strings.
   *
   * When converting timestamps, dates, or times to/from numbers, the numerical representation will be in milliseconds since the Unix epoch (1970-01-01 00:00:00 UTC).
   *
   * When converting strings to numbers, commas (often used as thousand separators) will be automatically removed before conversion.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called. If a column doesn't exist, the error is thrown at that point too.
   *
   * @param types - An object mapping column names to their target data types for conversion.
   * @param options - An optional object with configuration options:
   * @param options.strict - If `false`, values that cannot be converted will be replaced by `NULL` instead of throwing an error. Defaults to `true`.
   * @param options.datetimeFormat - A string specifying the format for date and time conversions. Uses `strftime` and `strptime` functions from DuckDB. For format specifiers, see [DuckDB's documentation](https://duckdb.org/docs/sql/functions/dateformat).
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Convert 'column1' to string and 'column2' to integer (JavaScript types)
   * await table.convert({ column1: "string", column2: "integer" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Convert 'column1' to VARCHAR and 'column2' to BIGINT (SQL types)
   * await table.convert({ column1: "varchar", column2: "bigint" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Convert strings in 'column3' to datetime using a specific format
   * await table.convert({ column3: "datetime" }, { datetimeFormat: "%Y-%m-%d" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Both values identify instants and are rendered in UTC.
   * await table
   *   .loadArray([
   *     { observedAt: "2024-04-07T13:00:00-04:00" },
   *     { observedAt: "2024-04-07T17:00:00Z" },
   *   ])
   *   .convert({ observedAt: "datetimeTz" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Convert datetime values in 'column3' to strings using a specific format
   * await table.convert({ column3: "string" }, { datetimeFormat: "%Y-%m-%d %H:%M:%S" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Convert 'amount' to float, replacing unconvertible values with NULL
   * await table.convert({ amount: "float" }, { strict: false }).log();
   * ```
   */
  convert(
    types: {
      [key: string]:
        | "integer"
        | "float"
        | "number"
        | "string"
        | "date"
        | "time"
        | "datetime"
        | "datetimeTz"
        | "bigint"
        | "double"
        | "varchar"
        | "timestamp"
        | "timestamp with time zone"
        | "boolean";
    },
    options: {
      strict?: boolean;
      datetimeFormat?: string;
    } = {},
  ): this {
    convert(this, types, options);
    return this;
  }

  /**
   * Removes the table from the database. After this operation, invoking methods on this SimpleTable instance will result in an error.
   *
   * @returns A promise that resolves after the table is removed.
   * @category Table Management
   *
   * @example
   * ```ts
   * // Remove the current table from the database
   * await table.removeTable();
   * ```
   */
  async removeTable(): Promise<this> {
    await removeTable(this);
    return this;
  }

  /**
   * Removes one or more columns from this table. This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - The name or an array of names of the columns to be removed.
   * @returns The table, so methods can be chained.
   * @category Column Operations
   *
   * @example
   * ```ts
   * // Remove 'column1' and 'column2' from the table
   * await table.removeColumns(["column1", "column2"]).log();
   * ```
   *
   * @example
   * ```ts
   * // Remove a single column named 'tempColumn'
   * await table.removeColumns("tempColumn").log();
   * ```
   */
  removeColumns(columns: string | string[]): this {
    removeColumns(this, columns);
    return this;
  }

  /**
   * Adds a new column to the table based on a specified data type (JavaScript or SQL types) and a SQL definition. This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param newColumn - The name of the new column to be added.
   * @param type - The data type for the new column. Can be a JavaScript type (e.g., `"number"`, `"string"`) or a SQL type (e.g., `"integer"`, `"varchar"`).
   * @param definition - A SQL expression defining how the values for the new column should be computed (e.g., `"column1 + column2"`, `"ST_Centroid(geom_column)"`).
   * @returns The table, so methods can be chained.
   * @category Column Operations
   *
   * @example
   * ```ts
   * // Add a new column 'total' as a float, calculated from 'column1' and 'column2'
   * await table.addColumn("total", "float", "column1 + column2").log();
   * ```
   *
   * @example
   * ```ts
   * // Add a new geometry column 'centroid' using the centroid of an existing 'country' geometry column
   * await table.addColumn("centroid", "geometry('EPSG:4326')", `ST_Centroid("country")`).log();
   * ```
   */
  addColumn(
    newColumn: string,
    type:
      | "integer"
      | "float"
      | "number"
      | "string"
      | "date"
      | "time"
      | "datetime"
      | "datetimeTz"
      | "bigint"
      | "double"
      | "varchar"
      | "timestamp"
      | "timestamp with time zone"
      | "boolean"
      | `geometry('${string}')`
      | `GEOMETRY('${string}')`,
    definition: string,
  ): this {
    addColumn(this, newColumn, type, definition);
    return this;
  }

  /**
   * Extracts one or more components from a temporal column into new columns.
   * Pass a single part to create a column with that part's name, or pass an
   * object mapping custom new-column names to parts. Existing columns are not
   * overwritten.
   *
   * `dayOfWeek` uses Sunday as `0` through Saturday as `6`. `week` follows
   * ISO week numbering, and `dayOfYear` starts at `1`. DuckDB `DATE`, `TIME`,
   * `TIMESTAMP`, and `TIMESTAMP WITH TIME ZONE` columns are supported when the
   * requested component applies to that type: date parts apply to dates and
   * timestamps, while time parts apply to times and timestamps. `NULL` input
   * values produce `NULL` extracted values. Parts extracted from
   * `TIMESTAMP WITH TIME ZONE` values use UTC.
   *
   * This method queues the operation; it runs when an async observer method
   * (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The temporal column from which to extract components.
   * @param parts - A part to extract using its name as the new column, or an object mapping each custom new-column name to the part it should contain.
   * @returns The table, so methods can be chained.
   * @category Column Operations
   *
   * @example
   * ```ts
   * // Add a column named 'year' from the 'publishedAt' timestamp
   * await table.extractDatePart("publishedAt", "year").log();
   * ```
   *
   * @example
   * ```ts
   * // Extract multiple components with custom column names
   * await table.extractDatePart("publishedAt", {
   *   publicationYear: "year",
   *   publicationMonth: "month",
   * }).log();
   * ```
   */
  extractDatePart(
    column: string,
    parts:
      | "year"
      | "quarter"
      | "month"
      | "week"
      | "day"
      | "dayOfWeek"
      | "dayOfYear"
      | "hour"
      | "minute"
      | "second"
      | {
        [newColumn: string]:
          | "year"
          | "quarter"
          | "month"
          | "week"
          | "day"
          | "dayOfWeek"
          | "dayOfYear"
          | "hour"
          | "minute"
          | "second";
      },
  ): this {
    extractDatePart(this, column, parts);
    return this;
  }

  /**
   * Adds a new column to the table containing the row number, starting at 0 (like an index).
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param newColumn - The name of the new column that will store the row number.
   * @param options - An optional object with configuration options:
   * @param options.by - A column name or an array of column names to partition by. The row number restarts at 0 within each group.
   * @returns The table, so methods can be chained.
   * @category Column Operations
   *
   * @example
   * ```ts
   * // Add a new column named 'rowNumber' with the row number for each row
   * await table.addRowNumber("rowNumber").log();
   * ```
   *
   * @example
   * ```ts
   * // Add a new column named 'rowNumber' with the row number for each 'category'
   * await table.addRowNumber("rowNumber", { by: "category" }).log();
   * ```
   */
  addRowNumber(
    newColumn: string,
    options: { by?: string | string[] } = {},
  ): this {
    addRowNumber(this, newColumn, options);
    return this;
  }

  /**
   * Performs a cross join operation with another table. A cross join returns the Cartesian product of the rows from both tables, meaning all possible pairs of rows will be in the resulting table.
   * This means that if the left table has `n` rows and the right table has `m` rows, the result will have `n * m` rows.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param rightTable - The SimpleTable instance to cross join with.
   * @param options - An optional object with configuration options:
   * @param options.outputTable - If `true`, the results will be stored in a new table with a generated name. If a string, it will be used as the name for the new table. If `false` or omitted, the current table will be overwritten. Defaults to `false`.
   * @returns A table instance containing the cross-joined data (either the current table or a new table), so methods can be chained.
   * @category Table Operations
   *
   * @example
   * ```ts
   * // Perform a cross join with 'tableB', overwriting the current table (tableA)
   * await tableA.crossJoin(tableB).log();
   * ```
   *
   * @example
   * ```ts
   * // Perform a cross join with 'tableB' and store the results in a new table with a generated name
   * const tableC = await tableA.crossJoin(tableB, { outputTable: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Perform a cross join with 'tableB' and store the results in a new table named 'tableC'
   * const tableC = await tableA.crossJoin(tableB, { outputTable: "tableC" }).log();
   * ```
   */
  crossJoin(
    rightTable: SimpleTable,
    options: {
      outputTable?: string | boolean;
    } = {},
  ): this {
    return crossJoin(this, rightTable, options) as this;
  }

  /**
   * Merges the data of this table (considered the left table) with another table (the right table) based on a common column or multiple columns.
   * Note that the order of rows in the returned data is not guaranteed to be the same as in the original tables.
   * This operation might create temporary files in a `.tmp` folder; consider adding `.tmp` to your `.gitignore`.
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called. The join uses the other table's state as of this call: operations queued on it afterwards run after the join.
   *
   * @param rightTable - The SimpleTable instance to be joined with this table.
   * @param options - An optional object with configuration options:
   * @param options.on - The column(s) to join on. If omitted, the method automatically searches for a column name that exists in both tables. Can be a single string or an array of strings for multiple join keys.
   * @param options.type - The type of join operation to perform. Possible values are `"inner"`, `"left"` (default), `"right"`, or `"full"`.
   * @param options.outputTable - If `true`, the results will be stored in a new table with a generated name. If a string, it will be used as the name for the new table. If `false` or omitted, the current table will be overwritten. Defaults to `false`.
   * @returns A table instance containing the joined data (either the current table or a new table), so methods can be chained.
   * @category Table Operations
   *
   * @example
   * ```ts
   * // Perform a left join with 'tableB' on a common column (auto-detected), overwriting tableA
   * await tableA.join(tableB).log();
   * ```
   *
   * @example
   * ```ts
   * // Perform an inner join with 'tableB' on the 'id' column, storing results in a new table named 'tableC'
   * const tableC = await tableA.join(tableB, { on: "id", type: 'inner', outputTable: "tableC" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Perform a join on multiple columns ('name' and 'category')
   * await tableA.join(tableB, { on: ["name", "category"] }).log();
   * ```
   */

  join(
    rightTable: SimpleTable,
    options: {
      on?: string | string[];
      type?: "inner" | "left" | "right" | "full";
      outputTable?: string | boolean;
    } = {},
  ): this {
    options = {
      ...options,
      on: Array.isArray(options.on) ? [...options.on] : options.on,
    };
    if (options.outputTable === true) {
      options.outputTable = `table${this.sdb.tableIncrement}`;
      this.sdb.tableIncrement += 1;
    }
    return join(this, rightTable, options) as this;
  }

  /**
   * Performs a fuzzy left join between this table (considered the left table) and another table
   * (the right table) based on string similarity between two text columns. Uses the
   * [rapidfuzz](https://query.farm/duckdb_extension_rapidfuzz) DuckDB community extension.
   *
   * If a similarity score column is added to the results, the rows will be ordered alphabetically by the left column, and then by descending similarity score within each group of identical left column values. Otherwise, the rows will be order alphabetically by the left column and then by the right column.
   *
   * This operation might create temporary files in a `.tmp` folder; consider adding `.tmp` to your `.gitignore`.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called. The join uses the other table's state as of this call: operations queued on it afterwards run after the join.
   *
   * @param rightTable - The SimpleTable instance to be joined with this table.
   * @param leftColumn - The name of the column in this (left) table containing the text to compare.
   * @param rightColumn - The name of the column in the right table containing the text to compare.
   * @param threshold - The minimum similarity score (0–100) required for two rows to be joined. For `method: "ratio"`, a length-based pre-filter is automatically applied based on the threshold to improve performance without losing accuracy.
   * @param options - An optional object with configuration options:
   * @param options.method - The rapidfuzz similarity algorithm to use. Defaults to `"ratio"`.
   *   - `"ratio"`: Overall similarity (Levenshtein-based).
   *   - `"partial_ratio"`: Best partial/substring similarity.
   *   - `"token_sort_ratio"`: Similarity after sorting tokens (words), useful for reordered words.
   *   - `"token_set_ratio"`: Similarity based on sets of tokens, ignoring duplicates and word order.
   * @param options.similarityColumn - If provided, a column with this name is added to the result containing the similarity score (0–100). If omitted, the score is not included in the output.
   * @param options.outputTable - If `true`, the results will be stored in a new table with a generated name. If a string, it will be used as the name for the new table. If `false` or omitted, the current table will be overwritten. Defaults to `false`.
   * @param options.prefilterPrefixLength - An optional prefix length. Only strings sharing the same first N characters are compared. Note that prefix filtering is lossy (e.g. "John" vs. "Phon" will not match despite high similarity).
   * @returns A table instance containing the fuzzy-joined data (either the current table or a new table), so methods can be chained.
   * @category Table Operations
   *
   * @example
   * ```ts
   * // Fuzzy left join tableA with tableB on 'name' (left) and 'standardName' (right) with a threshold of 80
   * // A length-based pre-filter is automatically applied.
   * await tableA.fuzzyJoin(tableB, "name", "standardName", 80).log();
   * ```
   *
   * @example
   * ```ts
   * // Fuzzy join with a prefix-based pre-filter and a threshold of 80
   * await tableA.fuzzyJoin(tableB, "name", "standardName", 80, {
   *   prefilterPrefixLength: 3, // Must share the same first 3 characters
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Fuzzy join with a custom threshold and method, storing results in a new table
   * const tableC = await tableA.fuzzyJoin(tableB, "name", "standardName", 90, {
   *   method: "token_sort_ratio",
   *   outputTable: "tableC",
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Fuzzy join with a custom similarity column name and a threshold of 80
   * await tableA.fuzzyJoin(tableB, "name", "standardName", 80, {
   *   similarityColumn: "matchScore",
   * }).log();
   * ```
   */
  fuzzyJoin(
    rightTable: SimpleTable,
    leftColumn: string,
    rightColumn: string,
    threshold: number,
    options: {
      method?:
        | "ratio"
        | "partial_ratio"
        | "token_sort_ratio"
        | "token_set_ratio";
      similarityColumn?: string;
      outputTable?: string | boolean;
      prefilterPrefixLength?: number;
    } = {},
  ): this {
    options = { ...options };
    if (options.outputTable === true) {
      options.outputTable = `table${this.sdb.tableIncrement}`;
      this.sdb.tableIncrement += 1;
    }
    return fuzzyJoin(
      this,
      rightTable,
      leftColumn,
      rightColumn,
      threshold,
      options,
    ) as this;
  }

  /**
   * Normalizes string values in a column by detecting fuzzy duplicates and replacing them with a single canonical value.
   *
   * Similar strings are grouped into clusters. Matching is transitive: if `"New York"` is similar to `"New Yorke"` and
   * `"New Yorke"` is similar to `"New Yorkk"`, all three land in the same cluster even if `"New York"` and `"New Yorkk"`
   * would not match directly. Each cluster is then collapsed to one representative value based on the `strategy` option.
   *
   * Similarity is computed using the [rapidfuzz](https://query.farm/duckdb_extension_rapidfuzz) DuckDB community extension,
   * which is installed and loaded automatically.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column containing the strings to normalize.
   * @param newColumn - The name of the column to write the normalized values to. Use the same name as `column` to normalize in-place.
   * @param threshold - The minimum similarity score (0–100) for two strings to be considered duplicates. For `method: "ratio"`, a length-based pre-filter is automatically applied based on the threshold to improve performance without losing accuracy.
   * @param options - An optional object with configuration options:
   * @param options.method - The rapidfuzz similarity algorithm to use. Defaults to `"ratio"`.
   *   - `"ratio"`: Overall similarity.
   *   - `"partial_ratio"`: Best partial/substring similarity.
   *   - `"token_sort_ratio"`: Similarity after sorting tokens (words), useful for reordered words.
   *   - `"token_set_ratio"`: Similarity based on sets of tokens, ignoring duplicates and word order.
   * @param options.strategy - The strategy for choosing the canonical value within each cluster of similar strings. Defaults to `"mostCommon"`.
   *   - `"mostCommon"`: Keep the value that appears most frequently in the original column.
   *   - `"longestString"`: Keep the longest string in the cluster.
   *   - `"shortestString"`: Keep the shortest string in the cluster.
   *   - `"mostCentral"`: Keep the string with the highest total similarity score to all other cluster members (the most "central" string).
   *   - `"maxScore"`: Keep the string that participates in the single highest-scoring pairwise match within the cluster.
   * @param options.prefilterPrefixLength - An optional prefix length. Only strings sharing the same first N characters are compared. Note that prefix filtering is lossy (e.g. "John" vs. "Phon" will not match despite high similarity).
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Normalize 'city' into a new 'cityClean' column, keeping the most common string per cluster with a threshold of 80
   * // A length-based pre-filter is automatically applied.
   * await table.fuzzyClean("city", "cityClean", 80).log();
   * ```
   *
   * @example
   * ```ts
   * // Normalize with a prefix-based pre-filter and a threshold of 80
   * await table.fuzzyClean("city", "cityClean", 80, {
   *   prefilterPrefixLength: 5, // Must share the same first 5 characters
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Normalize 'companyName' into a new column using token_sort_ratio and a threshold of 90
   * await table.fuzzyClean("companyName", "companyNameClean", 90, { method: "token_sort_ratio" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Normalize 'category' in-place, keeping the longest string in each cluster and a threshold of 80
   * await table.fuzzyClean("category", "category", 80, { strategy: "longestString" }).log();
   * ```
   */
  fuzzyClean(
    column: string,
    newColumn: string,
    threshold: number,
    options: {
      method?:
        | "ratio"
        | "partial_ratio"
        | "token_sort_ratio"
        | "token_set_ratio";
      strategy?:
        | "mostCommon"
        | "longestString"
        | "shortestString"
        | "mostCentral"
        | "maxScore";
      prefilterPrefixLength?: number;
    } = {},
  ): this {
    fuzzyClean(this, column, newColumn, threshold, options);
    return this;
  }

  /**
   * Replaces specified strings in the selected columns.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - The column name, an array of column names, or `"all"` to apply the replacement to every column in the table.
   * @param replacements - An object mapping old strings to new strings (e.g., `{ "oldValue": "newValue" }`).
   * @param options - An optional object with configuration options:
   * @param options.entireString - A boolean indicating whether the entire cell content must match the `oldString` for replacement to occur. Defaults to `false` (replaces substrings).
   * @param options.regex - A boolean indicating whether the `oldString` should be treated as a regular expression for global replacement. Cannot be used with `entireString: true`. Defaults to `false`.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Replace all occurrences of "kilograms" with "kg" in 'column1'
   * await table.replace("column1", { "kilograms": "kg" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Replace "kilograms" with "kg" and "liters" with "l" in 'column1' and 'column2'
   * await table.replace(["column1", "column2"], { "kilograms": "kg", "liters": "l" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Replace only if the entire string in 'column1' is "kilograms"
   * await table.replace("column1", { "kilograms": "kg" }, { entireString: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Replace any sequence of one or more digits with a hyphen in 'column1' using regex
   * await table.replace("column1", { "\d+": "-" }, { regex: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Replace "%" with "" in all columns
   * await table.replace("all", { "%": "" }).log();
   * ```
   */
  replace(
    columns: "all" | string | string[],
    replacements: { [key: string]: string },
    options: {
      entireString?: boolean;
      regex?: boolean;
    } = {},
  ): this {
    replace(this, columns, replacements, options);
    return this;
  }

  /**
   * Converts string values in the specified columns to lowercase. This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - The column name or an array of column names to be converted to lowercase.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Convert strings in 'column1' to lowercase
   * await table.lower("column1").log();
   * ```
   *
   * @example
   * ```ts
   * // Convert strings in 'column1' and 'column2' to lowercase
   * await table.lower(["column1", "column2"]).log();
   * ```
   */
  lower(columns: string | string[]): this {
    lower(this, columns);
    return this;
  }

  /**
   * Converts string values in the specified columns to uppercase. This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - The column name or an array of column names to be converted to uppercase.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Convert strings in 'column1' to uppercase
   * await table.upper("column1").log();
   * ```
   *
   * @example
   * ```ts
   * // Convert strings in 'column1' and 'column2' to uppercase
   * await table.upper(["column1", "column2"]).log();
   * ```
   */
  upper(columns: string | string[]): this {
    upper(this, columns);
    return this;
  }

  /**
   * Capitalizes the first letter of each string in the specified columns and converts the rest of the string to lowercase. This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - The column name or an array of column names to be capitalized.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Capitalize strings in 'column1' (e.g., "hello world" becomes "Hello world")
   * await table.capitalize("column1").log();
   * ```
   *
   * @example
   * ```ts
   * // Capitalize strings in 'column1' and 'column2'
   * await table.capitalize(["column1", "column2"]).log();
   * ```
   */
  capitalize(columns: string | string[]): this {
    capitalize(this, columns);
    return this;
  }

  /**
   * Truncates string values in a specified column to a maximum number of characters.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The column name containing strings to be truncated.
   * @param length - The maximum number of characters to keep.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Truncate strings in 'description' column to 50 characters
   * await table.truncate("description", 50).log();
   * ```
   *
   * @example
   * ```ts
   * // Truncate strings in 'name' column to 10 characters
   * await table.truncate("name", 10).log();
   * ```
   */
  truncate(column: string, length: number): this {
    truncate(this, column, length);
    return this;
  }

  /**
   * Pads the strings in the specified columns to a target length.
   *
   * The columns must contain string (VARCHAR) values. An error is thrown if any
   * column is of a different type. `null` values remain `null`. If any string
   * already exceeds the target length, an error is thrown (no silent truncation).
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - The column name(s) containing strings to be padded.
   * @param length - The target length of the padded strings.
   * @param options - An optional object with configuration options:
   * @param options.side - Which side to pad. `'left'` (default) or `'right'`.
   * @param options.character - The character to use for padding. Defaults to `'0'`.
   * @returns The table, so methods can be chained.
   * @throws {Error} If any column is not of string (VARCHAR) type.
   * @throws {Error} If any string value exceeds the target length.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Left-pad 'id' column to 3 characters with zeros (default)
   * await table.pad("id", 3).log();
   * // Result: '1' -> '001', '23' -> '023', null -> null
   * ```
   *
   * @example
   * ```ts
   * // Right-pad 'code' column to 5 characters with spaces
   * await table.pad("code", 5, { side: "right", character: " " }).log();
   * // Result: '123' -> '123  ', '45' -> '45   ', null -> null
   * ```
   *
   * @example
   * ```ts
   * // Left-pad multiple columns to 5 characters with dashes
   * await table.pad(["id", "code"], 5, { side: "left", character: "-" }).log();
   * // Result: '1' -> '----1', '23' -> '---23'
   * ```
   */
  pad(
    columns: string | string[],
    length: number,
    options: { side?: "left" | "right"; character?: string } = {},
  ): this {
    pad(this, columns, length, options);
    return this;
  }

  /**
   * Splits strings in a specified column by a separator and extracts a substring at a given index, storing the result in a new or existing column.
   * If the index is out of bounds, an empty string will be returned for that row.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column containing the strings to be split.
   * @param separator - The substring to use as a delimiter for splitting the strings.
   * @param index - The zero-based index of the substring to extract after splitting. For example, `0` for the first part, `1` for the second, etc.
   * @param newColumn - The name of the column where the extracted substrings will be stored. To overwrite the original column, use the same name as `column`.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Split 'address' by comma and extract the second part (index 1) into a new 'city' column
   * // e.g., "123 Main St, Anytown, USA" -> "Anytown"
   * await table.splitExtract("address", ",", 1, "city").log();
   * ```
   *
   * @example
   * ```ts
   * // Split 'filename' by dot and extract the first part (index 0), overwriting 'filename'
   * // e.g., "document.pdf" -> "document"
   * await table.splitExtract("filename", ".", 0, "filename").log();
   * ```
   */
  splitExtract(
    column: string,
    separator: string,
    index: number,
    newColumn: string,
  ): this {
    splitExtract(this, column, separator, index, newColumn);
    return this;
  }

  /**
   * Splits strings in a specified column by a separator and spreads the resulting parts into multiple new columns.
   *
   * Each part of the split string will be stored in a separate column. The number of columns created is determined by the length of the `newColumns` array.
   * If a row has fewer parts than the number of new columns, a warning will be logged and the extra columns will contain empty strings (unless `strict` is set to `false`).
   * If a row has more parts than the number of new columns, an error will be thrown unless `strict` is set to `false`.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column containing the strings to be split.
   * @param separator - The substring to use as a delimiter for splitting the strings.
   * @param newColumns - An array of column names for the extracted parts.
   * @param options - Optional configuration.
   * @param options.strict - If `false`, skips all validation checks (both max and min parts). Defaults to `true`.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Split 'fullName' by comma and spread into 'lastName' and 'firstName'
   * // e.g., "Shiab, Nael" -> lastName: "Shiab", firstName: "Nael"
   * await table.splitSpread("fullName", ",", ["lastName", "firstName"]).log();
   * ```
   *
   * @example
   * ```ts
   * // Split 'address' by comma and spread into three columns
   * // e.g., "123 Main St, Anytown, USA" -> street: "123 Main St", city: "Anytown", country: "USA"
   * await table.splitSpread("address", ",", ["street", "city", "country"]).log();
   * ```
   *
   * @example
   * ```ts
   * // Skip validation for performance
   * await table.splitSpread("data", "|", ["col1", "col2"], { strict: false }).log();
   * ```
   */
  splitSpread(
    column: string,
    separator: string,
    newColumns: string[],
    options: {
      strict?: boolean;
    } = {},
  ): this {
    splitSpread(this, column, separator, newColumns, options);
    return this;
  }

  /**
   * Extracts a specific number of characters from the beginning (left side) of string values in the specified column.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column containing the strings to be modified.
   * @param count - The number of characters to extract from the left side of each string.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Replace strings in 'productCode' with their first two characters
   * // e.g., "ABC-123" becomes "AB"
   * await table.firstChars("productCode", 2).log();
   * ```
   */
  firstChars(column: string, count: number): this {
    firstChars(this, column, count);
    return this;
  }

  /**
   * Extracts a specific number of characters from the end (right side) of string values in the specified column.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column containing the strings to be modified.
   * @param count - The number of characters to extract from the right side of each string.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Replace strings in 'productCode' with their last two characters
   * // e.g., "ABC-123" becomes "23"
   * await table.lastChars("productCode", 2).log();
   * ```
   */
  lastChars(column: string, count: number): this {
    lastChars(this, column, count);
    return this;
  }

  /**
   * Replaces `NULL` values in the specified columns with a given value.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - The column name, an array of column names, or `"all"` to apply the replacement to every column in the table.
   * @param value - The value to replace `NULL` occurrences with.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Replace NULL values in 'column1' with 0
   * await table.replaceNulls("column1", 0).log();
   * ```
   *
   * @example
   * ```ts
   * // Replace NULL values in 'columnA' and 'columnB' with the string "N/A"
   * await table.replaceNulls(["columnA", "columnB"], "N/A").log();
   * ```
   *
   * @example
   * ```ts
   * // Replace NULL values in 'dateColumn' with a specific date
   * await table.replaceNulls("dateColumn", new Date("2023-01-01")).log();
   * ```
   *
   * @example
   * ```ts
   * // Replace NULL values in all columns with 0
   * await table.replaceNulls("all", 0).log();
   * ```
   */
  replaceNulls(
    columns: "all" | string | string[],
    value: unknown,
  ): this {
    replaceNulls(this, columns, value);
    return this;
  }

  /**
   * Concatenates values from specified columns into a new column.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - An array of column names whose values will be concatenated.
   * @param newColumn - The name of the new column to store the concatenated values.
   * @param options - An optional object with configuration options:
   * @param options.separator - The string used to separate concatenated values. Defaults to an empty string (`""`).
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Concatenate 'firstName' and 'lastName' into a new 'fullName' column
   * await table.concatenate(["firstName", "lastName"], "fullName").log();
   * ```
   *
   * @example
   * ```ts
   * // Concatenate 'city' and 'country' into 'location', separated by a comma and space
   * await table.concatenate(["city", "country"], "location", { separator: ", " }).log();
   * ```
   */
  concatenate(
    columns: string[],
    newColumn: string,
    options: {
      separator?: string;
    } = {},
  ): this {
    concatenate(this, columns, newColumn, options);
    return this;
  }

  /**
   * Concatenates values from multiple columns into a new column with labeled rows.
   *
   * This method creates a new column where each value is a concatenation of the specified columns,
   * with each column value prefixed by its column name and a colon, followed by a newline.
   * Column entries are separated by double newlines ("\n\n").
   *
   * All values must be string, otherwise an error will be thrown. Use the `convert()` method first to convert non-string columns to string.
   *
   * If a column value is `NULL`, it will be replaced by `'Unknown'` in the concatenated result.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - An array of column names whose values will be concatenated with labels.
   * @param newColumn - The name of the new column to create with the concatenated values.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Concatenate multiple string columns into a labeled text field
   * await table.rowToText(
   *   ["summary", "findings", "context", "date", "quote"],
   *   "fullText"
   * ).log();
   * // Result in "fullText" will look like:
   * // summary:
   * // [value]
   * //
   * // findings:
   * // [value]
   * //
   * // context:
   * // [value]
   * //
   * // date:
   * // [value]
   * //
   * // quote:
   * // [value]
   * ```
   *
   * @example
   * ```ts
   * // Convert numeric columns to strings first, then concatenate
   * // NULL values will appear as 'Unknown'
   * await table
   *   .convert({ age: "string", salary: "string" })
   *   .rowToText(["name", "age", "salary"], "profile").log();
   * ```
   */
  rowToText(
    columns: string[],
    newColumn: string,
  ): this {
    rowToText(this, columns, newColumn);
    return this;
  }

  /**
   * Unnests (expands) rows by splitting a column's string values into multiple rows based on a separator.
   *
   * Each value in the specified column is split using the provided separator, and a new row is created for each resulting substring. All other column values are duplicated across the newly created rows.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column containing string values to be split and unnested.
   * @param separator - The delimiter string used to split the column values.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Unnest 'tags' column separated by commas
   * // Before: [{ id: 1, tags: "red,blue,green" }]
   * // After:  [{ id: 1, tags: "red" }, { id: 1, tags: "blue" }, { id: 1, tags: "green" }]
   * await table.unnest("tags", ",").log();
   * ```
   *
   * @example
   * ```ts
   * // Unnest 'neighborhoods' column separated by " / "
   * // Before: [{ city: "Montreal", neighborhoods: "Old Montreal / Chinatown / Griffintown" }]
   * // After:  [{ city: "Montreal", neighborhoods: "Old Montreal" },
   * //         { city: "Montreal", neighborhoods: "Chinatown" },
   * //         { city: "Montreal", neighborhoods: "Griffintown" }]
   * await table.unnest("neighborhoods", " / ").log();
   * ```
   */
  unnest(column: string, separator: string): this {
    unnest(this, column, separator);
    return this;
  }

  /**
   * Repeats rows based on the values in a column.
   *
   * If a row has a value of 3 in the specified column, it will be repeated 3 times. If the value is 0 or negative, the row will be removed.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column containing the number of times each row should be repeated.
   * @param options - An optional object with configuration options:
   * @param options.index - The name of a new column to store the index of the repeated row (starting at 0).
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Before: [{ id: 1, count: 2, category: "A" }, { id: 2, count: 3, category: "B" }]
   * await table.repeatRows("count").log();
   * // After:  [{ id: 1, count: 2, category: "A" }, { id: 1, count: 2, category: "A" },
   * //          { id: 2, count: 3, category: "B" }, { id: 2, count: 3, category: "B" }, { id: 2, count: 3, category: "B" }]
   * ```
   *
   * @example
   * ```ts
   * // With an index column
   * await table.repeatRows("count", { index: "copyId" }).log();
   * // After:  [{ id: 1, count: 2, category: "A", copyId: 0 }, { id: 1, count: 2, category: "A", copyId: 1 },
   * //          { id: 2, count: 3, category: "B", copyId: 0 }, { id: 2, count: 3, category: "B", copyId: 1 }, { id: 2, count: 3, category: "B", copyId: 2 }]
   * ```
   */
  repeatRows(
    column: string,
    options: { index?: string } = {},
  ): this {
    repeatRows(this, column, options);
    return this;
  }

  /**
   * Nests (collapses) rows by aggregating a column's values into a single string per group, separated by a delimiter.
   *
   * This is the inverse operation of `unnest()`. Multiple rows are combined into fewer rows by grouping on specified category columns and concatenating the target column values with a separator.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column whose values will be aggregated and concatenated.
   * @param separator - The delimiter string used to join the column values.
   * @param by - The column name or an array of column names to group by.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Nest 'neighborhoods' column separated by " / " for each city
   * // Before: [{ city: "Montreal", neighborhoods: "Old Montreal" },
   * //         { city: "Montreal", neighborhoods: "Chinatown" },
   * //         { city: "Montreal", neighborhoods: "Griffintown" }]
   * // After:  [{ city: "Montreal", neighborhoods: "Old Montreal / Chinatown / Griffintown" }]
   * await table.nest("neighborhoods", " / ", "city").log();
   * ```
   *
   * @example
   * ```ts
   * // Nest with multiple category columns
   * // Before: [{ country: "Canada", city: "Montreal", tags: "red" },
   * //         { country: "Canada", city: "Montreal", tags: "blue" }]
   * // After:  [{ country: "Canada", city: "Montreal", tags: "red,blue" }]
   * await table.nest("tags", ",", ["country", "city"]).log();
   * ```
   */
  nest(
    column: string,
    separator: string,
    by: string | string[],
  ): this {
    nest(this, column, separator, by);
    return this;
  }

  /**
   * Rounds numeric values in specified columns.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - The column name or an array of column names containing numeric values to be rounded.
   * @param options - An optional integer specifying the number of decimal places, or an object with configuration options:
   * @param options.decimals - The number of decimal places to round to. Defaults to `0` (rounds to the nearest integer).
   * @param options.method - The rounding method to use: `"round"` (rounds to the nearest integer, with halves rounding up), `"ceiling"` (rounds up to the nearest integer), or `"floor"` (rounds down to the nearest integer). Defaults to `"round"`.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Round 'column1' values to the nearest integer
   * await table.round("column1").log();
   * ```
   *
   * @example
   * ```ts
   * // Round 'column1' values to 2 decimal places
   * await table.round("column1", { decimals: 2 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Round 'column1' values down to the nearest integer (floor)
   * await table.round("column1", { method: "floor" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Round 'columnA' and 'columnB' values to 1 decimal place using ceiling method
   * await table.round(["columnA", "columnB"], { decimals: 1, method: "ceiling" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Round 'column1' values to 2 decimal places using the shorthand
   * await table.round("column1", 2).log();
   * ```
   */
  round(
    columns: string | string[],
    options:
      | number
      | {
        decimals?: number;
        method?: "round" | "ceiling" | "floor";
      } = {},
  ): this {
    round(this, columns, options);
    return this;
  }

  /**
   * Updates values in a specified column using a SQL expression.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column to be updated.
   * @param definition - The SQL expression used to set the new values in the column (e.g., `"column1 * 2"`, `"UPPER(column_name)"`).
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Update 'column1' with the left 5 characters of 'column2'
   * await table.updateColumn("column1", `LEFT(column2, 5)`).log();
   * ```
   *
   * @example
   * ```ts
   * // Double the values in 'price' column
   * await table.updateColumn("price", `price * 2`).log();
   * ```
   *
   * @example
   * ```ts
   * // Set 'status' to 'active' where 'isActive' is true
   * await table.updateColumn("status", `CASE WHEN isActive THEN 'active' ELSE 'inactive' END`).log();
   * ```
   */
  updateColumn(column: string, definition: string): this {
    updateColumn(this, column, definition);
    return this;
  }

  /**
   * Assigns ranks to rows in a new column based on the values of a specified column.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The column containing the values to be used for ranking.
   * @param newColumn - The name of the new column where the ranks will be stored.
   * @param options - An optional object with configuration options:
   * @param options.order - The order of values for ranking: `"asc"` for ascending (default) or `"desc"` for descending.
   * @param options.by - The column name or an array of column names to rank by. Ranks are assigned independently within each group.
   * @param options.dense - A boolean indicating whether to use dense ranking (no gaps). If `true`, ranks will be consecutive integers (e.g., 1, 2, 2, 3). If `false` (default), ranks might have gaps (e.g., 1, 2, 2, 4).
   * @returns The table, so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Compute ranks in a new 'rank' column based on 'score' values (ascending)
   * await table.ranks("score", "rank").log();
   * ```
   *
   * @example
   * ```ts
   * // Compute ranks in a new 'descRank' column based on 'score' values (descending)
   * await table.ranks("score", "descRank", { order: "desc" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute ranks by 'department', based on 'salary' values, without gaps
   * await table.ranks("salary", "salaryRank", { by: "department", dense: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute ranks by both 'department' and 'city'
   * await table.ranks("sales", "salesRank", { by: ["department", "city"] }).log();
   * ```
   */
  ranks(
    column: string,
    newColumn: string,
    options: {
      order?: "asc" | "desc";
      by?: string | string[];
      dense?: boolean;
    } = {},
  ): this {
    ranks(this, column, newColumn, options);
    return this;
  }

  /**
   * Assigns quantiles to rows in a new column based on specified column values.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The column containing values from which quantiles will be assigned.
   * @param count - The number of quantiles to divide the data into (e.g., `4` for quartiles, `10` for deciles).
   * @param newColumn - The name of the new column where the assigned quantiles will be stored.
   * @param options - An optional object with configuration options:
   * @param options.by - The column name or an array of column names to partition by. Quantiles are assigned independently within each group.
   * @returns The table, so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Assigns a quantile from 1 to 10 for each row in a new 'quantiles' column, based on 'column1' values.
   * await table.quantiles("column1", 10, "quantiles").log();
   * ```
   *
   * @example
   * ```ts
   * // Assign quantiles by 'column2', based on 'column1' values.
   * await table.quantiles("column1", 10, "quantiles", { by: "column2" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Assigns quartiles (4 quantiles) to 'sales' data, storing results in 'salesQuartile'
   * await table.quantiles("sales", 4, "salesQuartile").log();
   * ```
   */
  quantiles(
    column: string,
    count: number,
    newColumn: string,
    options: {
      by?: string | string[];
    } = {},
  ): this {
    quantiles(this, column, count, newColumn, options);
    return this;
  }

  /**
   * Assigns bins for specified column values based on an interval size.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The column containing values from which bins will be computed.
   * @param interval - The interval size for binning the values.
   * @param newColumn - The name of the new column where the bins will be stored.
   * @param options - An optional object with configuration options:
   * @param options.startValue - The starting value for binning. Defaults to the minimum value in the specified column.
   * @returns The table, so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Assigns a bin for each row in a new 'bins' column based on 'column1' values, with an interval of 10.
   * // If the minimum value in 'column1' is 5, the bins will follow this pattern: "[5-14]", "[15-24]", etc.
   * await table.bins("column1", 10, "bins").log();
   * ```
   *
   * @example
   * ```ts
   * // Assigns bins starting at a specific value (0) with an interval of 10.
   * // The bins will follow this pattern: "[0-9]", "[10-19]", "[20-29]", etc.
   * await table.bins("column1", 10, "bins", { startValue: 0 }).log();
   * ```
   */
  bins(
    column: string,
    interval: number,
    newColumn: string,
    options: {
      startValue?: number;
    } = {},
  ): this {
    bins(this, column, interval, newColumn, options);
    return this;
  }

  /**
   * Computes proportions horizontally across specified columns for each row.
   *
   * For example, given a table showing counts of men, women, and non-binary individuals per year:
   *
   * | Year | Men | Women | NonBinary |
   * | :--- | :-- | :---- | :-------- |
   * | 2021 | 564 | 685   | 145       |
   * | 2022 | 354 | 278   | 56        |
   * | 2023 | 856 | 321   | 221       |
   *
   * This method computes the proportion of men, women, and non-binary individuals on each row, adding new columns for these proportions.
   *
   * @example
   * ```ts
   * // Compute horizontal proportions for 'Men', 'Women', and 'NonBinary' columns, rounded to 2 decimal places
   * await table.rowProportions(["Men", "Women", "NonBinary"], { decimals: 2 }).log();
   * ```
   *
   * The table will then look like this:
   *
   * | Year | Men | Women | NonBinary | MenPerc | WomenPerc | NonBinaryPerc |
   * | :--- | :-- | :---- | :-------- | :------ | :-------- | :------------ |
   * | 2021 | 564 | 685   | 145       | 0.4     | 0.49      | 0.10          |
   * | 2022 | 354 | 278   | 56        | 0.51    | 0.4       | 0.08          |
   * | 2023 | 856 | 321   | 221       | 0.61    | 0.23      | 0.16          |
   *
   * By default, the new columns will be named with a suffix of `"Perc"`. You can customize this suffix using the `suffix` option.
   *
   * @example
   * ```ts
   * // Compute horizontal proportions with a custom suffix "Prop"
   * await table.rowProportions(["Men", "Women", "NonBinary"], { suffix: "Prop", decimals: 2 }).log();
   * ```
   *
   * The table will then look like this:
   *
   * | Year | Men | Women | NonBinary | MenProp | WomenProp | NonBinaryProp |
   * | :--- | :-- | :---- | :-------- | :------ | :-------- | :------------ |
   * | 2021 | 564 | 685   | 145       | 0.4     | 0.49      | 0.10          |
   * | 2022 | 354 | 278   | 56        | 0.51    | 0.4       | 0.08          |
   * | 2023 | 856 | 321   | 221       | 0.61    | 0.23      | 0.16          |
   *
   * @example
   * ```ts
   * // Compute percentages that sum to 100 on each row before rounding
   * await table.rowProportions(["Men", "Women", "NonBinary"], { base: 100, decimals: 1 }).log();
   * ```
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - An array of column names for which proportions will be computed on each row.
   * @param options - An optional object with configuration options:
   * @param options.suffix - A string suffix to append to the names of the new columns storing the computed proportions. Defaults to `"Perc"`.
   * @param options.base - A finite positive value that the proportions in each row sum to before rounding. Defaults to `1`.
   * @param options.decimals - The number of decimal places to round the computed proportions. Defaults to `undefined` (no rounding).
   * @returns The table, so methods can be chained.
   * @category Analyzing Data
   */
  rowProportions(
    columns: string[],
    options: {
      suffix?: string;
      base?: number;
      decimals?: number;
    } = {},
  ): this {
    rowProportions(this, columns, options);
    return this;
  }

  /**
   * Selects a ranked numeric value within each row and adds its source column
   * name, its value, or both as new columns.
   *
   * Values are ranked from highest to lowest by default. Null values are
   * ignored. By default, a tie at the requested rank throws an error. Set
   * `options.ties` to `"first"` to select the first tied column in the supplied
   * order, or to `"all"` to produce one row for each tied column. The `"all"`
   * option can therefore increase the table's row count. If null values leave
   * a row without the requested rank, the new columns contain null.
   *
   * This method queues the operation; it runs when an async observer method
   * (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - The numeric columns to rank within each row.
   * @param options - The output columns and ranking configuration. At least one of `nameColumn` or `valueColumn` is required.
   * @param options.nameColumn - The name of a new column containing the selected source column's name.
   * @param options.valueColumn - The name of a new column containing the selected source column's value.
   * @param options.rank - The one-based rank to select. Must not exceed the number of supplied columns. Defaults to `1`.
   * @param options.order - The ranking order: `"desc"` ranks the highest value first and `"asc"` ranks the lowest value first. Defaults to `"desc"`.
   * @param options.ties - How to handle a tie at the requested rank: `"strict"` throws, `"first"` selects the first supplied column, and `"all"` produces one row per tied column. Defaults to `"strict"`.
   * @returns The table, so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Add the name and value of the highest-scoring party on each row.
   * await table.rowRanks(["CAQ", "PLQ", "PQ"], {
   *   nameColumn: "winner",
   *   valueColumn: "winningVotes",
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Add only the second-lowest value on each row.
   * await table.rowRanks(["CAQ", "PLQ", "PQ"], {
   *   valueColumn: "secondLowestVotes",
   *   rank: 2,
   *   order: "asc",
   * }).log();
   * ```
   */
  rowRanks(
    columns: string[],
    options:
      & (
        | {
          /**
           * The name of a new column containing the selected source column's name.
           *
           * @example
           * ```ts
           * { nameColumn: "winner" }
           * ```
           */
          nameColumn: string;
          /**
           * The name of a new column containing the selected source column's value.
           *
           * @example
           * ```ts
           * { valueColumn: "winningVotes" }
           * ```
           */
          valueColumn?: string;
        }
        | {
          /**
           * The name of a new column containing the selected source column's name.
           *
           * @example
           * ```ts
           * { nameColumn: "winner" }
           * ```
           */
          nameColumn?: string;
          /**
           * The name of a new column containing the selected source column's value.
           *
           * @example
           * ```ts
           * { valueColumn: "winningVotes" }
           * ```
           */
          valueColumn: string;
        }
      )
      & {
        /**
         * The one-based rank to select. Must not exceed the number of supplied
         * columns. Defaults to `1`.
         *
         * @example
         * ```ts
         * { rank: 2 }
         * ```
         */
        rank?: number;
        /**
         * The ranking order. Defaults to `"desc"`.
         *
         * @example
         * ```ts
         * { order: "asc" }
         * ```
         */
        order?: "asc" | "desc";
        /**
         * How to handle a tie at the requested rank. Defaults to `"strict"`.
         *
         * @example
         * ```ts
         * { ties: "all" }
         * ```
         */
        ties?: "strict" | "first" | "all";
      },
  ): this {
    rowRanks(this, columns, options);
    return this;
  }

  /**
   * Computes proportions vertically over a column's values, relative to the sum of all values in that column or group.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The column containing values for which proportions will be computed. The proportions are calculated based on the sum of values in the specified column.
   * @param newColumn - The name of the new column where the proportions will be stored.
   * @param options - An optional object with configuration options:
   * @param options.by - The column name or an array of column names to partition by. Proportions are calculated independently within each group.
   * @param options.base - A finite positive value that the proportions in the column or each group sum to before rounding. Defaults to `1`.
   * @param options.decimals - The number of decimal places to round the computed proportions. Defaults to `undefined` (no rounding).
   * @returns The table, so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Add a new column 'perc' with each 'column1' value divided by the sum of all 'column1' values
   * await table.columnProportions("column1", "perc").log();
   * ```
   *
   * @example
   * ```ts
   * // Compute proportions for 'column1' by 'column2', rounded to two decimal places
   * await table.columnProportions("column1", "perc", { by: "column2", decimals: 2 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute percentages that sum to 100 before rounding
   * await table.columnProportions("sales", "sales_percentage", { base: 100, decimals: 1 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute proportions for 'sales' by 'region' and 'product_type'
   * await table.columnProportions("sales", "sales_proportion", { by: ["region", "product_type"] }).log();
   * ```
   */
  columnProportions(
    column: string,
    newColumn: string,
    options: {
      by?: string | string[];
      base?: number;
      decimals?: number;
    } = {},
  ): this {
    columnProportions(this, column, newColumn, options);
    return this;
  }

  /**
   * Creates a summary table from selected columns, optionally grouped by other columns.
   * This method allows you to aggregate data, calculate statistics (e.g., count, mean, sum), and group results by categorical columns.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param options - An object with configuration options for summarization:
   * @param options.columns - The column name or an array of column names to summarize. If omitted, only the row count is returned.
   * @param options.by - The column name or an array of column names to group by.
   * @param options.stats - The statistics to compute. Can be a single statistic (e.g., `"mean"`), an array (e.g., `["min", "max"]`), or an object mapping output column names to statistics (e.g., `{ avgSalary: "mean" }`). Supported statistics are `"count"`, `"countDistinct"`, `"countNull"`, `"min"`, `"max"`, `"mean"`, `"median"`, `"sum"`, `"skew"`, `"stdDev"`, and `"variance"`.
   * @param options.decimals - The number of decimal places to round the summarized columns. Defaults to `undefined` (no rounding).
   * @param options.outputTable - If `true`, the results will be stored in a new table with a generated name. If a string, it will be used as the name for the new table. If `false` or omitted, the current table will be overwritten. Defaults to `false`.
   * @param options.datesToMs - If `true`, timestamps, dates, and times will be converted to milliseconds before summarizing. This is useful when summarizing mixed data types (numbers and dates) as columns must be of the same type for aggregation.
   * @returns A table instance containing the summarized data (either the current table or a new table), so methods can be chained. When summarizing more than one column, a `column` column identifies which input column each row summarizes.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Summarize all columns with all available statistics, overwriting the current table
   * const columns = await table.getColumns();
   * await table.summarize({ columns }).log();
   * ```
   *
   * @example
   * ```ts
   * // Summarize all columns and store the results in a new table with a generated name
   * const columns = await table.getColumns();
   * const summaryTable = await table.summarize({ columns, outputTable: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Summarize all columns and store the results in a new table named 'mySummary'
   * const columns = await table.getColumns();
   * const mySummaryTable = await table.summarize({ columns, outputTable: "mySummary" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Summarize a single column ('sales') with all available statistics
   * await table.summarize({ columns: "sales" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Summarize multiple columns ('sales' and 'profit') with all available statistics
   * await table.summarize({ columns: ["sales", "profit"] }).log();
   * ```
   *
   * @example
   * ```ts
   * // Summarize 'sales' by 'region' (single category)
   * await table.summarize({ columns: "sales", by: "region" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Summarize 'sales' by 'region' and 'product_type'
   * await table.summarize({ columns: "sales", by: ["region", "product_type"] }).log();
   * ```
   *
   * @example
   * ```ts
   * // Summarize 'sales' by 'region' with a specific statistic (mean)
   * await table.summarize({ columns: "sales", by: "region", stats: "mean" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Summarize 'sales' by 'region' with specific statistics (mean and sum)
   * await table.summarize({ columns: "sales", by: "region", stats: ["mean", "sum"] }).log();
   * ```
   *
   * @example
   * ```ts
   * // Summarize 'sales' by 'region' with custom named statistics
   * await table.summarize({ columns: "sales", by: "region", stats: { averageSales: "mean", totalSales: "sum" } }).log();
   * ```
   *
   * @example
   * ```ts
   * // Summarize 'price' and 'cost', rounding aggregated columns to 2 decimal places
   * await table.summarize({ columns: ["price", "cost"], decimals: 2 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Summarize 'timestamp_column' by converting to milliseconds first
   * await table.summarize({ columns: "timestamp_column", datesToMs: true, stats: "mean" }).log();
   * ```
   */
  summarize(
    options: {
      columns?: string | string[];
      by?: string | string[];
      stats?:
        | (
          | "count"
          | "countDistinct"
          | "countNull"
          | "min"
          | "max"
          | "mean"
          | "median"
          | "sum"
          | "skew"
          | "stdDev"
          | "variance"
        )
        | (
          | "count"
          | "countDistinct"
          | "countNull"
          | "min"
          | "max"
          | "mean"
          | "median"
          | "sum"
          | "skew"
          | "stdDev"
          | "variance"
        )[]
        | {
          [key: string]:
            | "count"
            | "countDistinct"
            | "countNull"
            | "min"
            | "max"
            | "mean"
            | "median"
            | "sum"
            | "skew"
            | "stdDev"
            | "variance";
        };
      decimals?: number;
      outputTable?: string | boolean;
      datesToMs?: boolean;
    } = {},
  ): this {
    return summarize(this, options) as this;
  }

  /**
   * Adds one or more summary rows to the table. Each row is calculated from
   * the original rows before any summary rows are added. This is useful for
   * preparing totals and other statistics before exporting tabular data.
   *
   * Passing `"all"` selects every numeric column. Columns that are neither
   * summarized nor used for labels contain `NULL` in the added rows. A stat
   * string is also used as its row label; pass an object to customize that
   * label. If `options.stats` is omitted, every supported stat is added.
   *
   * This method queues the operation; it runs when an async observer method
   * (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param columns - The numeric column name, an array of numeric column names, or `"all"` to summarize every numeric column.
   * @param labelColumn - The existing string column in which stat row labels will be written.
   * @param options - An optional object with configuration options:
   * @param options.stats - A stat, stat configuration, or array of either. Supported stats are `"countDistinct"`, `"countNull"`, `"min"`, `"max"`, `"mean"`, `"median"`, `"sum"`, `"skew"`, `"stdDev"`, and `"variance"`. An object's `label` defaults to its `stat`. If omitted, all supported stats are added.
   * @param options.position - Whether to add the summary rows at the `"top"` or `"bottom"` of the table. Defaults to `"bottom"`.
   * @returns The table, so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Add a total row for every numeric column, labelled "sum" in "region".
   * await table.addSummaryRows("all", "region", { stats: "sum" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Add two summary rows with default labels.
   * await table.addSummaryRows(["sales", "expenses"], "region", {
   *   stats: ["sum", "mean"],
   *   position: "top",
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Customize the labels written to the label column.
   * await table.addSummaryRows("all", "region", {
   *   stats: [
   *     { stat: "sum", label: "Total" },
   *     { stat: "mean", label: "Average" },
   *   ],
   * }).log();
   * ```
   */
  addSummaryRows(
    columns: "all" | string | string[],
    labelColumn: string,
    options: {
      stats?:
        | "countDistinct"
        | "countNull"
        | "min"
        | "max"
        | "mean"
        | "median"
        | "sum"
        | "skew"
        | "stdDev"
        | "variance"
        | {
          stat:
            | "countDistinct"
            | "countNull"
            | "min"
            | "max"
            | "mean"
            | "median"
            | "sum"
            | "skew"
            | "stdDev"
            | "variance";
          label?: string;
        }
        | (
          | "countDistinct"
          | "countNull"
          | "min"
          | "max"
          | "mean"
          | "median"
          | "sum"
          | "skew"
          | "stdDev"
          | "variance"
          | {
            stat:
              | "countDistinct"
              | "countNull"
              | "min"
              | "max"
              | "mean"
              | "median"
              | "sum"
              | "skew"
              | "stdDev"
              | "variance";
            label?: string;
          }
        )[];
      position?: "top" | "bottom";
    } = {},
  ): this {
    addSummaryRows(this, columns, labelColumn, options);
    return this;
  }

  /**
   * Computes the cumulative sum of values in a column. For this method to work properly, ensure your data is sorted first.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column storing the values to be accumulated.
   * @param newColumn - The name of the new column in which the computed cumulative values will be stored.
   * @param options - An optional object with configuration options:
   * @param options.by - The column name or an array of column names to partition by. Accumulation is performed independently within each group.
   * @returns The table, so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Compute the cumulative sum of 'sales' in a new 'cumulativeSales' column
   * // Ensure the table is sorted by a relevant column (e.g., date) before calling this method.
   * await table.accumulate("sales", "cumulativeSales").log();
   * ```
   *
   * @example
   * ```ts
   * // Compute the cumulative sum of 'orders' by 'customer_id'
   * // Ensure the table is sorted by 'customer_id' and then by a relevant order column (e.g., order_date).
   * await table.accumulate("orders", "cumulativeOrders", { by: "customer_id" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute the cumulative sum of 'revenue' by 'region' and 'product_category'
   * await table.accumulate("revenue", "cumulativeRevenue", { by: ["region", "product_category"] }).log();
   * ```
   */
  accumulate(
    column: string,
    newColumn: string,
    options: {
      by?: string | string[];
    } = {},
  ): this {
    accumulate(this, column, newColumn, options);
    return this;
  }

  /**
   * Computes rolling aggregations (e.g., rolling average, min, max) over a specified column.
   * For rows without enough preceding or following rows to form a complete window, `NULL` will be returned.
   * For this method to work properly, ensure your data is sorted by the relevant column(s) first.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column storing the values to be aggregated.
   * @param newColumn - The name of the new column in which the computed rolling values will be stored.
   * @param stat - The aggregation function to apply: `"min"`, `"max"`, `"mean"`, `"median"`, or `"sum"`.
   * @param preceding - The number of preceding rows to include in the rolling window.
   * @param following - The number of following rows to include in the rolling window.
   * @param options - An optional object with configuration options:
   * @param options.by - The column name or an array of column names to partition by. Rolling statistics are computed independently within each group.
   * @param options.decimals - The number of decimal places to round the aggregated values. Defaults to `undefined` (no rounding).
   * @returns The table, so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Compute a 7-day rolling average of 'sales' with 3 preceding and 3 following rows
   * // (total window size of 7: 3 preceding + current + 3 following)
   * await table.rolling("sales", "rollingAvgSales", "mean", 3, 3).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute a rolling sum of 'transactions' by 'customer_id'
   * await table.rolling("transactions", "rollingSumTransactions", "sum", 5, 0, { by: "customer_id" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute a rolling maximum of 'temperature' rounded to 1 decimal place
   * await table.rolling("temperature", "rollingMaxTemp", "max", 2, 2, { decimals: 1 }).log();
   * ```
   */
  rolling(
    column: string,
    newColumn: string,
    stat: "min" | "max" | "mean" | "median" | "sum",
    preceding: number,
    following: number,
    options: {
      by?: string | string[];
      decimals?: number;
    } = {},
  ): this {
    rolling(
      this,
      column,
      newColumn,
      stat,
      preceding,
      following,
      options,
    );
    return this;
  }

  /**
   * Calculates correlations between columns. If no `x` and `y` columns are specified, the method computes the correlations for all numeric column combinations.
   * Note that correlation is symmetrical: the correlation of `x` with `y` is the same as `y` with `x`.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param options - An optional object with configuration options:
   * @param options.x - The name of the column for the x-values. If omitted, correlations will be computed for all numeric columns.
   * @param options.y - The name of the column for the y-values. It can be provided only when `options.x` is also set. If both are omitted, correlations will be computed for all numeric column pairs.
   * @param options.by - The column name or an array of column names to group by. Correlations are calculated independently within each group.
   * @param options.decimals - The number of decimal places to round the correlation values. Defaults to `undefined` (no rounding).
   * @param options.outputTable - If `true`, the results will be stored in a new table with a generated name. If a string, it will be used as the name for the new table. If `false` or omitted, the current table will be overwritten. Defaults to `false`.
   * @returns A table instance containing the correlation results (either the current table or a new table), so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Compute correlations between all numeric columns, overwriting the current table
   * await table.correlations().log();
   * ```
   *
   * @example
   * ```ts
   * // Compute correlations between 'column1' and all other numeric columns
   * await table.correlations({ x: "column1" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute the correlation between 'column1' and 'column2'
   * await table.correlations({ x: "column1", y: "column2" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute correlations within 'categoryColumn' and store results in a new table
   * const correlationTable = await table.correlations({ by: "categoryColumn", outputTable: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute correlations, rounded to 2 decimal places
   * await table.correlations({ decimals: 2 }).log();
   * ```
   */
  correlations(
    options: {
      x?: string;
      y?: string;
      by?: string | string[];
      decimals?: number;
      outputTable?: string | boolean;
    } = {},
  ): this {
    return correlations(this, options) as this;
  }

  /**
   * Performs linear regression analysis. The results include the slope, the y-intercept, and the R-squared value.
   * If no `x` and `y` columns are specified, the method computes linear regression analysis for all numeric column permutations.
   * Note that linear regression analysis is asymmetrical: the linear regression of `x` over `y` is not the same as `y` over `x`.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param options - An optional object with configuration options:
   * @param options.x - The name of the column for the independent variable (x-values). If omitted, linear regressions will be computed for all numeric columns as x.
   * @param options.y - The name of the column for the dependent variable (y-values). It can be provided only when `options.x` is also set. If both are omitted, linear regressions will be computed for all numeric column permutations.
   * @param options.by - The column name or an array of column names to group by. Linear regressions are calculated independently within each group.
   * @param options.decimals - The number of decimal places to round the regression values (slope, intercept, r-squared). Defaults to `undefined` (no rounding).
   * @param options.outputTable - If `true`, the results will be stored in a new table with a generated name. If a string, it will be used as the name for the new table. If `false` or omitted, the current table will be overwritten. Defaults to `false`.
   * @returns A table instance containing the linear regression results (either the current table or a new table), so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Compute all linear regressions between all numeric columns, overwriting the current table
   * await table.linearRegressions().log();
   * ```
   *
   * @example
   * ```ts
   * // Compute linear regressions with 'column1' as the independent variable and all other numeric columns as dependent variables
   * await table.linearRegressions({ x: "column1" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute the linear regression of 'sales' (y) over 'advertising' (x)
   * await table.linearRegressions({ x: "advertising", y: "sales" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute linear regressions by 'region' and store results in a new table
   * const regressionTable = await table.linearRegressions({ by: "region", outputTable: true }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute linear regressions, rounded to 3 decimal places
   * await table.linearRegressions({ decimals: 3 }).log();
   * ```
   */
  linearRegressions(
    options: {
      x?: string;
      y?: string;
      by?: string | string[];
      decimals?: number;
      outputTable?: string | boolean;
    } = {},
  ): this {
    return linearRegressions(this, options) as this;
  }

  /**
   * Identifies outliers in a specified column using the Interquartile Range (IQR) method.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column in which outliers will be identified.
   * @param newColumn - The name of the new column where the boolean results (`TRUE` for outlier, `FALSE` otherwise) will be stored.
   * @param options - An optional object with configuration options:
   * @param options.by - The column name or an array of column names to partition by. Outliers are detected independently within each group.
   * @returns The table, so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Look for outliers in the 'age' column and store results in a new 'isOutlier' column
   * await table.outliersIQR("age", "isOutlier").log();
   * ```
   *
   * @example
   * ```ts
   * // Look for outliers in 'salary' by 'gender'
   * await table.outliersIQR("salary", "salaryOutlier", { by: "gender" }).log();
   * ```
   */
  outliersIQR(
    column: string,
    newColumn: string,
    options: {
      by?: string | string[];
    } = {},
  ): this {
    outliersIQR(this, column, newColumn, options);
    return this;
  }

  /**
   * Computes the Z-score for values in a specified column.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column for which Z-scores will be calculated.
   * @param newColumn - The name of the new column where the computed Z-scores will be stored.
   * @param options - An optional object with configuration options:
   * @param options.by - The column name or an array of column names to partition by. Z-scores are calculated independently within each group.
   * @param options.decimals - The number of decimal places to round the Z-score values. Defaults to `undefined` (no rounding).
   * @returns The table, so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Calculate the Z-score for 'age' values and store results in a new 'ageZScore' column
   * await table.zScore("age", "ageZScore").log();
   * ```
   *
   * @example
   * ```ts
   * // Calculate Z-scores for 'salary' by 'department'
   * await table.zScore("salary", "salaryZScore", { by: "department" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Calculate Z-scores for 'score', rounded to 2 decimal places
   * await table.zScore("score", "scoreZScore", { decimals: 2 }).log();
   * ```
   */
  zScore(
    column: string,
    newColumn: string,
    options: {
      by?: string | string[];
      decimals?: number;
    } = {},
  ): this {
    zScore(this, column, newColumn, options);
    return this;
  }

  /**
   * Normalizes the values in a column using min-max normalization.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column in which values will be normalized.
   * @param newColumn - The name of the new column where normalized values will be stored.
   * @param options - An optional object with configuration options:
   * @param options.by - The column name or an array of column names to partition by. Normalization is performed independently within each group.
   * @param options.decimals - The number of decimal places to round the normalized values. Defaults to `undefined` (no rounding).
   * @param options.range - The inclusive range to scale normalized values to, as `[minimum, maximum]`. Both values must be finite and the minimum must be less than the maximum. Defaults to `[0, 1]`.
   * @returns The table, so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Normalize the values in 'column1' and store them in a new 'normalizedColumn1' column
   * await table.normalize("column1", "normalizedColumn1").log();
   * ```
   *
   * @example
   * ```ts
   * // Normalize 'value' by 'group'
   * await table.normalize("value", "normalizedValue", { by: "group" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Normalize 'data' values, rounded to 2 decimal places
   * await table.normalize("data", "normalizedData", { decimals: 2 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Normalize 'score' values to a range from 0 to 10
   * await table.normalize("score", "scaledScore", { range: [0, 10] }).log();
   * ```
   */
  normalize(
    column: string,
    newColumn: string,
    options: {
      by?: string | string[];
      decimals?: number;
      range?: [number, number];
    } = {},
  ): this {
    normalize(this, column, newColumn, options);
    return this;
  }

  /**
   * Indexes a numeric column by dividing each value by a reference value and multiplying the result by a base value.
   *
   * The reference can be calculated from the indexed column with a statistic, read from exactly one row selected by another column's value, or read from the unique row where another column reaches its minimum or maximum. With `options.by`, references are calculated or selected independently within each group. Null values in the indexed column remain null when their group has a valid reference. The operation throws when a group has no unique selected row or its reference value is null or zero.
   *
   * Exact temporal references are compared at their full DuckDB precision. JavaScript `Date` objects only have millisecond precision and always represent an instant. Construct them with an explicit timezone, such as `new Date("2001-01-01T00:00:00Z")`; date-time strings without `Z` or an offset use the user's local timezone.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The numeric column containing the values to index.
   * @param newColumn - The name of the new column where indexed values will be stored.
   * @param reference - A statistic calculated from `column`, a column and exact non-null `equals` value selecting a row, or a column and `at` set to `min` or `max` selecting its unique extreme row. The selected row's `column` value becomes the reference.
   * @param reference.stat - The statistic used to calculate the reference directly from the indexed column.
   * @param reference.column - The column used to select an exact reference row or its unique minimum or maximum row.
   * @param reference.equals - The non-null value used to select an exact reference row. Its JavaScript type must be compatible with the reference column's DuckDB type; string, numeric, boolean, and temporal values are not coerced across type families. Date values should be constructed with an explicit timezone.
   * @param reference.at - Selects the unique row where `reference.column` reaches its minimum or maximum.
   * @param options - An optional object with configuration options.
   * @param options.by - A column name or an array of column names to partition by. The reference is calculated independently within each group.
   * @param options.base - The finite positive value assigned to the reference. Defaults to `100`.
   * @param options.decimals - A finite non-negative integer specifying the number of decimal places to retain. By default, values are not rounded.
   * @returns The table, so methods can be chained.
   * @category Analyzing Data
   *
   * @example
   * ```ts
   * // Index each country's average home price to its January 2001 value.
   * await table.indexValues(
   *   "homePrice",
   *   "homePriceIndexed",
   *   {
   *     column: "date",
   *     equals: new Date("2001-01-01T00:00:00Z"),
   *   },
   *   {
   *     by: "country",
   *     base: 100,
   *     decimals: 1,
   *   },
   * ).log();
   * ```
   *
   * @example
   * ```ts
   * // Index each value against the mean of its group.
   * await table.indexValues("homePrice", "homePriceIndexed", { stat: "mean" }, {
   *   by: "country",
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Index each country's average home price to its earliest value.
   * // This throws if multiple rows share the earliest date in a country.
   * await table.indexValues("homePrice", "homePriceIndexed", {
   *   column: "date",
   *   at: "min",
   * }, { by: "country" }).log();
   * ```
   */
  indexValues(
    column: string,
    newColumn: string,
    reference:
      | {
        stat:
          | "min"
          | "max"
          | "mean"
          | "median";
        column?: never;
        equals?: never;
        at?: never;
      }
      | {
        column: string;
        equals: string | number | bigint | boolean | Date;
        stat?: never;
        at?: never;
      }
      | {
        column: string;
        at: "min" | "max";
        stat?: never;
        equals?: never;
      },
    options: {
      by?: string | string[];
      base?: number;
      decimals?: number;
    } = {},
  ): this {
    indexValues(this, column, newColumn, reference, options);
    return this;
  }

  /**
   * Updates data in the table using a JavaScript function. The function receives the existing rows as an array of objects and must return the modified rows as an array of objects.
   * This method offers high flexibility for data manipulation but can be slow for large tables as it involves transferring data between DuckDB and JavaScript.
   * This method does not work with tables containing geometries.
   *
   * This method queues the update; the dataModifier function runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param dataModifier - A synchronous or asynchronous function that takes the existing rows (as an array of objects) and returns the modified rows (as an array of objects).
   * @param options - An optional object with configuration options:
   * @param options.batchSize - If provided, rows are processed in batches of this size instead of all at once, so large tables don't have to be materialized entirely in memory. The modifier function is called once per batch.
   * @returns The table, so methods can be chained.
   * @category Updating Data
   *
   * @example
   * ```ts
   * // Count words correctly across multilingual article text.
   * const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
   * const table = await sdb
   *   .newTable()
   *   .loadData("articles.csv")
   *   .updateWithJS((rows) => {
   *     return rows.map((row) => ({
   *       ...row,
   *       wordCount: typeof row.text === "string"
   *         ? [...segmenter.segment(row.text)].filter((part) => part.isWordLike)
   *           .length
   *         : null,
   *     }));
   *   })
   *   .log();
   * ```
   *
   * @example
   * ```ts
   * // Enrich reviews with scores from an external service, 100 at a time.
   * const reviews = await table
   *   .updateWithJS(async (rows) => {
   *     const response = await fetch("https://api.example.com/score", {
   *       method: "POST",
   *       headers: { "content-type": "application/json" },
   *       body: JSON.stringify(rows.map((row) => row.review)),
   *     });
   *     const scores = await response.json() as number[];
   *     return rows.map((row, index) => ({ ...row, score: scores[index] }));
   *   }, { batchSize: 100 })
   *   .log();
   * ```
   */
  updateWithJS(
    dataModifier:
      | ((
        rows: {
          [key: string]: unknown;
        }[],
      ) => Promise<
        {
          [key: string]: unknown;
        }[]
      >)
      | ((
        rows: {
          [key: string]: unknown;
        }[],
      ) => {
        [key: string]: unknown;
      }[]),
    options: { batchSize?: number } = {},
  ): this {
    updateWithJS(this, dataModifier, options);
    return this;
  }

  /**
   * Returns the schema of the table, including column names and their data types.
   *
   * @returns A promise that resolves to an array of objects, where each object represents a column with its name and data type.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the schema of the table
   * const schema = await table.getSchema();
   * console.table(schema); // Log the schema in a readable table format
   * ```
   */
  async getSchema(): Promise<
    {
      [key: string]: string | null;
    }[]
  > {
    return await getSchema(this);
  }

  /**
   * Returns descriptive statistical information about the columns, including details like data types, number of null values, and distinct values.
   *
   * @returns A promise that resolves to an array of objects, each representing descriptive statistics for a column.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get and log descriptive information about the table's columns
   * const description = await table.getDescription();
   * console.table(description);
   * ```
   */
  async getDescription(): Promise<
    {
      [key: string]: unknown;
    }[]
  > {
    return await getDescription(this);
  }

  /**
   * Returns the name of the table.
   *
   * @returns The name of the table as a string.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the table name
   * const tableName = table.getName();
   * console.log(tableName); // e.g., "employees"
   * ```
   */
  getName(): string {
    return this.name;
  }

  /**
   * Returns a list of all column names in the table.
   *
   * @returns A promise that resolves to an array of strings, where each string is a column name.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get all column names from the table
   * const columns = await table.getColumns();
   * console.log(columns); // e.g., ["id", "name", "age"]
   * ```
   */
  async getColumns(): Promise<string[]> {
    return await getColumns(this);
  }

  /**
   * Normalizes string values in a column by:
   * 1. Stripping accents
   * 2. Optionally stripping punctuation (default: true)
   * 3. Converting to lowercase
   * 4. Normalizing whitespace (multiple spaces/tabs/newlines → single space)
   * 5. Trimming leading/trailing whitespace
   *
   * Produces identical output to `journalism-format`'s `normalizeString()` function
   * for all common cases including accented Latin characters.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column The column containing the text to normalize
   * @param newColumn The column to store the normalized results
   * @param options Configuration options
   * @param options.stripPunctuation Strip punctuation and underscores (default: true)
   *
   * @returns The table, so methods can be chained.
   * @example
   * ```ts
   * // Normalize text column and store in new column
   * await table.normalizeString("recipeName", "recipeNameNormalized").log();
   * // "Épicerie Parisienne!" → "epicerie parisienne"
   * ```
   *
   * @example
   * ```ts
   * // Keep punctuation for emails and URLs
   * await table.normalizeString("email", "emailNormalized", { stripPunctuation: false }).log();
   * // "User@Example.com" → "user@example.com"
   * await table.normalizeString("url", "urlNormalized", { stripPunctuation: false }).log();
   * // "https://Example.com/path" → "https://example.com/path"
   * ```
   *
   * @category Text Processing
   */
  normalizeString(
    column: string,
    newColumn: string,
    options: { stripPunctuation?: boolean } = {},
  ): this {
    normalizeString(this, column, newColumn, options);
    return this;
  }

  /**
   * Returns the number of columns in the table.
   *
   * @returns A promise that resolves to a number representing the total count of columns.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the number of columns in the table
   * const columnCount = await table.getColumnCount();
   * console.log(columnCount); // e.g., 3
   * ```
   */
  async getColumnCount(): Promise<number> {
    const result = (await getColumns(this)).length;
    return result;
  }

  /**
   * Returns the total number of characters in a column storing strings.
   *
   * @param column - The name of the string column to count characters from.
   * @returns A promise that resolves to the total number of characters across all rows in the specified column.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the total number of characters in the 'name' column
   * const totalChars = await table.getCharacterCount("name");
   * console.log(totalChars); // e.g., 523
   * ```
   */
  async getCharacterCount(column: string): Promise<number> {
    return await getCharacterCount(this, column);
  }

  /**
   * Returns the number of rows in the table.
   *
   * @param options - An optional object with configuration options:
   * @param options.conditions - The filtering conditions specified as a SQL `WHERE` clause (e.g., `"category = 'Book'"`).
   * @returns A promise that resolves to a number representing the total count of rows.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the number of rows in the table
   * const rowCount = await table.getRowCount();
   * console.log(rowCount); // e.g., 100
   * ```
   *
   * @example
   * ```ts
   * // Get the number of rows where 'category' is 'Book'
   * const bookCount = await table.getRowCount({ conditions: "category = 'Book'" });
   * console.log(bookCount);
   * ```
   */
  async getRowCount(options: { conditions?: string } = {}): Promise<number> {
    return await getRowCount(this, options);
  }

  /**
   * Returns the total number of values in the table (number of columns multiplied by the number of rows).
   *
   * @returns A promise that resolves to a number representing the total count of values.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the total number of values in the table
   * const valueCount = await table.getValueCount();
   * console.log(valueCount); // e.g., 300 (if 3 columns and 100 rows)
   * ```
   */
  async getValueCount(): Promise<number> {
    const result = (await this.getColumnCount()) * (await this.getRowCount());
    return result;
  }

  /**
   * Returns the data types of all columns in the table.
   *
   * @returns A promise that resolves to an object where keys are column names and values are their corresponding data types (e.g., `{ "id": "BIGINT", "name": "VARCHAR" }`).
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the data types of all columns
   * const dataTypes = await table.getTypes();
   * console.log(dataTypes);
   * ```
   */
  async getTypes(): Promise<{
    [key: string]: string;
  }> {
    return await getTypes(this);
  }

  /**
   * Returns a deterministic hash of the table's ordered schema and contents.
   * Pending operations are executed before the hash is calculated. Computing
   * the hash scans the complete table inside DuckDB without transferring its
   * rows to JavaScript.
   *
   * @returns A promise that resolves to a SHA-256 hash string.
   * @category Getting Data
   *
   * @example
   * ```ts
   * const hash = await table.getHash();
   * console.log(hash); // e.g., "8f14e45fceea..."
   * ```
   */
  async getHash(): Promise<string> {
    return await getHash(this);
  }

  /**
   * Returns all values from a specific column.
   * Temporal values use the same JavaScript representations as `getData()`.
   *
   * @param column - The name of the column from which to retrieve values.
   * @returns A promise that resolves to an array containing all values from the specified column.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get all values from the 'productName' column
   * const productNames = await table.getValues("productName");
   * console.log(productNames); // e.g., ["Laptop", "Mouse", "Keyboard"]
   * ```
   */
  async getValues(
    column: string,
  ): Promise<unknown[]> {
    return await getValues(this, column);
  }

  /**
   * Returns the minimum value from a specific column.
   * Temporal values use the same JavaScript representations as `getData()`.
   *
   * @param column - The name of the column from which to retrieve the minimum value.
   * @returns A promise that resolves to the minimum value of the specified column.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the minimum value from the 'price' column
   * const minPrice = await table.getMin("price");
   * console.log(minPrice); // e.g., 10.50
   * ```
   */
  async getMin(
    column: string,
  ): Promise<unknown> {
    return await getMin(this, column);
  }

  /**
   * Returns the maximum value from a specific column.
   * Temporal values use the same JavaScript representations as `getData()`.
   *
   * @param column - The name of the column from which to retrieve the maximum value.
   * @returns A promise that resolves to the maximum value of the specified column.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the maximum value from the 'price' column
   * const maxPrice = await table.getMax("price");
   * console.log(maxPrice); // e.g., 99.99
   * ```
   */
  async getMax(
    column: string,
  ): Promise<unknown> {
    return await getMax(this, column);
  }

  /**
   * Returns the extent (minimum and maximum values) of a specific column as an array.
   * Temporal values use the same JavaScript representations as `getData()`.
   *
   * @param column - The name of the column from which to retrieve the extent.
   * @returns A promise that resolves to an array `[min, max]` containing the minimum and maximum values of the specified column.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the extent of the 'temperature' column
   * const tempExtent = await table.getExtent("temperature");
   * console.log(tempExtent); // e.g., [15.2, 30.1]
   * ```
   */
  async getExtent(
    column: string,
  ): Promise<
    [
      unknown,
      unknown,
    ]
  > {
    return [await this.getMin(column), await this.getMax(column)];
  }

  /**
   * Returns the mean (average) value from a specific numeric column.
   *
   * @param column - The name of the numeric column from which to retrieve the mean value.
   * @param options - An optional object with configuration options:
   * @param options.decimals - The number of decimal places to round the result to. Defaults to `undefined` (no rounding).
   * @returns A promise that resolves to the mean value of the specified column.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the mean of the 'age' column
   * const meanAge = await table.getMean("age");
   * console.log(meanAge); // e.g., 35.75
   * ```
   *
   * @example
   * ```ts
   * // Get the mean of the 'salary' column, rounded to 2 decimal places
   * const meanSalary = await table.getMean("salary", { decimals: 2 });
   * console.log(meanSalary); // e.g., 55000.23
   * ```
   */
  async getMean(
    column: string,
    options: {
      decimals?: number;
    } = {},
  ): Promise<number> {
    return await getMean(this, column, options);
  }

  /**
   * Returns the median value from a specific numeric column.
   *
   * @param column - The name of the numeric column from which to retrieve the median value.
   * @param options - An optional object with configuration options:
   * @param options.decimals - The number of decimal places to round the result to. Defaults to `undefined` (no rounding).
   * @returns A promise that resolves to the median value of the specified column.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the median of the 'age' column
   * const medianAge = await table.getMedian("age");
   * console.log(medianAge); // e.g., 30
   * ```
   *
   * @example
   * ```ts
   * // Get the median of the 'salary' column, rounded to 2 decimal places
   * const medianSalary = await table.getMedian("salary", { decimals: 2 });
   * console.log(medianSalary); // e.g., 50000.00
   * ```
   */
  async getMedian(
    column: string,
    options: {
      decimals?: number;
    } = {},
  ): Promise<number> {
    return await getMedian(this, column, options);
  }

  /**
   * Returns the sum of values from a specific numeric column.
   *
   * @param column - The name of the numeric column from which to retrieve the sum.
   * @returns A promise that resolves to the sum of values in the specified column.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the sum of the 'quantity' column
   * const totalQuantity = await table.getSum("quantity");
   * console.log(totalQuantity); // e.g., 1250
   * ```
   */
  async getSum(column: string): Promise<number> {
    return await getSum(this, column);
  }

  /**
   * Returns the skewness of values from a specific numeric column.
   *
   * @param column - The name of the numeric column from which to retrieve the skewness.
   * @param options - An optional object with configuration options:
   * @param options.decimals - The number of decimal places to round the result to. Defaults to `undefined` (no rounding).
   * @returns A promise that resolves to the skewness value of the specified column.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the skewness of the 'data' column
   * const dataSkew = await table.getSkew("data");
   * console.log(dataSkew); // e.g., 0.5
   * ```
   *
   * @example
   * ```ts
   * // Get the skewness of the 'values' column, rounded to 2 decimal places
   * const valuesSkew = await table.getSkew("values", { decimals: 2 });
   * console.log(valuesSkew); // e.g., -0.25
   * ```
   */
  async getSkew(
    column: string,
    options: {
      decimals?: number;
    } = {},
  ): Promise<number> {
    return await getSkew(this, column, options);
  }

  /**
   * Returns the standard deviation of values from a specific numeric column.
   *
   * @param column - The name of the numeric column from which to retrieve the standard deviation.
   * @param options - An optional object with configuration options:
   * @param options.decimals - The number of decimal places to round the result to. Defaults to `undefined` (no rounding).
   * @returns A promise that resolves to the standard deviation value of the specified column.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the standard deviation of the 'height' column
   * const heightStdDev = await table.getStdDev("height");
   * console.log(heightStdDev); // e.g., 5.2
   * ```
   *
   * @example
   * ```ts
   * // Get the standard deviation of the 'score' column, rounded to 3 decimal places
   * const scoreStdDev = await table.getStdDev("score", { decimals: 3 });
   * console.log(scoreStdDev); // e.g., 12.345
   * ```
   */
  async getStdDev(
    column: string,
    options: {
      decimals?: number;
    } = {},
  ): Promise<number> {
    return await getStdDev(this, column, options);
  }

  /**
   * Returns the variance of values from a specific numeric column.
   *
   * @param column - The name of the numeric column from which to retrieve the variance.
   * @param options - An optional object with configuration options:
   * @param options.decimals - The number of decimal places to round the result to. Defaults to `undefined` (no rounding).
   * @returns A promise that resolves to the variance value of the specified column.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the variance of the 'data' column
   * const dataVariance = await table.getVariance("data");
   * console.log(dataVariance); // e.g., 25.5
   * ```
   *
   * @example
   * ```ts
   * // Get the variance of the 'values' column, rounded to 2 decimal places
   * const valuesVariance = await table.getVariance("values", { decimals: 2 });
   * console.log(valuesVariance); // e.g., 10.23
   * ```
   */
  async getVariance(
    column: string,
    options: {
      decimals?: number;
    } = {},
  ): Promise<number> {
    return await getVariance(this, column, options);
  }

  /**
   * Returns the value of a specific quantile from the values in a given numeric column.
   *
   * @param column - The name of the numeric column from which to calculate the quantile.
   * @param quantile - The quantile to calculate, expressed as a number between 0 and 1 (e.g., `0.25` for the first quartile, `0.5` for the median, `0.75` for the third quartile).
   * @param options - An optional object with configuration options:
   * @param options.decimals - The number of decimal places to round the result to. Defaults to `undefined` (no rounding).
   * @returns A promise that resolves to the quantile value of the specified column.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the first quartile (25th percentile) of 'column1'
   * const firstQuartile = await table.getQuantile("column1", 0.25);
   * console.log(firstQuartile); // e.g., 15.7
   * ```
   *
   * @example
   * ```ts
   * // Get the 90th percentile of 'score' values, rounded to 2 decimal places
   * const ninetiethPercentile = await table.getQuantile("score", 0.9, { decimals: 2 });
   * console.log(ninetiethPercentile); // e.g., 88.55
   * ```
   */
  async getQuantile(
    column: string,
    quantile: number,
    options: { decimals?: number } = {},
  ): Promise<number> {
    return await getQuantile(this, column, quantile, options);
  }

  /**
   * Returns unique values from a specific column. The values are returned in ascending order.
   * Temporal values use the same JavaScript representations as `getData()`.
   *
   * @param column - The name of the column from which to retrieve unique values.
   * @returns A promise that resolves to an array containing the unique values from the specified column, sorted in ascending order.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get unique values from the 'category' column
   * const uniqueCategories = await table.getUniques("category");
   * console.log(uniqueCategories); // e.g., ["Books", "Clothing", "Electronics"]
   * ```
   */
  async getUniques(
    column: string,
  ): Promise<unknown[]> {
    return await getUniques(this, column);
  }

  /**
   * Returns the first row of the table, optionally filtered by SQL conditions.
   * You can also use JavaScript syntax for conditions (e.g., `&&`, `||`, `===`, `!==`).
   * Temporal values use the same JavaScript representations as `getData()`.
   *
   * @param options - An optional object with configuration options:
   * @param options.conditions - The filtering conditions specified as a SQL `WHERE` clause (e.g., `"category = 'Book'"`).
   * @returns A promise that resolves to an object representing the first row, or `null` if no rows match the conditions.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the very first row of the table
   * const firstRow = await table.getFirstRow();
   * console.log(firstRow);
   * ```
   *
   * @example
   * ```ts
   * // Get the first row where the 'category' is 'Book'
   * const firstRowBooks = await table.getFirstRow({ conditions: `category === 'Book'` }); // Using JS syntax
   * console.log(firstRowBooks);
   * ```
   */
  async getFirstRow(
    options: {
      conditions?: string;
    } = {},
  ): Promise<
    {
      [key: string]: unknown;
    } | null
  > {
    return await getFirstRow(this, options);
  }

  /**
   * Returns the last row of the table, optionally filtered by SQL conditions.
   * You can also use JavaScript syntax for conditions (e.g., `&&`, `||`, `===`, `!==`).
   * Temporal values use the same JavaScript representations as `getData()`.
   *
   * @param options - An optional object with configuration options:
   * @param options.conditions - The filtering conditions specified as a SQL `WHERE` clause (e.g., `"category = 'Book'"`).
   * @returns A promise that resolves to an object representing the last row, or `null` if no rows match the conditions.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the very last row of the table
   * const lastRow = await table.getLastRow();
   * console.log(lastRow);
   * ```
   *
   * @example
   * ```ts
   * // Get the last row where the 'category' is 'Book'
   * const lastRowBooks = await table.getLastRow({ conditions: `category === 'Book'` }); // Using JS syntax
   * console.log(lastRowBooks);
   * ```
   */
  async getLastRow(
    options: {
      conditions?: string;
    } = {},
  ): Promise<
    {
      [key: string]: unknown;
    } | null
  > {
    return await getLastRow(this, options);
  }

  /**
   * Returns the top `n` rows of the table, optionally filtered by SQL conditions.
   * You can also use JavaScript syntax for conditions (e.g., `&&`, `||`, `===`, `!==`).
   * Temporal values use the same JavaScript representations as `getData()`.
   *
   * @param count - The number of rows to return from the top of the table.
   * @param options - An optional object with configuration options:
   * @param options.conditions - The filtering conditions specified as a SQL `WHERE` clause (e.g., `"category = 'Books'"`).
   * @returns A promise that resolves to an array of objects representing the top `n` rows.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the first 10 rows of the table
   * const top10 = await table.getTop(10);
   * console.log(top10);
   * ```
   *
   * @example
   * ```ts
   * // Get the first 5 rows where the 'category' is 'Books'
   * const top5Books = await table.getTop(5, { conditions: `category === 'Books'` }); // Using JS syntax
   * console.log(top5Books);
   * ```
   */
  async getTop(
    count: number,
    options: {
      conditions?: string;
    } = {},
  ): Promise<
    {
      [key: string]: unknown;
    }[]
  > {
    return await getTop(this, count, options);
  }

  /**
   * Returns the bottom `n` rows of the table, optionally filtered by SQL conditions.
   * By default, the last row will be returned first. To preserve the original order, use the `originalOrder` option.
   * You can also use JavaScript syntax for conditions (e.g., `&&`, `||`, `===`, `!==`).
   * Temporal values use the same JavaScript representations as `getData()`.
   *
   * @param count - The number of rows to return from the bottom of the table.
   * @param options - An optional object with configuration options:
   * @param options.originalOrder - A boolean indicating whether the rows should be returned in their original order (`true`) or in reverse order (last row first, `false`). Defaults to `false`.
   * @param options.conditions - The filtering conditions specified as a SQL `WHERE` clause (e.g., `"category = 'Books'"`).
   * @returns A promise that resolves to an array of objects representing the bottom `n` rows.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get the last 10 rows (last row first)
   * const bottom10 = await table.getBottom(10);
   * console.log(bottom10);
   * ```
   *
   * @example
   * ```ts
   * // Get the last 10 rows in their original order
   * const bottom10OriginalOrder = await table.getBottom(10, { originalOrder: true });
   * console.log(bottom10OriginalOrder);
   * ```
   *
   * @example
   * ```ts
   * // Get the last 5 rows where the 'category' is 'Books' (using JS syntax)
   * const bottom5Books = await table.getBottom(5, { conditions: `category === 'Books'` });
   * console.log(bottom5Books);
   * ```
   */
  async getBottom(
    count: number,
    options: {
      originalOrder?: boolean;
      conditions?: string;
    } = {},
  ): Promise<
    {
      [key: string]: unknown;
    }[]
  > {
    return await getBottom(this, count, options);
  }

  /**
   * Returns a single row that matches the specified conditions. If no row matches or if more than one row matches, an error is thrown by default.
   * You can also use JavaScript syntax for conditions (e.g., `AND`, `||`, `===`, `!==`).
   * Temporal values use the same JavaScript representations as `getData()`.
   *
   * @param conditions - The conditions to match, specified as a SQL `WHERE` clause.
   * @param options - Optional settings:
   * @param options.strict - If `false`, no error will be thrown when no row or more than one row match the condition. With no match, `null` is returned; with multiple matches, the first row is returned. Defaults to `true`.
   * @returns A promise that resolves to an object representing the matched row, or `null` if `strict` is `false` and no row matches.
   * @throws {Error} If `strict` is `true` and no row or more than one row matches the conditions.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get a row where 'name' is 'John'
   * const johnsRow = await table.getRow(`name = 'John'`);
   * console.log(johnsRow);
   * ```
   *
   * @example
   * ```ts
   * // Get a row where 'id' is 123 (using JS syntax)
   * const rowById = await table.getRow(`id === 123`);
   * console.log(rowById);
   * ```
   *
   * @example
   * ```ts
   * // Get a row without throwing an error if multiple matches or no match
   * const flexibleRow = await table.getRow(`status = 'pending'`, { strict: false });
   * console.log(flexibleRow);
   * ```
   */
  async getRow(
    conditions: string,
    options: { strict?: boolean } = {},
  ): Promise<
    {
      [key: string]: unknown;
    } | null
  > {
    const data = await this.getData({ conditions, limit: 2 });
    if (options.strict !== false) {
      if (data.length === 0) {
        throw new Error(`No row found with condition \`${conditions}\`.`);
      } else if (data.length > 1) {
        throw new Error(
          `More than one row found with condition \`${conditions}\`.`,
        );
      }
    }

    return data[0] ?? null;
  }

  /**
   * Returns the data from the table as an array of objects, optionally filtered by SQL conditions.
   * You can also use JavaScript syntax for conditions (e.g., `&&`, `||`, `===`, `!==`).
   *
   * Top-level DuckDB `DATE` and `TIMESTAMP` columns are returned as JavaScript
   * `Date` objects interpreted in UTC. `TIMESTAMP WITH TIME ZONE` values are
   * returned as UTC strings, preserving DuckDB's microsecond precision;
   * JavaScript `Date` supports only milliseconds.
   *
   * @param options - An optional object with configuration options:
   * @param options.columns - An array of column names to include in the result. If omitted, all columns will be included.
   * @param options.conditions - The filtering conditions specified as a SQL `WHERE` clause (e.g., `"category = 'Book'"`).
   * @param options.limit - The maximum number of rows to return. Must be an integer greater than or equal to `0`.
   * @returns A promise that resolves to an array of objects, where each object represents a row in the table.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get all data from the table
   * const allData = await table.getData();
   * console.log(allData);
   * ```
   *
   * @example
   * ```ts
   * // Get data filtered by a condition (using JS or SQL syntax)
   * const booksData = await table.getData({ conditions: `category === 'Book'` });
   * console.log(booksData);
   * ```
   *
   * @example
   * ```ts
   * // Get data filtered by a condition and specific columns
   * const booksData = await table.getData({ columns: ["title", "author"], conditions: `category === 'Book'` });
   * console.log(booksData);
   * ```
   *
   * @example
   * ```ts
   * // Return at most two rows.
   * const preview = await table.getData({ limit: 2 });
   * ```
   */
  async getData(
    options: {
      columns?: string | string[];
      conditions?: string;
      limit?: number;
    } = {},
  ): Promise<
    {
      [key: string]: unknown;
    }[]
  > {
    return await getData(this, options);
  }

  /**
   * Streams the table rows one by one as an async iterator, without
   * materializing the whole table in memory. Values are converted to
   * JavaScript types the same way as `getData()`.
   *
   * The underlying DuckDB result is streamed chunk by chunk, so tables
   * larger than the available memory can be iterated. Avoid running other
   * queries on the same database while iterating.
   *
   * @param options - An optional object with configuration options:
   * @param options.columns - The column name or an array of column names to include. If omitted, all columns are streamed.
   * @param options.conditions - A SQL `WHERE` clause condition to filter the rows.
   * @returns An async generator yielding one row object at a time.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Stream all rows
   * for await (const row of table.stream()) {
   *   console.log(row);
   * }
   * ```
   *
   * @example
   * ```ts
   * // Stream specific columns and rows
   * for await (const row of table.stream({ columns: "temperature", conditions: `temperature > 20` })) {
   *   console.log(row);
   * }
   * ```
   */
  stream(
    options: {
      columns?: string | string[];
      conditions?: string;
    } = {},
  ): AsyncGenerator<{ [key: string]: unknown }, void, undefined> {
    return stream(this, options);
  }

  /**
   * Returns the data from the table as a CSV string, optionally filtered by SQL conditions.
   * You can also use JavaScript syntax for conditions (e.g., `&&`, `||`, `===`, `!==`).
   * Temporal values are first converted as they are in `getData()`, then
   * serialized using UTC date and timestamp text.
   *
   * @param options - An optional object with configuration options:
   * @param options.columns - An array of column names to include in the CSV. If omitted, all columns will be included.
   * @param options.conditions - The filtering conditions specified as a SQL `WHERE` clause (e.g., `"category = 'Book'"`).
   * @returns A promise that resolves to a CSV-formatted string representation of the table data.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get all data from the table as CSV
   * const allDataCSV = await table.getDataAsCSV();
   * console.log(allDataCSV);
   * ```
   *
   * @example
   * ```ts
   * // Get data filtered by a condition (using JS syntax or SQL syntax) as CSV
   * const booksDataCSV = await table.getDataAsCSV({ conditions: `category === 'Book'` });
   * console.log(booksDataCSV);
   * ```
   *
   * @example
   * ```ts
   * // Get data filtered by a condition and specific columns as CSV
   * const booksDataCSV = await table.getDataAsCSV({ columns: ["title", "author"], conditions: `category === 'Book'` });
   * console.log(booksDataCSV);
   * ```
   */
  async getDataAsCSV(options: {
    columns?: string | string[];
    conditions?: string;
  } = {}): Promise<string> {
    const data = await this.getData(options);
    return csvFormat(data);
  }

  // GEOSPATIAL

  /**
   * Creates point geometries from latitude (y) and longitude (x) columns.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param latColumn - The name of the column storing the latitude (y-coordinate) values.
   * @param lonColumn - The name of the column storing the longitude (x-coordinate) values.
   * @param newColumn - The name of the new column where the point geometries will be stored.
   * @param options - An optional object with configuration options:
   * @param options.projection - The projection of the coordinates. Defaults to EPSG:4326 (WGS84), passed as `"EPSG:4326"`.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Create point geometries in a new 'geom' column using latitude (y) and longitude (x) columns.
   * // The resulting coordinates are ordered as [longitude, latitude], or [x, y].
   * // The projection is assumed to be EPSG:4326 (WGS84).
   * await table.createPoints("lat", "lon", "geom").log();
   * ```
   *
   * @example
   * ```ts
   * // Create point geometries from coordinates in a projected coordinate system
   * await table.createPoints("y", "x", "geom", { projection: "EPSG:3347" }).log();
   * ```
   */
  createPoints(
    latColumn: string,
    lonColumn: string,
    newColumn: string,
    options: { projection?: string } = {},
  ): this {
    createPoints(this, latColumn, lonColumn, newColumn, options);
    return this;
  }

  /**
   * Adds a column with boolean values indicating the validity of geometries.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param newColumn - The name of the new column where the boolean results (`TRUE` for valid, `FALSE` for invalid) will be stored.
   * @param options - An optional object with configuration options:
   * @param options.column - The name of the column storing the geometries to be checked. If omitted, the method will automatically attempt to find a geometry column.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Check if geometries are valid and store results in a new 'isValid' column
   * // The method will automatically detect the geometry column.
   * await table.addGeoValidity("isValid").log();
   * ```
   *
   * @example
   * ```ts
   * // Check validity of geometries in a specific column named 'myGeom'
   * await table.addGeoValidity("isValidMyGeom", { column: "myGeom" }).log();
   * ```
   */
  addGeoValidity(
    newColumn: string,
    options: { column?: string } = {},
  ): this {
    addGeoValidity(this, newColumn, options);
    return this;
  }

  /**
   * Adds a column with the number of vertices (points) in each geometry.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param newColumn - The name of the new column where the vertex counts will be stored.
   * @param options - An optional object with configuration options:
   * @param options.column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Add a new column 'vertexCount' with the number of vertices for each geometry
   * // The method will automatically detect the geometry column.
   * await table.addVertexCount("vertexCount").log();
   * ```
   *
   * @example
   * ```ts
   * // Add vertex counts for geometries in a specific column named 'myGeom'
   * await table.addVertexCount("myGeomVertices", { column: "myGeom" }).log();
   * ```
   */
  addVertexCount(
    newColumn: string,
    options: { column?: string } = {},
  ): this {
    addVertexCount(this, newColumn, options);
    return this;
  }

  /**
   * Attempts to make invalid geometries valid without removing any vertices.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column storing the geometries to be fixed. If omitted, the method will automatically attempt to find a geometry column.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Fix invalid geometries in the default geometry column
   * await table.fixGeo().log();
   * ```
   *
   * @example
   * ```ts
   * // Fix invalid geometries in a specific column named 'myGeom'
   * await table.fixGeo("myGeom").log();
   * ```
   */
  fixGeo(column?: string): this {
    fixGeo(this, column);
    return this;
  }

  /**
   * Adds a column with boolean values indicating whether geometries are closed (e.g., polygons) or open (e.g., linestrings).
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param newColumn - The name of the new column where the boolean results (`TRUE` for closed, `FALSE` for open) will be stored.
   * @param options - An optional object with configuration options:
   * @param options.column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Check if geometries are closed and store results in a new 'isClosed' column
   * await table.addGeoClosedStatus("isClosed").log();
   * ```
   *
   * @example
   * ```ts
   * // Check closed status of geometries in a specific column named 'boundaryGeom'
   * await table.addGeoClosedStatus("boundaryClosed", { column: "boundaryGeom" }).log();
   * ```
   */
  addGeoClosedStatus(
    newColumn: string,
    options: { column?: string } = {},
  ): this {
    addGeoClosedStatus(this, newColumn, options);
    return this;
  }

  /**
   * Adds a column with the geometry type (e.g., `"POINT"`, `"LINESTRING"`, `"POLYGON"`) for each geometry.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param newColumn - The name of the new column where the geometry types will be stored.
   * @param options - An optional object with configuration options:
   * @param options.column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Add a new column 'geometryType' with the type of each geometry
   * await table.addGeoType("geometryType").log();
   * ```
   *
   * @example
   * ```ts
   * // Get the geometry type for geometries in a specific column named 'featureGeom'
   * await table.addGeoType("featureType", { column: "featureGeom" }).log();
   * ```
   */
  addGeoType(
    newColumn: string,
    options: { column?: string } = {},
  ): this {
    addGeoType(this, newColumn, options);
    return this;
  }

  /**
   * Flips the coordinate order of geometries in a specified column (e.g., from `[longitude (x), latitude (y)]` to `[latitude (y), longitude (x)]` or vice-versa).
   * **Warning:** This method should be used with caution as it directly manipulates coordinate order and can affect the accuracy of geospatial operations if not used correctly.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Flip coordinates in the default geometry column
   * await table.flipCoordinates().log();
   * ```
   *
   * @example
   * ```ts
   * // Flip coordinates in a specific column named 'myGeom'
   * await table.flipCoordinates("myGeom").log();
   * ```
   */
  flipCoordinates(column?: string): this {
    flipCoordinates(this, column);
    return this;
  }

  /**
   * Reduces the precision of geometries in a specified column to a given number of decimal places.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param decimals - The number of decimal places to keep in the coordinates of the geometries.
   * @param options - An optional object with configuration options:
   * @param options.column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Reduce the precision of geometries in the default column to 3 decimal places
   * await table.reducePrecision(3).log();
   * ```
   *
   * @example
   * ```ts
   * // Reduce the precision of geometries in a specific column named 'myGeom' to 2 decimal places
   * await table.reducePrecision(2, { column: "myGeom" }).log();
   * ```
   */
  reducePrecision(
    decimals: number,
    options: { column?: string } = {},
  ): this {
    reducePrecision(this, decimals, options);
    return this;
  }

  /**
   * Reprojects the geometries in a specified column to another Spatial Reference System (SRS).
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param crs - The target SRS (e.g., `"EPSG:3347"`, or `"EPSG:4326"` for EPSG:4326 (WGS84)).
   * @param options - An optional object with configuration options:
   * @param options.column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Reproject geometries in the default column to EPSG:3347 (NAD83/Statistics Canada Lambert)
   * await table.reproject("EPSG:3347").log();
   * ```
   *
   * @example
   * ```ts
   * // Reproject geometries in a specific column named 'myGeom' to EPSG:3347
   * await table.reproject("EPSG:3347", { column: "myGeom" }).log();
   * ```
   */
  reproject(
    crs: string,
    options: { column?: string } = {},
  ): this {
    reproject(this, crs, options);
    return this;
  }

  /**
   * Computes the area of geometries in square meters (`"m2"`) or optionally square kilometers (`"km2"`).
   * The input geometry is assumed to be in EPSG:4326 (WGS84).
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param newColumn - The name of the new column where the computed areas will be stored.
   * @param options - An optional object with configuration options:
   * @param options.unit - The unit for the computed area: `"m2"` (square meters) or `"km2"` (square kilometers). Defaults to `"m2"`.
   * @param options.column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @param options.decimals - The number of decimal places to round the computed areas. Defaults to `undefined` (no rounding).
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Compute the area of geometries in square meters and store in 'area_m2'
   * await table.area("area_m2").log();
   * ```
   *
   * @example
   * ```ts
   * // Compute the area of geometries in square kilometers and store in 'area_km2'
   * await table.area("area_km2", { unit: "km2" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute areas in square kilometers rounded to two decimal places
   * await table.area("area_km2", { unit: "km2", decimals: 2 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute the area of geometries in a specific column named 'myGeom'
   * await table.area("myGeomArea", { column: "myGeom" }).log();
   * ```
   */
  area(
    newColumn: string,
    options: {
      unit?: "m2" | "km2";
      column?: string;
      decimals?: number;
    } = {},
  ): this {
    area(this, newColumn, options);
    return this;
  }

  /**
   * Computes the length of line geometries in meters (`"m"`) or optionally kilometers (`"km"`).
   * The input geometry is assumed to be in EPSG:4326 (WGS84).
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param newColumn - The name of the new column where the computed lengths will be stored.
   * @param options - An optional object with configuration options:
   * @param options.unit - The unit for the computed length: `"m"` (meters) or `"km"` (kilometers). Defaults to `"m"`.
   * @param options.column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @param options.decimals - The number of decimal places to round the computed lengths. Defaults to `undefined` (no rounding).
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Compute the length of line geometries in meters and store in 'length_m'
   * await table.length("length_m").log();
   * ```
   *
   * @example
   * ```ts
   * // Compute the length of line geometries in kilometers and store in 'length_km'
   * await table.length("length_km", { unit: "km" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute lengths in kilometers rounded to two decimal places
   * await table.length("length_km", { unit: "km", decimals: 2 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute the length of geometries in a specific column named 'routeGeom'
   * await table.length("routeLength", { column: "routeGeom" }).log();
   * ```
   */
  length(
    newColumn: string,
    options: {
      unit?: "m" | "km";
      column?: string;
      decimals?: number;
    } = {},
  ): this {
    length(this, newColumn, options);
    return this;
  }

  /**
   * Computes the perimeter of polygon geometries in meters (`"m"`) or optionally kilometers (`"km"`).
   * The input geometry is assumed to be in EPSG:4326 (WGS84).
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param newColumn - The name of the new column where the computed perimeters will be stored.
   * @param options - An optional object with configuration options:
   * @param options.unit - The unit for the computed perimeter: `"m"` (meters) or `"km"` (kilometers). Defaults to `"m"`.
   * @param options.column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @param options.decimals - The number of decimal places to round the computed perimeters. Defaults to `undefined` (no rounding).
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Compute the perimeter of polygon geometries in meters and store in 'perimeter_m'
   * await table.perimeter("perimeter_m").log();
   * ```
   *
   * @example
   * ```ts
   * // Compute the perimeter of polygon geometries in kilometers and store in 'perimeter_km'
   * await table.perimeter("perimeter_km", { unit: "km" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute perimeters in kilometers rounded to two decimal places
   * await table.perimeter("perimeter_km", { unit: "km", decimals: 2 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute the perimeter of geometries in a specific column named 'landParcelGeom'
   * await table.perimeter("landParcelPerimeter", { column: "landParcelGeom" }).log();
   * ```
   */
  perimeter(
    newColumn: string,
    options: {
      unit?: "m" | "km";
      column?: string;
      decimals?: number;
    } = {},
  ): this {
    perimeter(this, newColumn, options);
    return this;
  }

  /**
   * Computes a buffer (a polygon representing a specified distance around a geometry) for geometries in a specified column.
   * The distance is in the Spatial Reference System (SRS) unit of the input geometries.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param newColumn - The name of the new column where the buffered geometries will be stored.
   * @param distance - The distance for the buffer. This value is in the units of the geometry's SRS.
   * @param options - An optional object with configuration options:
   * @param options.column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Create a buffer of 1 unit around geometries in the default column, storing results in 'bufferedGeom'
   * await table.buffer("bufferedGeom", 1).log();
   * ```
   *
   * @example
   * ```ts
   * // Create a buffer of 10 units around geometries in a specific column named 'pointsGeom'
   * await table.buffer("pointsBuffer", 10, { column: "pointsGeom" }).log();
   * ```
   */
  buffer(
    newColumn: string,
    distance: number,
    options: { column?: string } = {},
  ): this {
    buffer(this, newColumn, distance, options);
    return this;
  }

  /**
   * Merges the data of this table (considered the left table) with another table (the right table) based on a spatial relationship.
   * Note that the order of rows in the returned data is not guaranteed to be the same as in the original tables.
   * This operation might create temporary files in a `.tmp` folder; consider adding `.tmp` to your `.gitignore`.
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called. The join uses the other table's state as of this call: operations queued on it afterwards run after the join.
   *
   * @param rightTable - The SimpleTable instance to be joined with this table.
   * @param method - The spatial join method to use: `"intersect"` (geometries overlap), `"inside"` (geometries of the left table are entirely within geometries of the right table), or `"withinDistance"` (geometries of the left table are within a specified distance of geometries in the right table).
   * @param options - An optional object with configuration options:
   * @param options.leftColumn - The name of the column storing geometries in the left table (this table). If omitted, the method attempts to find one.
   * @param options.rightColumn - The name of the column storing geometries in the right table. If omitted, the method attempts to find one.
   * @param options.type - The type of join operation to perform: `"inner"`, `"left"` (default), `"right"`, or `"full"`. For some types (like `"inside"`), the table order is important.
   * @param options.distance - Required if `method` is `"withinDistance"`. The target distance for the spatial join. The unit depends on `distanceMethod`.
   * @param options.distanceMethod - The method for distance calculations: `"srs"` (default, uses the SRS unit), `"haversine"` (uses meters, requires EPSG:4326 (WGS84) input), or `"spheroid"` (uses meters, requires EPSG:4326 (WGS84) input, most accurate but slowest).
   * @param options.excludeLeftGeometry - Whether to exclude the selected `leftColumn` geometry from the result. Defaults to `false`.
   * @param options.excludeRightGeometry - Whether to exclude the selected `rightColumn` geometry from the result. Defaults to `false`.
   * @param options.outputTable - If `true`, the results will be stored in a new table with a generated name. If a string, it will be used as the name for the new table. If `false` or omitted, the current table will be overwritten. Defaults to `false`.
   * @returns A table instance containing the spatially joined data (either the current table or a new table), so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Merge data based on intersecting geometries, overwriting tableA
   * await tableA.joinGeo(tableB, "intersect").log();
   * ```
   *
   * @example
   * ```ts
   * // Merge data where geometries in tableA are inside geometries in tableB
   * await tableA.joinGeo(tableB, "inside").log();
   * ```
   *
   * @example
   * ```ts
   * // Join using both geometries without copying them into the result
   * await tableA.joinGeo(tableB, "intersect", {
   *   excludeLeftGeometry: true,
   *   excludeRightGeometry: true,
   * }).log();
   * ```
   *
   * @example
   * ```ts
   * // Merge data where geometries in tableA are within 10 units (SRS) of geometries in tableB
   * await tableA.joinGeo(tableB, "withinDistance", { distance: 10 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Merge data where geometries in tableA are within 10 kilometers (Haversine) of geometries in tableB
   * // Input geometries must be in EPSG:4326 (WGS84).
   * await tableA.joinGeo(tableB, "withinDistance", { distance: 10, distanceMethod: "haversine", unit: "km" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Merge data with specific geometry columns and an inner join type, storing results in a new table
   * const tableC = await tableA.joinGeo(tableB, "intersect", {
   *   leftColumn: "geometriesA",
   *   rightColumn: "geometriesB",
   *   type: "inner",
   *   outputTable: true,
   * }).log();
   * ```
   */
  joinGeo(
    rightTable: SimpleTable,
    method: "intersect" | "inside" | "withinDistance",
    options: {
      leftColumn?: string;
      rightColumn?: string;
      type?: "inner" | "left" | "right" | "full";
      distance?: number;
      distanceMethod?: "srs" | "haversine" | "spheroid";
      excludeLeftGeometry?: boolean;
      excludeRightGeometry?: boolean;
      outputTable?: string | boolean;
    } = {},
  ): this {
    options = { ...options };
    if (options.outputTable === true) {
      options.outputTable = `table${this.sdb.tableIncrement}`;
      this.sdb.tableIncrement += 1;
    }
    return joinGeo(
      this,
      method,
      rightTable,
      options,
    ) as this;
  }

  /**
   * Computes the intersection of two sets of geometries, creating new geometries where they overlap.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column1 - The name of the first column storing geometries.
   * @param column2 - The name of the second column storing geometries. Both columns must have the same projection.
   * @param newColumn - The name of the new column where the computed intersection geometries will be stored.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Compute the intersection of geometries in 'geomA' and 'geomB' columns, storing results in 'intersectGeom'
   * await table.intersection("geomA", "geomB", "intersectGeom").log();
   * ```
   */
  intersection(
    column1: string,
    column2: string,
    newColumn: string,
  ): this {
    intersection(this, column1, column2, newColumn);
    return this;
  }

  /**
   * Computes the geometric difference between two geometries, returning the portion of the first geometry that does not intersect the second.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column1 - The name of the column storing the geometries from which the second geometries will be subtracted.
   * @param column2 - The name of the column storing the geometries to subtract. Both columns must have the same projection.
   * @param newColumn - The name of the new column where the geometric differences will be stored.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Subtract 'geomB' from 'geomA', storing the result in 'geomA_minus_geomB'
   * await table.difference("geomA", "geomB", "geomA_minus_geomB").log();
   * ```
   */
  difference(
    column1: string,
    column2: string,
    newColumn: string,
  ): this {
    difference(this, column1, column2, newColumn);
    return this;
  }

  /**
   * Fills holes in polygon geometries.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Fill holes in geometries in the default geometry column
   * await table.fillHoles().log();
   * ```
   *
   * @example
   * ```ts
   * // Fill holes in geometries in a specific column named 'polygonGeom'
   * await table.fillHoles("polygonGeom").log();
   * ```
   */
  fillHoles(column?: string): this {
    fillHoles(this, column);
    return this;
  }

  /**
   * Returns `TRUE` if two geometries intersect (overlap in any way), and `FALSE` otherwise.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column1 - The name of the first column storing geometries.
   * @param column2 - The name of the second column storing geometries. Both columns must have the same projection.
   * @param newColumn - The name of the new column where the boolean results (`TRUE` for intersection, `FALSE` otherwise) will be stored.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Check if geometries in 'geomA' and 'geomB' intersect, storing results in 'doIntersect'
   * await table.intersects("geomA", "geomB", "doIntersect").log();
   * ```
   */
  intersects(
    column1: string,
    column2: string,
    newColumn: string,
  ): this {
    intersects(this, column1, column2, newColumn);
    return this;
  }

  /**
   * Returns `TRUE` if every point of a geometry in `column` is covered by a geometry in `containerColumn`, including their boundaries, and `FALSE` otherwise.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column storing the geometries to be tested for containment.
   * @param containerColumn - The name of the column storing the geometries to be tested as containers. Both columns must have the same projection.
   * @param newColumn - The name of the new column where the boolean results (`TRUE` when covered, `FALSE` otherwise) will be stored.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Check if geometries in 'pointGeom' are covered by 'polygonGeom', storing results in 'isCovered'
   * await table.coveredBy("pointGeom", "polygonGeom", "isCovered").log();
   * ```
   */
  coveredBy(
    column: string,
    containerColumn: string,
    newColumn: string,
  ): this {
    coveredBy(this, column, containerColumn, newColumn);
    return this;
  }

  /**
   * Computes the union of two geometries, creating a new geometry that represents the merged area of both.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column1 - The name of the first column storing geometries.
   * @param column2 - The name of the second column storing geometries. Both columns must have the same projection.
   * @param newColumn - The name of the new column where the computed union geometries will be stored.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Compute the union of geometries in 'geomA' and 'geomB', storing results in 'unionGeom'
   * await table.union("geomA", "geomB", "unionGeom").log();
   * ```
   */
  union(
    column1: string,
    column2: string,
    newColumn: string,
  ): this {
    union(this, column1, column2, newColumn);
    return this;
  }

  /**
   * Extracts the latitude (y) and longitude (x) coordinates from point geometries.
   * The input geometry is assumed to be in EPSG:4326 (WGS84).
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column storing the point geometries.
   * @param latColumn - The name of the new column where the extracted latitude (y-coordinate) values will be stored.
   * @param lonColumn - The name of the new column where the extracted longitude (x-coordinate) values will be stored.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Extract latitude (y) and longitude (x) from 'geom' into new 'lat' and 'lon' columns.
   * await table.extractLatLon("geom", "lat", "lon").log();
   * ```
   */
  extractLatLon(
    column: string,
    latColumn: string,
    lonColumn: string,
  ): this {
    extractLatLon(this, column, latColumn, lonColumn);
    return this;
  }

  /**
   * Simplifies geometries while preserving their overall coverage. A higher tolerance results in more significant simplification.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param tolerance - A numeric value representing the simplification tolerance. A higher value leads to greater simplification.
   * @param options - An optional object with configuration options:
   * @param options.column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @param options.simplifyBoundary - If `true` (default), the boundary of the geometries will also be simplified. If `false`, only the interior of the geometries will be simplified, preserving the original boundary.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Simplify geometries in the default column with a tolerance of 0.1
   * await table.simplify(0.1).log();
   * ```
   *
   * @example
   * ```ts
   * // Simplify geometries in 'myGeom' column, preserving the boundary
   * await table.simplify(0.05, { column: "myGeom", simplifyBoundary: false }).log();
   * ```
   */
  simplify(
    tolerance: number,
    options: { column?: string; simplifyBoundary?: boolean } = {},
  ): this {
    simplify(this, tolerance, options);
    return this;
  }

  /**
   * Computes the centroid of geometries.
   * The values are returned in the SRS unit of the input geometries.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param newColumn - The name of the new column where the computed centroid geometries will be stored.
   * @param options - An optional object with configuration options:
   * @param options.column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Compute the centroid of geometries in the default column, storing results in 'centerPoint'
   * await table.centroid("centerPoint").log();
   * ```
   *
   * @example
   * ```ts
   * // Compute the centroid of geometries in a specific column named 'areaGeom'
   * await table.centroid("areaCentroid", { column: "areaGeom" }).log();
   * ```
   */
  centroid(
    newColumn: string,
    options: { column?: string } = {},
  ): this {
    centroid(this, newColumn, options);
    return this;
  }

  /**
   * Generates a random point within the geometries of a specified column.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param newColumn - The name of the new column where the random points will be stored.
   * @param tries - The number of points to generate within the bounding box of each geometry to find one that is within the geometry itself.
   * @param options - An optional object with configuration options:
   * @param options.column - The name of the column storing the geometries within which the random points will be generated. If omitted, the method will automatically attempt to find a geometry column.
   * @param options.strict - If `false`, the method will not throw an error if some points cannot be generated. Corresponding rows will have `NULL` in the new column. Defaults to `true`.
   *
   * @example
   * ```ts
   * // Generate a random point for each geometry in the default column, trying 100 points
   * await table.randomPoint("randomPoint", 100).log();
   * ```
   *
   * @example
   * ```ts
   * // Generate a random point for each geometry in a specific column named 'areaGeom', trying 50 points
   * await table.randomPoint("pointInArea", 50, { column: "areaGeom" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Generate a random point for each geometry, but don't throw if some points cannot be generated
   * await table.randomPoint("pointInArea", 1, { strict: false }).log();
   * ```
   */
  randomPoint(
    newColumn: string,
    tries: number,
    options: { column?: string; strict?: boolean } = {},
  ): this {
    randomPoint(this, newColumn, tries, options);
    return this;
  }

  /**
   * Computes the distance between geometries in two specified columns.
   * By default, the distance is calculated in the Spatial Reference System (SRS) unit of the input geometries.
   * You can optionally specify `"spheroid"` or `"haversine"` methods to get results in meters or kilometers.
   * If using `"spheroid"` or `"haversine"`, the input geometries must be in EPSG:4326 (WGS84).
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column1 - The name of the first column storing geometries.
   * @param column2 - The name of the second column storing geometries.
   * @param newColumn - The name of the new column where the computed distances will be stored.
   * @param options - An optional object with configuration options:
   * @param options.method - The method to use for distance calculations: `"srs"` (default, uses SRS unit), `"haversine"` (meters, requires EPSG:4326 (WGS84)), or `"spheroid"` (meters, requires EPSG:4326 (WGS84), most accurate but slowest).
   * @param options.unit - If `method` is `"spheroid"` or `"haversine"`, you can choose between `"m"` (meters, default) or `"km"` (kilometers).
   * @param options.decimals - The number of decimal places to round the distance values. Defaults to `undefined` (no rounding).
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Compute distance between 'geomA' and 'geomB' in SRS units, store in 'distance_srs'
   * await table.distance("geomA", "geomB", "distance_srs").log();
   * ```
   *
   * @example
   * ```ts
   * // Compute Haversine distance in meters between 'point1' and 'point2', store in 'distance_m'
   * // Input geometries must be in EPSG:4326 (WGS84).
   * await table.distance("point1", "point2", "distance_m", { method: "haversine" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute Haversine distance in kilometers, rounded to 2 decimal places
   * // Input geometries must be in EPSG:4326 (WGS84).
   * await table.distance("point1", "point2", "distance_km", { method: "haversine", unit: "km", decimals: 2 }).log();
   * ```
   *
   * @example
   * ```ts
   * // Compute Spheroid distance in kilometers
   * // Input geometries must be in EPSG:4326 (WGS84).
   * await table.distance("area1", "area2", "distance_spheroid_km", { method: "spheroid", unit: "km" }).log();
   * ```
   */
  distance(
    column1: string,
    column2: string,
    newColumn: string,
    options: {
      unit?: "m" | "km";
      method?: "srs" | "haversine" | "spheroid";
      decimals?: number;
    } = {},
  ): this {
    distance(this, column1, column2, newColumn, options);
    return this;
  }

  /**
   * Unnests geometries recursively, transforming multi-part geometries (e.g., MultiPolygon) into individual single-part geometries (e.g., Polygon).
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column storing the geometries to be unnested. If omitted, the method will automatically attempt to find a geometry column.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Unnest geometries in the default column
   * await table.unnestGeo().log();
   * ```
   *
   * @example
   * ```ts
   * // Unnest geometries in a specific column named 'multiGeom'
   * await table.unnestGeo("multiGeom").log();
   * ```
   */
  unnestGeo(column?: string): this {
    unnestGeo(this, column);
    return this;
  }

  /**
   * Adds the bounding box coordinates of geometries in a specified column as four new columns: `minLon`, `minLat`, `maxLon`, and `maxLat`.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param options - An optional object with configuration options:
   * @param options.column - The name of the column storing the geometries for which the bounding box will be computed. If omitted, the method will automatically attempt to find a geometry column.
   * @param options.decimals - The number of decimal places to round the bounding box coordinates. Defaults to `undefined` (no rounding).
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Compute the bounding box for geometries in the default column
   * await table.addBoundingBox().log();
   * // The table now has minLon, minLat, maxLon, and maxLat columns.
   * ```
   *
   * @example
   * ```ts
   * // Compute the bounding box for geometries in 'geom' column and round coordinates to 2 decimal places
   * await table.addBoundingBox({ column: "geom", decimals: 2 }).log();
   * // The table now has minLon, minLat, maxLon, and maxLat columns with values rounded to 2 decimal places.
   * ```
   */
  addBoundingBox(
    options: {
      column?: string;
      decimals?: number;
    } = {},
  ): this {
    addBoundingBox(this, options);
    return this;
  }

  /**
   * Aggregates geometries in a specified column based on a chosen aggregation method.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param method - The aggregation method to apply: `"union"` (combines all geometries into a single multi-geometry) or `"intersection"` (computes the intersection of all geometries).
   * @param options - An optional object with configuration options:
   * @param options.column - The name of the column storing the geometries to be aggregated. If omitted, the method will automatically attempt to find a geometry column.
   * @param options.by - The column name or an array of column names to group by. Geometries are aggregated independently within each group.
   * @param options.outputTable - If `true`, the results will be stored in a new table with a generated name. If a string, it will be used as the name for the new table. If `false` or omitted, the current table will be overwritten. Defaults to `false`.
   * @returns A table instance containing the aggregated geometries (either the current table or a new table), so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Aggregate all geometries in the default column into a single union geometry
   * await table.aggregateGeo("union").log();
   * ```
   *
   * @example
   * ```ts
   * // Aggregate geometries by 'country' and compute their union
   * await table.aggregateGeo("union", { by: "country" }).log();
   * ```
   *
   * @example
   * ```ts
   * // Aggregate geometries in 'regions' column into their intersection, storing results in a new table
   * const intersectionTable = await table.aggregateGeo("intersection", { column: "regions", outputTable: true }).log();
   * ```
   */
  aggregateGeo(
    method: "union" | "intersection",
    options: {
      column?: string;
      by?: string | string[];
      outputTable?: string | boolean;
    } = {},
  ): this {
    return aggregateGeo(this, method, options) as this;
  }

  /**
   * Transforms closed linestring geometries into polygon geometries.
   *
   * This method queues the operation; it runs when an async observer method (like `getData()` or `log()`) is awaited, or when `run()` is called.
   *
   * @param column - The name of the column storing the linestring geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @returns The table, so methods can be chained.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Transform closed linestrings in the default geometry column into polygons
   * await table.linesToPolygons().log();
   * ```
   *
   * @example
   * ```ts
   * // Transform closed linestrings in a specific column named 'routeLines' into polygons
   * await table.linesToPolygons("routeLines").log();
   * ```
   */
  linesToPolygons(column?: string): this {
    linesToPolygons(this, column);
    return this;
  }

  /**
   * Returns the bounding box of geometries in `[minLon, minLat, maxLon, maxLat]` order.
   * By default, the method will try to find the column with the geometries. The input geometry is assumed to be in EPSG:4326 (WGS84).
   *
   * @param column - The name of the column storing geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @returns A promise that resolves to an array `[minLon, minLat, maxLon, maxLat]` representing the bounding box.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Get the bounding box of geometries in the default column
   * const bbox = await table.getBoundingBox();
   * console.log(bbox); // e.g., [-75.0, 45.0, -73.0, 46.0]
   * ```
   *
   * @example
   * ```ts
   * // Get the bounding box of geometries in a specific column named 'areaGeom'
   * const areaBbox = await table.getBoundingBox("areaGeom");
   * console.log(areaBbox);
   * ```
   */
  async getBoundingBox(
    column?: string,
  ): Promise<[number, number, number, number]> {
    return await getBoundingBox(this, column);
  }

  /**
   * Returns the table's geospatial data as a GeoJSON object.
   * If the table has multiple geometry columns, you must specify which one to use.
   *
   * @param column - The name of the column storing the geometries. If omitted, the method will automatically attempt to find a geometry column.
   * @param options - An optional object with configuration options:
   * @param options.rewind - If `true`, rewinds the coordinates of polygons to follow the spherical winding order (important for D3.js). Defaults to `false`.
   * @returns A promise that resolves to a GeoJSON object representing the table's geospatial data.
   * @category Getting Data
   *
   * @example
   * ```ts
   * // Get GeoJSON data from the default geometry column
   * const geojson = await table.getGeoData();
   * console.log(geojson);
   * ```
   *
   * @example
   * ```ts
   * // Get GeoJSON data from a specific geometry column named 'myGeometries'
   * const myGeomJson = await table.getGeoData("myGeometries");
   * console.log(myGeomJson);
   * ```
   *
   * @example
   * ```ts
   * // Get GeoJSON data and rewind polygon coordinates for D3.js compatibility
   * const rewoundGeojson = await table.getGeoData(undefined, { rewind: true });
   * console.log(rewoundGeojson);
   * ```
   */
  async getGeoData(
    column?: string,
    options: { rewind?: boolean } = {},
  ): Promise<{
    type: string;
    features: unknown[];
  }> {
    if (column === undefined) {
      column = await findGeoColumn(this, "getGeoData()");
    }

    return await getGeoData(this, column, options);
  }

  /**
   * Writes the table's data to a file in various formats (CSV, JSON, Parquet, DuckDB, SQLite).
   * If the specified path does not exist, it will be created.
   *
   * @param file - The absolute path to the output file (e.g., `"./output.csv"`, `"./output.json"`).
   * @param options - An optional object with configuration options:
   * @param options.compression - A boolean indicating whether to compress the output file. If `true`, CSV and JSON files will be compressed with GZIP, while Parquet files will use ZSTD. Defaults to `false`.
   * @param options.dataAsArrays - For JSON files only. If `true`, JSON files are written as a single object with arrays for each column (e.g., `{ "col1": [v1, v2], "col2": [v3, v4] }`) instead of an array of objects. This can reduce file size for web projects. You can use the `arraysToData` function from the [journalism library](https://jsr.io/@nshiab/journalism/doc/~/arraysToData) to convert it back.
   * @param options.formatDates - For CSV and JSON files only. If `true`, date and timestamp columns will be formatted as ISO 8601 strings (e.g., `"2025-01-01T01:00:00.000Z"`). Defaults to `false`.
   * @returns A promise that resolves to the table, so methods can be chained.
   * @category File Operations
   *
   * @example
   * ```ts
   * // Write data to a CSV file
   * await table.writeData("./output.csv");
   * ```
   *
   * @example
   * ```ts
   * // Write data to a JSON file with GZIP compression.
   * // The output file will be named output.json.gz.
   * await table.writeData("./output.json", { compression: true });
   * ```
   *
   * @example
   * ```ts
   * // Write data to a Parquet file
   * await table.writeData("./output.parquet");
   * ```
   *
   * @example
   * ```ts
   * // Write data to a DuckDB database file
   * await table.writeData("./my_database.db");
   * ```
   *
   * @example
   * ```ts
   * // Write data to a SQLite database file
   * await table.writeData("./my_database.sqlite");
   * ```
   *
   * @example
   * ```ts
   * // Write JSON data with dates formatted as ISO strings
   * await table.writeData("./output_dates.json", { formatDates: true });
   * ```
   */
  async writeData(
    file: string,
    options: {
      compression?: boolean;
      dataAsArrays?: boolean;
      formatDates?: boolean;
    } = {},
  ): Promise<this> {
    await writeData(this, file, options);
    return this;
  }

  /**
   * Writes the table's geospatial data to a file in GeoJSON, GeoParquet, or Shapefile format.
   * If the specified path does not exist, it will be created.
   *
   * @param file - The absolute path to the output file (e.g., `"./output.geojson"`, `"./output.geoparquet"`, `"./shapefile-folder/output.shp"`, `"./output.shp.zip"`). A `.shp.zip` extension writes a ZIP archive using fast DEFLATE compression. Creating the archive temporarily requires enough disk space for both the uncompressed Shapefile and the ZIP, and ZIP archives are limited to 4 GB.
   * @param options - An optional object with configuration options:
   * @param options.precision - For GeoJSON, the maximum number of figures after the decimal separator to write in coordinates. Defaults to `undefined` (full precision).
   * @param options.compression - For GeoParquet, if `true`, uses ZSTD compression; otherwise, uses DuckDB's default SNAPPY compression. SNAPPY prioritizes faster compression, while ZSTD typically produces smaller files but takes longer to write. Read performance depends on the data and storage because smaller files can reduce I/O. This option is not supported for GeoJSON or Shapefiles. Defaults to `false`.
   * @param options.rewind - For GeoJSON, if `true`, rewinds the coordinates of polygons to follow the right-hand rule (RFC 7946). Defaults to `false`.
   * @param options.metadata - For GeoJSON, an object to be added as top-level metadata to the GeoJSON output.
   * @param options.formatDates - For GeoJSON, if `true`, formats date and timestamp columns to ISO 8601 strings. Defaults to `false`.
   * @returns A promise that resolves to the table, so methods can be chained.
   * @category File Operations
   *
   * @example
   * ```ts
   * // Write geospatial data to a GeoJSON file
   * await table.writeGeoData("./output.geojson");
   * ```
   *
   * @example
   * ```ts
   * // Write geospatial data to a ZSTD-compressed GeoParquet file
   * await table.writeGeoData("./output.geoparquet", { compression: true });
   * ```
   *
   * @example
   * ```ts
   * // Write geospatial data to a Shapefile with all relevant files  in the same folder
   * await table.writeGeoData("./shapefile-folder/output.shp");
   * ```
   *
   * @example
   * ```ts
   * // Write a Shapefile and its related files to output.shp.zip
   * await table.writeGeoData("./output.shp.zip");
   * ```
   *
   * @example
   * ```ts
   * // Write GeoJSON with specific precision and metadata
   * await table.writeGeoData("./output_high_precision.geojson", {
   *   precision: 6,
   *   metadata: { source: "SimpleDataAnalysis" },
   * });
   * ```
   */
  async writeGeoData(
    file: string,
    options: {
      precision?: number;
      compression?: boolean;
      rewind?: boolean;
      metadata?: unknown;
      formatDates?: boolean;
    } = {},
  ): Promise<this> {
    await writeGeoData(this, file, options);
    return this;
  }

  /**
   * Caches the results of computations in `./.sda-cache`.
   * You should add `./.sda-cache` to your `.gitignore` file.
   *
   * Cache entries are stored as DuckDB database files. Full-text search (FTS)
   * indexes are persisted in the cache file and restored directly on a cache
   * hit. Vector similarity search (VSS/HNSW) indexes are not persisted in the
   * cache file; their definitions are stored as metadata and used to rebuild
   * the indexes on every cache hit. If loading the entry or restoring its
   * indexes fails, the computation runs again and replaces the cache entry.
   *
   * `cache()` automatically tracks whether earlier SDA operations changed the
   * table. It also records every other already registered `SimpleTable` read
   * through `SimpleTable` methods while `compute` runs and invalidates the
   * cached step when any of their generations change. Tables created inside
   * `compute` are part of the computation itself and are not dependencies.
   *
   * `SimpleDB.customQuery()` bypasses this tracking. Reading or changing a
   * table with `customQuery()` can therefore return stale cached data. Include
   * a value that identifies the custom query's dependencies in `options.inputs`
   * (such as a table content hash), or use tracked `SimpleTable` methods.
   *
   * `compute` may modify only the table being cached. Other tables that existed
   * before `compute` must remain read-only. Temporary tables may be created and
   * modified inside `compute`, but they must be removed before it finishes
   * because a cache hit does not run `compute` again.
   *
   * @param compute - A function wrapping the computations to be cached. It receives the table on which `cache()` was called. This function will be executed on the first run or if the cached data is invalid/expired.
   * @param options - An optional object with configuration options:
   * @param options.inputs - An ordered array of additional values captured by `compute` that affect its result. Each position is compared structurally across runs, so adding, removing, moving, or changing an input invalidates the cache. Functions and class constructors are compared by source. `SimpleTable` dependencies read by `compute` are tracked automatically, and the table being cached is already tracked, so neither needs to be included here.
   * @param options.ttl - Cache lifetime in seconds. Omit for no expiration, use `0` to refresh the matching cache entry immediately, or provide a positive value to refresh once the entry reaches that age. The cache is also invalidated when the `compute` function, the table, or an input changes.
   * @returns A promise that resolves to the table, so methods can be chained.
   * @category Caching
   *
   * @example
   * ```ts
   * // Computations are re-run if the callback changes or earlier operations modify the table
   * const sdb = new SimpleDB();
   * const items = await sdb.newTable("items").cache((table) => {
   *   table
   *     .loadData("items.csv")
   *     .summarize({
   *       columns: "price",
   *       by: "department",
   *       stats: ["min", "max", "mean"],
   *     });
   * });
   * await items.log();
   *
   * // It's important to call close() on the SimpleDB instance to clean up the cache.
   * // This prevents the cache from growing indefinitely.
   * await sdb.close();
   * ```
   *
   * @example
   * ```ts
   * // Cache with a Time-To-Live (TTL) of 60 seconds
   * // The computations will be re-run if the cached data is older than 1 minute, the callback changes, or the table changes.
   * const sdb = new SimpleDB();
   * const table = await sdb.newTable().cache((table) => {
   *   table
   *     .loadData("items.csv")
   *     .summarize({
   *       columns: "price",
   *       by: "department",
   *       stats: ["min", "max", "mean"],
   *     });
   * }, { ttl: 60 });
   * await table.log();
   *
   * await sdb.close();
   * ```
   *
   * @example
   * ```ts
   * // Enable verbose logging for cache operations via SimpleDB instance
   * const sdb = new SimpleDB({ cacheVerbose: true });
   * const table = await sdb.newTable().cache((table) => {
   *   table
   *     .loadData("items.csv")
   *     .summarize({
   *       columns: "price",
   *       by: "department",
   *       stats: ["min", "max", "mean"],
   *     });
   * });
   * await table.log();
   *
   * await sdb.close();
   * ```
   *
   * @example
   * ```ts
   * // Read-only table dependencies are tracked automatically. Other captured values go in inputs.
   * const year = 2026;
   * const summary = await sdb.newTable("summary").cache(async (table) => {
   *   table.loadArray(
   *     await fires.getData({ conditions: `year = ${year}` }),
   *   );
   * }, { inputs: [year] });
   * await summary.log();
   * ```
   */
  async cache(
    compute: (table: this) => void | Promise<void>,
    options: {
      inputs?: readonly unknown[];
      ttl?: number;
    } = {},
  ): Promise<this> {
    await cache(this, compute, { ...options, verbose: this.sdb.cacheVerbose });
    return this;
  }

  /**
   * Logs a specified number of rows from the table to the console. By default, the first 10 rows are logged.
   * You can optionally log the column types and filter the data based on conditions.
   * You can also use JavaScript syntax for conditions (e.g., `&&`, `||`, `===`, `!==`).
   *
   * @param options - Either the number of rows to log (a specific number or `"all"`) or an object with configuration options:
   * @param options.count - The number of rows to log. Defaults to 10 or the value set in the SimpleDB instance. Use `"all"` to log all rows.
   * @param options.types - Whether to log the column types along with the data. Defaults to the value set in the SimpleDB instance.
   * @param options.conditions - A SQL `WHERE` clause condition to filter the data before logging. Defaults to no condition.
   * @returns A promise that resolves to the table, so methods can be chained.
   * @category Logging
   *
   * @example
   * ```ts
   * // Log the first 10 rows (default behavior)
   * await table.log();
   * ```
   *
   * @example
   * ```ts
   * // Log the first 50 rows
   * await table.log(50);
   * ```
   *
   * @example
   * ```ts
   * // Log all rows
   * await table.log("all");
   * ```
   *
   * @example
   * ```ts
   * // Log the first 20 rows and include column types
   * await table.log({ count: 20, types: true });
   * ```
   *
   * @example
   * ```ts
   * // Log rows where 'status' is 'active' (using JS syntax for conditions)
   * await table.log({ conditions: `status === 'active'` });
   * ```
   */
  async log(
    options: "all" | number | {
      count?: number | "all";
      types?: boolean;
      conditions?: string;
    } = {},
  ): Promise<this> {
    if (
      this.connection === undefined
    ) {
      await this.sdb.start();
      this.db = this.sdb.db;
      this.connection = this.sdb.connection;
    }
    if (this.connection === undefined) {
      throw new Error("this.connection is undefined");
    }

    let count: number;
    if (typeof options === "number") {
      count = options;
    } else if (options === "all") {
      count = await this.getRowCount();
    } else if (typeof options === "object") {
      if (options.count === "all") {
        count = await this.getRowCount();
      } else if (typeof options.count === "number") {
        count = options.count;
      } else {
        count = this.rowsToLog;
      }
    } else {
      count = this.rowsToLog;
    }
    const types = typeof options === "object"
      ? options.types ?? this.typesToLog
      : this.typesToLog;
    const conditions = typeof options === "object"
      ? options.conditions ?? undefined
      : undefined;

    if (
      this.connection === undefined ||
      !(await this.sdb.hasTable(this.name))
    ) {
      console.log(`\nTable ${this.name}: no data`);
    } else {
      console.log(`\nTable ${this.name}:`);
      conditions && console.log(`Conditions: ${conditions}`);
      const data = await this.getTop(count, { conditions });
      logData(
        types ? await this.getTypes() : null,
        data,
        this.charsToLog,
      );
      const rowCount = conditions
        ? parseInt(
          (await this.sdb.customQuery(
            `select count(*) as count from ${
              quoteIdentifier(this.name)
            } where ${conditions}`,
            { returnData: true },
          ) as { count: string }[])[0].count,
        )
        : await this.getRowCount();
      console.log(
        `${formatNumber(rowCount)} rows in total ${`(count: ${count}${
          typeof this.charsToLog === "number"
            ? `, charsToLog: ${this.charsToLog}`
            : ""
        })`}`,
      );
    }
    return this;
  }

  /**
   * Generates and logs a histogram of a numeric column to the console.
   *
   * @param values - The name of the numeric column for which to generate the histogram.
   * @param options - An optional object with configuration options:
   * @param options.bins - The number of bins (intervals) to use for the histogram. Defaults to 10.
   * @param options.formatLabels - A function to format the labels for the histogram bins. It receives the lower and upper bounds of each bin as arguments.
   * @param options.compact - If `true`, the histogram will be displayed in a more compact format. Defaults to `false`.
   * @param options.width - The maximum width of the histogram bars in characters.
   * @returns A promise that resolves when the histogram has been logged to the console.
   * @category Dataviz
   *
   * @example
   * // Basic histogram of the 'temperature' column
   * ```typescript
   * await table.logHistogram("temperature")
   * ```
   *
   * @example
   * // Histogram with 20 bins and custom label formatting
   * ```typescript
   * await table.logHistogram("age", {
   *   bins: 20,
   *   formatLabels: (min, max) => `${min}-${max} years`,
   * });
   * ```
   */
  /**
   * Logs descriptive information about the columns in the table to the console. This includes details such as data types, number of null values, and number of distinct values for each column.
   * It internally calls the `getDescription` method to retrieve the descriptive statistics.
   *
   * @returns A promise that resolves to the table, so methods can be chained.
   * @category Logging
   *
   * @example
   * ```ts
   * // Log descriptive information for all columns in the table
   * await table.logDescription();
   * ```
   */
  async logDescription(): Promise<this> {
    await this.run();
    if (
      this.connection === undefined ||
      !(await this.sdb.hasTable(this.name))
    ) {
      console.log(`\nTable ${this.name}: no data`);
    } else {
      console.log(`\nTable ${this.name}:`);
      logData(
        null,
        await getDescription(this),
        this.charsToLog,
      );
    }
    return this;
  }

  /**
   * Retrieves the projection of a specified geospatial column.
   *
   * @param column - The name of the geospatial column for which to retrieve the projection.
   * @returns A promise that resolves to the projection of the specified column.
   * @category Geospatial
   *
   * @example
   * ```ts
   * // Get the projection of the 'geom' column
   * const projection = await table.getProjection("geom");
   * ```
   */
  async getProjection(column: string): Promise<string> {
    const res = (await this.sdb.customQuery(
      `SELECT ST_CRS(${quoteIdentifier(column)}) AS proj FROM ${
        quoteIdentifier(this.name)
      } LIMIT 1;`,
      { returnData: true },
    ) as { proj: string | null }[])[0];
    const proj = res && res.proj !== "null" ? res.proj : null;

    return `GEOMETRY${proj ? `('${proj}')` : ""}`;
  }

  /**
   * Logs the projections of the geospatial data (if any) to the console.
   *
   * @returns A promise that resolves to the SimpleTable instance after logging the projections.
   * @category Logging
   *
   * @example
   * ```ts
   * // Log the geospatial projections of the table
   * await table.logProjections();
   * ```
   */
  async logProjections(): Promise<this> {
    console.log(`\nTable ${this.name} projections:`);
    const types = await this.getTypes();
    const geoColumns = Object.entries(types)
      .filter(([_, type]) => type.toLowerCase().includes("geometry"))
      .map(([column]) => column);

    if (geoColumns.length === 0) {
      console.log("No geometry columns found.");
    } else {
      for (const column of geoColumns) {
        const projection = types[column];
        console.log(`- Column ${quoteIdentifier(column)}: ${projection}`);
      }
    }

    return await this;
  }

  /**
   * Logs the types of all columns in the table to the console.
   *
   * @returns A promise that resolves to the SimpleTable instance after logging the column types.
   * @category Logging
   *
   * @example
   * ```ts
   * // Log the data types of all columns in the table
   * await table.logTypes();
   * ```
   */
  async logTypes(): Promise<this> {
    console.log(`\nTable ${this.name} types:`);
    console.log(await this.getTypes());
    return await this;
  }

  /**
   * Logs unique values for a specified column to the console. By default, a maximum of 100 values are logged (depending on your runtime).
   * You can optionally stringify the values to see them all.
   *
   * @param column - The name of the column from which to retrieve and log unique values.
   * @param options - An optional object with configuration options:
   * @param options.stringify - If `true`, converts the unique values to a JSON string before logging. Defaults to `false`.
   * @returns A promise that resolves to the SimpleTable instance after logging the unique values.
   * @category Logging
   *
   * @example
   * ```ts
   * // Logs unique values for the column "name"
   * await table.logUniques("name");
   * ```
   *
   * @example
   * ```ts
   * // Logs unique values for the column "name" and stringifies them
   * await table.logUniques("name", { stringify: true });
   * ```
   */
  async logUniques(
    column: string,
    options: { stringify?: boolean } = {},
  ): Promise<this> {
    const values = await this.getUniques(column);
    console.log(`\nTable ${this.name} — unique values in ${column}:`);
    if (options.stringify) {
      console.log(JSON.stringify(values, null, 2));
    } else {
      console.log(values);
    }
    return await this;
  }

  /**
   * Logs the columns in the table to the console. You can optionally include their data types.
   *
   * @param options - An optional object with configuration options:
   * @param options.types - If `true`, logs the column names along with their data types. Defaults to `false`.
   * @returns A promise that resolves to the SimpleTable instance after logging the columns.
   * @category Logging
   *
   * @example
   * ```ts
   * // Log only the column names
   * await table.logColumns();
   * ```
   *
   * @example
   * ```ts
   * // Log column names along with their types
   * await table.logColumns({ types: true });
   * ```
   */
  async logColumns(options: { types?: boolean } = {}): Promise<this> {
    console.log(`\nTable ${this.name} columns:`);
    if (options.types) {
      console.log(await this.getTypes());
    } else {
      console.log(await this.getColumns());
    }

    return await this;
  }

  /**
   * Logs the total number of rows in the table to the console.
   *
   * @returns A promise that resolves to the SimpleTable instance after logging the row count.
   * @category Logging
   *
   * @example
   * ```ts
   * // Log the total number of rows in the table
   * await table.logRowCount();
   * ```
   */
  async logRowCount(): Promise<this> {
    const rowCount = await this.getRowCount();
    console.log(`\nTable ${this.name}: ${formatNumber(rowCount)} rows.`);
    return await this;
  }

  /**
   * Logs the bottom `n` rows of the table to the console. By default, the last row will be returned first. To preserve the original order, use the `originalOrder` option.
   *
   * @param count - The number of rows to log from the bottom of the table. Defaults to the table's `rowsToLog` option if not specified.
   * @param options - An optional object with logging preferences.
   * @param options.originalOrder - If true, the rows are displayed in their original order (top to bottom). Defaults to false.
   * @returns A promise that resolves to the table, so methods can be chained.
   * @category Logging
   *
   * @example
   * ```ts
   * // Log bottom rows with default count (uses table's rowsToLog option)
   * await table.logBottom();
   * ```
   *
   * @example
   * ```ts
   * // Log the last 10 rows (displayed with last row first)
   * await table.logBottom(10);
   * ```
   *
   * @example
   * ```ts
   * // Log the last 5 rows in original order (top to bottom)
   * await table.logBottom(5, { originalOrder: true });
   * ```
   */
  async logBottom(
    count?: number,
    options: { originalOrder?: boolean } = {},
  ): Promise<this> {
    const rows = count ?? this.rowsToLog;
    console.log(`\nTable ${this.name} (${rows} bottom rows):`);
    const data = await this.getBottom(rows, options);
    logData(
      null,
      data,
      this.charsToLog,
    );
    return this;
  }

  /**
   * Logs the extent (minimum and maximum values) of a numeric column to the console.
   *
   * @param column - The name of the numeric column for which to log the extent.
   * @returns A promise that resolves to the table, so methods can be chained.
   * @category Logging
   *
   * @example
   * ```ts
   * // Log the extent of the 'price' column
   * await table.logExtent("price");
   * ```
   */
  async logExtent(column: string): Promise<this> {
    const extent = await this.getExtent(column);
    console.log(`\nTable ${this.name} (${column} extent):`);
    console.log(extent);
    return this;
  }
}
