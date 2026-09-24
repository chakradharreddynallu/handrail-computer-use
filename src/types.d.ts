/** Portable capability contracts. Runtime validation lives in contracts.js. */
export type Step =
  | { action: "fill"; target: "memberNumber"; parameter: "member_id" }
  | {
      action: "click";
      target: "search" | "openMember" | "savings" | "transfer";
    }
  | { action: "extract"; target: "balance"; output: "balance" }
  | { action: "extract"; target: "currency"; output: "currency" };
export interface Inputs {
  member_id: string;
}
export interface Outputs {
  balance: string;
  currency: "USD";
}
export interface Observation {
  surface?: "browser";
  binding_version?: "1.0";
  state: string;
  controls?: string[];
}
export interface Capability {
  schema_version: "1.0";
  name: "read_savings_balance";
  version: 1;
  application: { family: "legacy-servicing-demo"; binding_version: "1.0" };
  inputs: {
    member_id: { type: "string"; pattern: "^[0-9]{5}$"; sensitive: true };
  };
  outputs: {
    balance: { type: "decimal"; scale: 2; sensitive: true };
    currency: { type: "string"; enum: ["USD"] };
  };
  steps: Step[];
  checkpoint: "savings_verified";
  risk: "read_only";
  targeting: {
    strategy: "trusted-binding-reference";
    binding: "legacy-servicing-demo@1.0";
  };
}
export type Result =
  | { status: "success"; outputs: Outputs; step: number; artifact?: Capability }
  | {
      status: "business_outcome";
      code: "member_not_found" | "validation_error" | "permission_denied";
      step: number;
    }
  | {
      status: "failure";
      code: string;
      step: number;
      expected: string;
      observed: Observation;
    };
export interface Surface {
  owner: "automation" | "paused" | "human" | "stopped";
  observe(): Promise<Observation>;
  act(step: Step, args: Inputs, owner?: string): Promise<string | undefined>;
  extract(target: "balance" | "currency"): Promise<string>;
  checkpoint(): Promise<boolean>;
  close(): Promise<void>;
}
