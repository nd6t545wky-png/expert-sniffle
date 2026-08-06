/**
 * Verifies legacy-data adoption in a real browser: seed a legacy key, load
 * the app, and confirm the data is carried across without loss and without
 * the legacy copy being destroyed.
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8899/next/";
const results = [];
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const LEGACY = {
  version: 1,
  onboardingComplete: true,
  pre: { "2026-07-01": { score: 82, risk: "green", planLevel: "full", workloadFactor: 1 } },
  post: { "2026-07-01": { perceivedExertion: 6, armFeel: 8 } },
  bullpens: { "2026-07-01": { date: "2026-07-01", intent: "moderate", throws: 35 } },
  completedTasks: { "2026-07-01": ["warmup", "throwing"] },
  profile: { name: "Dylan Sippel" },
  somethingUnknown: { keep: "this" },
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

// Seed the legacy key on the origin, with no current-key data.
await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate((data) => {
  localStorage.clear();
  localStorage.setItem("dylanCleanV1", JSON.stringify(data));
}, LEGACY);

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);

const current = await page.evaluate(() => JSON.parse(localStorage.getItem("dylan-pitching-os-v1") || "null"));
const legacyStill = await page.evaluate(() => localStorage.getItem("dylanCleanV1"));

check("legacy data adopted into the current key", current !== null);
check("readiness record carried across", current?.pre?.["2026-07-01"]?.score === 82);
check("session report carried across", current?.post?.["2026-07-01"]?.armFeel === 8);
check("throwing record carried across", current?.bullpens?.["2026-07-01"]?.throws === 35);
check("completed tasks carried across", JSON.stringify(current?.completedTasks?.["2026-07-01"]) === '["warmup","throwing"]');
check("unknown fields preserved, not dropped", current?.somethingUnknown?.keep === "this");
check("profile preserved", current?.profile?.name === "Dylan Sippel");
check("legacy copy left in place, not deleted", legacyStill !== null);

// The adopted plan should actually drive the UI.
// Reach the year view the way the app does on a phone: More, then Year.
await page.click('.bottom-nav button:has-text("More")');
await page.waitForTimeout(200);
await page.locator('.content .nav-item:has-text("Year")').first().click();
await page.waitForTimeout(200);
check("app usable after migration", (await page.textContent("#root")).includes("Annual plan"));

// Migration must never clobber newer current-key data with older legacy data.
await page.evaluate(() => {
  localStorage.setItem(
    "dylan-pitching-os-v1",
    JSON.stringify({ version: 1, pre: { "2026-08-01": { score: 99 } }, post: {}, bullpens: {}, completedTasks: {} })
  );
  localStorage.setItem("dylanCleanV1", JSON.stringify({ version: 1, pre: { "2020-01-01": { score: 1 } } }));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);
const afterSecond = await page.evaluate(() => JSON.parse(localStorage.getItem("dylan-pitching-os-v1") || "null"));
check("existing data not overwritten by older legacy data", afterSecond?.pre?.["2026-08-01"]?.score === 99);
check("stale legacy record not merged in", afterSecond?.pre?.["2020-01-01"] === undefined);

await browser.close();
console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
