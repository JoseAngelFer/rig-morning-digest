import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestResult } from '../src/digest/types.js';

const config = (runsDir: string) => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

const temporaryDirectories: string[] = [];

async function temporaryRuns(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeNight(runsDir: string, night: string, contents: string): Promise<void> {
  await writeFile(join(runsDir, `${night}.jsonl`), contents, 'utf8');
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('digest routes', () => {
  it('returns matching sorted rows from the real reader in HTML and JSON', async () => {
    const runsDir = await temporaryRuns();
    const night = '2026-10-28';
    await writeNight(
      runsDir,
      night,
      [
        JSON.stringify({ at: '2026-10-28T04:00:00-04:00', job: 'zeta', status: 'ok', owner: 'zoe' }),
        JSON.stringify({ at: '2026-10-28T01:00:00+01:00', job: 'beta', status: 'retry', owner: null, error: 'first beta error' }),
        JSON.stringify({ at: '2026-10-28T02:00:00+01:00', job: 'alpha', status: 'retry', owner: 'ann', error: 'alpha recorded error' }),
        JSON.stringify({ at: '2026-10-28T03:00:00+01:00', job: 'beta', status: 'retry', owner: null, error: 'second beta error' }),
        JSON.stringify({ at: '2026-10-28T02:30:00+01:00', job: 'alpha', status: 'retry', owner: 'ann', error: 'same alpha error' }),
        JSON.stringify({ at: '2026-10-28T03:30:00+01:00', job: 'alpha', status: 'ok', owner: null }),
        JSON.stringify({ at: '2026-10-28T05:00:00+01:00', job: 'xss <job>', status: 'ok', owner: '<owner> &', error: '<unsafe>' }),
        JSON.stringify({ at: '2026-10-28T02:00:00+01:00', job: 'beta', status: 'retry', owner: null, error: 'third beta error' }),
        JSON.stringify({ at: '2026-10-28T04:30:00+01:00', job: 'beta', status: 'fail', owner: null, error: 'final beta failure' }),
      ].join('\n') + '\n',
    );

    const app = createApp(config(runsDir));
    const [pageResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await pageResponse.text();
    const json: unknown = await jsonResponse.json();
    const expected: DigestResult = {
      rows: [
        {
          job: 'alpha', owner: null, runs: 3, retries: 2, lastStatus: 'ok',
          lastError: 'alpha recorded error', firstAt: '2026-10-28T02:00:00+01:00', lastAt: '2026-10-28T03:30:00+01:00',
        },
        {
          job: 'beta', owner: null, runs: 4, retries: 3, lastStatus: 'fail',
          lastError: 'final beta failure', firstAt: '2026-10-28T01:00:00+01:00', lastAt: '2026-10-28T04:30:00+01:00',
        },
        {
          job: 'xss <job>', owner: '<owner> &', runs: 1, retries: 0, lastStatus: 'ok',
          lastError: '<unsafe>', firstAt: '2026-10-28T05:00:00+01:00', lastAt: '2026-10-28T05:00:00+01:00',
        },
        {
          job: 'zeta', owner: 'zoe', runs: 1, retries: 0, lastStatus: 'ok',
          lastError: null, firstAt: '2026-10-28T04:00:00-04:00', lastAt: '2026-10-28T04:00:00-04:00',
        },
      ],
      badLines: 0,
    };

    expect(pageResponse.status).toBe(200);
    expect(pageResponse.headers.get('content-type')).toMatch(/text\/html/);
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-type')).toMatch(/application\/json/);
    expect(json).toEqual(expected);

    expect(html).toContain('alpha');
    expect(html).toContain('beta');
    expect(html).toContain('xss &lt;job&gt;');
    expect(html).not.toContain('<job>');
    expect(html).toContain('&lt;owner&gt; &amp;');
    expect(html).toContain('—');
    expect(html).toContain('alpha recorded error');
    expect(html).toContain('final beta failure');
    expect(html).toContain('2026-10-28T02:00:00+01:00');
    expect(html).toContain('2026-10-28T03:30:00+01:00');
    expect(html).toContain('2026-10-28T04:00:00-04:00');
    expect(html).toContain('3');
    expect(html).toContain('2');
    expect(html).toContain('fail');
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('beta'));
    expect(html.indexOf('beta')).toBeLessThan(html.indexOf('xss &lt;job&gt;'));
    expect(html.indexOf('xss &lt;job&gt;')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toMatch(/beta[\s\S]*?(?:retry|warning|fail)/i);
  });

  it('returns safe 404 responses for missing and invalid nights', async () => {
    const runsDir = await temporaryRuns();
    const app = createApp(config(runsDir));

    for (const night of ['2026-10-28', 'not-a-night']) {
      const pageResponse = await app.request(`/digest/${night}`);
      const jsonResponse = await app.request(`/api/digest/${night}`);
      expect(pageResponse.status).toBe(404);
      expect(jsonResponse.status).toBe(404);
      expect(jsonResponse.headers.get('content-type')).toMatch(/application\/json/);
      await expect(jsonResponse.json()).resolves.toBeTruthy();
    }
  });

  it('renders an existing empty night as nothing ran and empty JSON', async () => {
    const runsDir = await temporaryRuns();
    await writeNight(runsDir, '2026-10-28', '');
    const app = createApp(config(runsDir));

    const pageResponse = await app.request('/digest/2026-10-28');
    const jsonResponse = await app.request('/api/digest/2026-10-28');
    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({ rows: [], badLines: 0 });
  });

  it('keeps valid records when JSON and record shapes are malformed', async () => {
    const runsDir = await temporaryRuns();
    await writeNight(
      runsDir,
      '2026-10-28',
      [
        JSON.stringify({ at: '2026-10-28T01:00:00+01:00', job: 'kept', status: 'ok', owner: null }),
        '{not json}',
        JSON.stringify({ at: '2026-10-28T02:00:00+01:00', job: 'bad-status', status: 'pending', owner: 'nobody' }),
        JSON.stringify({ at: '2026-10-28T03:00:00+01:00', job: 'bad-error', status: 'ok', owner: 'nobody', error: null }),
      ].join('\n') + '\n',
    );
    const app = createApp(config(runsDir));

    const pageResponse = await app.request('/digest/2026-10-28');
    const jsonResponse = await app.request('/api/digest/2026-10-28');
    const html = await pageResponse.text();
    expect(pageResponse.status).toBe(200);
    expect(html).toContain('kept');
    expect(html).not.toContain('bad-status');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({
      rows: [{
        job: 'kept', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T01:00:00+01:00', lastAt: '2026-10-28T01:00:00+01:00',
      }],
      badLines: 3,
    });
  });
});
