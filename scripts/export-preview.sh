#!/usr/bin/env bash
# Requires the real service on loopback (PORT defaults to 8787). Never writes inside the checkout.
set -euo pipefail
umask 077

if [[ $# != 1 ]]; then
  echo 'usage: bash scripts/export-preview.sh /absolute/private/destination' >&2
  exit 1
fi
case "${INCLUDE_MARKER:-false}" in
  true|false) ;;
  *) echo 'INCLUDE_MARKER must be true or false' >&2; exit 1 ;;
esac
export INCLUDE_MARKER="${INCLUDE_MARKER:-false}"
port=${PORT:-8787}
[[ "$port" =~ ^[1-9][0-9]{0,4}$ ]] && (( port <= 65535 )) || {
  echo 'PORT must be an integer from 1 to 65535' >&2; exit 1;
}
repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
destination=$(realpath -m -- "$1")
case "$destination/" in
  "$repo/"*) echo 'Preview destination must be outside the checkout' >&2; exit 1 ;;
esac
[[ "$1" = /* ]] || { echo 'Destination must be absolute' >&2; exit 1; }
mkdir -p -- "$destination"
chmod 700 -- "$destination"
# Resolve again after mkdir so symlinked parent directories cannot bypass the check.
destination=$(realpath -- "$destination")
case "$destination/" in
  "$repo/"*) echo 'Preview destination must be outside the checkout' >&2; exit 1 ;;
esac
partial=$(mktemp "$destination/.preview.XXXXXX")
trap 'rm -f -- "$partial"' EXIT
curl --fail --silent --show-error --max-time 30 \
  --output "$partial" "http://127.0.0.1:$port/digest/2026-10-28"
node --input-type=module - "$partial" <<'NODE'
import { readFileSync } from 'node:fs';
const html = readFileSync(process.argv[2], 'utf8');
const check = (condition, message) => {
  if (!condition) { console.error(`Preview validation failed: ${message}`); process.exit(1); }
};
check(/^<!doctype html>/i.test(html) && /<\/html>\s*$/i.test(html), 'HTML document');
check((html.match(/<style\b/gi) ?? []).length === 1, 'one inline stylesheet');
// Intentionally conservative: static text, inline CSS and local navigation only.
check(!/<\s*(script|link|img|picture|source|iframe|frame|object|embed|audio|video|base|svg)\b/i.test(html), 'no scripts or dependent assets');
check(!/\s(?:on[\w-]+|src|srcset|poster|background)\s*=/i.test(html), 'no active/resource attributes');
check(!/(?:\burl\s*\(|@import\b|\bjavascript\s*:)/i.test(html), 'no external CSS or script URLs');
check(!/<meta\b[^>]*http-equiv/i.test(html), 'no refresh');
check(!/href\s*=\s*["']?(?!#)[^\s>]/i.test(html), 'no dependent links');
check(html.includes('digest · 2026-10-28'), 'sample night');
const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
  .map(match => [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(cell => cell[1]))
  .filter(cells => cells.length);
const jobs = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];
check(rows.length === jobs.length && rows.every((row, i) => row[0] === jobs[i]), 'five sorted sample jobs');
check(rows[0][1] === '—', 'missing owner rendered as em dash');
const escape = value => value.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const marker = process.env.LANE_MARKER?.trim();
if (process.env.INCLUDE_MARKER === 'true') {
  check(Boolean(marker), 'requested marker secret is missing or blank');
  check(html.includes(`<span class="marker">${escape(marker)}</span>`), 'requested lane banner');
} else {
  check(html.includes('<span class="marker">no marker set</span>'), 'marker-free lane banner');
}
console.log('Preview validated (content and marker not printed).');
NODE
mv -- "$partial" "$destination/index.html"
chmod 600 -- "$destination/index.html"
