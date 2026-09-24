# Handrail — computer-use capabilities

A focused implementation for interface.ai Assignment A: a model discovers a read-only member-servicing workflow through a real browser UI; a versioned capability replays it without a model; exceptional states route to a live-session operator.

**Submission status:** implementation and tests included. A genuine API-backed discovery run still must be captured using your model account. Do not submit until `npm run check:submission` passes and you have personally reviewed the evidence. Offline scripted discovery is explicitly not live LLM evidence.

## Setup

Node.js 22+ and npm; Chromium is installed by Playwright. Linux CI installs system dependencies as well.

```bash
npm ci
npx playwright install chromium
npm test
```

For Ubuntu environments missing libraries: `npx playwright install --with-deps chromium`.
If you deliberately use an existing compatible Chromium, set `HANDRAIL_CHROMIUM_PATH` to its absolute executable path. The normal path is Playwright's pinned browser. An alternate version can behave differently; rerun tests.

No real credentials, bank systems, PII, or business APIs are used. The fixture is a table-based UI inside an iframe, with human labels and no test IDs. All business transitions happen through clicks and typing. The sandbox server only serves two HTML files.

## Demo path — genuine discovery, then model-free replay

Terminal 1:

```bash
npm run sandbox
```

Terminal 2 (Bash/macOS/Linux/WSL):

```bash
# Enter your key privately; do not paste it into chat or commit it.
read -rsp 'OpenAI API key: ' OPENAI_API_KEY; echo
export OPENAI_API_KEY
export OPENAI_MODEL=gpt-4o-mini
npm run discover -- --goal 'Look up the supplied member and return their current savings balance and currency.' --member 10001 --artifact evidence/capability.json
unset OPENAI_API_KEY
npm run replay -- --artifact evidence/capability.json --member 10002
npm run replay -- --artifact evidence/capability.json --member 99999
npm run check:submission
```

The model chooses each next action from the observed UI and completed actions. It receives symbolic parameter names, not member numbers or balances. API request IDs and usage are logged; raw prompts/responses and goals are not persisted. `store:false` is sent, but it is not a promise of zero provider retention. Only synthetic data is permitted in this demo.

On Windows, WSL is the easiest way to use these commands. Alternatively set the key in your PowerShell environment privately and run the same npm commands. The CLI does not auto-load `.env` files.

Outputs are returned as typed values by `Engine.run()`. CLI output is redacted by default; append `--show-outputs` only for these synthetic examples. Decimal balances are strings to avoid binary floating-point rounding. Unknown members are a `business_outcome`, not an exception or success with empty outputs. Failures exit 1; business outcomes exit 0 and are distinguished by status.

## No-key demo

```bash
npm run demo:offline
```

This starts a real local UI and runs **scripted test discovery**, replay with another input, not-found, slow load, known notice, and session restoration through a simulated operator. Files go under `evidence/offline/`; they cannot satisfy the live-model submission check. The live sandbox and browser are real; the test planner and operator are deliberately simulated.

## Human takeover — same live session

With the sandbox running and a capability available:

```bash
npm run replay -- --artifact evidence/capability.json --target 'http://127.0.0.1:4173/?fault=session' --interactive --headed
```

At the pause, type `restore` to operate the existing browser, then `resume`. Or click **Restore demo session** in the same headed window and type `resume`. The system checks the intervention ID, returns control to automation, and restarts the read-only flow once. Input values remain in memory. `abort`, EOF, or a two-minute timeout stop the run. Human actions/events are logged without field values.

Without `--interactive`, an intervention request and a sanitized structural DOM snapshot are emitted, and the process stops safely. Keeping a noninteractive browser alive for a remote operator is outside this slice; the CLI interactive mode is the live handoff demonstration.

For offline artifact use, substitute `evidence/offline/capability.json`.

## Runtime demonstrations

| Target query         | Result                                                  |
| -------------------- | ------------------------------------------------------- |
| none, member `99999` | `business_outcome / member_not_found`                   |
| `?fault=denied`      | `business_outcome / permission_denied`                  |
| `?fault=slow`        | Bounded observation polling; no duplicated click        |
| `?fault=notice`      | Dismiss a reviewed read-only notice and continue        |
| `?fault=session`     | Escalate; human restores session; one read-only restart |
| `?fault=crash`       | Failure and intervention request                        |
| `?fault=dialog`      | Dismiss without accepting; stop and escalate            |

Invalid input is rejected before typing. `Transfer funds` is visible in the app but prohibited by the trusted policy, regardless of what a model or artifact asks. A custom JSON policy can be supplied via `--policy`; its shape is illustrated by `config/policy.json`. Policy configuration and bindings are administrator-trusted, not supplied by a calling agent.

## Layout

- `src/contracts.js`, `schemas/`: typed runtime contracts and portable JSON schemas.
- `src/engine.js`: bounded discovery/replay orchestration and result taxonomy.
- `src/surface.js`: Playwright iframe adapter and reviewed locator bindings.
- `src/planner.js`: the only live model dependency; dynamically loaded for discovery.
- `src/handoff.js`: ownership state machine and minimal operator console.
- `src/policy.js`, `src/evidence.js`: allowlists and data-minimizing evidence.
- `sandbox/`: synthetic legacy-style application, no business API.
- `tests/`: core contracts/security tests and live-browser integration tests.
- `REPORT.md`: required seven-section design write-up.
- `docs/DEFENSE.md`: design questions and honest limitations to rehearse.
- `evidence/STATUS.md`: actual execution evidence and remaining gates.

## Submit

Read `docs/SUBMISSION.md`. Push the project root to a public GitHub repository. Review it for secrets and make sure the required files are at the repository root. Email the URL from the address you applied with; do not email this package as a zip. The local check verifies file/evidence shape, not authenticity or a guaranteed score.

## Provider reference

The discovery adapter uses the [OpenAI API](https://platform.openai.com/docs/api-reference/introduction) and [JSON output mode](https://developers.openai.com/api/docs/guides/structured-outputs). Runtime validation remains mandatory even when the provider returns valid JSON.

## Capture live evidence in GitHub Actions

If you prefer not to install the project locally, add a repository Actions secret named `OPENAI_API_KEY`, then manually run **Live discovery evidence** from the Actions tab. This sends the synthetic task to your OpenAI account and uses its API quota. The workflow runs discovery, removes the key from the replay environment, performs successful and not-found replays, and checks the evidence. It uploads `live-discovery-evidence` for review; it does not automatically commit files or send the submission email. Download and review that artifact, then commit its contents under `evidence/` before submitting. The separate tests workflow does not require a model key.
