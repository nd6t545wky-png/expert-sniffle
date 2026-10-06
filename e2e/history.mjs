/**
 * Training history, end to end against the real Worker and a local D1.
 *
 * Logs a throw in the browser and checks it reaches `/api/history` as an
 * encrypted row, then opens a second, empty device with the same key and
 * checks the record is read back. Expects `wrangler dev --local` on HISTORY_BASE
 * (default http://127.0.0.1:8790) with migrations applied.
 */
import { chromium } from "playwright";

const ORIGIN = process.env.HISTORY_BASE || "http://127.0.0.1:8790";
const BASE = `${ORIGIN}/next/`;
const SHOTS = process.env.HISTORY_SHOTS || "";
const KEY = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

const results = [];
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const serverRows = async () => {
  const response = await fetch(`${ORIGIN}/api/history`, { headers: { Authorization: `Bearer ${KEY}` } });
  return (await response.json()).events ?? [];
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

async function device() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((key) => {
    localStorage.setItem("dylan-pitching-os-sync-key-v1", key);
    localStorage.setItem("dylan-pitching-os-v1", JSON.stringify({ version: 1, onboardingComplete: true }));
  }, KEY);
  await page.reload({ waitUntil: "networkidle" });
  return { context, page };
}

const go = async (page, target) => {
  const bottom = page.locator(`.bottom-nav button:has-text("${target}")`);
  if (await bottom.count()) await bottom.first().click();
  else {
    await page.locator('.bottom-nav button:has-text("More")').click();
    await page.waitForTimeout(150);
    await page.locator(`.mobile-sheet .nav-item:has-text("${target}")`).first().click();
  }
  await page.waitForTimeout(200);
};

// ---- device A: do something, see it uploaded
const a = await device();
await go(a.page, "Today");
await a.page.locator('.metric-shortcut:has-text("Active workload")').first().click();
await a.page.waitForTimeout(200);
await a.page.selectOption("select", "low");
await a.page.click('button:has-text("Log throwing")');

let rows = [];
for (let i = 0; i < 20 && !rows.length; i += 1) {
  await a.page.waitForTimeout(500);
  rows = await serverRows();
}
check("logged throw reaches the server's history table", rows.length >= 1, `${rows.length} rows`);
check("stored as a performance result", rows.some((r) => r.eventType === "performance_result"));
check("payload is ciphertext, not the record", rows.every((r) => !/throws|intent/.test(r.encryptedPayload)));

const local = await a.page.evaluate(() => JSON.parse(localStorage.getItem("dylan-pitching-os-v1")).trainingHistory);
check("device A marks the event uploaded", local?.events?.length >= 1 && local.events.every((e) => e.uploadedAt));

await go(a.page, "Athlete");
const cardA = await a.page.locator('[aria-label="Training history"]').textContent();
check("history card lists the throw", /Throwing logged/.test(cardA ?? ""), cardA?.slice(0, 120));
check("history card reports everything saved", /Every step is saved/.test(cardA ?? ""));
if (SHOTS) await a.page.locator('[aria-label="Training history"]').screenshot({ path: `${SHOTS}/history-card.png` });

// ---- device B: empty, same key, reads the record back
const b = await device();
let remote = null;
for (let i = 0; i < 20; i += 1) {
  await b.page.waitForTimeout(500);
  remote = await b.page.evaluate(() => JSON.parse(localStorage.getItem("dylan-pitching-os-v1")).trainingHistory);
  if (remote?.events?.length) break;
}
check("a second device reads the history back", remote?.events?.length === rows.length, `${remote?.events?.length} events`);
check("second device does not re-upload what it read", (await serverRows()).length === rows.length);

await browser.close();
console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
