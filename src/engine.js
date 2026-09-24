import {
  Fault,
  requireThat,
  validateCapability,
  validateInputs,
  validateDecision,
  makeCapability,
  TARGETS,
} from "./contracts.js";
const BUSINESS = {
  not_found: "member_not_found",
  validation: "validation_error",
  denied: "permission_denied",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export class Engine {
  constructor(
    surface,
    evidence,
    handoff,
    { timeoutMs = 30000, maxSteps = 20 } = {},
  ) {
    this.surface = surface;
    this.evidence = evidence;
    this.handoff = handoff;
    this.timeoutMs = timeoutMs;
    this.maxSteps = maxSteps;
    this.step = 0;
    this.outputs = {};
    this.handoffs = 0;
  }
  async ready(args) {
    // Poll observations, never retry a possibly committed click.
    for (let n = 0; n < 20; n++) {
      const obs = await this.surface.observe();
      if (BUSINESS[obs.state])
        return {
          status: "business_outcome",
          code: BUSINESS[obs.state],
          step: this.step,
        };
      if (obs.state === "loading") {
        if (n === 0)
          this.evidence.emit("recovery", {
            kind: "bounded_wait",
            step: this.step,
          });
        await sleep(100);
        continue;
      }
      if (obs.state === "notice") {
        this.evidence.emit("recovery", {
          kind: "known_read_only_notice",
          step: this.step,
        });
        await this.surface.recoverNotice();
        continue;
      }
      if (
        [
          "session_expired",
          "app_error",
          "unexpected_dialog",
          "network_blocked",
          "unknown",
        ].includes(obs.state)
      ) {
        await this.handoff.request(
          this.surface,
          this.evidence,
          { reason: obs.state, step: this.step, observed: obs },
          args,
        );
        this.handoffs++;
        if (obs.state === "session_expired") {
          requireThat(
            (await this.surface.observe()).state === "search",
            "unsafe_resume",
          );
          return { restart: true };
        }
        const after = await this.surface.observe();
        requireThat(
          ![
            "app_error",
            "unknown",
            "unexpected_dialog",
            "network_blocked",
          ].includes(after.state),
          "unsafe_resume",
        );
        continue;
      }
      return null;
    }
    throw new Fault("load_timeout");
  }
  async run({ capability, args, planner }) {
    const mode = planner ? "discovery" : "replay";
    const steps = [];
    let restarts = 0;
    let started = Date.now();
    let lastSignature = "",
      repeats = 0;
    try {
      validateInputs(args);
      if (capability) validateCapability(capability);
      requireThat(!!planner !== !!capability);
      // Validate the WHOLE capability before any UI action; no late surprise risky step.
      if (capability)
        for (const s of capability.steps) this.surface.policy.checkStep(s);
      for (let count = 0; count < this.maxSteps; count++) {
        requireThat(
          Date.now() - started - this.handoff.pausedMs < this.timeoutMs,
          "run_timeout",
        );
        const state = await this.ready(args); // Only explicit operator time is excluded from the execution budget
        if (state?.status) return this.evidence.result(state);
        if (state?.restart) {
          requireThat(++restarts <= 1, "restart_limit");
          this.step = 0;
          this.outputs = {};
          steps.length = 0;
          this.evidence.emit("recovery", { kind: "read_only_restart" });
          continue;
        }
        const obs = await this.surface.observe();
        let step;
        if (planner) {
          const d = validateDecision(
            await planner.decide({
              observation: obs,
              completed: steps,
              output_fields: Object.keys(this.outputs),
            }),
          );
          this.evidence.emit("decision", {
            step: this.step,
            action: d.action,
            ...(d.target ? { target: d.target } : {}),
            reason: d.reason,
            observed: obs,
          });
          if (d.action === "escalate") {
            await this.handoff.request(
              this.surface,
              this.evidence,
              { reason: "model_stuck", step: this.step, observed: obs },
              args,
            );
            this.handoffs++;
            continue;
          }
          if (d.action === "finish") {
            requireThat(await this.surface.checkpoint(), "checkpoint_failed");
            requireThat(
              Object.keys(this.outputs).length === 2,
              "missing_outputs",
            );
            // Human-assisted discovery is useful evidence, but must not be published as a replayable flow.
            requireThat(
              this.handoffs === 0,
              "assisted_discovery_requires_review",
            );
            const artifact = validateCapability(makeCapability(steps));
            return this.evidence.result({
              status: "success",
              outputs: this.outputs,
              artifact,
              step: this.step,
            });
          }
          const { reason, ...s } = d;
          step = s;
          const signature = JSON.stringify({ obs, step });
          repeats = signature === lastSignature ? repeats + 1 : 0;
          lastSignature = signature;
          requireThat(repeats < 2, "loop_detected");
        } else {
          if (this.step >= capability.steps.length) {
            requireThat(await this.surface.checkpoint(), "checkpoint_failed");
            requireThat(
              Object.keys(this.outputs).length === 2,
              "missing_outputs",
            );
            return this.evidence.result({
              status: "success",
              outputs: this.outputs,
              step: this.step,
            });
          }
          step = capability.steps[this.step];
        }
        this.evidence.emit("action_started", {
          step: this.step,
          ...step,
          expected: step.target,
          observed: obs,
        });
        const value = await this.surface.act(step, args);
        if (step.action === "extract") this.outputs[step.output] = value;
        steps.push(step);
        this.evidence.emit("action_completed", {
          step: this.step,
          action: step.action,
          target: step.target,
        });
        this.step++;
      }
      throw new Fault("max_steps");
    } catch (error) {
      const code =
        error instanceof Fault
          ? error.code
          : error.name === "TimeoutError"
            ? "target_timeout"
            : "execution_error";
      let observed = { state: "unavailable" };
      try {
        observed = await this.surface.observe();
      } catch {}
      this.evidence.snapshot(
        await (this.surface.diagnostic
          ? this.surface.diagnostic().catch(() => observed)
          : Promise.resolve(observed)),
      );
      // Route hard stops too; an unknown/ambiguous action is never blindly retried after human takeover.
      if (
        this.handoff.state === "automation" &&
        ![
          "invalid_input",
          "invalid_contract",
          "incompatible_capability",
        ].includes(code)
      ) {
        try {
          await this.handoff.request(
            this.surface,
            this.evidence,
            { reason: code, step: this.step, observed },
            args,
          );
        } catch {}
      }
      return this.evidence.result({
        status: "failure",
        code,
        step: this.step,
        expected: TARGETS.includes(capability?.steps?.[this.step]?.target)
          ? capability.steps[this.step].target
          : "validated_safe_action",
        observed,
      });
    }
  }
}
