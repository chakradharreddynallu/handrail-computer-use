import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Policy } from "../src/policy.js";
import { Evidence } from "../src/evidence.js";
import { Engine } from "../src/engine.js";
import { Handoff } from "../src/handoff.js";
import {
  Fault,
  validateCapability,
  validateDecision,
  validateInputs,
} from "../src/contracts.js";
import { capability, ScriptedPlanner } from "./helpers.js";
function fixture(states = ["search"]) {
  const dir = mkdtempSync(join(tmpdir(), "handrail-unit-"));
  const evidence = new Evidence(dir, "unit-test");
  const surface = {
    owner: "automation",
    policy: new Policy("http://127.0.0.1:4173"),
    n: 0,
    calls: [],
    async observe() {
      return {
        state: states[Math.min(this.n, states.length - 1)],
        controls: [],
      };
    },
    async checkpoint() {
      return true;
    },
    async act(s, args) {
      this.policy.checkStep(s);
      assert.equal(this.owner, "automation");
      this.calls.push(s);
      this.n++;
      if (s.action === "extract")
        return s.target === "balance" ? "1234.56" : "USD";
    },
    async recoverNotice() {
      this.n++;
    },
    async humanAction(cmd) {
      assert.equal(this.owner, "human");
      this.n++;
    },
  };
  return { dir, evidence, surface };
}
test("schema rejects literal values, unknown versions, arbitrary selectors and outputs", () => {
  for (const mutate of [
    (c) => (c.schema_version = "2"),
    (c) => (c.steps[0].value = "secret"),
    (c) => (c.steps[0].selector = "body"),
    (c) => (c.steps[5].output = "token"),
    (c) => (c.steps = []),
  ]) {
    const c = capability();
    mutate(c);
    assert.throws(() => validateCapability(c));
  }
  assert.throws(() =>
    validateDecision({
      action: "click",
      target: "search",
      reason: "my secret",
    }),
  );
  assert.throws(() => validateInputs({ member_id: "123", password: "secret" }));
});
test("origin, credentials, paths, query, protocol and action guardrails", () => {
  const p = new Policy("http://127.0.0.1:4173");
  for (const u of [
    "https://127.0.0.1:4173/",
    "http://127.0.0.1:9999/",
    "http://127.0.0.1:4173/transfer",
    "http://127.0.0.1:4173/?secret=x",
    "http://u:p@127.0.0.1:4173/",
    "http://127.0.0.1:4173/?fault=bad",
    "http://127.0.0.1:4173/?fault=slow&fault=none",
  ])
    assert.equal(p.urlAllowed(u), false);
  assert.equal(p.urlAllowed("http://127.0.0.1:4173/?fault=slow"), true);
  assert.throws(() => p.checkStep({ action: "click", target: "transfer" }), {
    code: "policy_blocked",
  });
});
test("replay returns typed outputs without a planner and never logs sensitive values", async () => {
  const f = fixture();
  const result = await new Engine(f.surface, f.evidence, new Handoff()).run({
    capability: capability(),
    args: { member_id: "10001" },
  });
  assert.equal(result.status, "success");
  assert.deepEqual(result.outputs, { balance: "1234.56", currency: "USD" });
  const persisted = readdirSync(f.dir)
    .map((n) => readFileSync(join(f.dir, n), "utf8"))
    .join("");
  assert.ok(!persisted.includes("10001") && !persisted.includes("1234.56"));
  assert.equal(f.surface.calls.length, 6);
});
test("business not-found is not a hard failure", async () => {
  const f = fixture(["search", "search", "not_found"]);
  const r = await new Engine(f.surface, f.evidence, new Handoff()).run({
    capability: capability(),
    args: { member_id: "99999" },
  });
  assert.equal(r.status, "business_outcome");
  assert.equal(r.code, "member_not_found");
  assert.equal(f.surface.calls.length, 2);
});
test("whole artifact policy checked before action; risky tail cannot execute a prefix", async () => {
  const f = fixture(),
    c = capability();
  c.steps.push({ action: "click", target: "transfer" });
  const r = await new Engine(f.surface, f.evidence, new Handoff()).run({
    capability: c,
    args: { member_id: "10001" },
  });
  assert.equal(r.code, "policy_blocked");
  assert.equal(f.surface.calls.length, 0);
});
test("real control-transfer logic uses same surface and rejects stale resume", async () => {
  const f = fixture();
  let same;
  const h = new Handoff({
    operator: async ({ surface, id, act }) => {
      same = surface;
      assert.equal(surface.owner, "human");
      await act("restore");
      return { id, action: "resume" };
    },
  });
  await h.request(
    f.surface,
    f.evidence,
    { reason: "session_expired", step: 2 },
    { member_id: "10001" },
  );
  assert.equal(same, f.surface);
  assert.equal(f.surface.owner, "automation");
  const bad = new Handoff({
    operator: async () => ({ id: "stale", action: "resume" }),
  });
  await assert.rejects(
    bad.request(f.surface, f.evidence, { reason: "unknown" }, {}),
    { code: "invalid_resume" },
  );
  assert.equal(f.surface.owner, "stopped");
});
test("handoff expires and rejects late operator actions", async () => {
  const f = fixture();
  let late;
  const h = new Handoff({
    timeoutMs: 10,
    operator: ({ act }) => {
      late = act;
      return new Promise(() => {});
    },
  });
  await assert.rejects(
    h.request(f.surface, f.evidence, { reason: "unknown" }, {}),
    { code: "intervention_timeout" },
  );
  await assert.rejects(late("restore"), { code: "control_ownership" });
});
test("session restoration restarts only read-only flow with bounded retries", async () => {
  const f = fixture(["search", "search", "session_expired", "search"]);
  const h = new Handoff({
    operator: async ({ id, act }) => {
      await act("restore");
      return { id, action: "resume" };
    },
  });
  const r = await new Engine(f.surface, f.evidence, h).run({
    capability: capability(),
    args: { member_id: "10001" },
  });
  assert.equal(r.status, "success");
  assert.equal(h.count, 1);
  assert.equal(f.surface.calls.filter((s) => s.action === "fill").length, 2);
});
test("scripted discovery serializes parameters, not invocation values", async () => {
  const f = fixture();
  const r = await new Engine(f.surface, f.evidence, new Handoff()).run({
    planner: new ScriptedPlanner(),
    args: { member_id: "10001" },
  });
  assert.equal(r.status, "success");
  assert.equal(r.artifact.steps[0].parameter, "member_id");
  assert.ok(!JSON.stringify(r.artifact).includes("10001"));
});
test("malformed model output fails closed", async () => {
  const f = fixture();
  const r = await new Engine(f.surface, f.evidence, new Handoff()).run({
    planner: { decide: async () => ({ action: "eval", script: "steal()" }) },
    args: { member_id: "10001" },
  });
  assert.equal(r.status, "failure");
  assert.equal(f.surface.calls.length, 0);
});
test("false finish is rejected without required outputs", async () => {
  const f = fixture();
  const r = await new Engine(f.surface, f.evidence, new Handoff()).run({
    planner: {
      decide: async () => ({ action: "finish", reason: "goal_complete" }),
    },
    args: { member_id: "10001" },
  });
  assert.equal(r.code, "missing_outputs");
});
test("failed checkpoint prevents a success response", async () => {
  const f = fixture();
  f.surface.checkpoint = async () => false;
  const r = await new Engine(f.surface, f.evidence, new Handoff()).run({
    capability: capability(),
    args: { member_id: "10001" },
  });
  assert.equal(r.code, "checkpoint_failed");
});
test("ambiguous action failures never retry potentially committed clicks", async () => {
  const f = fixture();
  let attempts = 0;
  f.surface.act = async () => {
    attempts++;
    throw new Fault("ambiguous_target");
  };
  const r = await new Engine(f.surface, f.evidence, new Handoff()).run({
    capability: capability(),
    args: { member_id: "10001" },
  });
  assert.equal(r.code, "ambiguous_target");
  assert.equal(attempts, 1);
});
