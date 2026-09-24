# Handrail — design report

## Architecture

Handrail is one Node.js process with an injected planner, an execution engine, a surface adapter, trusted policy, evidence sink, and control-transfer coordinator. Discovery imports the OpenAI planner; replay never imports it. The model decides one action at a time from a sanitized observation of a live iframe application. Playwright operates the browser; there are no application API calls. A local synthetic servicing application makes runtime faults repeatable without accessing financial systems.

I chose a narrow read-only savings inquiry: enter a parameterized member number, search, open details, open savings, extract balance/currency. This exercises navigation and extraction while keeping write safety unambiguous. A catalog of reviewed control bindings limits discovery to a known app's affordances; the action sequence is discovered, the entire application is not autonomously reverse engineered. The implementation favors readable JavaScript, runtime validation, and portable JSON schemas over framework overhead.

## Artifact schema

The versioned capability declares its name/version, application family and binding version, typed inputs, typed outputs, ordered steps, targeting strategy, risk class, and terminal checkpoint. Steps use logical control references and parameter references, never literal member numbers, raw HTML, model transcripts, executable code, or arbitrary selectors. A balance is a scale-two decimal string; currency is an enum. This avoids floating-point rounding and validates extraction at the boundary.

The binding manifest is reviewable source code: iframe scope plus exact label/role/name. A unique visible match is required. Artifact v1 is deliberately closed to one contract; unknown fields and incompatible versions fail before actions. JSON schemas document the portable representation; runtime validators enforce it plus policy. A binding reference keeps tenant-specific selectors out of the reusable flow. Artifacts are not cryptographically signed or approval-gated yet, so a repository reviewer remains the trust boundary.

## Determinism & error handling

Replay consumes the same ordered steps, resolves the same reviewed bindings, substitutes validated inputs, checks output types, and asserts the final UI checkpoint. It calls no planner. Browser timing is asynchronous; determinism means no model decisions or ad hoc selector substitutions, not identical millisecond timings. Exact-match ambiguity fails rather than choosing the first plausible control.

Unknown member, validation, and permission denial are explicit business outcomes. Known read-only notices are dismissed; loading is polled for a bounded period without repeating the triggering click. A session expiry requests intervention, then permits one restart because this capability is read-only. App errors, unknown UI states, unexpected dialogs, blocked network activity, and unresolved controls fail closed. Unexpected dialogs are dismissed without accepting them. We do not retry an action whose effects are unknown.

Results contain status, safe error code, step index, expected control, and an allowlisted observation. Success returns declared outputs in memory. Evidence omits values and raw exception messages. Failure captures a structural DOM snapshot with known controls, counts, enabled state, and geometry, excluding arbitrary page text and field contents. Core tests use doubles; browser tests exercise the real UI. Scripted discovery is labeled and cannot substitute for genuine model evidence.

## Heterogeneity & multi-tenant

The seam is `observe / act / extract / checkpoint`: the engine consumes logical controls and typed outputs, not Playwright objects. This adapter handles an iframe/table layout without test IDs. It still relies on usable labels and DOM semantics; it does not claim to solve inaccessible canvas/desktop applications. A desktop adapter could resolve logical controls with UI Automation/AX and a reviewed visual-anchor strategy. Coordinate actions would require a viewport/window fingerprint and local visual preconditions; naked absolute coordinates are too weak for unattended replay.

At scale, the shared capability would be keyed by vendor family and compatible version range, with tenant bindings/configuration stored separately. Overrides may change reviewed locators, not silently widen policy. Validate each binding against the control contract, run tenant canaries, pin approved capability+binding versions, and quarantine mismatches. Keep sessions, credentials, outputs, and logs tenant-isolated. Use a leased worker per live session and an ownership epoch to fence stale operators. These are design extensions, not implemented multi-tenant infrastructure.

## Escalation & handoff

The coordinator transitions AUTOMATION → PAUSED → HUMAN → AUTOMATION. It emits a run-correlated intervention with a unique ID, capability, step, reason, and sanitized state. While human owns the surface, automation cannot act. The minimal terminal operator can restore the demo session through the same Playwright page; headed mode also allows direct interaction with that existing window. Commands and bounded UI event metadata are recorded without entered values. Resume must match the intervention ID; stale responses, disconnects, and timeout stop the session. Late command calls are rejected.

The engine checks state on return. Only known read-only session recovery restarts automatically; an ambiguous action remains a failure even after inspection. Human-assisted discovery cannot publish a capability automatically, because manual steps are not yet canonicalized into its step list. Noninteractive mode routes an intervention to evidence and exits rather than pretending to offer unattended remote co-browsing. The local console has OS-level trust, not enterprise operator authentication.

## Safety

Trusted policy constrains exact origin, routes, query values, action types, and risky targets. Browser request interception also blocks disallowed outbound requests and non-GET methods; service workers and WebSockets are disabled/blocked. Popups are closed. A risky transfer control is blocked even if the model names it or a capability falsely claims read-only status. Replay preflights the entire artifact before executing its first step.

All fixture data is synthetic. Model observations contain finite state/control names, not member IDs or balance values. The goal is sent to the provider, so users must not put sensitive data in it. Secrets come from the environment and never enter artifacts. Logs use enumerated metadata rather than regex-only redaction. Screenshots/traces are deliberately avoided because they can contain financial data. DOM evidence is an allowlisted projection, not a full dump. Provider `store:false` is not a zero-retention guarantee; a real deployment needs approved processing agreements and retention controls. Browser-level policy is defense in depth, not an OS network sandbox. Human direct interaction and trusted app/binding authors remain part of the trust boundary.

## Cuts

No payment execution, generalized auto-discovery of arbitrary controls, OCR/desktop adapter, remote operator console, distributed leases, credential vault, or tenant fleet is implemented. These would obscure the core contract in a take-home. The next steps are a genuine API-backed discovery run and its replay evidence, operator-reviewed demo, signed/approved artifacts, broader fault injection, then one legacy visual adapter. Remaining verification gaps are recorded in `evidence/STATUS.md`; no simulated run is represented as an LLM run. AI assisted implementation, and the submitter should be able to explain and modify every component.
