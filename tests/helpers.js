import { makeCapability } from "../src/contracts.js";
export const STEPS = [
  { action: "fill", target: "memberNumber", parameter: "member_id" },
  { action: "click", target: "search" },
  { action: "click", target: "openMember" },
  { action: "click", target: "savings" },
  { action: "extract", target: "balance", output: "balance" },
  { action: "extract", target: "currency", output: "currency" },
];
export const capability = () => makeCapability(STEPS);
/** Test double, NEVER a genuine model run. */
export class ScriptedPlanner {
  async decide({ completed }) {
    const s = STEPS[completed.length];
    return s
      ? {
          ...s,
          reason:
            s.action === "fill"
              ? "enter_parameter"
              : s.action === "extract"
                ? "read_output"
                : "navigate",
        }
      : { action: "finish", reason: "goal_complete" };
  }
}
