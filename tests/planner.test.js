import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIPlanner } from "../src/planner.js";

test("provider adapter validates real API-shaped response; mock is not live evidence", async () => {
  const oldFetch = globalThis.fetch,
    oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-key";
  const events = [];
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.equal(body.response_format.type, "json_object");
      assert.ok(!options.body.includes("10001"));
      assert.ok(!options.body.includes("test-only-key"));
      return {
        ok: true,
        headers: new Headers({ "x-request-id": "mock-request" }),
        json: async () => ({
          usage: { total_tokens: 1 },
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: "click",
                  target: "search",
                  reason: "navigate",
                }),
              },
            },
          ],
        }),
      };
    };
    const planner = new OpenAIPlanner("Read savings balance", {
      emit: (event, fields) => events.push({ event, ...fields }),
    });
    const decision = await planner.decide({
      observation: { state: "search", controls: ["search"] },
      completed: [],
      output_fields: [],
    });
    assert.equal(decision.action, "click");
    assert.equal(events[0].request_id, "mock-request");
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(planner.decide({}), { code: "model_request_failed" });
    assert.ok(!JSON.stringify(events).includes("test-only-key"));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
