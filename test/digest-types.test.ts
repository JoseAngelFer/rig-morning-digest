import { expect, expectTypeOf, it } from 'vitest';
import type { DigestResult, DigestRow, DigestStatus, ReadNight } from '../src/digest/types.js';
import * as contract from '../src/digest/types.js';

it('supports synchronous reader implementations and representative results', () => {
  const row = {
    job: 'backup',
    owner: null,
    runs: 3,
    retries: 1,
    lastStatus: 'ok',
    lastError: null,
    firstAt: '2026-10-28T01:00:00+01:00',
    lastAt: '2026-10-28T02:00:00+01:00',
  } satisfies DigestRow;
  const results = {
    populated: { rows: [row], badLines: 0 },
    empty: { rows: [], badLines: 0 },
    malformed: { rows: [row], badLines: 2 },
    allMalformed: { rows: [], badLines: 1 },
    missing: null,
  } satisfies Record<string, DigestResult | null>;
  const readNight: ReadNight = (_runsDir, night) =>
    results[night as keyof typeof results] ?? null;

  expectTypeOf<Parameters<ReadNight>>().toEqualTypeOf<[runsDir: string, night: string]>();
  expectTypeOf<ReturnType<ReadNight>>().toEqualTypeOf<DigestResult | null>();
  expectTypeOf<Exclude<DigestStatus, 'ok' | 'retry' | 'fail'>>().toEqualTypeOf<never>();
  for (const lastStatus of ['ok', 'retry', 'fail'] as const) {
    expectTypeOf({ ...row, lastStatus, lastError: 'recorded error' }).toExtend<DigestRow>();
  }

  // These assertions are checked by tsc, not just the test runner.
  // @ts-expect-error Unknown statuses cannot cross the typed boundary.
  const invalidStatus: DigestRow = { ...row, lastStatus: 'pending' };
  // @ts-expect-error Owner must be a string or null.
  const invalidOwner: DigestRow = { ...row, owner: 42 };
  // @ts-expect-error Aggregated errors are required, with null for no error.
  const missingError: DigestRow = { job: 'backup', owner: null, runs: 0, retries: 0, lastStatus: 'ok', firstAt: '', lastAt: '' };
  // @ts-expect-error Consumers must not assume a Promise-based reader.
  const asyncReader: ReadNight = async () => results.empty;
  void [invalidStatus, invalidOwner, missingError, asyncReader];

  expect(readNight('unused', 'populated')?.rows[0].firstAt).toBe('2026-10-28T01:00:00+01:00');
  expect(readNight('unused', 'empty')).toEqual({ rows: [], badLines: 0 });
  expect(readNight('unused', 'malformed')?.badLines).toBe(2);
  expect(readNight('unused', 'allMalformed')).toEqual({ rows: [], badLines: 1 });
  expect(readNight('unused', 'missing')).toBeNull();
});

it('does not export a declaration-only or placeholder runtime reader', () => {
  expect('readNight' in contract).toBe(false);
});
