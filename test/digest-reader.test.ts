import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';
import type { ReadNight } from '../src/digest/types.js';

const night = '2026-10-28';
const valid = {
  at: '2026-10-28T23:00:06+01:00',
  job: 'lane/sync',
  status: 'ok',
  owner: 'rook',
};

it('implements the synchronous shared reader contract', () => {
  expectTypeOf<typeof readNight>().toEqualTypeOf<ReadNight>();
});

it('reads the real night without changing it: 15 records, five jobs, one bad line', () => {
  const result = readNight(fileURLToPath(new URL('../runs', import.meta.url)), night);
  expect(result).toEqual({
    badLines: 1,
    rows: [
      {
        job: 'digest/render', owner: null, runs: 1, retries: 0,
        lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
      },
      {
        job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
        lastStatus: 'ok', lastError: 'upstream 503',
        firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'lane/sync', owner: 'rook', runs: 8, retries: 1,
        lastStatus: 'ok', lastError: 'lock held',
        firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0,
        lastStatus: 'fail', lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0,
        lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
      },
    ],
  });
  expect(result?.rows.reduce((total, row) => total + row.runs, 0)).toBe(15);
});

describe('reader with temporary logs', () => {
  let root: string;
  let runsDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rig-reader-'));
    runsDir = join(root, 'runs');
    mkdirSync(runsDir);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeLog(contents: string, key = night): void {
    writeFileSync(join(runsDir, `${key}.jsonl`), contents);
  }

  function writeRecords(records: readonly unknown[], key = night): void {
    writeLog(records.map(record => JSON.stringify(record)).join('\n'), key);
  }

  it('returns null for missing files, including an absent runs directory', () => {
    expect(readNight(runsDir, night)).toBeNull();
    expect(readNight(join(root, 'missing'), night)).toBeNull();
  });

  it('propagates non-ENOENT I/O errors', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow(expect.objectContaining({ code: 'EISDIR' }));
  });

  it.each(['', '\n\r\n \t\r\n'])('represents an empty or blank-only night (%j)', contents => {
    writeLog(contents);
    expect(readNight(runsDir, night)).toEqual({ rows: [], badLines: 0 });
  });

  it('counts every nonblank malformed line in an all-malformed file', () => {
    writeLog('{\n\nnull\r\n[]\n{"at":\n \t\n');
    expect(readNight(runsDir, night)).toEqual({ rows: [], badLines: 4 });
  });

  const invalidRecords: [string, unknown][] = [
    ['null', null], ['array', []], ['string', 'record'], ['number', 42], ['boolean', false],
    ['empty object', {}],
    ['numeric timestamp', { ...valid, at: 42 }],
    ['null timestamp', { ...valid, at: null }],
    ['numeric job', { ...valid, job: 42 }],
    ['null job', { ...valid, job: null }],
    ['empty job', { ...valid, job: '' }],
    ['blank job', { ...valid, job: ' \t\r\n' }],
    ['unknown status', { ...valid, status: 'pending' }],
    ['uppercase status', { ...valid, status: 'OK' }],
    ['null status', { ...valid, status: null }],
    ['numeric status', { ...valid, status: 1 }],
    ['numeric owner', { ...valid, owner: 42 }],
    ['object owner', { ...valid, owner: {} }],
    ['boolean owner', { ...valid, owner: false }],
    ['null error', { ...valid, error: null }],
    ['numeric error', { ...valid, error: 42 }],
    ['array error', { ...valid, error: [] }],
    ...['at', 'job', 'status', 'owner'].map((field): [string, unknown] => [
      `missing ${field}`, Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field)),
    ]),
  ];

  it.each(invalidRecords)('rejects %s once and continues with later valid records', (_name, record) => {
    writeRecords([valid, record, { ...valid, owner: null }]);
    expect(readNight(runsDir, night)).toEqual({
      badLines: 1,
      rows: [{
        job: valid.job, owner: null, runs: 2, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: valid.at, lastAt: valid.at,
      }],
    });
  });

  it('ignores blank lines, handles CRLF, and continues after malformed JSON', () => {
    writeLog(` \t\r\n${JSON.stringify(valid)}\r\n{bad json\r\n\r\n${JSON.stringify(valid)}`);
    const result = readNight(runsDir, night);
    expect(result?.badLines).toBe(1);
    expect(result?.rows).toHaveLength(1);
    expect(result?.rows[0].runs).toBe(2);
  });

  it('aggregates in file order, preserving offsets, last owner, and latest error after success', () => {
    const firstAt = '2026-10-29T05:30:00.123456+05:45';
    const lastAt = '2026-10-28T01:00:00-03:30';
    writeRecords([
      { ...valid, at: firstAt, status: 'fail', error: 'first failure' },
      { ...valid, status: 'retry', error: 'latest failure' },
      { ...valid, status: 'retry', owner: 'new owner' },
      { ...valid, at: lastAt, owner: null },
    ]);
    expect(readNight(runsDir, night)).toEqual({
      badLines: 0,
      rows: [{
        job: valid.job, owner: null, runs: 4, retries: 2, lastStatus: 'ok',
        lastError: 'latest failure', firstAt, lastAt,
      }],
    });
  });

  it.each(['ok', 'retry', 'fail'])('accepts and retains final status %s', status => {
    writeRecords([{ ...valid, status, owner: null }]);
    expect(readNight(runsDir, night)?.rows[0]).toEqual({
      job: valid.job, owner: null, runs: 1, retries: status === 'retry' ? 1 : 0,
      lastStatus: status, lastError: null, firstAt: valid.at, lastAt: valid.at,
    });
  });

  it('accepts extra fields and empty string owners/errors without discarding them', () => {
    writeRecords([
      { ...valid, owner: null, error: 'failure', extra: { ignored: true } },
      { ...valid, owner: '', error: '' },
      { ...valid, owner: '' },
    ]);
    expect(readNight(runsDir, night)?.rows[0]).toMatchObject({
      owner: '', runs: 3, lastError: '',
    });
    expect(readNight(runsDir, night)?.badLines).toBe(0);
  });

  it('keeps arbitrary job keys distinct and sorts by case-sensitive string comparison', () => {
    const jobs = ['toString', '__proto__', 'a', 'Z', '2', 'constructor', 'é', 'A', '10', ' job '];
    writeRecords([...jobs, '__proto__'].map(job => ({ ...valid, job })));
    const result = readNight(runsDir, night);
    expect(result?.badLines).toBe(0);
    expect(result?.rows.map(row => row.job)).toEqual([
      ' job ', '10', '2', 'A', 'Z', '__proto__', 'a', 'constructor', 'toString', 'é',
    ]);
    expect(result?.rows.find(row => row.job === '__proto__')?.runs).toBe(2);
  });

  it.each([
    '2026-10-28T23:00:06Z',
    '2026-10-28T23:00:06.000+00:00',
    '2026-10-28T23:00:06-00:00',
    '2024-02-29T00:00:00+14:00',
    '2000-02-29T23:59:59-12:00',
  ])('accepts an offset timestamp verbatim: %s', at => {
    writeRecords([{ ...valid, at }]);
    expect(readNight(runsDir, night)?.rows[0]).toMatchObject({ firstAt: at, lastAt: at });
    expect(readNight(runsDir, night)?.badLines).toBe(0);
  });

  it.each([
    '', 'not a timestamp', '2026-10-28', '2026-10-28T23:00:06',
    '2026-10-28 23:00:06+01:00', '2026-10-28T23:00+01:00',
    '2026-10-28T23:00:06+0100', '2026-10-28T23:00:06+24:00',
    '2026-10-28T23:00:06+01:60', '2026-10-28T24:00:00Z',
    '2026-10-28T23:60:00Z', '2026-10-28T23:00:60Z',
    '2026-10-28T23:00:06.Z', '2026-10-28T23:00:06Z\n',
    ' 2026-10-28T23:00:06Z', '2026-10-28T23:00:06Zgarbage',
    '2026-02-29T00:00:00Z', '1900-02-29T00:00:00Z',
    '2026-04-31T00:00:00Z', '2026-00-01T00:00:00Z',
    '2026-13-01T00:00:00Z', '2026-10-00T00:00:00Z',
  ])('counts invalid timestamps without affecting aggregation: %j', at => {
    writeRecords([{ ...valid, at }, valid]);
    expect(readNight(runsDir, night)?.badLines).toBe(1);
    expect(readNight(runsDir, night)?.rows[0]).toMatchObject({
      runs: 1, firstAt: valid.at, lastAt: valid.at,
    });
  });

  it.each([
    '', '.', '..', '../2026-10-28', '../../2026-10-28', '/2026-10-28',
    '..\\2026-10-28', '2026-10-28/../2026-10-29', '2026-10-28.jsonl',
    '2026-10-28\0', '2026-10-28\n', ' 2026-10-28', '2026-10-28 ',
    '2026-1-28', '２０２６-１０-２８', '2026-02-29', '1900-02-29',
    '2026-04-31', '2026-00-01', '2026-13-01', '2026-10-00',
  ])('rejects invalid direct-call night keys before reading: %j', key => {
    writeFileSync(join(root, `${night}.jsonl`), JSON.stringify(valid));
    expect(() => readNight(runsDir, key)).toThrow(RangeError);
    expect(() => readNight(join(root, 'missing'), key)).toThrow(RangeError);
  });

  it.each(['2024-02-29', '2000-02-29'])('accepts valid leap-day night keys: %s', key => {
    writeRecords([valid], key);
    expect(readNight(runsDir, key)?.rows).toHaveLength(1);
  });
});
