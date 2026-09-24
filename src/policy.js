import { Fault, requireThat, validateStep } from "./contracts.js";
export const defaultPolicy = {
  paths: ["/", "/legacy"],
  actions: ["fill", "click", "extract"],
  blockedTargets: ["transfer"],
  faults: ["none", "slow", "notice", "session", "denied", "crash", "dialog"],
};
export class Policy {
  constructor(origin, config = defaultPolicy) {
    const u = new URL(origin);
    requireThat(
      u.protocol === "http:" &&
        u.hostname === "127.0.0.1" &&
        u.pathname === "/" &&
        !u.search &&
        !u.hash &&
        !u.username &&
        !u.password,
      "target_not_allowed",
    );
    this.origin = u.origin;
    this.config = config;
  }
  urlAllowed(raw) {
    try {
      const u = new URL(raw);
      return (
        u.origin === this.origin &&
        !u.username &&
        !u.password &&
        !u.hash &&
        this.config.paths.includes(u.pathname) &&
        [...u.searchParams.keys()].every((k) => k === "fault") &&
        u.searchParams.getAll("fault").length <= 1 &&
        (!u.search || this.config.faults.includes(u.searchParams.get("fault")))
      );
    } catch {
      return false;
    }
  }
  checkURL(raw) {
    requireThat(this.urlAllowed(raw), "target_not_allowed");
  }
  checkStep(step) {
    validateStep(step);
    if (
      !this.config.actions.includes(step.action) ||
      this.config.blockedTargets.includes(step.target)
    )
      throw new Fault("policy_blocked");
  }
}
