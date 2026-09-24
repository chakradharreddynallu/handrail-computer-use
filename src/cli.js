import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Policy, defaultPolicy } from "./policy.js";
import { BrowserSurface } from "./surface.js";
import { Evidence } from "./evidence.js";
import { Handoff, terminalOperator } from "./handoff.js";
import { Engine } from "./engine.js";
const { positionals, values: v } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: "string", default: "http://127.0.0.1:4173/" },
    goal: { type: "string" },
    member: { type: "string", default: "10001" },
    artifact: { type: "string", default: "evidence/capability.json" },
    evidence: { type: "string", default: "evidence" },
    headed: { type: "boolean", default: false },
    interactive: { type: "boolean", default: false },
    policy: { type: "string" },
    "show-outputs": { type: "boolean", default: false },
  },
});
let surface;
try {
  const mode = positionals[0];
  if (!["discover", "replay"].includes(mode)) throw Error();
  const policy = new Policy(
    new URL(v.target).origin,
    v.policy ? JSON.parse(readFileSync(v.policy, "utf8")) : defaultPolicy,
  );
  policy.checkURL(v.target);
  const evidence = new Evidence(v.evidence, mode);
  let planner, capability;
  if (mode === "discover") {
    if (!v.goal) throw Error();
    const { OpenAIPlanner } = await import("./planner.js");
    planner = new OpenAIPlanner(v.goal, evidence);
  } else capability = JSON.parse(readFileSync(v.artifact, "utf8"));
  surface = await BrowserSurface.create(policy, evidence, { headed: v.headed });
  await surface.open(v.target);
  const engine = new Engine(
    surface,
    evidence,
    new Handoff({ operator: v.interactive ? terminalOperator : undefined }),
  );
  const result = await engine.run({
    capability,
    planner,
    args: { member_id: v.member },
  });
  if (result.artifact) {
    mkdirSync(dirname(v.artifact), { recursive: true });
    writeFileSync(v.artifact, JSON.stringify(result.artifact, null, 2));
  }
  const { artifact, outputs, ...summary } = result;
  console.log(
    JSON.stringify(
      {
        ...summary,
        ...(outputs
          ? {
              outputs: v["show-outputs"]
                ? outputs
                : "[redacted; returned in process]",
            }
          : {}),
      },
      null,
      2,
    ),
  );
  process.exitCode = result.status === "failure" ? 1 : 0;
} catch {
  console.error(
    "Setup failed. Check command, target, artifact, browser installation and OPENAI_API_KEY. Raw errors suppressed to avoid secret leakage.",
  );
  process.exitCode = 1;
} finally {
  if (surface) await surface.close();
}
