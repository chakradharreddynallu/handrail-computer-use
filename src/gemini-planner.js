import { Fault, validateDecision, requireThat, TARGETS, REASONS } from "./contracts.js";
import { SYSTEM_PROMPT, userContent } from "./planner.js";
/**
 * Google Gemini adapter with the same decide() contract as OpenAIPlanner. Only discovery imports it.
 * Output is constrained by a JSON Schema at generation time and still validated by validateDecision.
 */
export const DECISION_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["fill", "click", "extract", "finish", "escalate"] },
    // The risky target is never offered to the model; policy blocks it independently anyway.
    target: { type: "string", enum: TARGETS.filter((t) => t !== "transfer") },
    parameter: { type: "string", enum: ["member_id"] },
    output: { type: "string", enum: ["balance", "currency"] },
    reason: { type: "string", enum: REASONS },
  },
  required: ["action", "reason"],
  additionalProperties: false,
};
const ALLOWED_STATUS = new Set([
  "INVALID_ARGUMENT", "FAILED_PRECONDITION", "PERMISSION_DENIED", "UNAUTHENTICATED",
  "NOT_FOUND", "RESOURCE_EXHAUSTED", "INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const count = (n) => (Number.isInteger(n) ? n : 0);
export class GeminiPlanner {
  constructor(
    goal,
    evidence,
    {
      model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      // Free-tier per-minute quotas are small; pacing avoids 429s. Model calls have no UI side effects.
      minIntervalMs = Number(process.env.GEMINI_MIN_INTERVAL_MS ?? 6500),
      maxRetryMs = 60000,
    } = {},
  ) {
    requireThat(!!process.env.GEMINI_API_KEY, "missing_model_key");
    // The model id becomes part of the URL path; reject anything that is not a plain id.
    requireThat(/^[a-z0-9][a-z0-9.\-]{0,63}$/.test(model), "invalid_model");
    this.goal = goal;
    this.evidence = evidence;
    this.model = model;
    this.minIntervalMs = Number.isFinite(minIntervalMs) && minIntervalMs > 0 ? minIntervalMs : 0;
    this.maxRetryMs = maxRetryMs;
    this.calls = 0;
    this.lastCall = 0;
  }
  async request(state) {
    const wait = this.lastCall + this.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCall = Date.now();
    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      {
        method: "POST",
        // Key goes in a header, never the URL, so it cannot leak through URL logging.
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userContent(this.goal, state) }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseJsonSchema: DECISION_SCHEMA,
          },
        }),
      },
    );
  }
  async decide(state) {
    this.calls++;
    let response = await this.request(state);
    let body;
    // Rate limit (429) or transient overload (503): one bounded retry. Re-asking the model is
    // safe; it cannot repeat a UI action.
    const RETRY_DEFAULT_MS = { 429: 30000, 503: 10000 };
    if (RETRY_DEFAULT_MS[response.status]) {
      const status = response.status;
      try { body = await response.json(); } catch {}
      const hint = body?.error?.details?.find?.((d) => d?.retryDelay)?.retryDelay;
      const delayMs = Math.min(
        this.maxRetryMs,
        /^\d+(\.\d+)?s$/.test(hint ?? "") ? Math.ceil(parseFloat(hint) * 1000) : RETRY_DEFAULT_MS[status],
      );
      this.evidence.emit("model_retry", { http_status: status, delay_ms: delayMs });
      await sleep(delayMs);
      body = undefined;
      response = await this.request(state);
    }
    if (!response.ok) {
      // Log only fixed categories; provider messages can echo credentials or input.
      try { body ??= await response.json(); } catch {}
      const status = body?.error?.status;
      this.evidence.emit("model_request_failed", {
        http_status: Number.isInteger(response.status) ? response.status : 0,
        provider_code: ALLOWED_STATUS.has(status) ? status : "unclassified",
      });
      throw new Fault("model_request_failed");
    }
    const data = await response.json();
    const u = data.usageMetadata || {};
    this.evidence.emit("model_call", {
      provider: "gemini",
      model: this.model,
      model_version: typeof data.modelVersion === "string" ? data.modelVersion : null,
      request_id: typeof data.responseId === "string" ? data.responseId : null,
      call: this.calls,
      usage: {
        prompt_tokens: count(u.promptTokenCount),
        output_tokens: count(u.candidatesTokenCount),
        thought_tokens: count(u.thoughtsTokenCount),
        total_tokens: count(u.totalTokenCount),
      },
    });
    try {
      const text = data.candidates[0].content.parts
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text)
        .join("");
      return validateDecision(JSON.parse(text));
    } catch {
      throw new Fault("invalid_model_response");
    }
  }
}
