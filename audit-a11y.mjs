/**
 * Keyboard and control audit.
 *
 * `audit-design.mjs` answers "can this be read". This answers "can this be
 * operated" — the half of accessibility a screenshot and a contrast ratio both
 * miss entirely, and the half that was actually broken here: a rule written to
 * strip a decorative shadow off the dashboard tiles was three classes deep and
 * outranked the focus ring, so every metric shortcut and every text field in
 * the product was keyboard-focusable with nothing drawn to say so.
 *
 * Four checks, on every page, at desktop width:
 *
 *   noType    A <button> with no `type` submits the form it is standing in.
 *   noName    A control with no text, aria-label or title is unnameable to a
 *             screen reader.
 *   smallHit  Anything under 24px in either direction is below the WCAG 2.2
 *             target-size minimum.
 *   noFocus   A tab stop that paints neither an outline nor a box-shadow.
 *             Driven from the keyboard rather than with `.focus()`, because
 *             `:focus-visible` does not apply to a programmatic focus.
 */

import { chromium } from "playwright";

const SEED = {
  version: 1,
  onboardingComplete: true,
  profile: {
    name: "Dylan Sippel", height: 185, weight: 85, throwingHand: "Right",
    role: "Starting pitcher", winterTeam: "Norths", summerTeam: "Coomera Cubs",
    programTemplate: "australian_two_season",
    bloodPanels: [{ date: "2026-08-20", lab: "QML", results: { ferritin: { value: 24, low: 30, high: 300 } } }],
  },
  pre: { "2026-08-26": { score: 71, planLevel: "full", sleepHours: 7, inputs: { shoulder: 1, elbow: 0, forearm: 0 } } },
  post: {},
  games: [{ id: "g1", date: "2026-08-22", pitches: 62, opponent: "Surfers" }],
  bullpens: { "2026-08-24": { date: "2026-08-24", throws: 40, intent: "moderate" } },
  setLogs: {}, completedTasks: {}, skippedTasks: {}, taskCompletionUpdatedAt: {},
  healthPrefill: {}, pulseImports: {}, weeklyReviews: {},
  nutrition: {
    targets: { calories: 3200, protein: 180, carbs: 0, fat: 0, fluid: 4.5 },
    meals: {}, savedMeals: [], hydration: {}, hydrationEvents: {},
    hydrationPresets: [0.5], sweatLoss: {}, reminders: {},
  },
  mechanics: { assessments: [], approvedInterventions: [] },
};

const PAGES = ["session", "dashboard", "annual", "workload", "tracking", "nutrition", "bloods", "profile"];

/** How far to walk the tab ring on each page. */
const TAB_STOPS = 45;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto("http://127.0.0.1:8899/next/", { waitUntil: "domcontentloaded" });
await page.evaluate((seed) => {
  localStorage.setItem("dylan-pitching-os-sync-key-v1", "a".repeat(64));
  localStorage.setItem("dylan-pitching-os-v1", JSON.stringify(seed));
}, SEED);

let problems = 0;
let controls = 0;
let stops = 0;

for (const target of PAGES) {
  await page.evaluate((id) => sessionStorage.setItem("dylan-pitching-os-page-v1", id), target);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".content", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(900);

  const found = await page.evaluate(() => {
    const out = { noType: [], noName: [], smallHit: [], noFocus: [], seen: 0 };
    const visible = (el) => {
      const box = el.getBoundingClientRect();
      return box.width > 1 && box.height > 1 && getComputedStyle(el).visibility !== "hidden";
    };
    const name = (el) =>
      (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();

    for (const el of document.querySelectorAll("button")) {
      if (!visible(el)) continue;
      out.seen += 1;
      const label = name(el).slice(0, 40);
      if (!el.hasAttribute("type")) out.noType.push(`${el.className} :: ${label}`);
      if (!label) out.noName.push(el.className.slice(0, 60));
      const box = el.getBoundingClientRect();
      if (box.height < 24 || box.width < 24) {
        out.smallHit.push(`${label} ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
    return out;
  });

  // The focus walk has to happen from the driver: a keypress is what makes
  // Chromium treat the focus as keyboard-originated, and only then does
  // `:focus-visible` match.
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  for (let step = 0; step < TAB_STOPS; step += 1) {
    await page.keyboard.press("Tab");
    const miss = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const ring =
        (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
        (style.boxShadow && style.boxShadow !== "none");
      return ring ? null : `${el.tagName}.${el.className}`.slice(0, 70);
    });
    stops += 1;
    if (miss) found.noFocus.push(miss);
  }

  controls += found.seen;
  for (const [check, list] of Object.entries(found)) {
    if (check === "seen" || !list.length) continue;
    problems += list.length;
    console.log(
      `  FAIL ${target}/${check} (${list.length}): ${[...new Set(list)].slice(0, 6).join(" | ")}`
    );
  }
}

await browser.close();
console.log(
  `\n${controls} buttons and ${stops} tab stops checked across ${PAGES.length} pages, ` +
    `${problems} problem${problems === 1 ? "" : "s"}.`
);
process.exit(problems ? 1 : 0);
