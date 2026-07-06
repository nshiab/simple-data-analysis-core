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
   * Returns a single SELECT statement over `input`, which is either the
   * quoted table name or the alias of the previous CTE in the fused chain.
   */
  buildSelect: (input: string, schema: TableSchema) => string;
};

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
 * An operation queued by a sync builder method, executed when the pending
 * chains are flushed at an observation point.
 */
export type PendingOp = FusableOp | BarrierOp;

/**
 * A pending operation as built by a sync builder method, before queueOp
 * stamps it with its program-order sequence.
 */
export type PendingOpInput =
  | Omit<FusableOp, "sequence">
  | Omit<BarrierOp, "sequence">;
