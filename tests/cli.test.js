import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startSandbox } from "../sandbox/server.js";
import { capability } from "./helpers.js";

const CLI = fileURLToPath(new URL("../src/cli.js", import.meta.url));
// Preloaded into the CLI child process: reports which planner modules load and replaces fetch,
// so a provider request gets a canned "escalate" decision and nothing reaches a real API.
const PROBE = `
import { registerHooks } from "node:module";
const say = (m) => process.stderr.write("PROBE " + m + "\\n");
registerHooks({
  resolve(specifier, context, next) {
    const r = next(specifier, context);
    const m = /\\/src\\/((?:gemini-)?planner)\\.js$/.exec(r.url);
    if (m) say("load " + m[1]);
    return r;
  },
});
globalThis.fetch = async (url) => {
  const host = new URL(String(url)).host;
  say("fetch " + host);
  const decision = JSON.stringify({ action: "escalate", reason: "blocked" });
  if (host === "api.openai.com")
    return new Response(JSON.stringify({ choices: [{ message: { content: decision } }], usage: {} }), {
      headers: { "x-request-id": "probe-openai" },
    });
  if (host === "generativelanguage.googleapis.com")
    return new Response(JSON.stringify({ responseId: "probe-gemini", candidates: [{ content: { parts: [{ text: decision }] } }] }));
  throw new Error("probe: unexpected network");
};
`;
let app;
before(async () => {
  app = await startSandbox(0);
});
after(async () => {
  await app.close();
});
function cli(args, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "handrail-cli-"));
  const clean = { ...process.env };
  for (const k of ["OPENAI_API_KEY", "GEMINI_API_KEY", "OPENAI_MODEL", "GEMINI_MODEL"]) delete clean[k];
  const child = spawn(
    process.execPath,
    [
      "--import", `data:text/javascript,${encodeURIComponent(PROBE)}`,
      CLI, ...args,
      "--target", `${app.origin}/`,
      "--evidence", dir,
      ...(args.includes("--artifact") ? [] : ["--artifact", join(dir, "capability.json")]),
    ],
    { env: { ...clean, ...env }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "", stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  return new Promise((resolve) =>
    child.on("close", (code) => {
      const events = readdirSync(dir)
        .filter((n) => n.endsWith(".jsonl"))
        .flatMap((n) => readFileSync(join(dir, n), "utf8").trim().split("\n").map(JSON.parse));
      const probe = stderr.split("\n").filter((l) => l.startsWith("PROBE ")).map((l) => l.slice(6));
      resolve({ code, stdout, stderr, events, probe, dir });
    }),
  );
}
const discover = (...extra) => ["discover", "--goal", "Read the savings balance.", "--member", "10001", ...extra];

test("cli --provider gemini selects GeminiPlanner; mocked provider, no real API call", async () => {
  const r = await cli(discover("--provider", "gemini"), {
    GEMINI_API_KEY: "test-only-gemini-key",
    GEMINI_MIN_INTERVAL_MS: "0",
  });
  assert.ok(r.probe.includes("load gemini-planner"));
  assert.deepEqual(r.probe.filter((p) => p.startsWith("fetch")), ["fetch generativelanguage.googleapis.com"]);
  const call = r.events.find((e) => e.event === "model_call");
  assert.equal(call.provider, "gemini");
  assert.equal(call.request_id, "probe-gemini");
  // The canned escalate decision stops safely without an operator; nothing is published.
  assert.equal(r.code, 1);
  assert.equal(JSON.parse(r.stdout).status, "failure");
  assert.ok(!readdirSync(r.dir).includes("capability.json"));
  assert.ok(!(r.stdout + r.stderr + JSON.stringify(r.events)).includes("test-only-gemini-key"));
});

test("cli --provider openai, and the default, still select OpenAIPlanner", async () => {
  for (const extra of [["--provider", "openai"], []]) {
    const r = await cli(discover(...extra), { OPENAI_API_KEY: "test-only-key" });
    assert.ok(r.probe.includes("load planner"));
    assert.ok(!r.probe.includes("load gemini-planner"));
    assert.deepEqual(r.probe.filter((p) => p.startsWith("fetch")), ["fetch api.openai.com"]);
    const call = r.events.find((e) => e.event === "model_call");
    assert.equal(call.provider, "openai");
    assert.equal(call.request_id, "probe-openai");
    assert.equal(r.code, 1);
  }
});

test("cli fails safely on an invalid provider or a missing provider key", async () => {
  for (const [args, env] of [
    [discover("--provider", "claude"), { OPENAI_API_KEY: "k", GEMINI_API_KEY: "k" }],
    [discover("--provider", "gemini"), {}],
  ]) {
    const r = await cli(args, env);
    assert.equal(r.code, 1);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^Setup failed\./m);
    assert.ok(!r.probe.some((p) => p.startsWith("fetch")));
    assert.ok(!r.events.some((e) => e.event === "model_call"));
  }
  assert.ok(!(await cli(discover("--provider", "claude"), {})).probe.some((p) => p.startsWith("load")));
});

test("cli replay needs no model key and never loads a planner, whatever --provider says", async () => {
  const dir = mkdtempSync(join(tmpdir(), "handrail-cap-"));
  const artifact = join(dir, "cap.json");
  writeFileSync(artifact, JSON.stringify(capability()));
  for (const extra of [[], ["--provider", "gemini"]]) {
    const r = await cli(["replay", "--member", "10002", ...extra, "--artifact", artifact]);
    assert.equal(r.code, 0);
    assert.equal(JSON.parse(r.stdout).status, "success");
    assert.deepEqual(r.probe, []);
    assert.ok(!r.events.some((e) => e.event === "model_call"));
  }
});
