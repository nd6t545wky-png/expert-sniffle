/**
 * End-to-end verification of the rebuilt app against a real browser.
 * Drives the actual workflows rather than asserting that markup exists.
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8899/next/";
const results = [];
let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

const go = async (label) => {
  await page.click(`nav button:has-text("${label}")`);
  await page.waitForTimeout(120);
};
const storage = () => page.evaluate(() => JSON.parse(localStorage.getItem("dylan-pitching-os-v1") || "null"));

await page.goto(BASE, { waitUntil: "networkidle" });

// ---------------------------------------------------------------- gate
await go("Session");
check("session starts locked", (await page.textContent("#root")).includes("Locked"));
check("tasks hidden while locked", !(await page.isVisible('button:has-text("Mark complete")')));

await go("Workload");
await page.selectOption("select", "high");
await page.click('button:has-text("Log throwing")');
await page.waitForTimeout(120);
const preAuth = await page.textContent('[role="alert"]');
check("high intent blocked before readiness", preAuth && preAuth.length > 0, preAuth?.slice(0, 60));

// ------------------------------------------------------- readiness: hold
await go("Readiness");
const setRange = async (label, value) => {
  const el = page.locator(`label:has-text("${label}") input[type="range"]`).first();
  await el.evaluate((node, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(node, String(v));
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await page.waitForTimeout(60);
};

await setRange("Shoulder", 7);
await page.waitForTimeout(150);
const holdPreview = await page.textContent('[role="status"]');
check("shoulder 7 previews a hold", holdPreview?.includes("hold"), holdPreview?.slice(0, 40));
check("hold explains it needs review", (await page.textContent("#root")).includes("cannot be overridden"));

// back to healthy
await setRange("Shoulder", 0);
await page.waitForTimeout(150);
const fullPreview = await page.textContent('[role="status"]');
check("healthy inputs preview full", fullPreview?.includes("full"), fullPreview?.slice(0, 40));

// ------------------------------------------------------------- submit
await page.click('button:has-text("Submit readiness")');
await page.waitForTimeout(300);
const afterSubmit = await storage();
check("readiness persisted to localStorage", afterSubmit && Object.keys(afterSubmit.pre || {}).length === 1);
const submittedDate = afterSubmit ? Object.keys(afterSubmit.pre)[0] : "";
check("stored under an ISO date key", /^\d{4}-\d{2}-\d{2}$/.test(submittedDate), submittedDate);
check("navigated to the session after submitting", (await page.textContent("#root")).includes("Today's session"));

// --------------------------------------------------------- plan unlocked
check("session now unlocked", !(await page.textContent("#root")).includes("Locked"));
check("tasks visible", await page.isVisible('button:has-text("Mark complete")'));

// -------------------------------------------------------- duplicate guard
await go("Readiness");
await page.click('button:has-text("Submit readiness")');
await page.waitForTimeout(200);
const dupText = await page.textContent("#root");
check("duplicate readiness refused", dupText.includes("already been submitted"));
const afterDup = await storage();
check("duplicate did not add a second record", Object.keys(afterDup.pre).length === 1);

// ------------------------------------------------------- task completion
await go("Session");
await page.click('button:has-text("Mark complete")');
await page.waitForTimeout(250);
const afterTask = await storage();
const tasksDone = afterTask.completedTasks?.[submittedDate] || [];
check("task completion persisted", tasksDone.length === 1, JSON.stringify(tasksDone));
check("completed task shows as logged", await page.isVisible('button:has-text("Logged")'));

// ------------------------------------------------------------- workload
await go("Workload");
const today = await page.evaluate(() => new Date().getDay()); // 0=Sun
const isHighIntentDay = today === 3 || today === 6; // Wed or Sat
await page.selectOption("select", "high");
await page.click('button:has-text("Log throwing")');
await page.waitForTimeout(250);
const afterHigh = await storage();
const loggedHigh = Object.keys(afterHigh.bullpens || {}).length > 0;
check(
  isHighIntentDay ? "high intent allowed on Wed/Sat" : "high intent blocked on a non-permitted day",
  isHighIntentDay ? loggedHigh : !loggedHigh,
  `weekday=${today} logged=${loggedHigh}`
);

// a permitted intent must always work
await page.selectOption("select", "low");
await page.click('button:has-text("Log throwing")');
await page.waitForTimeout(250);
const afterLow = await storage();
check("low intent logged", Object.keys(afterLow.bullpens || {}).length > 0);
check("workload totals rendered", (await page.textContent("#root")).includes("7-day load"));

// -------------------------------------------------------------- report
await go("Tracking");
await page.click('button:has-text("Submit report")');
await page.waitForTimeout(250);
const afterReport = await storage();
check("session report persisted", Object.keys(afterReport.post || {}).length === 1);
check("report shown back", (await page.textContent("#root")).includes("Reported:"));

// duplicate report
await go("Tracking");
check("duplicate report prevented by UI state", !(await page.isVisible('button:has-text("Submit report")')));

// ------------------------------------------------------------ annual
await go("Annual");
const weekCount = await page.$$eval(".week-grid button", (b) => b.length);
check("52 week cells", weekCount === 52, String(weekCount));
await page.click('[aria-label="Week 30, Preseason"]');
await page.waitForTimeout(150);
check("selecting week 30 shows Preseason", (await page.textContent("#root")).includes("Preseason"));
check("shows position within phase", /week 4 of 10/.test(await page.textContent("#root")));

// ------------------------------------------------- persistence on reload
const before = await storage();
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);
const after = await storage();
check("data survives a reload", JSON.stringify(before.pre) === JSON.stringify(after.pre));
await go("Session");
check("plan still unlocked after reload", !(await page.textContent("#root")).includes("Locked"));

// ------------------------------------------------------ dashboard summary
await go("Dashboard");
const dash = await page.textContent("#root");
check("dashboard shows readiness score", /\d+\/100/.test(dash));
check("dashboard shows programme phase", /Winter Ball|Transition|Velocity|Preseason|Summer/.test(dash));

// -------------------------------------------------------- corrupt data
await page.evaluate(() => localStorage.setItem("dylan-pitching-os-v1", "{ not json"));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);
const corruptText = await page.textContent("#root");
check("corrupt data surfaces a warning", corruptText.includes("could not be read"));
check("corrupt data is not deleted", corruptText.includes("Nothing has been deleted"));
const backedUp = await page.evaluate(() =>
  Object.keys(localStorage).some((k) => k.includes("corrupt") && localStorage.getItem(k) === "{ not json")
);
check("original bytes preserved under a backup key", backedUp);

// ---------------------------------------------------------------- output
check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

await browser.close();
console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
