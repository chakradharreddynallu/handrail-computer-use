import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
/** Callers pass ONLY enumerated metadata, never page text, arguments, outputs or exceptions. */
export class Evidence {
  constructor(dir, kind) {
    this.dir = dir;
    this.id = randomUUID();
    mkdirSync(dir, { recursive: true });
    this.path = join(dir, `${kind}-${this.id}.jsonl`);
    this.emit("run_started", { kind });
  }
  emit(event, fields = {}) {
    appendFileSync(
      this.path,
      JSON.stringify({
        at: new Date().toISOString(),
        run_id: this.id,
        event,
        ...fields,
      }) + "\n",
    );
  }
  snapshot(state) {
    const path = join(this.dir, `failure-${this.id}.json`);
    writeFileSync(
      path,
      JSON.stringify(
        { format: "allowlisted-ui-snapshot-v1", ...state },
        null,
        2,
      ),
    );
    this.emit("failure_evidence", { file: `failure-${this.id}.json` });
    return path;
  }
  result(result) {
    const { outputs, ...safe } = result;
    this.emit("run_completed", {
      ...safe,
      ...(outputs ? { output_fields: Object.keys(outputs) } : {}),
    });
    return result;
  }
}
