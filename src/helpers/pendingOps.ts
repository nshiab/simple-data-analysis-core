import type { DuckDBValue } from "@duckdb/node-api";

/**
 * The types of a table's schema, as returned by DESCRIBE: column names mapped
 * to DuckDB types (e.g., { name: "VARCHAR", salary: "BIGINT" }).
 */
export type TableSchema = { [column: string]: string };

/**
 * A queued operation that can be expressed as a single SELECT over its input.
 * At flush time, consecutive fusable operations on the same table are
 * composed as CTEs into one statement.
 */
export type FusableOp = {
  kind: "fusable";
  /** The SDA method that queued the operation (e.g., "filter()"). */
  method: string;
  /** The parameters passed to the method, for error reporting. */
  parameters: { [key: string]: unknown } | null;
  /**
   * The operation's position in program order across all tables of the
   * database, stamped by queueOp.
   */
  sequence: number;
  /**
   * Whether buildSelect needs the schema of its input relation. When `false`,
   * the flush compiler skips the DESCRIBE round-trip and passes an empty
   * schema.
   */
  needsSchema: boolean;
  /**
   * Whether the SELECT uses spatial functions. The flush compiler loads the
   * spatial extension once per connection before executing such operations.
   */
  needsSpatial?: boolean;
  /**
   * The user-supplied SQL fragments embedded verbatim in the SELECT (e.g.,
   * filter conditions, addColumn definitions). Such SQL can reference tables
   * by name, and names don't follow a fused chain: a subquery on the
   * operation's own table would read the pre-chain state instead of the
   * previous step's output. The flush compiler scans these fragments and
   * executes the operation against materialized tables when they reference
   * one.
   */
  rawSQL?: string[];
  /**
   * Whether the operation's fused segment must be rooted in a materialized
   * table rather than an external source. Used when DuckDB's source execution
   * shape affects an observable result such as deterministic sampled-row
   * order.
   */
  requiresMaterializedInput?: boolean;
  /** Data values bound to placeholders in this operation's SELECT. */
  values?: DuckDBValue[] | ((schema: TableSchema) => DuckDBValue[]);
  /**
   * Whether the SELECT returns exactly the schema of its input (same columns,
   * same types), like `SELECT * REPLACE` with type-preserving expressions.
   * The flush compiler reuses the schema across consecutive
   * schema-preserving operations instead of running a DESCRIBE per step.
   */
  preservesSchema?: boolean;
  /**
   * Returns a single SELECT statement over `input`, which is either the
   * quoted table name or the alias of the previous CTE in the fused chain.
   */
  buildSelect: (input: string, schema: TableSchema) => string;
};

/**
 * A queued operation that starts a fused segment from an external relational
 * source instead of consuming the target table's current contents.
 */
export type SourceOp = {
  kind: "source";
  /** The SDA method that queued the source (e.g., "loadData()"). */
  method: string;
  /** The parameters passed to the method, for error reporting. */
  parameters: { [key: string]: unknown } | null;
  /** The operation's position in database-wide program order. */
  sequence: number;
  /** Whether the source SELECT uses spatial functions. */
  needsSpatial?: boolean;
  /**
   * User-supplied SQL fragments or table names read by the source. They close
   * pending segments for those tables before the source executes.
   */
  rawSQL?: string[];
  /** Data values bound to placeholders in the source SELECT. */
  values?: DuckDBValue[];
  /** Returns the source as a single composable SELECT statement. */
  buildSelect: () => string;
};

/** A relational operation that can participate in a fused segment. */
export type RelationalOp = SourceOp | FusableOp;

/**
 * A queued operation that is multi-statement by nature (or otherwise cannot
 * be expressed as a single SELECT). Barriers execute in order between fused
 * segments.
 */
export type BarrierOp = {
  kind: "barrier";
  /** The SDA method that queued the operation (e.g., "loadData()"). */
  method: string;
  /** The parameters passed to the method, for error reporting. */
  parameters: { [key: string]: unknown } | null;
  /**
   * The operation's position in program order across all tables of the
   * database, stamped by queueOp.
   */
  sequence: number;
  /** Executes the operation. */
  execute: () => Promise<void>;
};

/**
 * An asynchronous extension barrier whose callback can queue builder methods.
 * Nested operations drain before the callback observes the database and before
 * the original chain continues.
 */
export type AsyncBarrierOp = {
  kind: "asyncBarrier";
  /** The extension method that queued the operation. */
  method: string;
  /** The parameters passed to the extension method, for error reporting. */
  parameters: { [key: string]: unknown } | null;
  /** The operation's position in database-wide program order. */
  sequence: number;
  /** Executes the asynchronous extension operation. */
  execute: () => Promise<void>;
};

/**
 * An operation queued by a sync builder or extension method, executed when
 * the pending chains are flushed at an observation point.
 */
export type PendingOp = RelationalOp | BarrierOp | AsyncBarrierOp;

/**
 * A pending operation as built by a sync builder or extension method, before
 * queueOp stamps it with its program-order sequence.
 */
export type PendingOpInput =
  | Omit<FusableOp, "sequence">
  | Omit<SourceOp, "sequence">
  | Omit<BarrierOp, "sequence">
  | Omit<AsyncBarrierOp, "sequence">;
