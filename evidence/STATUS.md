# Evidence status — 2026-09-23

## Executed in the build environment

- Node.js 24.19.0; Playwright 1.62.1; Linux Chromium 153 from the @sparticuz/chromium package.
- The standard Playwright CDN download returned an invalid archive in this environment. The browser suite therefore used `HANDRAIL_CHROMIUM_PATH` with the alternate Chromium. Users and CI should use Playwright's normal installed Chromium and rerun the suite.
- `npm test`: see `test-results.txt` for the actual test count and results. Includes core policy/contract/ownership tests, provider-adapter mock tests, schema tests, and real-browser integration tests.
- `npm run demo:offline`: actual live-browser scripted discovery, replay with another synthetic member, not-found, slow loading, read-only notice recovery, same-session handoff with a **simulated** operator, app error, and unexpected dialog. See `offline-results.txt` and `offline/*.jsonl`.
- `offline/capability.json`: a saved capability produced by the scripted test planner through the live browser; **not** an LLM-discovered artifact.
- `offline/failure-*.json`: allowlisted structural DOM snapshots including visible known controls, enabled state, count and geometry. Field values and arbitrary text are excluded.
- Evidence was scanned for synthetic input member IDs and extracted balances; none were present in JSON/JSONL artifacts/logs. This finite check complements the allowlist-by-construction design; it is not a universal DLP certification.

## Not yet executed / not claimed

- Successful OpenAI API-driven discovery. The key is configured, but the live run on 2026-09-25 failed at step 0 with HTTP 429 / `credit_balance_exhausted`. Live discovery was later completed with Gemini instead; see "Live Gemini discovery and replay — 2026-09-29" below. No successful OpenAI run is claimed.
- ~~A real person's interactive console or headed-window takeover.~~ Completed on 2026-09-29; see "Real human takeover — 2026-09-29" below.
- Submission email.

## Publication update — 2026-09-24

The project is public at https://github.com/chakradharreddynallu/handrail-computer-use. GitHub-hosted CI passed on commit `c28dcb547b36730ccca9251525516de7d52cce87`, using Node 22 and the normal Playwright Chromium installation: https://github.com/chakradharreddynallu/handrail-computer-use/actions/runs/36012085584. A manual **Live discovery evidence** workflow is included to capture real model evidence after the repository secret is configured. No live model run is claimed by this publication.

## Required before submission

1. Follow README's genuine discovery/replay commands with your own API access. Keep the live files at the root of `evidence/`, separate from the offline folder.
2. Run the interactive takeover demo yourself.
3. Verify `npm run check:submission` passes and inspect the logs yourself.
4. Update this status with the actual runs performed; do not relabel scripted evidence.
5. Publish and review the public repository, then email its URL from your application address.

As of 2026-09-29 the check passes with the Gemini evidence below, and items 1–4 are done, including the real-person takeover (item 2). Item 5 remains open: the repository is public, but the submission email has not been sent. The project is an implemented, tested candidate submission, not a claim that every submission gate is complete or that any score is guaranteed.

## Live API attempt — 2026-09-25

Run https://github.com/chakradharreddynallu/handrail-computer-use/actions/runs/36098394091 reached the provider and stopped safely before a UI action. The sanitized evidence reports `credit_balance_exhausted` (HTTP 429). Restore API credits before retrying. Diagnostic code records only allowlisted error codes and HTTP status; it excludes provider messages and credentials.

## Live Gemini discovery and replay — 2026-09-29

Run locally on Windows 11, Node.js 24.19.0, Playwright 1.62.1 with its normal Chrome for Testing 151 (headless), against the local synthetic sandbox. Code at commit `a7b770e` (Gemini provider added in `62eeab8`/`f840049`, 503 retry in `a7b770e`).

- **Genuine LLM-driven discovery succeeded** with `--provider gemini` and model **`gemini-3.1-flash-lite`**: `discover-8df7fd54-c156-4428-b068-5aaf31d81cbf.jsonl`. Seven real Gemini calls, each logged as `model_call` with Gemini's `responseId` as `request_id`, `model_version` and token counts. The model chose fill `member_id` → search → open member → savings → extract balance → extract currency → finish; it did not choose the visible `transfer` control. The engine's checkpoint and output checks accepted `finish`, and it produced `capability.json` (6 steps, parameterized by `member_id`, `risk: read_only`), which passes `validateCapability()` and `schemas/capability.schema.json`.
- **Model choice:** `gemini-2.5-flash` returned 404 `NOT_FOUND` for this key. Earlier discovery attempts with `gemini-3.8-flash` and `gemini-3.5-flash` stopped safely on provider errors (HTTP 503 `UNAVAILABLE`, a request timeout, HTTP 500 `INTERNAL`) and were not kept here. `gemini-3.1-flash-lite` was then selected by probing candidate models with the exact discovery request and choosing the one with all probes correct and no retries.
- **Deterministic replay succeeded without an LLM or API key:** `replay-c3e51efa-406c-455f-9fc2-89faa6a61633.jsonl`, member `10002` → `success` at step 6, savings checkpoint verified, both declared outputs extracted (values redacted; the log records only `output_fields`). Neither API key was set, and a preload tripwire that flags any planner module load or outbound fetch never fired. The log contains no model events.
- **Exceptional replay succeeded as a business outcome:** `replay-c4f1617d-0a1a-42ac-acfe-105c62e81c51.jsonl`, member `99999` → `business_outcome` / `member_not_found` at step 2, exit 0, with no failure or handoff.
- **`npm run check:submission` passes:** "Local evidence checks passed."
- `npm test` on this machine: 35/35 passing after these changes. `test-results.txt` is the earlier build-environment record and predates the Gemini tests.
- The live logs and artifact were scanned for synthetic member IDs, amounts and key patterns; none were present.

## Real human takeover — 2026-09-29

A real person, not a simulated operator, completed the same-session handoff: `replay-2010204f-aa56-4d49-ae67-fbabe664c51d.jsonl`, with the paused-state snapshot `failure-2010204f-aa56-4d49-ae67-fbabe664c51d.json`. The command was `replay --artifact evidence/capability.json --member 10002 --target "http://127.0.0.1:4173/?fault=session" --interactive --headed`, with no model or API key involved.

Flow: session expiry → intervention requested (`intervention_requested`, `reason: session_expired`) → the human took control of the same headed browser (`control_transferred` to `human`) → manual click on **Restore demo session** (`human_ui_event`, `target: restoreSession`, `values: not_collected`) → `resume` with the matching intervention ID → automation regained control (`control_transferred` to `automation`, then `recovery: read_only_restart`) → final `success` at step 6 with both outputs extracted. The log records no typed values, member IDs or balances.
