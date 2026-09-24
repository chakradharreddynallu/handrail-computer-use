# Explain and defend the submission

Use these as discussion prompts, not claims of prior production experience.

1. **What does the model do?** It observes the current symbolic UI state and visible controls, then chooses one typed action. It does not receive a hard-coded action sequence. Offline tests use a separate scripted planner, clearly labeled.
2. **How is this different from a Playwright script?** Discovery creates a validated, parameterized contract. Production replay is intentionally similar to a small interpreter for a deterministic script, with typed results, guardrails and handoff.
3. **Why not let the model choose any CSS selector?** A selector is authority to interact with a control. A reviewed catalog narrows that authority and separates tenant bindings from the flow. The cost is onboarding the bindings in advance.
4. **Why not use screenshot coordinates everywhere?** Semantics are more robust where available. This iframe/table fixture supports labels. For a real inaccessible legacy app, implement visual anchors behind the same surface interface, with stronger preconditions and escalation.
5. **What if the model says it finished too soon?** The engine checks both output fields and the independent UI checkpoint; the model cannot self-certify success.
6. **Why is a balance a string?** Exact two-decimal representation avoids floating-point rounding. Production currencies have varying minor units, so the type would evolve.
7. **Why is member-not-found not an error?** The automation ran correctly and the caller received a legitimate domain answer. The caller needs a distinct business status.
8. **Why not retry every failure?** A timeout after a click can mean the action committed. Blind retry can duplicate transactions. This slice waits for read states and restarts only the reviewed read-only flow after session restoration.
9. **How do you know replay uses no model?** It imports no planner, accepts a capability, and runs without an API key. Tests assert outputs through this path. A deployment could place replay in an egress-restricted worker.
10. **What is real about handoff?** The same page/context stays alive; ownership changes; commands operate it; a run-specific resume returns control. The integration test uses a simulated operator but the terminal accepts a real person.
11. **Why not publish a capability after manual intervention?** The recorded automation steps might omit what the human did. A successful session is not automatically a reusable recording.
12. **How would you share across institutions?** Shared vendor capability + reviewed tenant bindings + pinned versions + canary checks. Never copy credentials or policy permissions between tenants.
13. **What cannot this prototype guarantee?** Arbitrary UI generalization, financial-grade security, multi-user fencing, full redaction of arbitrary apps, or API success before a live run. Be specific, not defensive.
14. **What evidence demonstrates quality?** A genuine model-call log with request IDs, a successful saved capability, replay with another member, a not-found outcome, and a real operator session. Unit tests alone are insufficient.

## Five-minute demonstration

- Show the goal and synthetic application, then run discovery.
- Open the artifact: point to parameter references, output types, and checkpoint.
- Remove the API key; replay with a different member.
- Replay with an unknown member; explain business outcome versus failure.
- Inject session expiry; restore the same browser session and resume.
- Show the sanitized evidence and one explicit limitation.

Do these yourself before the leadership discussion. Change a fault condition and explain the resulting control flow without reading a script.
