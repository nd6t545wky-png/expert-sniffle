/**
 * Screenshot the app across its main pages, at phone and desktop width.
 *
 * Used to audit a design change: run it, look, change, run it again. Writes to
 * captured/<label>/<page>.png so two runs can be compared side by side.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const label = process.argv[2] ?? "current";
const only = process.argv[3];
const dir = `captured/${label}`;
mkdirSync(dir, { recursive: true });

const SEED = {
  version: 1,
  onboardingComplete: true,
  profile: {
    name: "Dylan Sippel",
    height: 185,
    weight: 85,
    throwingHand: "Right",
    role: "Starting pitcher",
    winterTeam: "Norths",
    summerTeam: "Coomera Cubs",
    appearance: "system",
    programTemplate: "australian_two_season",
    bloodPanels: [
      {
        date: "2026-08-20",
        lab: "Sullivan Nicolaides",
        results: {
          haemoglobin: { value: 152, low: 130, high: 175 },
          ferritin: { value: 24, low: 30, high: 300 },
          ck: { value: 1420 },
          testosterone: { value: 21.4, low: 8.3, high: 29.5 },
          vitaminD: { value: 61 },
        },
      },
    ],
    retests: [{ date: "2026-08-24", values: { sj: 21.5, cmj: 33.8, djContact: 0.318, djRsi: 1.12 } }],
  },
  pre: {
    "2026-08-24": { score: 78, planLevel: "full", sleepHours: 7.5, inputs: { shoulder: 2, elbow: 0, forearm: 1, sleepHours: 7.5, sleepQuality: 4 } },
    "2026-08-26": { score: 71, planLevel: "full", sleepHours: 7, inputs: { shoulder: 1, elbow: 0, forearm: 0, sleepHours: 7, sleepQuality: 4 } },
  },
  post: { "2026-08-22": { bestVelocity: 78, velocityType: "Mound" }, "2026-08-25": { bestVelocity: 84, velocityType: "Pulldown" } },
  games: [{ id: "g1", date: "2026-08-22", pitches: 62, opponent: "Surfers Paradise", innings: 4, strikeouts: 6 }],
  bullpens: {
    "2026-08-24": { date: "2026-08-24", throws: 40, intent: "moderate" },
    "2026-08-25": { date: "2026-08-25", throws: 32, intent: "high" },
  },
  setLogs: {
    "2026-08-24": { "w7-d0-a": [{ reps: 5, kg: 100 }, { reps: 5, kg: 100 }, { reps: 4, kg: 105 }] },
    "2026-08-26": { "w7-d2-a": [{ reps: 5, kg: 92.5 }, { reps: 5, kg: 92.5 }] },
  },
  completedTasks: {}, skippedTasks: {}, taskCompletionUpdatedAt: {},
  healthPrefill: {}, pulseImports: {}, weeklyReviews: {},
  nutrition: {
    targets: { calories: 3200, protein: 180, carbs: 0, fat: 0, fluid: 4.5 },
    meals: {}, savedMeals: [], hydration: {}, hydrationEvents: {},
    hydrationPresets: [0.5, 0.75], sweatLoss: {}, reminders: {},
  },
  mechanics: { assessments: [], approvedInterventions: [] },
};

const PAGES = ["session", "dashboard", "annual", "workload", "tracking", "nutrition", "bloods", "profile"];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

for (const [device, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["phone", { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 2,
    isMobile: device === "phone",
    hasTouch: device === "phone",
    // Without this the same build shot twice differs on half its pages: the
    // redesign's transitions are still mid-flight when the shutter fires, so
    // every comparison drowns in motion noise. Freezing motion is what makes
    // two runs comparable at all.
    reducedMotion: "reduce",
  });
  await page.goto("http://127.0.0.1:8899/next/", { waitUntil: "domcontentloaded" });
  await page.evaluate((seed) => {
    localStorage.setItem("dylan-pitching-os-sync-key-v1", "a".repeat(64));
    localStorage.setItem("dylan-pitching-os-v1", JSON.stringify(seed));
    localStorage.setItem("dylan-pitching-os-page-v1", "session");
  }, SEED);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".content", { timeout: 20000 });
  await page.waitForTimeout(1800);

  // Navigate by the key the app restores from rather than by clicking. The
  // phone hides half these pages behind a sheet whose backdrop eats clicks,
  // and this run is about what the pages look like, not how you reach them.
  for (const target of PAGES) {
    if (only && only !== target) continue;
    await page.evaluate((id) => sessionStorage.setItem("dylan-pitching-os-page-v1", id), target);
    await page.reload({ waitUntil: "domcontentloaded" });
    try {
      await page.waitForSelector(".content", { timeout: 15000 });
    } catch {
      console.log(`  WARN ${device}/${target}: no .content — shooting anyway`);
    }
    // Fonts settle before layout is final, and a half-loaded face reflows text.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1400);
    await page.screenshot({
      path: `${dir}/${device}-${target}.png`,
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    });
    console.log(`  shot ${device}/${target}`);
  }

  await page.close();
}

await browser.close();
