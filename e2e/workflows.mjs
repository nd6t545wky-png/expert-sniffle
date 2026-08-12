/**
 * End-to-end verification of the rebuilt app against a real browser.
 * Drives the actual workflows rather than asserting that markup exists.
 */
import { chromium } from "playwright";

// Deliberately the STATIC harness (no API): several checks below assert the
// cloud-gated states, which only appear when no sync key is available.
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
// Fail fast: a selector that no longer matches should report in seconds, not
// stall the whole run on the default 30s timeout.
page.setDefaultTimeout(8000);

const consoleErrors = [];
const failedRequests = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("response", (r) => r.status() >= 400 && failedRequests.push(`${r.status()} ${r.url()}`));

const NAV = {
  Dashboard: "Today", Session: "Plan", Tracking: "Progress", Nutrition: "Nutrition", Account: "Athlete",
  Readiness: "Readiness", Workload: "Workload", Annual: "Year", Mechanics: "Biomechanics", Integrations: "Connections",
};
const go = async (label) => {
  const target = NAV[label] ?? label;
  // The "More" sheet's backdrop sits above the bottom nav (as in the original),
  // so it has to be dismissed before another tab can be tapped.
  const openSheet = page.locator(".mobile-sheet-backdrop");
  if (await openSheet.count()) await openSheet.click();
  // Prefer the bottom nav; fall back to the sidebar for sections it omits.
  const bottom = page.locator(`.bottom-nav button:has-text("${target}")`);
  if (await bottom.count()) {
    await bottom.first().click();
  } else {
    // Sections the bottom nav cannot hold live behind "More" on a phone.
    await page.locator('.bottom-nav button:has-text("More")').click();
    await page.waitForTimeout(150);
    await page.locator(`.mobile-sheet .nav-item:has-text("${target}")`).first().click();
  }
  await page.waitForTimeout(150);
};
// Readiness and workload are reached from the dashboard's metric tiles, as
// in the original — so make sure we are on the dashboard first.
const shortcut = async (label) => {
  await go("Dashboard");
  await page.locator(`.metric-shortcut:has-text("${label}")`).first().click();
  await page.waitForTimeout(200);
};
const storage = () => page.evaluate(() => JSON.parse(localStorage.getItem("dylan-pitching-os-v1") || "null"));

await page.goto(BASE, { waitUntil: "networkidle" });

// Today's own week, recorded before anything browses elsewhere.
await go("Dashboard");
await page.waitForTimeout(200);
const todayWeek = Number((await page.textContent("#root .page-head .eyebrow")).match(/Week (\d+)/)?.[1] ?? 0);

// ---------------------------------------------------------------- gate
await go("Session");
check("session starts locked", (await page.textContent("#root")).includes("Health check-in required"));
check("tasks hidden while locked", (await page.locator(".task-stage").count()) === 0);

await shortcut("Active workload");
await page.selectOption("select", "high");
await page.click('button:has-text("Log throwing")');
await page.waitForTimeout(120);
const preAuth = await page.textContent('[role="alert"]');
check("high intent blocked before readiness", preAuth && preAuth.length > 0, preAuth?.slice(0, 60));

// ------------------------------------------------------- readiness: hold
await shortcut("Readiness");
// Inputs are now siblings of their label inside .field (the prototype's
// shape), so address them by id rather than by nesting.
const FIELD_IDS = { Shoulder: "shoulder", Elbow: "elbow", Forearm: "forearm", Energy: "energy" };
const setRange = async (label, value) => {
  const el = page.locator(`#${FIELD_IDS[label] ?? label.toLowerCase()}`).first();
  await el.evaluate((node, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(node, String(v));
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await page.waitForTimeout(60);
};

// --------------------------------------------- sliders actually operate
// Synthetic value-setting (above) proves the handler is wired; it does not
// prove the control can be used. Drive one slider with a real pointer and
// with the keyboard, and check the widget's own readouts follow.
const rangeState = async (id) =>
  page.locator(`#${id}`).evaluate((node) => ({
    value: node.value,
    progress: node.style.getPropertyValue("--range-progress"),
    number: node.closest(".range-field").querySelector("[data-range-number]").textContent,
    text: node.closest(".range-field").querySelector("[data-range-text]").textContent,
  }));

await page.locator("#shoulder").scrollIntoViewIfNeeded();
await page.waitForTimeout(100);
const sliderBefore = await rangeState("shoulder");
const box = await page.locator("#shoulder").boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(150);
const sliderAfter = await rangeState("shoulder");
check("slider drags with a real pointer", sliderBefore.value !== sliderAfter.value, `${sliderBefore.value} -> ${sliderAfter.value}`);
check("filled track follows the thumb", /%$/.test(sliderAfter.progress) && sliderAfter.progress !== sliderBefore.progress, sliderAfter.progress);
check("live output follows the thumb", sliderAfter.number === sliderAfter.value, `${sliderAfter.number} / ${sliderAfter.text}`);
check("soreness reads in words, not just a number", /[A-Za-z]/.test(sliderAfter.text), sliderAfter.text);

await page.locator('.range-field:has(#shoulder) .range-reset').click();
await page.waitForTimeout(120);
check("reset returns the slider to its default", (await rangeState("shoulder")).value === "0");

await page.locator("#energy").focus();
const energyBefore = await rangeState("energy");
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(120);
const energyAfter = await rangeState("energy");
check("arrow keys move the slider", energyBefore.value !== energyAfter.value, `${energyBefore.value} -> ${energyAfter.value}`);

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
await page.click('button:has-text("Set today")');
await page.waitForTimeout(300);
const afterSubmit = await storage();
check("readiness persisted to localStorage", afterSubmit && Object.keys(afterSubmit.pre || {}).length === 1);
const submittedDate = afterSubmit ? Object.keys(afterSubmit.pre)[0] : "";
check("stored under an ISO date key", /^\d{4}-\d{2}-\d{2}$/.test(submittedDate), submittedDate);
// The heading is now the programme's own session title, not a generic label.
const sessionHeading = await page.textContent("#root h2");
check("navigated to the session after submitting", Boolean(sessionHeading), sessionHeading);
check(
  "session shows the real programme prescriptions, not placeholders",
  /Plyo Ball|Trap bar|deadlift|catch/i.test(await page.textContent("#root")),
  sessionHeading
);

// --------------------------------------------------------- plan unlocked
check("session now unlocked", !(await page.textContent("#root")).includes("Locked"));
check("tasks visible", (await page.locator(".task-stage").count()) > 0);
check("tasks grouped into stages", (await page.locator(".task-stage .stage-number").count()) > 1);
check("check-out is locked until the plan is resolved", (await page.textContent("#root")).includes("check-out locked"));

// -------------------------------------------------------- duplicate guard
await shortcut("Readiness");
await page.click('button:has-text("Set today")');
await page.waitForTimeout(200);
const dupText = await page.textContent("#root");
check("duplicate readiness refused", dupText.includes("already been submitted"));
const afterDup = await storage();
check("duplicate did not add a second record", Object.keys(afterDup.pre).length === 1);

// ------------------------------------------------------- task completion
await go("Session");
// Tick the first task's checkbox, the way the original works.
const firstCheck = page.locator(".task-stage[open] .task-check").first();
await firstCheck.check();
await page.waitForTimeout(250);
const afterTask = await storage();
const tasksDone = afterTask.completedTasks?.[submittedDate] || [];
check("task completion persisted", tasksDone.length === 1, JSON.stringify(tasksDone));
check("completed task shows as ticked", await firstCheck.isChecked());

// ------------------------------------------------------------- task detail
await page.locator(".task-stage[open] .task-details").first().click();
await page.waitForTimeout(200);
const detail = await page.textContent('[role="dialog"]');
check("task detail panel opens", /Why it is here/.test(detail) && /Stop rule/.test(detail));
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check("escape closes the detail panel", (await page.locator('[role="dialog"]').count()) === 0);

// ------------------------------------------------------------------- skip
const skipButton = page.locator(".task-stage[open] .task-skip").first();
await skipButton.click();
await page.waitForTimeout(200);
await page.click('button:has-text("Skip task")');
await page.waitForTimeout(200);
const afterNoReason = await storage();
check(
  "skip refused without a reason",
  Object.keys(afterNoReason.skippedTasks?.[submittedDate] || {}).length === 0
);

await page.selectOption("#taskSkipReason", "Time constraint");
await page.fill("#taskSkipNotes", "ran out of time");
await page.click('button:has-text("Skip task")');
await page.waitForTimeout(300);
const afterSkip = await storage();
const skips = afterSkip.skippedTasks?.[submittedDate] || {};
const skipId = Object.keys(skips)[0];
check("skip persisted with its reason", skips[skipId]?.reason === "Time constraint", JSON.stringify(skips[skipId]));
check("skip keeps the optional note", skips[skipId]?.notes === "ran out of time");
check(
  "skipped work is not counted as completed",
  !(afterSkip.completedTasks?.[submittedDate] || []).includes(skipId)
);
check("skipped task is labelled", (await page.textContent("#root")).includes("Skipped"));

// undo it again so the rest of the run sees a clean plan
await page.locator('button:has-text("Undo skip")').first().click();
await page.waitForTimeout(250);
const afterUndo = await storage();
check(
  "undo returns the task to the plan",
  Object.keys(afterUndo.skippedTasks?.[submittedDate] || {}).length === 0
);

// ------------------------------------------------------------- workload
await shortcut("Active workload");
// The weekday has to come from Brisbane, not from this machine's clock. The
// app anchors every date to Australia/Brisbane; `new Date().getDay()` reads
// UTC, and for the ten hours a day those disagree this check asserted the
// opposite of what the app was correctly doing — it failed on a Tuesday and
// again on a Wednesday during one afternoon of work.
const today = await page.evaluate(() => {
  const brisbane = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
  }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(brisbane);
}); // 0=Sun, in the app's own timezone
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
// The year is a calendar now: month grids, one colour per cycle, and days
// that select the week they belong to.
await go("Annual");
check("every month the programme touches", (await page.locator(".cal-month-card").count()) === 13);
check("one tab per training cycle", (await page.locator(".cal-cycle").count()) === 8);
check("cycle colour comes from the phase table", await page.locator(".cal-cycle").first().evaluate(
  (n) => getComputedStyle(n).getPropertyValue("--cycle").trim() === "#e52b21"
));

// A day carries its week and cycle, and selecting it moves the selection.
const day = page.locator('.cal-day[aria-label*="week 30"]').first();
await day.click();
await page.waitForTimeout(200);
check("selecting a day selects its week", (await page.textContent("#root .page-head")).includes("Week 30"));
check("and names the cycle that week belongs to", /GBL Summer|Preseason|Break/.test(await page.textContent("#root .page-head")));

// Days outside the 52 weeks cannot be chosen.
const outside = page.locator('.cal-day[aria-label*="outside the programme"]').first();
check("days outside the programme are not selectable", await outside.isDisabled());

// Year and month are two views of the same calendar.
await page.click('button[role="tab"]:has-text("Month")');
await page.waitForTimeout(200);
check("month view shows one month", (await page.locator(".cal-month-card").count()) === 1);
await page.click('button[role="tab"]:has-text("Year")');
await page.waitForTimeout(200);
check("year view comes back", (await page.locator(".cal-month-card").count()) === 13);
check("no horizontal overflow on the calendar", await page.evaluate(
  () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
));

// ------------------------------------------------------------- day tabs
// The regression these guard: the heading naming one weekday while the date
// underneath named another. Every tab is checked against what the page then
// shows and what the record is filed under.
await go("Session");
const tabCount = await page.locator(".day-tab").count();
check("seven day tabs", tabCount === 7, String(tabCount));

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
let dayDrift = "";
for (let day = 0; day < 7; day += 1) {
  await page.locator(".day-tab").nth(day).click();
  await page.waitForTimeout(220);
  const eyebrow = await page.textContent("#root .page-head .eyebrow");
  // The eyebrow carries "Week N · <weekday> <d> <month>"; the tab carries the
  // same date. They are derived from one place, so they must agree.
  const tabLabel = await page.locator(".day-tab").nth(day).getAttribute("aria-label");
  const weekday = DAY_ORDER[day];
  if (!eyebrow.includes(weekday)) dayDrift += `eyebrow "${eyebrow}" missing ${weekday}; `;
  if (!tabLabel.startsWith(weekday)) dayDrift += `tab ${day} labelled "${tabLabel}"; `;
  const dayOfMonth = tabLabel.match(/(\d+) [A-Za-z]{3}/)?.[1];
  if (dayOfMonth && !eyebrow.includes(` ${dayOfMonth} `)) {
    dayDrift += `tab date ${dayOfMonth} not in eyebrow "${eyebrow}"; `;
  }
}
check("every tab's weekday and date match the page heading", dayDrift === "", dayDrift.slice(0, 200));

// The week arrows move the whole week, keeping the chosen weekday.
const weekBefore = await page.textContent("#root .page-head .eyebrow");
await page.click('button:has-text("Week →")');
await page.waitForTimeout(250);
const weekAfter = await page.textContent("#root .page-head .eyebrow");
const num = (t) => Number(t.match(/Week (\d+)/)?.[1] ?? 0);
check("the week arrow advances one week", num(weekAfter) === num(weekBefore) + 1, `${weekBefore} -> ${weekAfter}`);
check(
  "and keeps the same weekday",
  weekAfter.split("·")[1]?.trim().split(" ")[0] === weekBefore.split("·")[1]?.trim().split(" ")[0],
  `${weekBefore} -> ${weekAfter}`
);
await page.click('button:has-text("← Week")');
await page.waitForTimeout(250);
check("and back again", (await page.textContent("#root .page-head .eyebrow")) === weekBefore);

// Selecting another day must be visible, and reversible.
await page.locator(".day-tab").nth((await page.evaluate(() => new Date().getDay()) + 3) % 7).click();
await page.waitForTimeout(250);
const banner = await page.textContent("#root");
check("viewing another day is announced", /not today/.test(banner));
await page.click('button:has-text("Back to today")');
await page.waitForTimeout(250);
check("back to today clears the banner", !/not today/.test(await page.textContent("#root")));
check("back to today restores the unlocked session", (await page.locator(".task-stage").count()) > 0);

// A check-in filed on another day must land on that day's date, not today's.
const beforeOtherDay = await storage();
const todayKeys = Object.keys(beforeOtherDay.pre || {});
await page.locator(".day-tab").nth(6).click();
await page.waitForTimeout(250);
const otherTabLabel = await page.locator(".day-tab").nth(6).getAttribute("aria-label");
if (/locked/.test(otherTabLabel)) {
  check("another day starts locked, with its own gate", (await page.textContent("#root")).includes("Health check-in required"));
  await page.click('button:has-text("Complete check-in")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Set today")');
  await page.waitForTimeout(400);
  const afterOtherDay = await storage();
  const added = Object.keys(afterOtherDay.pre || {}).filter((k) => !todayKeys.includes(k));
  check("a check-in on another day is filed under that day", added.length === 1, added.join(","));
  check("today's own record is untouched", todayKeys.every((k) => afterOtherDay.pre[k]));
  // and the tab now reports it
  await go("Session");
  const relabelled = await page.locator(".day-tab").nth(6).getAttribute("aria-label");
  check("the tab reflects the new status", /open/.test(relabelled), relabelled);
}
await page.click('button:has-text("Back to today")').catch(() => {});
await page.waitForTimeout(250);

// ------------------------------- Today means today, whatever is browsed
// Browse to a distant week, then check that the pages which are *about today*
// still say today, while the browsing position survives for the ones that are
// about what you are looking at.
await go("Session");
await page.click('button:has-text("Week →")');
await page.click('button:has-text("Week →")');
await page.waitForTimeout(250);
const browsedEyebrow = await page.textContent("#root .page-head .eyebrow");
const browsedWeek = Number(browsedEyebrow.match(/Week (\d+)/)?.[1] ?? 0);

await go("Dashboard");
await page.waitForTimeout(250);
const dashEyebrow = await page.textContent("#root .page-head .eyebrow");
const dashWeek = Number(dashEyebrow.match(/Week (\d+)/)?.[1] ?? 0);
check("Today shows today's week, not the browsed one", dashWeek === todayWeek, `browsed ${browsedWeek}, Today ${dashWeek}`);
check("Today's topbar agrees with Today", (await page.textContent(".top-context")).includes(`Week ${todayWeek} `), await page.textContent(".top-context"));
check("the topbar names the page you are on", (await page.textContent(".mobile-context")) === "Today", await page.textContent(".mobile-context"));
await go("Session");
check("and updates when you move", (await page.textContent(".mobile-context")) === "Daily plan", await page.textContent(".mobile-context"));
await go("Dashboard");

// The browsing position is kept, not thrown away.
await go("Session");
await page.waitForTimeout(250);
check(
  "the browsed week survives leaving and returning",
  Number((await page.textContent("#root .page-head .eyebrow")).match(/Week (\d+)/)?.[1]) === browsedWeek,
  await page.textContent("#root .page-head .eyebrow")
);

// Nutrition rides with Today, so the dashboard's hydration tile cannot show
// one number and the page it links to another. Log some water first —
// comparing two blank values would prove nothing.
await go("Nutrition");
await page.click('button:has-text("+500 mL")');
await page.waitForTimeout(300);
const loggedWater = (await page.locator(".water-readout strong").textContent()).trim();
check("hydration logged on Nutrition", loggedWater !== "0 L", loggedWater);

// Browse away, then come back to Today: the tile must still read that value.
await go("Session");
await page.click('button:has-text("Week →")');
await page.waitForTimeout(200);
await go("Dashboard");
await page.waitForTimeout(250);
const tileWater = (await page.locator('.metric-shortcut:has-text("Hydration") .metric-value').textContent()).trim();
check(
  "Today's hydration tile shows today's water, not the browsed week's",
  Number(tileWater.replace(/[^\d.]/g, "")) === Number(loggedWater.replace(/[^\d.]/g, "")),
  `tile "${tileWater}" vs logged "${loggedWater}"`
);

await page.locator('.metric-shortcut:has-text("Hydration")').first().click();
await page.waitForTimeout(300);
const pageWater = (await page.locator(".water-readout strong").textContent()).trim();
check(
  "hydration reads the same on Today and on Nutrition",
  Number(pageWater.replace(/[^\d.]/g, "")) === Number(tileWater.replace(/[^\d.]/g, "")),
  `tile "${tileWater}" vs page "${pageWater}"`
);
check("both views format the number the same way", tileWater === `${pageWater}`, `tile "${tileWater}" vs page "${pageWater}"`);

// A dashboard action must land on today, not on the week left open.
await go("Session");
await page.click('button:has-text("Week →")');
await page.waitForTimeout(200);
await go("Dashboard");
await page.locator('.metric-shortcut:has-text("Session progress")').first().click();
await page.waitForTimeout(300);
check(
  "a dashboard shortcut opens today, not the browsed week",
  Number((await page.textContent("#root .page-head .eyebrow")).match(/Week (\d+)/)?.[1]) === todayWeek,
  await page.textContent("#root .page-head .eyebrow")
);

// ------------------------------------- the page survives a reload
// v60 could drop you back on the dashboard unprompted. The open page is
// remembered, so a reload (or a service-worker update, which reloads without
// asking) resumes where you were.
await go("Session");
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);
check(
  "reload stays on the session, not the dashboard",
  (await page.locator(".task-stage").count()) > 0,
  await page.textContent("#root h2")
);

// A state change must not bounce the view either.
await page.locator(".task-stage[open] .task-check").first().click();
await page.waitForTimeout(300);
check("logging a task does not jump back to the dashboard", (await page.locator(".task-stage").count()) > 0);

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
check("dashboard shows the readiness metric", /Readiness/.test(dash) && /metric-value/.test(await page.innerHTML("#root")));
// Phase names come from the programme's own table (FNCBA/GBL), not the
// five-phase structure in the brief.
check("dashboard shows the programme week and phase", /Week \d+ · /.test(dash), dash.match(/Week \d+ · [^\n]{0,40}/)?.[0]);

// ------------------------------------------------- new feature sections
for (const label of ["Nutrition", "Mechanics", "Integrations", "Account"]) {
  await go(label);
  const rendered = await page.isVisible("#root section");
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  );
  check(`${label} renders`, rendered);
  check(`${label} has no horizontal overflow`, noOverflow);
}

// Nutrition works without a sync key (local logging), integrations do not.
await go("Nutrition");
check("nutrition usable without cloud", (await page.textContent("#root")).includes("Hydration"));
const beforeHydration = await storage();
await page.click('button:has-text("+500 mL")');
await page.waitForTimeout(250);
const afterHydration = await storage();
check(
  "hydration logged and persisted",
  JSON.stringify(beforeHydration?.nutrition?.hydration) !== JSON.stringify(afterHydration?.nutrition?.hydration)
);

// Both pages keep their cards and disable the actions, rather than replacing
// the page with a sentence — so assert the controls are genuinely unreachable,
// not just that an explanation is on screen.
await go("Integrations");
check(
  "integrations explain the autosave prerequisite",
  (await page.textContent("#root")).includes("Cloud autosave required")
);
check(
  "integrations gated behind cloud autosave",
  await page.locator('button:has-text("Connect Oura")').isDisabled()
);

await go("Mechanics");
check(
  "mechanics explain the autosave prerequisite",
  (await page.textContent("#root")).includes("Cloud autosave required")
);
check(
  "mechanics gated behind cloud autosave",
  await page.locator("#video").isDisabled()
);

await go("Account");
check("account explains the recovery key", (await page.textContent("#root")).includes("server never sees it"));
check("sync disabled without a key", await page.getAttribute('button:has-text("Sync now")', "disabled") !== null);

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
// This harness serves dist/ as static files, so there is no Worker and every
// /api/* call 404s by design. Those are expected here; anything else is not.
const apiFailures = failedRequests.filter((entry) => entry.includes("/api/"));
const assetFailures = failedRequests.filter((entry) => !entry.includes("/api/"));
check("no failed asset requests", assetFailures.length === 0, assetFailures.slice(0, 3).join(" | "));
check(
  "only expected /api 404s against the static harness",
  apiFailures.every((entry) => entry.startsWith("404")),
  apiFailures.slice(0, 3).join(" | ")
);
const realErrors = consoleErrors.filter((text) => !/status of 404/.test(text));
check("no unexpected console errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

await browser.close();
console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
