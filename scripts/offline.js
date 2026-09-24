import { writeFileSync } from "node:fs";
import { startSandbox } from "../sandbox/server.js";
import { Policy } from "../src/policy.js";
import { BrowserSurface } from "../src/surface.js";
import { Evidence } from "../src/evidence.js";
import { Engine } from "../src/engine.js";
import { Handoff } from "../src/handoff.js";
import { ScriptedPlanner } from "../tests/helpers.js";
const app = await startSandbox(0);
let artifact;
try {
  for (const scenario of [
    "scripted-discovery",
    "replay",
    "not-found",
    "slow",
    "notice",
    "handoff",
    "app-error",
    "dialog",
  ]) {
    const evidence = new Evidence("evidence/offline", scenario);
    evidence.emit("provenance", {
      model: "NONE",
      driver: "scripted-test",
      human: scenario === "handoff" ? "simulated-operator" : "none",
    });
    const surface = await BrowserSurface.create(
      new Policy(app.origin),
      evidence,
    );
    try {
      const fault =
        { slow: "slow", notice: "notice", handoff: "session", "app-error": "crash", dialog: "dialog" }[scenario] ||
        "none";
      await surface.open(`${app.origin}/?fault=${fault}`);
      const operator =
        scenario === "handoff"
          ? async ({ id, act }) => {
              await act("restore");
              return { id, action: "resume" };
            }
          : undefined;
      const result = await new Engine(
        surface,
        evidence,
        new Handoff({ operator }),
      ).run({
        args: {
          member_id:
            scenario === "not-found"
              ? "99999"
              : scenario === "replay"
                ? "10002"
                : "10001",
        },
        ...(scenario === "scripted-discovery"
          ? { planner: new ScriptedPlanner() }
          : { capability: artifact }),
      });
      if (result.artifact) {
        artifact = result.artifact;
        writeFileSync(
          "evidence/offline/capability.json",
          JSON.stringify(artifact, null, 2),
        );
      }
      console.log(
        `${scenario}: ${result.status}${result.code ? " / " + result.code : ""}`,
      );
      const expectedFailure = ["app-error", "dialog"].includes(scenario);
      if ((result.status === "failure") !== expectedFailure) throw Error("Offline scenario had an unexpected outcome");
    } finally {
      await surface.close();
    }
  }
} finally {
  await app.close();
}
