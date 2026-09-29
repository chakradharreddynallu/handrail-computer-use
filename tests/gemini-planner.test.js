import test from "node:test";
import assert from "node:assert/strict";
import { GeminiPlanner, DECISION_SCHEMA } from "../src/gemini-planner.js";
import { SYSTEM_PROMPT } from "../src/planner.js";

const state = {
  observation: { state: "search", controls: ["memberNumber", "search"] },
  completed: [],
  output_fields: [],
};
const reply = (text, extra = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({
    responseId: "mock-response-id",
    modelVersion: "gemini-mock-001",
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    candidates: [{ content: { parts: [{ text }] } }],
    ...extra,
  }),
});
const ok = (decision, extra) => reply(JSON.stringify(decision), extra);
async function withGemini(fn) {
  const oldFetch = globalThis.fetch,
    oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only-gemini-key";
  try {
    await fn();
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
}
const sink = (events) => ({ emit: (event, fields) => events.push({ event, ...fields }) });

test("gemini adapter sends schema-constrained request without secrets or literal values; mock is not live evidence", () =>
  withGemini(async () => {
    const events = [];
    globalThis.fetch = async (url, options) => {
      assert.equal(
        url,
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      );
      assert.ok(!url.includes("key="));
      assert.equal(options.headers["x-goog-api-key"], "test-only-gemini-key");
      const body = JSON.parse(options.body);
      assert.equal(body.systemInstruction.parts[0].text, SYSTEM_PROMPT);
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.deepEqual(body.generationConfig.responseJsonSchema, DECISION_SCHEMA);
      assert.ok(!DECISION_SCHEMA.properties.target.enum.includes("transfer"));
      assert.ok(!options.body.includes("10001"));
      assert.ok(!options.body.includes("test-only-gemini-key"));
      return ok({ action: "fill", target: "memberNumber", parameter: "member_id", reason: "enter_parameter" });
    };
    const planner = new GeminiPlanner("Read savings balance", sink(events), {
      model: "gemini-2.5-flash",
      minIntervalMs: 0,
    });
    const decision = await planner.decide(state);
    assert.equal(decision.action, "fill");
    assert.equal(events[0].event, "model_call");
    assert.equal(events[0].provider, "gemini");
    assert.equal(events[0].request_id, "mock-response-id");
    assert.equal(events[0].model_version, "gemini-mock-001");
    const logged = JSON.stringify(events);
    assert.ok(!logged.includes("test-only-gemini-key"));
    assert.ok(!logged.includes("Read savings balance"));
    assert.ok(!logged.includes("enter_parameter"));
  }));

test("gemini adapter honours GEMINI_MODEL", () =>
  withGemini(async () => {
    const old = process.env.GEMINI_MODEL;
    process.env.GEMINI_MODEL = "gemini-3.5-flash";
    try {
      let seen;
      globalThis.fetch = async (url) => ((seen = url), ok({ action: "click", target: "search", reason: "navigate" }));
      await new GeminiPlanner("goal", sink([]), { minIntervalMs: 0 }).decide(state);
      assert.ok(seen.includes("/models/gemini-3.5-flash:generateContent"));
    } finally {
      if (old === undefined) delete process.env.GEMINI_MODEL;
      else process.env.GEMINI_MODEL = old;
    }
  }));

test("gemini adapter fails closed on malformed JSON, invalid decisions, blocked candidates and provider errors", () =>
  withGemini(async () => {
    const events = [];
    const planner = new GeminiPlanner("goal", sink(events), { minIntervalMs: 0 });
    globalThis.fetch = async () => reply("not json {");
    await assert.rejects(planner.decide(state), { code: "invalid_model_response" });
    globalThis.fetch = async () => ok({ action: "click", target: "transfer", reason: "navigate", note: "x" });
    await assert.rejects(planner.decide(state), { code: "invalid_model_response" });
    globalThis.fetch = async () => ok({ action: "eval", target: "search", reason: "navigate" });
    await assert.rejects(planner.decide(state), { code: "invalid_model_response" });
    globalThis.fetch = async () => ok({}, { candidates: [] });
    await assert.rejects(planner.decide(state), { code: "invalid_model_response" });
    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { status: "PERMISSION_DENIED", message: "echo test-only-gemini-key 10001 1234.56" } }),
    });
    await assert.rejects(planner.decide(state), { code: "model_request_failed" });
    const failed = events.find((e) => e.event === "model_request_failed");
    assert.equal(failed.provider_code, "PERMISSION_DENIED");
    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => { throw new Error("html"); } });
    await assert.rejects(planner.decide(state), { code: "model_request_failed" });
    assert.equal(events.at(-1).provider_code, "unclassified");
    const logged = JSON.stringify(events);
    for (const secret of ["test-only-gemini-key", "10001", "1234.56", "not json"])
      assert.ok(!logged.includes(secret));
  }));

test("gemini adapter retries a rate limit once, then reports it", () =>
  withGemini(async () => {
    const events = [];
    const planner = new GeminiPlanner("goal", sink(events), { minIntervalMs: 0, maxRetryMs: 1 });
    let calls = 0;
    const limited = { ok: false, status: 429, json: async () => ({ error: { status: "RESOURCE_EXHAUSTED" } }) };
    globalThis.fetch = async () => (++calls === 1 ? limited : ok({ action: "click", target: "search", reason: "navigate" }));
    assert.equal((await planner.decide(state)).target, "search");
    assert.equal(calls, 2);
    calls = 0;
    globalThis.fetch = async () => (calls++, limited);
    await assert.rejects(planner.decide(state), { code: "model_request_failed" });
    assert.equal(calls, 2);
    assert.equal(events.filter((e) => e.event === "model_retry").length, 2);
  }));

test("gemini adapter requires a key and a plain model id", () =>
  withGemini(async () => {
    assert.throws(() => new GeminiPlanner("g", sink([]), { model: "../../evil?x=" }), { code: "invalid_model" });
    delete process.env.GEMINI_API_KEY;
    assert.throws(() => new GeminiPlanner("g", sink([])), { code: "missing_model_key" });
  }));
