import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type FinalStatusCounts = {
  ok: number;
  retry: number;
  fail: number;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: string[];
  counts: Record<string, FinalStatusCounts>;
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function finalStatusCounts(runsDir: string, night: string): FinalStatusCounts | null {
  try {
    const result = readNight(runsDir, night);
    if (result === null) return null;
    const counts: FinalStatusCounts = { ok: 0, retry: 0, fail: 0 };
    for (const row of result.rows) counts[row.lastStatus]++;
    return counts;
  } catch {
    return null;
  }
}

export function readStatus(config: RigConfig): Status {
  const candidates = nightsOnDisk(config.runsDir);
  const nights: string[] = [];
  const counts: Record<string, FinalStatusCounts> = {};
  for (const night of candidates) {
    const nightCounts = finalStatusCounts(config.runsDir, night);
    if (nightCounts !== null) {
      nights.push(night);
      counts[night] = nightCounts;
    }
  }

  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
    counts,
  };
}
