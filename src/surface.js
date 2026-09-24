import { chromium } from "playwright";
import { Fault, requireThat } from "./contracts.js";
/** Trusted, reviewed bindings: never accepted from a model or an artifact. */
export const BINDINGS = {
  memberNumber: { kind: "label", name: "Member number" },
  search: { kind: "button", name: "Search" },
  openMember: { kind: "button", name: "Open member" },
  savings: { kind: "button", name: "Savings" },
  balance: { kind: "label", name: "Current balance" },
  currency: { kind: "label", name: "Currency" },
  transfer: { kind: "button", name: "Transfer funds" },
  dismissNotice: { kind: "button", name: "Dismiss notice" },
  restoreSession: { kind: "button", name: "Restore demo session" },
  back: { kind: "button", name: "Back to search" },
};
const HEADINGS = {
  search: "Member search",
  results: "Search results",
  details: "Member details",
  savings_verified: "Savings overview",
  not_found: "Member not found",
  validation: "Invalid member number",
  denied: "Permission denied",
  app_error: "Application unavailable",
  session_expired: "Session expired",
  notice: "Read-only notice",
};
/** Surface seam: observe(), act(), extract(), checkpoint(), close(). No model dependency. */
export class BrowserSurface {
  static async create(policy, evidence, { headed = false } = {}) {
    const s = new BrowserSurface();
    s.policy = policy;
    s.evidence = evidence;
    s.owner = "automation";
    s.dialogBlocked = false;
    s.networkBlocked = false;
    s.browser = await chromium.launch({
      headless: !headed,
      ...(process.env.HANDRAIL_CHROMIUM_PATH
        ? {
            executablePath: process.env.HANDRAIL_CHROMIUM_PATH,
            args: ["--no-sandbox", "--disable-dev-shm-usage"],
          }
        : {}),
    });
    s.context = await s.browser.newContext({
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    await s.context.route("**/*", async (route) => {
      if (
        !policy.urlAllowed(route.request().url()) ||
        route.request().method() !== "GET"
      ) {
        s.networkBlocked = true;
        evidence.emit("network_blocked");
        await route.abort();
      } else await route.continue();
    });
    await s.context.routeWebSocket(/.*/, (ws) => ws.close());
    s.page = await s.context.newPage();
    s.page.setDefaultTimeout(1500);
    s.page.on("dialog", async (d) => {
      s.dialogBlocked = true;
      evidence.emit("unexpected_dialog", {
        action: "dismissed_without_accepting",
      });
      await d.dismiss();
    });
    s.context.on("page", async (p) => {
      if (p !== s.page) {
        s.networkBlocked = true;
        await p.close();
      }
    });
    await s.page.exposeBinding("__operatorEvent", (_, kind, target) => {
      if (s.owner === "human" && ["click", "input", "keydown"].includes(kind))
        evidence.emit("human_ui_event", {
          kind,
          target: Object.hasOwn(BINDINGS, target) ? target : "unmapped",
          values: "not_collected",
        });
    });
    await s.page.addInitScript((bindings) => {
      for (const kind of ["click", "input", "keydown"])
        document.addEventListener(
          kind,
          (e) => {
            const el = e.target.closest("button,input,output") || e.target;
            const name =
              el.labels?.[0]?.textContent ||
              el.getAttribute("aria-label") ||
              el.textContent;
            const target =
              Object.keys(bindings).find(
                (k) => bindings[k].name === name?.trim(),
              ) || "unmapped";
            window.__operatorEvent(kind, target);
          },
          true,
        );
    }, BINDINGS);
    return s;
  }
  root() {
    return this.page.frameLocator('iframe[title="Legacy servicing"]');
  }
  locator(target) {
    const b = BINDINGS[target];
    requireThat(b, "unknown_target");
    return b.kind === "label"
      ? this.root().getByLabel(b.name, { exact: true })
      : this.root().getByRole(b.kind, { name: b.name, exact: true });
  }
  async open(url) {
    this.policy.checkURL(url);
    await this.page.goto(url);
    await this.root().getByRole("heading").first().waitFor();
  }
  async observe() {
    let state = "unknown";
    for (const [key, text] of Object.entries(HEADINGS)) {
      if (
        await this.root()
          .getByRole("heading", { name: text, exact: true })
          .isVisible()
      ) {
        state = key;
        break;
      }
    }
    if (
      await this.root()
        .getByRole("status")
        .filter({ hasText: /^Loading$/ })
        .isVisible()
    )
      state = "loading";
    if (this.dialogBlocked) state = "unexpected_dialog";
    if (this.networkBlocked) state = "network_blocked";
    const controls = [];
    for (const target of Object.keys(BINDINGS)) {
      if (await this.locator(target).isVisible()) controls.push(target);
    }
    return { surface: "browser", binding_version: "1.0", state, controls };
  }
  async checkpoint() {
    return (
      (await this.observe()).state === "savings_verified" &&
      (await this.root()
        .getByRole("status")
        .filter({ hasText: /^Balance verified$/ })
        .isVisible())
    );
  }
  async act(step, args, owner = "automation") {
    requireThat(this.owner === owner, "control_ownership");
    this.policy.checkStep(step);
    this.policy.checkURL(this.page.url());
    const loc = this.locator(step.target);
    await loc.waitFor({ state: "visible" });
    requireThat((await loc.count()) === 1, "ambiguous_target");
    if (step.action === "fill") await loc.fill(args[step.parameter]);
    else if (step.action === "click") await loc.click();
    else return this.extract(step.target);
  }
  async extract(target) {
    const loc = this.locator(target);
    requireThat((await loc.count()) === 1, "ambiguous_target");
    const value = (await loc.innerText()).trim();
    if (target === "balance")
      requireThat(/^\d+\.\d{2}$/.test(value), "invalid_output");
    else
      requireThat(target === "currency" && value === "USD", "invalid_output");
    return value; // Sensitive values returned to caller only, never Evidence.
  }
  async recoverNotice() {
    requireThat(this.owner === "automation", "control_ownership");
    await this.locator("dismissNotice").click();
  }
  async diagnostic() {
    const state = await this.observe();
    const nodes = [];
    for (const target of state.controls) {
      const loc = this.locator(target);
      nodes.push({
        target,
        role: BINDINGS[target].kind,
        count: await loc.count(),
        enabled: await loc.isEnabled(),
        box: await loc.boundingBox(),
      });
    }
    return {
      ...state,
      frame_count: this.page.frames().length,
      nodes,
      values: "omitted_by_construction",
    };
  }
  async humanAction(command, args) {
    requireThat(this.owner === "human", "control_ownership");
    if (command === "restore") {
      await this.locator("restoreSession").click();
      return;
    }
    if (command === "back") {
      await this.locator("back").click();
      return;
    }
    throw new Fault("operator_action_not_allowed");
  }
  async close() {
    await this.browser.close();
  }
}
