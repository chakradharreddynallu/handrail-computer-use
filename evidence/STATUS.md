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

- Genuine OpenAI API-driven discovery. No model API key was configured during this build.
- A real person's interactive console or headed-window takeover. The mechanism is implemented and exercised with a simulated operator in the integration test.
- A GitHub-hosted CI run or submission email.

## Publication update — 2026-09-24

The project is being published to `chakradharreddynallu/handrail-computer-use`. A manual **Live discovery evidence** workflow is included to capture real model evidence after the repository secret is configured. No live model run is claimed by this publication.

## Required before submission

1. Follow README's genuine discovery/replay commands with your own API access. Keep the live files at the root of `evidence/`, separate from the offline folder.
2. Run the interactive takeover demo yourself.
3. Verify `npm run check:submission` passes and inspect the logs yourself.
4. Update this status with the actual runs performed; do not relabel scripted evidence.
5. Publish and review the public repository, then email its URL from your application address.

The check currently fails intentionally because required live evidence is missing. The project is an implemented, tested candidate submission, not a claim that every submission gate is complete or that any score is guaranteed.
