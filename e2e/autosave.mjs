/**
 * Autosave: one upload per change, and silence when nothing changes.
 * The loop risk is real — a sync can alter local state, and syncing that back
 * would spin — so this asserts quiet periods explicitly.
 */
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
p.setDefaultTimeout(10000);

let calls = [];
await c.route("**/api/sync**", (route) =>
  (calls.push(route.request().method()),
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ revision: 1, payload: null, updatedAt: new Date().toISOString() }),
  }))
);
await c.route("**/api/account/status**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: '{"signedIn":false,"workspaceReady":false}' })
);
await p.addInitScript(() => localStorage.setItem("dylan-pitching-os-sync-key-v1", "a".repeat(64)));

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);

await p.goto("http://127.0.0.1:8899/next/", { waitUntil: "networkidle" });
await p.waitForTimeout(4000);
check("the loaded snapshot is saved without being asked", calls.length >= 2, calls.join(","));

// --- quiet means quiet
calls = [];
await p.waitForTimeout(12000);
check("no traffic while nothing changes", calls.length === 0, `${calls.length} requests`);

// --- exactly one cycle per change
calls = [];
await p.locator('.metric-shortcut:has-text("Readiness")').first().click();
await p.waitForTimeout(400);
await p.click('button:has-text("Set today")');
await p.waitForTimeout(5000);
check("a change uploads once (pull then push)", calls.join(",") === "GET,PUT", calls.join(","));

// --- a burst of edits debounces into one upload
calls = [];
const slider = p.locator("#rpe");
await p.locator('.bottom-nav button:has-text("Progress")').click();
await p.waitForTimeout(400);
for (const value of [3, 4, 5, 6, 7]) {
  await slider.evaluate((n, v) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(n, String(v));
    n.dispatchEvent(new Event("input", { bubbles: true }));
    n.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await p.waitForTimeout(120);
}
await p.click('button:has-text("Submit report")');
await p.waitForTimeout(5000);
check("a burst of edits is one upload, not one per keystroke", calls.length <= 2, `${calls.length} requests`);

// --- and it goes quiet again afterwards
calls = [];
await p.waitForTimeout(10000);
check("settles again after the upload", calls.length === 0, `${calls.length} requests`);

console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
await b.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
