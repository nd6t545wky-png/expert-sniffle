/**
 * Design regression sweep.
 *
 * Two things a screenshot will not tell you reliably: whether any text has
 * fallen below a readable contrast ratio, and whether the typeface actually
 * loaded. Both were real defects here — the selected day tab rendered white on
 * light grey, and a webfont behind a strict CSP fails silently.
 *
 * Walks every page in light and dark, and reports.
 */

import { chromium } from "playwright";

const SEED = {
  version: 1,
  onboardingComplete: true,
  profile: {
    name: "Dylan Sippel", height: 185, weight: 85, throwingHand: "Right",
    role: "Starting pitcher", winterTeam: "Norths", summerTeam: "Coomera Cubs",
    programTemplate: "australian_two_season",
    bloodPanels: [{ date: "2026-08-20", lab: "QML", results: { ferritin: { value: 24, low: 30, high: 300 }, ck: { value: 1420 } } }],
  },
  pre: { "2026-08-26": { score: 71, planLevel: "full", sleepHours: 7, inputs: { shoulder: 1, elbow: 0, forearm: 0 } } },
  post: {}, games: [{ id: "g1", date: "2026-08-22", pitches: 62, opponent: "Surfers" }],
  bullpens: { "2026-08-24": { date: "2026-08-24", throws: 40, intent: "moderate" } },
  setLogs: {}, completedTasks: {}, skippedTasks: {}, taskCompletionUpdatedAt: {},
  healthPrefill: {}, pulseImports: {}, weeklyReviews: {},
  nutrition: { targets: { calories: 3200, protein: 180, carbs: 0, fat: 0, fluid: 4.5 }, meals: {}, savedMeals: [], hydration: {}, hydrationEvents: {}, hydrationPresets: [0.5], sweatLoss: {}, reminders: {} },
  mechanics: { assessments: [], approvedInterventions: [] },
};

const PAGES = ["session", "dashboard", "annual", "workload", "tracking", "nutrition", "bloods", "profile"];

/** Relative luminance, then the WCAG ratio. */
function ratio(fg, bg) {
  const lum = ([r, g, b]) => {
    const c = [r, g, b].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [a, b] = [lum(fg), lum(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let problems = 0;
let checked = 0;
let unverifiable = 0;

for (const theme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: theme });
  await page.goto("http://127.0.0.1:8899/next/", { waitUntil: "domcontentloaded" });
  await page.evaluate((seed) => {
    localStorage.setItem("dylan-pitching-os-sync-key-v1", "a".repeat(64));
    localStorage.setItem("dylan-pitching-os-v1", JSON.stringify(seed));
  }, SEED);

  for (const target of PAGES) {
    await page.evaluate((id) => sessionStorage.setItem("dylan-pitching-os-page-v1", id), target);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600);

    const found = await page.evaluate(async () => {
      // Did the webfont actually resolve? A CSP block fails silently — and
      // `check` answers false for a face that simply has not loaded yet, so
      // wait for the font set to settle before believing the answer.
      await document.fonts.ready;
      const geist = document.fonts.check('600 16px "Geist"');

      /**
       * Parse a computed colour to 0–255 RGB.
       *
       * Chromium serialises some values as `color(srgb 1 1 1 / 0.86)`, whose
       * channels are 0–1 floats. Reading those as 0–255 turns white into black
       * and invents contrast failures — which is exactly what the first version
       * of this script did to every active nav item.
       */
      const toRgb = (s) => {
        const nums = (s.match(/[\d.]+/g) ?? []).map(Number);
        if (nums.length < 3) return null;
        const [r, g, b] = nums;
        return /^color\(/.test(s) ? [r * 255, g * 255, b * 255] : [r, g, b];
      };
      const alphaOf = (s) => {
        const nums = (s.match(/[\d.]+/g) ?? []).map(Number);
        return nums.length >= 4 ? nums[3] : 1;
      };

      /**
       * The opaque colour painted behind an element, or null when it cannot be
       * known from computed style alone.
       *
       * A gradient or image background is not a colour, and guessing one is
       * how this check produced its first run of nonsense: it walked past the
       * dark hero card's gradient, found the white page underneath, and
       * reported white-on-white for text that is plainly legible. Anything
       * sitting on an image is reported as unverifiable rather than failed.
       */
      const opaqueBehind = (el) => {
        let node = el;
        while (node && node !== document.documentElement) {
          const cs = getComputedStyle(node);
          if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
          const rgb = toRgb(cs.backgroundColor);
          if (rgb && alphaOf(cs.backgroundColor) > 0.85) return rgb;
          node = node.parentElement;
        }
        return [255, 255, 255];
      };

      const out = [];
      let skipped = 0;
      for (const el of document.querySelectorAll("body *")) {
        const text = [...el.childNodes]
          .filter((n) => n.nodeType === 3 && n.textContent.trim())
          .map((n) => n.textContent.trim())
          .join(" ");
        if (!text) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        if (Number(cs.opacity) < 0.35) continue;
        const bg = opaqueBehind(el);
        if (bg === null) { skipped += 1; continue; }
        out.push({
          text: text.slice(0, 48),
          cls: el.className?.toString?.().slice(0, 48) ?? "",
          fg: toRgb(cs.color) ?? [0, 0, 0],
          bg,
          size: parseFloat(cs.fontSize),
          weight: Number(cs.fontWeight) || 400,
          family: cs.fontFamily.split(",")[0].replace(/["']/g, ""),
        });
      }
      return { geist, out, skipped };
    });

    if (!found.geist) {
      console.log(`  FAIL ${theme}/${target}: Geist did not load`);
      problems += 1;
    }
    const nonGeist = found.out.filter((i) => i.family !== "Geist" && i.family !== "Geist Mono");
    if (nonGeist.length) {
      console.log(`  WARN ${theme}/${target}: ${nonGeist.length} nodes not on Geist (e.g. ${nonGeist[0].family})`);
    }

    unverifiable += found.skipped;
    for (const item of found.out) {
      checked += 1;
      // WCAG AA: 4.5 for body, 3.0 once text is large (18.66px bold / 24px).
      const large = item.size >= 24 || (item.size >= 18.66 && item.weight >= 700);
      const need = large ? 3 : 4.5;
      const got = ratio(item.fg, item.bg);
      if (got < need) {
        console.log(
          `  FAIL ${theme}/${target}: ${got.toFixed(2)}:1 (need ${need}) — "${item.text}" [${item.cls}]`
        );
        problems += 1;
      }
    }
  }
  await page.close();
}

await browser.close();
console.log(
  `\n${checked} text nodes checked, ${problems} problem${problems === 1 ? "" : "s"}; ` +
    `${unverifiable} on image or gradient backgrounds, not checkable from computed style.`
);
process.exit(problems ? 1 : 0);
