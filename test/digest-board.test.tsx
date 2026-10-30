import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('digest links and final status counts', () => {
  it('links nights and counts each job once by its final status', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-board-'));
    dirs.push(runsDir);
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      '{"at":"2026-10-28T01:00:00+01:00","job":"a","status":"retry","owner":"lane"}',
      '{"at":"2026-10-28T01:01:00+01:00","job":"a","status":"ok","owner":"lane"}',
      '{"at":"2026-10-28T01:02:00+01:00","job":"b","status":"fail","owner":"lane"}',
    ].join('\n'));
    writeFileSync(join(runsDir, '2026-10-27.jsonl'), '');

    const res = await createApp({ ...config, runsDir }).request('/');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('final job status counts');
    expect(html).toContain('ok 1 · retry 0 · fail 1');
    expect(html).toContain('ok 0 · retry 0 · fail 0');
    expect(html.indexOf('2026-10-28')).toBeLessThan(html.indexOf('2026-10-27'));
  });

  it('renders an empty board for a missing or malformed runs directory', async () => {
    const runsDir = join(tmpdir(), 'rig-board-does-not-exist');
    const res = await createApp({ ...config, runsDir }).request('/');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('nothing in runs/');
  });
});
