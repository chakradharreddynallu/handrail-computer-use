import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSandbox } from "../sandbox/server.js";
import { BrowserSurface } from "../src/surface.js";
import { Policy } from "../src/policy.js";
import { Evidence } from "../src/evidence.js";
import { Handoff } from "../src/handoff.js";
import { Engine } from "../src/engine.js";
import { capability, ScriptedPlanner } from "./helpers.js";
let app;
before(async () => {
  app = await startSandbox(0);
});
after(async () => {
  await app.close();
});
async function run(fault = "none", member = "10001", operator, planner) {
  const evidence = new Evidence(
    mkdtempSync(join(tmpdir(), "handrail-browser-")),
    "browser-test",
  );
  const surface = await BrowserSurface.create(new Policy(app.origin), evidence);
  try {
    await surface.open(`${app.origin}/?fault=${fault}`);
    const r = await new Engine(
      surface,
      evidence,
      new Handoff({ operator }),
    ).run({
      ...(planner ? { planner } : { capability: capability() }),
      args: { member_id: member },
    });
    return { r, events: readFileSync(evidence.path, "utf8") };
  } finally {
    await surface.close();
  }
}
test("live iframe UI: scripted discovery then parameterized replay", async () => {
  assert.equal(
    (await run("none", "10001", undefined, new ScriptedPlanner())).r.status,
    "success",
  );
  assert.deepEqual((await run("none", "10002")).r.outputs, {
    balance: "987.65",
    currency: "USD",
  });
});
for (const [fault, member, status, code] of [
  ["none", "99999", "business_outcome", "member_not_found"],
  ["denied", "10001", "business_outcome", "permission_denied"],
  ["crash", "10001", "failure", "intervention_required"],
  ["dialog", "10001", "failure", "intervention_required"],
  ["none", "abc", "failure", "invalid_input"],
]) {
  test(`runtime ${fault}/${member}`, async () => {
    const { r } = await run(fault, member);
    assert.equal(r.status, status);
    assert.equal(r.code, code);
  });
}
for (const fault of ["slow", "notice"])
  test(`bounded recovery ${fault}`, async () => {
    const { r, events } = await run(fault);
    assert.equal(r.status, "success");
    assert.match(events, /recovery/);
  });
test("same browser session hands off and resumes; operator simulated in test only", async () => {
  let page;
  const { r, events } = await run(
    "session",
    "10001",
    async ({ id, surface, act }) => {
      page = surface.page;
      assert.equal(surface.owner, "human");
      await act("restore");
      assert.equal(surface.page, page);
      return { id, action: "resume" };
    },
  );
  assert.equal(r.status, "success");
  assert.match(events, /human_action/);
  assert.match(events, /read_only_restart/);
});
test("unexpected outbound request is blocked before reaching a server", async () => {
  const evidence = new Evidence(
    mkdtempSync(join(tmpdir(), "handrail-policy-")),
    "browser-test",
  );
  const s = await BrowserSurface.create(new Policy(app.origin), evidence);
  try {
    await s.open(app.origin);
    await s.page.goto("http://127.0.0.1:1/").catch(() => {});
    assert.equal(s.networkBlocked, true);
  } finally {
    await s.close();
  }
});
