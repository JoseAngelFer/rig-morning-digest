import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight } from './types.js';

interface RunRecord {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
}

function isDateKey(value: string): boolean {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  return match !== null && match[0] === value && isDateKey(match[1]);
}

function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return isTimestamp(record.at)
    && typeof record.job === 'string' && record.job.trim().length > 0
    && (record.status === 'ok' || record.status === 'retry' || record.status === 'fail')
    && (typeof record.owner === 'string' || record.owner === null)
    && (!('error' in record) || typeof record.error === 'string');
}

/** Invalid night keys throw RangeError before any file access. */
export const readNight: ReadNight = (runsDir, night) => {
  if (typeof night !== 'string' || !isDateKey(night)) {
    throw new RangeError('night must be a valid YYYY-MM-DD date key');
  }

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const jobs = new Map<string, DigestRow>();
  let badLines = 0;
  for (const line of contents.split('\n')) {
    if (line.trim().length === 0) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      badLines++;
      continue;
    }
    if (!isRunRecord(record)) {
      badLines++;
      continue;
    }

    const row = jobs.get(record.job);
    if (row) {
      row.owner = record.owner;
      row.runs++;
      row.retries += record.status === 'retry' ? 1 : 0;
      row.lastStatus = record.status;
      if (record.error !== undefined) row.lastError = record.error;
      row.lastAt = record.at;
    } else {
      jobs.set(record.job, {
        job: record.job,
        owner: record.owner,
        runs: 1,
        retries: record.status === 'retry' ? 1 : 0,
        lastStatus: record.status,
        lastError: record.error ?? null,
        firstAt: record.at,
        lastAt: record.at,
      });
    }
  }

  return {
    rows: [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0),
    badLines,
  };
};
