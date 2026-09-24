import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { requireThat, Fault } from "./contracts.js";
/** AUTOMATION -> PAUSED -> HUMAN -> AUTOMATION, bound to a single live surface/run. */
export class Handoff {
  constructor({ operator, timeoutMs = 120000, maxRequests = 2 } = {}) {
    this.operator = operator;
    this.timeoutMs = timeoutMs;
    this.maxRequests = maxRequests;
    this.count = 0;
    this.state = "automation";
    this.pausedMs = 0;
  }
  async request(surface, evidence, context, args) {
    requireThat(this.state === "automation", "control_ownership");
    if (++this.count > this.maxRequests) throw new Fault("intervention_limit");
    this.state = "paused";
    surface.owner = "paused";
    const id = randomUUID();
    evidence.emit("intervention_requested", {
      intervention_id: id,
      ...context,
      capability: "read_savings_balance",
    });
    evidence.snapshot(
      await (surface.diagnostic ? surface.diagnostic() : surface.observe()),
    );
    if (!this.operator) {
      surface.owner = "stopped";
      this.state = "stopped";
      throw new Fault("intervention_required");
    }
    this.state = "human";
    surface.owner = "human";
    evidence.emit("control_transferred", {
      intervention_id: id,
      owner: "human",
    });
    const pauseStarted = Date.now();
    let timer,
      active = true;
    const controller = new AbortController();
    const act = async (command) => {
      requireThat(active && this.state === "human", "control_ownership");
      await surface.humanAction(command, args);
      evidence.emit("human_action", { intervention_id: id, command });
    };
    try {
      const answer = await Promise.race([
        this.operator({ id, context, act, surface, signal: controller.signal }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Fault("intervention_timeout")),
            this.timeoutMs,
          );
        }),
      ]);
      requireThat(
        answer?.id === id && answer?.action === "resume",
        "invalid_resume",
      );
      active = false;
      surface.owner = "automation";
      this.state = "automation";
      evidence.emit("control_transferred", {
        intervention_id: id,
        owner: "automation",
      });
    } catch (e) {
      surface.owner = "stopped";
      this.state = "stopped";
      throw e;
    } finally {
      this.pausedMs += Date.now() - pauseStarted;
      active = false;
      clearTimeout(timer);
      controller.abort();
    }
  }
}
/** Minimal real console: commands act on the existing page. In --headed mode use the browser too. */
export async function terminalOperator({ id, context, act, signal }) {
  console.error(
    `PAUSED ${id}: ${context.reason}. Same browser session retained. Commands: restore, back, resume, abort.`,
  );
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  signal.addEventListener("abort", () => rl.close(), { once: true });
  try {
    for await (const line of rl) {
      const cmd = line.trim();
      if (cmd === "resume") return { id, action: "resume" };
      if (cmd === "abort") throw new Fault("operator_aborted");
      try {
        await act(cmd);
        console.error("Action completed; type resume when ready.");
      } catch {
        console.error(
          "Action unavailable. Use restore/back in the matching UI state.",
        );
      }
    }
  } finally {
    rl.close();
  }
  throw new Fault("operator_disconnected");
}
