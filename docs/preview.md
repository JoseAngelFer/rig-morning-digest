# Review preview (issue #7)

**Preparation only: human publication approval is still pending.** Committing this code
is not approval. Do not dispatch, publish, change repository settings/secrets, or set up
external services until the human/coordinator explicitly approves those actions.
Issue #7 stays open until its Done when conditions hold AND the reviewer has looked.
The course rejected closing it on delivery alone; sending the link is not review completion.

## Approved manual publication

After implementation/tests and separate recorded approval:

1. Confirm the approved destination is this repository's GitHub Pages HTTPS site and that
   the same URL can be replaced for cleanup. Record the approval, selected commit/ref,
   cleanup owner (#8), and destination, **not** the marker or HTML.
2. An authorized human/coordinator must confirm Pages is configured for **GitHub Actions**
   (not a branch). Any settings, environment protection, or repository `LANE_MARKER` secret
   changes need their own authorization. The workflow does not enable Pages automatically.
3. Manually dispatch **Review preview** (`.github/workflows/preview.yml`) on the reviewed ref.
   Set `include_marker: true` only for approved banner-bearing review publication; it fails
   if the repository secret `LANE_MARKER` is absent/blank. `false` is the default and publishes
   the same sample page **without** the marker. Both choices publish publicly and require
   approval. There is no push trigger and no arbitrary URL/path input.
4. Honor any `github-pages` environment review gate. The workflow serializes Pages
   deployments, tests/typechecks, starts the real service on loopback without dotenv,
   command-fetches `/digest/2026-10-28`, validates the document, and deploys only an Actions
   Pages artifact. It never commits HTML or deploys a `gh-pages` branch.

The generated directory is private under `RUNNER_TEMP`; only `index.html` is uploaded.
The upload artifact has one-day retention. Service output is private temporary output,
not printed. Do not enable shell tracing or dump environment/HTML into Actions logs.

## Verify, deliver, and remove retained copies

After a successful deployment, use the deployment step/environment's actual `page_url`.
Confirm it is HTTPS on a real approved hostname (not an IP/localhost). Fetch it with curl
into a private temporary file **outside the repository**; check HTTP success and compare
against the approved sample: five sorted jobs, missing owner `—`, inline CSS, no scripts or
dependent assets, and the intended lane banner. Check marker presence/absence privately,
never print its value or attach the HTML. Record the URL, workflow run ID, commit, and
verification result only. The Pages URL may contain a repository path; do not guess it.

Send the verified URL and all eight actual plan issue URLs (#1–#8) to the reviewer. Record
evidence of delivery without copying preview content. Keep #7 open until the reviewer has actually looked and the course confirms that step;
delivery alone is not sufficient. Local export or an unshared deployment is not completion.

After verifying a successful deployment, the authorized coordinator should delete the
`github-pages` artifact from that run and **all older preview runs**, including failed
runs that uploaded an artifact (Actions run → Artifacts → delete). Verify they are gone.
This deletes retained downloadable copies, not the deployed site. One-day retention is a
fallback, not a substitute for deletion. Never upload the preview as a generic artifact,
issue attachment, commit, or chat attachment.

## Cleanup after REVIEW (#8)

Once REVIEW arrives and cleanup is approved, dispatch the same reviewed workflow with
`include_marker: false`. This starts a fresh marker-free service and replaces the same
Pages destination; it does not merely delete an artifact or disable a site. Verify the
public URL again (account for Pages/cache propagation), confirming the same digest and
`no marker set` banner with the previous marker absent. Delete retained old/new preview
artifacts after successful replacement. Record marker-free verification and notify the
reviewer/cleanup owner; do not record the former marker. If deployment/verification fails,
leave cleanup open and retry with authorization—do not claim the public marker is gone.

## Local command export (no publication)

Requires already installed project dependencies and a running real service. Start it
without dotenv and without a marker for a safe local check:

```sh
env -u LANE_MARKER HOST=127.0.0.1 PORT=8787 pnpm exec tsx src/server.ts
```

In another shell, from the checkout:

```sh
preview=$(mktemp -d "${TMPDIR:-/tmp}/rig-preview.XXXXXX")
INCLUDE_MARKER=false bash scripts/export-preview.sh "$preview"
# Inspect privately, then remove the local copy:
rm -rf -- "$preview"
```

For an authorized marker-bearing local check, supply the same `LANE_MARKER` securely in
both service and export environments and set `INCLUDE_MARKER=true` for the exporter.
No hardcoded marker, `.env`, or preview belongs in git. The exporter accepts only an
absolute destination outside the checkout; the loopback host and sample route are fixed.
For an occupied local port, set the same numeric `PORT` (1–65535) in both shells; CI
always uses 8787.
It fails closed on an unexpected page, dependent assets/client JS, missing sample jobs,
missing-owner rendering, or a wrong banner. Never publish under local-test authorization.
