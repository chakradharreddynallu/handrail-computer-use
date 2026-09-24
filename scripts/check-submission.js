import { existsSync, readFileSync, readdirSync } from "node:fs";
import { validateCapability } from "../src/contracts.js";
const problems = [];
for (const f of ["README.md", "REPORT.md", "evidence/capability.json"])
  if (!existsSync(f)) problems.push(`Missing ${f}`);
if (existsSync("evidence/capability.json"))
  try {
    validateCapability(
      JSON.parse(readFileSync("evidence/capability.json", "utf8")),
    );
  } catch {
    problems.push("Invalid capability");
  }
const logs = existsSync("evidence")
  ? readdirSync("evidence")
      .filter((n) => n.endsWith(".jsonl"))
      .map((n) =>
        readFileSync(`evidence/${n}`, "utf8")
          .trim()
          .split("\n")
          .map(JSON.parse),
      )
  : [];
if (
  !logs.some(
    (es) =>
      es.some((e) => e.event === "model_call" && e.request_id) &&
      es.some((e) => e.event === "run_completed" && e.status === "success"),
  )
)
  problems.push("Missing successful LIVE model discovery evidence");
if (
  !logs.some(
    (es) =>
      es[0]?.kind === "replay" &&
      es.some((e) => e.event === "run_completed" && e.status === "success"),
  )
)
  problems.push("Missing successful replay evidence");
if (
  !logs.some((es) =>
    es.some(
      (e) => e.event === "run_completed" && e.status === "business_outcome",
    ),
  )
)
  problems.push("Missing exceptional replay evidence");
console.log(
  problems.length
    ? problems.join("\n")
    : "Local evidence checks passed. Manually review provenance, secrets and public repo URL before submitting.",
);
process.exitCode = problems.length ? 1 : 0;
