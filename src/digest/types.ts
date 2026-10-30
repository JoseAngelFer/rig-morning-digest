/** Status values accepted at the reader boundary; other values are bad lines. */
export type DigestStatus = 'ok' | 'retry' | 'fail';

/** One job's valid records, aggregated in file order (not timestamp order). */
export interface DigestRow {
  job: string;
  /** Owner from the last valid record, including an explicit null. */
  owner: string | null;
  /** Number of valid records for this job, including retry and fail records. */
  runs: number;
  /** Number of this job's valid records whose status is retry. */
  retries: number;
  lastStatus: DigestStatus;
  /** Latest recorded error string; null if none. Later absent errors do not clear it. */
  lastError: string | null;
  /** First valid record's at string, verbatim, including its original offset. */
  firstAt: string;
  /** Last valid record's at string, verbatim, including its original offset. */
  lastAt: string;
}

/** An existing night; empty files return { rows: [], badLines: 0 }. */
export interface DigestResult {
  /** One row per job, ascending by job using case-sensitive string comparison. */
  rows: DigestRow[];
  /** Nonblank lines rejected for invalid JSON or invalid record shape. */
  badLines: number;
}

/**
 * Synchronously read runsDir/<night>.jsonl; night is a YYYY-MM-DD date key.
 * Missing files (ENOENT) return null, distinct from an existing empty night.
 * Other I/O errors propagate. Callers validate untrusted night/path input.
 *
 * The reader must validate parsed input before aggregation: each record is an
 * object with string at (timestamp with offset), string job, a DigestStatus,
 * owner (string or null), and optional string error. Missing error is allowed;
 * null/non-string error is invalid. Extra fields are ignored. Blank lines are
 * ignored; malformed records count once in badLines and contribute no row data.
 * An existing all-malformed file has empty rows and a positive badLines count.
 *
 * This is only a callable type, not a runtime reader export. Implementations
 * should export readNight from src/digest/reader.ts with this signature; consumers
 * import that value from './reader.js', or inject a ReadNight test double. Import
 * contracts with `import type { ReadNight } from './types.js'`.
 */
export type ReadNight = (runsDir: string, night: string) => DigestResult | null;
