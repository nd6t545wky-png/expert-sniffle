import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("captured", { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto("http://127.0.0.1:8898/", { waitUntil: "networkidle" });
await p.evaluate(() => {
  localStorage.setItem("dylan-pitching-os-sync-key-v1", "a".repeat(64));
  localStorage.setItem("dylan-pitching-os-v1", JSON.stringify({
    version:1, onboardingComplete:true,
    profile:{ name:"Dylan Sippel", height:185, weight:85, throwingHand:"Right", role:"Starting pitcher", winterTeam:"Norths", summerTeam:"Coomera Cubs", appearance:"system", glassIntensity:"balanced", interfaceDensity:"comfortable", motionPreference:"system", navigationBehavior:"smart", programTemplate:"australian_two_season" },
    pre:{}, post:{}, completedTasks:{}, skippedTasks:{}, taskCompletionUpdatedAt:{},
    healthPrefill:{}, pulseImports:{}, bullpens:{}, weeklyReviews:{},
    nutrition:{ targets:{calories:3200,protein:180,carbs:0,fat:0,fluid:4.5}, meals:{}, savedMeals:[], hydration:{}, hydrationEvents:{}, hydrationPresets:[0.5,0.75], sweatLoss:{}, reminders:{} },
    mechanics:{ assessments:[], approvedInterventions:[] },
  }));
});
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(2000);

const pages = ["session","annual","analytics","nutrition","mechanics","profile","integrations"];
for (const page of pages) {
  const ok = await p.evaluate((pg) => {
    const btn = document.querySelector(`[data-action="nav"][data-page="${pg}"]`);
    if (!btn) return false;
    btn.click(); return true;
  }, page);
  if (!ok) { console.log(page, "NAV NOT FOUND"); continue; }
  await p.waitForTimeout(900);
  const html = await p.innerHTML(".content");
  writeFileSync(`captured/${page}.html`, html);
  console.log(page, html.length, "chars");
}
await b.close();
