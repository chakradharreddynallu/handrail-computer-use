import { isDeepStrictEqual } from "node:util";
/** Deliberately closed v1 contract: new operations require a versioned schema change. */
export const ACTIONS = ["fill", "click", "extract"];
export const TARGETS = [
  "memberNumber",
  "search",
  "openMember",
  "savings",
  "balance",
  "currency",
  "transfer",
];
export const REASONS = [
  "enter_parameter",
  "navigate",
  "read_output",
  "goal_complete",
  "blocked",
];
export class Fault extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
export function requireThat(ok, code = "invalid_contract") {
  if (!ok) throw new Fault(code);
}
export function exactKeys(o, keys) {
  requireThat(o && typeof o === "object" && !Array.isArray(o));
  requireThat(Object.keys(o).every((k) => keys.includes(k)));
}
export function validateStep(s) {
  exactKeys(s, ["action", "target", "parameter", "output"]);
  requireThat(ACTIONS.includes(s.action) && TARGETS.includes(s.target));
  if (s.action === "fill")
    requireThat(
      s.target === "memberNumber" &&
        s.parameter === "member_id" &&
        s.output === undefined,
    );
  if (s.action === "click")
    requireThat(
      ["search", "openMember", "savings", "transfer"].includes(s.target) &&
        s.parameter === undefined &&
        s.output === undefined,
    );
  if (s.action === "extract")
    requireThat(
      ["balance", "currency"].includes(s.target) &&
        s.output === s.target &&
        s.parameter === undefined,
    );
  return s;
}
export function validateDecision(d) {
  exactKeys(d, ["action", "target", "parameter", "output", "reason"]);
  requireThat(REASONS.includes(d.reason));
  const { reason, ...s } = d;
  if (["finish", "escalate"].includes(s.action)) {
    exactKeys(s, ["action"]);
    return d;
  }
  validateStep(s);
  return d;
}
export const INPUTS = {
  member_id: { type: "string", pattern: "^[0-9]{5}$", sensitive: true },
};
export const OUTPUTS = {
  balance: { type: "decimal", scale: 2, sensitive: true },
  currency: { type: "string", enum: ["USD"] },
};
export function validateInputs(args) {
  exactKeys(args, ["member_id"]);
  requireThat(
    typeof args.member_id === "string" && /^\d{5}$/.test(args.member_id),
    "invalid_input",
  );
  return args;
}
export function makeCapability(steps) {
  return {
    schema_version: "1.0",
    name: "read_savings_balance",
    version: 1,
    application: { family: "legacy-servicing-demo", binding_version: "1.0" },
    inputs: structuredClone(INPUTS),
    outputs: structuredClone(OUTPUTS),
    steps: structuredClone(steps),
    checkpoint: "savings_verified",
    targeting: {
      strategy: "trusted-binding-reference",
      binding: "legacy-servicing-demo@1.0",
    },
    risk: "read_only",
  };
}
export function validateCapability(c) {
  exactKeys(c, [
    "schema_version",
    "name",
    "version",
    "application",
    "inputs",
    "outputs",
    "steps",
    "checkpoint",
    "targeting",
    "risk",
  ]);
  const base = makeCapability([]);
  for (const key of Object.keys(base).filter((k) => k !== "steps"))
    requireThat(
      isDeepStrictEqual(c[key], base[key]),
      "incompatible_capability",
    );
  requireThat(
    Array.isArray(c.steps) && c.steps.length > 0 && c.steps.length <= 20,
  );
  c.steps.forEach(validateStep);
  requireThat(
    c.steps.some((s) => s.action === "extract" && s.output === "balance") &&
      c.steps.some((s) => s.action === "extract" && s.output === "currency"),
  );
  return c;
}
