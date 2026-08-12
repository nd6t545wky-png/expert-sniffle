/**
 * Offline behaviour.
 *
 * The rebuilt app shipped for months with no service worker at all — only the
 * prototype's app.js ever registered one — so at a field with no signal it did
 * not load. This suite is here so that cannot happen again quietly: it checks
 * the worker registers, that it precaches the /next/ bundles by name, and that
 * both apps still render with the network cut.
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE || "http://127.0.0.1:8899";
let passed = 0;
let failed = 0;

function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${BASE}/next/`, { waitUntil: "networkidle" });
const controlled = await page
  .waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 })
  .then(() => true)
  .catch(() => false);
check("the rebuilt app registers a service worker", controlled);

await page.waitForTimeout(1500);
const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  const paths = [];
  for (const name of names) {
    const keys = await (await caches.open(name)).keys();
    for (const request of keys) paths.push(new URL(request.url).pathname);
  }
  return paths;
});

check("the cache is named for this build", (await page.evaluate(() => caches.keys())).some((k) => /^pitching-os-[0-9a-f]{12}$/.test(k)));
check("the prototype shell is precached", cached.includes("/index.html"));
check("the rebuilt shell is precached", cached.includes("/next/"));
check(
  "the rebuilt app's bundles are precached by name",
  cached.some((path) => /^\/next\/assets\/index-.*\.js$/.test(path)),
  cached.filter((p) => p.startsWith("/next/assets/")).join(", ")
);
check("no API response was cached", !cached.some((path) => path.startsWith("/api/")));

await context.setOffline(true);

await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(1500);
check(
  "the rebuilt app renders with the network cut",
  await page.evaluate(() => Boolean(document.querySelector("#root")?.children.length))
);

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(1200);
check(
  "the prototype still renders with the network cut",
  await page.evaluate(() => document.body.innerText.trim().length > 50)
);

// A fresh profile that only ever opened the prototype must still get the
// rebuilt app offline — that is what install-time precaching buys.
const second = await browser.newContext();
const cold = await second.newPage();
await cold.goto(`${BASE}/`, { waitUntil: "networkidle" });
await cold.waitForTimeout(2500);
await second.setOffline(true);
await cold.goto(`${BASE}/next/`, { waitUntil: "domcontentloaded" }).catch(() => {});
await cold.waitForTimeout(1800);
check(
  "a browser that only opened the prototype still gets the rebuilt app offline",
  await cold.evaluate(() => Boolean(document.querySelector("#root")?.children.length))
);

await second.setOffline(false);
await cold.reload({ waitUntil: "networkidle" });
await cold.waitForTimeout(1200);
check(
  "coming back online still serves the app",
  await cold.evaluate(() => Boolean(document.querySelector("#root")?.children.length))
);

await browser.close();

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed === 0 ? 0 : 1);
