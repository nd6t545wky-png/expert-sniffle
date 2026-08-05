const STORAGE_KEY = "dylan-pitching-os-v1";
const SYNC_KEY_STORAGE = "dylan-pitching-os-sync-key-v1";
const APPLE_UPLOAD_TOKEN_STORAGE = "dylan-pitching-os-apple-upload-v1";
const SYNC_PENDING_STORAGE = "pitching-os-sync-pending-v1";
const SYNC_HISTORY_STORAGE = "pitching-os-sync-history-v1";
const SYNC_LAST_STORAGE = "pitching-os-sync-last-v1";
const HYDRATION_REMINDER_STORAGE = "pitching-os-hydration-reminder-v1";
const CLOUD_SYNC_DEBOUNCE_MS = 900;
const ANNUAL_START = "2026-07-13";
const SUMMER_FIRST_GAME = "2026-10-02";
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HistoryDomain = window.PitchingHistory;
if (!HistoryDomain) throw new Error("The immutable training-history module did not load");

const HISTORY_EVENT_TYPE = {
  planSnapshots: "plan_snapshot",
  checkIns: "health_check_in",
  taskChanges: "task_completion",
  checkOuts: "session_check_out",
  performanceResults: "performance_result",
  planChanges: "plan_change"
};

const PHASES = [
  {
    id: "winter",
    name: "FNCBA Winter · In Season",
    weeks: [1, 8],
    color: "#e52b21",
    summary: "Official Division 1 Rounds 12–19: Saturday competition, Wednesday velocity exposure, and no back-to-back high-intent throwing."
  },
  {
    id: "transition",
    name: "Post-Winter Transition",
    weeks: [9, 10],
    color: "#e52b21",
    summary: "Unload after the final published FNCBA regular-season round, restore range of motion, and retain basic strength."
  },
  {
    id: "preseason",
    name: "GBL Preseason",
    weeks: [11, 11],
    color: "#5b2e91",
    summary: "Rebuild the Tuesday/Thursday team rhythm and prepare for Coomera Cubs' athlete-provided Friday 2 October opener."
  },
  {
    id: "summer_first",
    name: "GBL Summer · Term 4",
    weeks: [12, 22],
    color: "#5b2e91",
    summary: "Coomera Cubs competition begins Friday 2 October: training Tuesday/Thursday, games Friday/Sunday, and Wednesday whole-body strength maintenance."
  },
  {
    id: "summer_break",
    name: "GBL Christmas Break",
    weeks: [23, 28],
    color: "#149ca5",
    summary: "No assumed league games: recover first, then rebuild throwing and strength before Term 1 competition."
  },
  {
    id: "summer_second",
    name: "GBL Summer · Term 1",
    weeks: [29, 36],
    color: "#5b2e91",
    summary: "Return to the Friday/Sunday competition rhythm and taper into the last pre-Easter weekend."
  },
  {
    id: "transition_summer",
    name: "Post-Summer Transition",
    weeks: [37, 38],
    color: "#149ca5",
    summary: "Two lower-stress weeks after the GBL planning window before the next winter build."
  },
  {
    id: "winter_next",
    name: "FNCBA Winter 2027 · Planning",
    weeks: [39, 52],
    color: "#e52b21",
    summary: "Provisional Saturday competition rhythm based on the 2026 draw; replace with the official 2027 fixture when published."
  }
];

const FNC_DIV1_ROUNDS_2026 = [
  [1, "2026-04-11"], [2, "2026-04-18"], [3, "2026-05-02"], [4, "2026-05-09"], [5, "2026-05-16"],
  [6, "2026-05-30"], [7, "2026-06-06"], [8, "2026-06-13"], [9, "2026-06-20"], [10, "2026-06-27"],
  [11, "2026-07-04"], [12, "2026-07-18"], [13, "2026-07-25"], [14, "2026-08-01"], [15, "2026-08-08"],
  [16, "2026-08-15"], [17, "2026-08-22"], [18, "2026-08-29"], [19, "2026-09-05"]
].map(([round, date]) => ({ round, date }));

const SEASON_CALENDAR = [
  {
    name: "FNCBA Division 1 · 2026 regular season",
    dates: "11 Apr – 5 Sep 2026",
    status: "Official draw",
    tone: "official",
    detail: "19 published Saturday rounds. This 52-week dashboard begins at Round 12 on 18 July and stays in-season through Round 19 on 5 September.",
    href: "https://websites.mygameday.app/comp_info.cgi?a=FIXTURE&c=0-12778-0-659449-0"
  },
  {
    name: "GBL 2026/27 · competition planning window",
    dates: "2 Oct 2026 – 21 Mar 2027",
    status: "Athlete-provided opener",
    tone: "derived",
    detail: "Coomera Cubs' first game is set to Friday 2 October from the athlete's schedule. Baseball Queensland confirms the broader Term 4/Term 1 model and two-game weekly series, but later grade fixtures remain planning dates until the draw is published.",
    href: "https://www.baseballqueensland.com.au/gbl/"
  },
  {
    name: "GBL Christmas break · planning block",
    dates: "14 Dec 2026 – 24 Jan 2027",
    status: "Term-aligned",
    tone: "derived",
    detail: "No league games are assumed in the plan. The block follows the published Queensland summer school-holiday window and rebuilds before Term 1 begins on 27 January.",
    href: "https://education.qld.gov.au/about-us/calendar/term-dates"
  },
  {
    name: "FNCBA Winter 2027",
    dates: "Planning from 5 Apr 2027",
    status: "2027 draw pending",
    tone: "pending",
    detail: "The app uses the 2026 Saturday pattern only as a planning placeholder. It does not label any 2027 fixture as confirmed.",
    href: "https://www.fncbaseball.com.au/2022-draw/"
  }
];

const winterWeeks = [
  ["Baseline quality", "Trap bar deadlift 4 × 5 @ 120 kg", "8 pulldowns; establish a clean baseline", "Log full readiness and game workload"],
  ["Add force", "Trap bar deadlift 4 × 5 @ 122.5 kg", "8 pulldowns; match Week 1 intent", "Repeat load if final set exceeds RPE 8"],
  ["Heavier triples", "Trap bar deadlift 5 × 3 @ 127.5 kg", "8 pulldowns; protect velocity quality", "Keep all lifting reps crisp"],
  ["Force peak", "Trap bar deadlift 5 × 3 @ 130 kg", "6–8 pulldowns; stop before fatigue", "Block review: velocity, soreness, game load"],
  ["Strength-speed entry", "Trap bar deadlift 6 × 2 @ 120 kg", "8 pulldowns; faster build-up", "Maximum concentric intent"],
  ["Strength-speed build", "Trap bar deadlift 6 × 2 @ 122.5 kg", "8–10 pulldowns if readiness is green", "Hold Wednesday lift to 40 minutes"],
  ["Strength-speed peak", "Trap bar deadlift 6 × 2 @ 125 kg", "8 pulldowns; best-six average", "No grinders; record bar-speed impression"],
  ["Deload and assess", "Trap bar deadlift 4 × 2 @ 115 kg", "6 pulldowns at 90–95%", "Reduce gym accessories by one set"],
  ["Power conversion", "Trap bar deadlift 4 × 2 @ 110 kg", "6–8 high-quality pulldowns", "Light medicine ball; fast outputs"],
  ["Power build", "Trap bar deadlift 4 × 2 @ 112.5 kg", "8 pulldowns; full recovery", "Maintain bodyweight and sleep"],
  ["Power peak", "Trap bar deadlift 4 × 2 @ 115 kg", "6–8 pulldowns; no velocity chase", "Game freshness takes priority"],
  ["Winter review", "Trap bar deadlift 3 × 2 @ 105 kg", "4–6 pulldowns at 90%", "Review the full 12-week dashboard"]
];

const transitionWeeks = [
  ["Unload and restore", "Trap bar deadlift 3 × 5 @ RPE 6", "No pulldowns; easy catch only", "Throwing volume down 45–55%"],
  ["Rebuild movement", "Trap bar deadlift 3 × 4 @ RPE 6–7", "Moderate catch; one controlled mound touch", "Finish every session fresh"]
];

const velocityWeeks = [
  ["Extension base", "Trap bar deadlift 4 × 4 @ 110 kg", "Long toss foundation; 6 pulldowns", "Establish distance and recovery baseline"],
  ["Extension build", "Trap bar deadlift 4 × 4 @ 112.5 kg", "Add 15–30 ft if mechanics hold", "No consecutive high-intent days"],
  ["Intent entry", "Trap bar deadlift 5 × 3 @ 117.5 kg", "8 pulldowns; radar best six", "Track high-effort throw count"],
  ["Deload", "Trap bar deadlift 3 × 3 @ 105 kg", "5–6 pulldowns at 90–95%", "Throwing volume down 25%"],
  ["Overload strength", "Trap bar deadlift 5 × 3 @ 120 kg", "8 pulldowns; stable direction", "Medicine ball 3 kg"],
  ["Speed-strength", "Trap bar deadlift 6 × 2 @ 115 kg", "8–10 pulldowns if green", "Stop at two-throw velocity drop"],
  ["Speed-strength build", "Trap bar deadlift 6 × 2 @ 117.5 kg", "Top-six average target", "Keep mound volume moderate"],
  ["Test and deload", "Trap bar deadlift 3 × 2 @ 105 kg", "Test day: 6–8 quality throws", "Compare peak and average, not peak alone"],
  ["Mound conversion", "Trap bar deadlift 4 × 3 @ 112.5 kg", "Pulldown volume down; bullpen up", "Fastball command before secondary volume"],
  ["Mound build", "Trap bar deadlift 4 × 3 @ 115 kg", "20–25 pitch competitive bullpen", "One high-output exposure only"],
  ["Live intent", "Trap bar deadlift 4 × 2 @ 115 kg", "Live AB or game-intent bullpen", "Full recovery between hitters"],
  ["Velocity block review", "Trap bar deadlift 3 × 2 @ 105 kg", "Low-volume test; no fatigue chase", "Review 12-week velocity trend"]
];

const preseasonWeeks = [
  ["Mound foundation", "Trap bar deadlift 4 × 3 @ 115 kg", "25-pitch bullpen", "Build repeatable strike intent"],
  ["Pitch mix", "Trap bar deadlift 4 × 3 @ 117.5 kg", "30-pitch bullpen", "Fastball/changeup command"],
  ["Two-inning shape", "Trap bar deadlift 5 × 2 @ 117.5 kg", "2 × 15-pitch innings", "Five-minute inning break"],
  ["Deload", "Trap bar deadlift 3 × 3 @ 105 kg", "20-pitch touch-and-feel bullpen", "Volume down 30%"],
  ["Three-inning build", "Trap bar deadlift 4 × 2 @ 115 kg", "3 × 15-pitch innings", "Game routines between innings"],
  ["Live hitters", "Trap bar deadlift 4 × 2 @ 117.5 kg", "Live hitters; 45–55 pitches", "Track first-pitch strikes"],
  ["Work capacity", "Trap bar deadlift 4 × 2 @ 115 kg", "55–65 pitch simulation", "Recovery begins immediately"],
  ["Game rehearsal", "Trap bar deadlift 3 × 2 @ 110 kg", "65–75 pitch simulation", "Use complete pregame routine"],
  ["Taper", "Trap bar deadlift 3 × 2 @ 105 kg", "Short pen; 15–20 pitches", "Reduce total training volume"],
  ["Preseason review", "Trap bar deadlift 2 × 2 @ 100 kg", "Competition-ready touch", "Confirm summer role and pitch limits"]
];

const summerFocus = [
  "Opening workload baseline", "Recover between two game windows", "Maintain strength and command", "Four-week deload review",
  "Build appearance consistency", "Protect high-effort throw spacing", "Maintain power microdose", "Term 4 deload",
  "Late-Term 4 performance", "Hold Term 4 workload", "Christmas-break entry", "Term 1 return", "Re-establish game rhythm",
  "Command under game fatigue", "Maintain bodyweight and speed", "Late-season deload", "Performance push",
  "Hold velocity deeper", "Pre-Easter taper"
];

const LIFT_PB_LABELS = {
  trapBarDeadlift: "Trap bar deadlift",
  benchPress: "Bench press",
  backSquat: "Back squat",
  pushPress: "Push press"
};

const VELOCITY_PB_LABELS = {
  pulldown: "Pulldown velocity",
  gameFastball: "Game fastball velocity"
};

const TRAP_BAR_WEEK_SPECS = {
  1: [4, 5, 80], 2: [4, 5, 82], 3: [5, 3, 85], 4: [5, 3, 87],
  5: [6, 2, 80], 6: [6, 2, 82], 7: [6, 2, 83], 8: [4, 2, 77],
  9: [3, 5, 65], 10: [3, 4, 70], 11: [4, 3, 75], 12: [3, 2, 70],
  13: [3, 3, 75], 14: [3, 3, 77], 15: [3, 3, 78], 16: [2, 3, 70],
  17: [3, 3, 77], 18: [3, 2, 80], 19: [3, 3, 75], 20: [2, 3, 70],
  21: [3, 2, 78], 22: [2, 2, 70], 23: [3, 5, 70], 24: [4, 5, 75],
  25: [4, 4, 78], 26: [5, 3, 82], 27: [5, 3, 85], 28: [3, 3, 70],
  29: [3, 3, 75], 30: [3, 3, 77], 31: [3, 2, 80], 32: [2, 3, 70],
  33: [3, 3, 77], 34: [3, 2, 80], 35: [2, 2, 72], 36: [2, 2, 67],
  37: [3, 5, 60], 38: [3, 4, 65], 39: [4, 5, 78], 40: [4, 5, 80],
  41: [5, 3, 83], 42: [5, 3, 85], 43: [6, 2, 78], 44: [6, 2, 80],
  45: [6, 2, 82], 46: [4, 2, 72], 47: [4, 3, 75], 48: [4, 3, 77],
  49: [4, 2, 78], 50: [3, 2, 70], 51: [4, 2, 75], 52: [3, 2, 70]
};

function defaultPBs() {
  const liftRecord = () => ({ value: 0, kind: "unestablished", source: "Not tested", date: "", updatedAt: "", resultId: "" });
  const velocityRecord = () => ({ value: 0, kind: "unestablished", source: "Not recorded", date: "", updatedAt: "", resultId: "" });
  return {
    lifts: {
      trapBarDeadlift: liftRecord(),
      benchPress: liftRecord(),
      backSquat: liftRecord(),
      pushPress: liftRecord()
    },
    velocity: {
      pulldown: velocityRecord(),
      gameFastball: velocityRecord()
    },
    trainingMaxes: {
      lifts: {
        trapBarDeadlift: liftRecord(),
        benchPress: liftRecord(),
        backSquat: liftRecord(),
        pushPress: liftRecord()
      },
      velocity: {
        pulldown: velocityRecord(),
        gameFastball: velocityRecord()
      }
    },
    history: []
  };
}

function mergePBs(stored = {}) {
  const defaults = defaultPBs();
  const storedTrainingMaxes = stored.trainingMaxes || {};
  return {
    lifts: Object.fromEntries(Object.keys(defaults.lifts).map((key) => [key, { ...defaults.lifts[key], ...(stored.lifts?.[key] || {}) }])),
    velocity: Object.fromEntries(Object.keys(defaults.velocity).map((key) => [key, { ...defaults.velocity[key], ...(stored.velocity?.[key] || {}) }])),
    trainingMaxes: {
      lifts: Object.fromEntries(Object.keys(defaults.trainingMaxes.lifts).map((key) => [
        key,
        {
          ...defaults.trainingMaxes.lifts[key],
          ...(stored.lifts?.[key] || {}),
          ...(storedTrainingMaxes.lifts?.[key] || {})
        }
      ])),
      velocity: Object.fromEntries(Object.keys(defaults.trainingMaxes.velocity).map((key) => [
        key,
        {
          ...defaults.trainingMaxes.velocity[key],
          ...(stored.velocity?.[key] || {}),
          ...(storedTrainingMaxes.velocity?.[key] || {})
        }
      ]))
    },
    history: Array.isArray(stored.history) ? stored.history : []
  };
}

function roundToIncrement(value, increment = 2.5) {
  return Math.round(Number(value) / increment) * increment;
}

function liftLoadFromPB(liftKey, percent, increment = 2.5) {
  const value = Number(state?.pbs?.trainingMaxes?.lifts?.[liftKey]?.value || 0);
  return value > 0 ? roundToIncrement(value * Number(percent) / 100, increment) : 0;
}

function strengthPrescription(liftKey, sets, reps, percent, fallback) {
  const load = liftLoadFromPB(liftKey, percent);
  const trainingMax = state?.pbs?.trainingMaxes?.lifts?.[liftKey];
  if (!load || !trainingMax) return fallback;
  const basis = trainingMax.kind === "tested" ? "tested training max" : "estimated training max";
  return `${sets} × ${reps} @ ${percent}% · ${load} kg (from ${trainingMax.value} kg ${basis})`;
}

function trapBarPrescription(week, fallback, pbs) {
  const spec = TRAP_BAR_WEEK_SPECS[week];
  const trainingMax = pbs?.trainingMaxes?.lifts?.trapBarDeadlift;
  if (!spec || !Number(trainingMax?.value)) return fallback;
  const [sets, reps, percent] = spec;
  const load = roundToIncrement(Number(trainingMax.value) * percent / 100, 2.5);
  const basis = trainingMax.kind === "tested" ? "tested training max" : "estimated training max";
  return `Trap bar deadlift ${sets} × ${reps} @ ${percent}% · ${load} kg (from ${trainingMax.value} kg ${basis})`;
}

function estimatedOneRepMax(weight, reps, rpe) {
  const load = Number(weight);
  const completedReps = Number(reps);
  const effort = Number(rpe);
  if (!(load > 0 && completedReps > 0 && effort >= 1 && effort <= 10)) return 0;
  const repsInReserve = Math.max(0, 10 - effort);
  return round(load * (1 + (completedReps + repsInReserve) / 30), 1);
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDays(value, amount) {
  const date = value instanceof Date ? new Date(value) : parseDate(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function isoDate(date) {
  const d = date instanceof Date ? date : parseDate(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function brisbaneToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatDate(date, options = { day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("en-AU", options).format(date instanceof Date ? date : parseDate(date));
}

function formatDateRange(start, end) {
  return `${formatDate(start, { day: "numeric", month: "short" })} – ${formatDate(end, { day: "numeric", month: "short", year: "numeric" })}`;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round(value, places = 0) { const scale = 10 ** places; return Math.round(value * scale) / scale; }
function esc(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted && char === '"' && source[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\t")) {
      row.push(cell.trim());
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizedHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pulseDate(value) {
  const raw = String(value || "").trim();
  const iso = raw.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  const au = raw.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (au) return `${au[3]}-${String(au[2]).padStart(2, "0")}-${String(au[1]).padStart(2, "0")}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : isoDate(parsed);
}

function pulseNumber(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : "";
}

function parsePulseExport(text) {
  const rows = csvRows(text);
  if (rows.length < 2) throw new Error("The PULSE/TRAQ file needs a header row and at least one data row");
  const headers = rows[0].map(normalizedHeader);
  const aliases = {
    date: ["date", "day", "sessiondate", "throwdate", "workoutdate", "createdat"],
    totalThrows: ["totalthrows", "throwcount", "throws", "totalthrowcount"],
    highThrows: ["higheffortthrows", "higheffortthrowcount", "highintentthrows", "highthrows"],
    pulseWorkload: ["onedayworkload", "1dayworkload", "dailyworkload", "workload"],
    acRatio: ["acratio", "acutechronicratio", "acutechronicworkloadratio", "acwr"],
    pulseArmSpeed: ["pulsearmspeed", "armspeed", "maxarmspeed", "averagearmspeed"],
    pulseTorque: ["pulsetorque", "torque", "maxtorque", "averagetorque"],
    pulseBallVelocity: ["ballvelocity", "velocity", "maxvelocity", "pitchvelocity"]
  };
  const columns = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, headers.findIndex((header) => names.includes(header))]));
  if (columns.date < 0) throw new Error("No date column was found in the PULSE/TRAQ file");
  if (["totalThrows", "highThrows", "pulseWorkload", "acRatio", "pulseArmSpeed", "pulseTorque", "pulseBallVelocity"].every((field) => columns[field] < 0)) {
    throw new Error("No supported PULSE metrics were found. Export throw count, workload, A:C ratio, arm speed, torque or ball velocity");
  }
  const imported = {};
  for (const row of rows.slice(1)) {
    const date = pulseDate(row[columns.date]);
    if (!date) continue;
    const record = { source: "PULSE/TRAQ file", importedAt: new Date().toISOString() };
    for (const field of Object.keys(aliases)) {
      if (field === "date" || columns[field] < 0) continue;
      const value = pulseNumber(row[columns[field]]);
      if (value !== "") record[field] = value;
    }
    if (Object.keys(record).length > 2) imported[date] = { ...(imported[date] || {}), ...record };
  }
  if (!Object.keys(imported).length) throw new Error("No dated PULSE records could be imported");
  return imported;
}

function phaseForWeek(week) {
  return PHASES.find((phase) => week >= phase.weeks[0] && week <= phase.weeks[1]) || PHASES[0];
}

function isSummerCompetitionPhase(phaseId) {
  return phaseId === "summer_first" || phaseId === "summer_second";
}

function isTransitionPhase(phaseId) {
  return phaseId === "transition" || phaseId === "transition_summer";
}

function isWinterCompetitionPhase(phaseId) {
  return phaseId === "winter" || phaseId === "winter_next";
}

function fncRoundForRange(start, end) {
  const startIso = isoDate(start);
  const endIso = isoDate(end);
  return FNC_DIV1_ROUNDS_2026.find((item) => item.date >= startIso && item.date <= endIso) || null;
}

function getWeekPlan(week, pbs = null) {
  const phase = phaseForWeek(week);
  const start = addDays(ANNUAL_START, (week - 1) * 7);
  const end = addDays(start, 6);
  const fncRound = fncRoundForRange(start, end);
  let data;
  if (phase.id === "winter") data = winterWeeks[week - 1];
  if (phase.id === "transition") data = transitionWeeks[week - 9];
  if (phase.id === "preseason") {
    data = ["GBL team-rhythm re-entry", "Trap bar deadlift 4 × 3 @ RPE 6–7", "One controlled Wednesday intent exposure; team training rhythm Tue/Thu", "Prepare for Coomera Cubs' athlete-provided Friday 2 October opener"];
  }
  if (isSummerCompetitionPhase(phase.id)) {
    const index = phase.id === "summer_first" ? week - 12 : 11 + (week - 29);
    const deload = [3, 7, 14, 18].includes(index);
    data = [
      summerFocus[index],
      deload ? "Wednesday full body 2–3 sets @ RPE 6" : "Wednesday full body 3–4 sets @ RPE 6–7",
      "Training Tue/Thu; games Fri/Sun; no separate velocity day",
      deload ? "Reduce non-game work 25% and review appearance load" : "Friday workload determines Saturday recovery or primer"
    ];
  }
  if (phase.id === "summer_break") {
    const index = week - 23;
    const breakData = [
      ["Christmas unload", "Trap bar deadlift 3 × 5 @ RPE 6", "Throwing volume down 45–55%; no game assumptions", "Restore after the first GBL block"],
      ["Movement rebuild", "Trap bar deadlift 4 × 5 @ RPE 6–7", "Easy catch plus one controlled mound touch", "No back-to-back intent"],
      ["Strength rebuild", "Trap bar deadlift 4 × 4 @ RPE 7", "Long-toss foundation; 6 controlled pulldowns", "Keep high-effort count low"],
      ["Force emphasis", "Trap bar deadlift 5 × 3 @ RPE 7", "8 pulldowns with full recovery", "Protect Christmas/New Year recovery"],
      ["Strength-speed", "Trap bar deadlift 5 × 3 @ RPE 7–8", "Mound conversion; 25–35 pitch bullpen", "Finish every high-output set before drop-off"],
      ["Term 1 re-entry taper", "Trap bar deadlift 3 × 3 @ RPE 6", "Short competitive bullpen; no fatigue chase", "Reduce accessories 30% before games resume"]
    ];
    data = breakData[index];
  }
  if (phase.id === "transition_summer") data = transitionWeeks[week - 37];
  if (phase.id === "winter_next") {
    const index = (week - 39) % winterWeeks.length;
    const base = winterWeeks[index];
    data = [`2027 winter planning · ${base[0]}`, base[1], base[2], "Saturday rhythm is provisional until FNCBA publishes the 2027 draw"];
  }
  if (!data) data = ["Training continuity", "Trap bar deadlift at RPE 6–7", "Quality throwing only", "Review the published competition calendar"];
  const includesSummerOpener = SUMMER_FIRST_GAME >= isoDate(start) && SUMMER_FIRST_GAME <= isoDate(end);
  const competition = fncRound
    ? `FNCBA Division 1 · Round ${fncRound.round} · ${formatDate(fncRound.date, { weekday: "short", day: "numeric", month: "short" })}`
    : includesSummerOpener
      ? `Coomera Cubs opening game · ${formatDate(SUMMER_FIRST_GAME, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · athlete provided`
      : isSummerCompetitionPhase(phase.id)
        ? "GBL Friday/Sunday planning window · later 2026/27 fixtures pending"
      : phase.id === "winter_next"
        ? "FNCBA 2027 Saturday rhythm · exact draw pending"
        : "No league game assumed";
  const scheduleStatus = fncRound ? "Confirmed draw" : includesSummerOpener ? "Athlete-provided" : "Planning";
  const scheduleTone = fncRound ? "official" : includesSummerOpener ? "derived" : "pending";
  return {
    week,
    phase,
    start,
    end,
    focus: data[0],
    mondayLift: trapBarPrescription(week, data[1], pbs),
    throwing: data[2],
    recovery: data[3],
    competition,
    scheduleConfirmed: Boolean(fncRound),
    scheduleStatus,
    scheduleTone,
    theme: `${phase.name} · ${data[0]}`
  };
}

function annualWeeksForState() {
  return Array.from({ length: 52 }, (_, index) => getWeekPlan(index + 1, state.pbs));
}

function plannedDayLabel(phaseId, day) {
  const standard = [
    ["Recovery catch", "Force"], ["Command", "Speed"], ["Pulldowns", "Power"], ["Recovery catch", "Restore"],
    ["Primer catch", "Primer"], ["Game", "Compete"], ["Off", "Recover"]
  ];
  if (isSummerCompetitionPhase(phaseId)) return [
    ["Post-game recovery", "Restore"], ["Team training", "Practice"], ["Strength + catch", "Maintain"], ["Team training", "Prepare"],
    ["Game", "Compete"], ["Recovery / primer", "Role-aware"], ["Game", "Compete"]
  ][day];
  if (isTransitionPhase(phaseId)) return [
    ["Restore + strength", "Unload"], ["Easy catch", "Restore"], ["Reduced throw + gym", "Rebuild"], ["Aerobic recovery", "Restore"],
    ["Movement microdose", "Freshen"], ["Optional catch", "Recover"], ["Off", "Recover"]
  ][day];
  if (phaseId === "preseason" || phaseId === "summer_break") return [
    ["Whole-body force", "Build"], ["Command + speed", "Develop"], ["Velocity + power", "Express"], ["Recovery", "Restore"],
    ["Primer", "Freshen"], ["Mound / catch build", "Prepare"], ["Off", "Recover"]
  ][day];
  return standard[day];
}

function weeklyRhythmText(phaseId) {
  if (isSummerCompetitionPhase(phaseId)) return "Training Tue/Thu · Games Fri/Sun";
  if (isTransitionPhase(phaseId)) return "Reduced throwing · No league game assumed";
  if (phaseId === "preseason") return "Team rhythm Tue/Thu · Saturday mound build";
  if (phaseId === "summer_break") return "Strength/velocity rebuild · No league game assumed";
  if (phaseId === "winter_next") return "Velocity Wed · Provisional Saturday competition";
  return "Velocity Wed · FNCBA game Saturday";
}

function phaseStatusTone(phaseId) {
  return "team";
}

function seasonThemeForPhase(phaseId) {
  return ["winter", "transition", "winter_next"].includes(phaseId) ? "norths" : "coomera";
}

function teamBrandForPhase(phaseId) {
  const winter = seasonThemeForPhase(phaseId) === "norths";
  return winter
    ? { name: state.profile.winterTeam || "Norths", logo: "/assets/norths-baseball-logo.jpg", alt: "Norths Baseball Club logo" }
    : { name: state.profile.summerTeam || "Coomera Cubs", logo: "/assets/coomera-cubs-logo.png", alt: "Coomera Cubs Baseball Club logo" };
}

function plannedStressShape(phaseId) {
  if (isSummerCompetitionPhase(phaseId)) return [25, 55, 50, 40, 95, 25, 95];
  if (isTransitionPhase(phaseId)) return [45, 30, 45, 25, 25, 20, 0];
  if (phaseId === "preseason" || phaseId === "summer_break") return [55, 55, 90, 25, 35, 70, 0];
  return [45, 55, 100, 25, 30, 100, 0];
}

function todaySelection() {
  const now = parseDate(brisbaneToday());
  const start = parseDate(ANNUAL_START);
  const diff = Math.floor((now - start) / 86400000);
  const selectedWeek = clamp(Math.floor(diff / 7) + 1, 1, 52);
  const selectedDay = diff < 0 ? 0 : diff > 363 ? 6 : ((diff % 7) + 7) % 7;
  return { selectedWeek, selectedDay, openDate: brisbaneToday() };
}

function initialState() {
  const current = todaySelection();
  return {
    version: 1,
    onboardingComplete: false,
    page: "dashboard",
    selectedWeek: current.selectedWeek,
    selectedDay: current.selectedDay,
    lastOpenDate: current.openDate,
    syncUpdatedAt: new Date().toISOString(),
    pre: {},
    completedTasks: {},
    skippedTasks: {},
    taskCompletionUpdatedAt: {},
    post: {},
    healthPrefill: {},
    healthHistoryFetchedAt: "",
    pulseImports: {},
    bullpens: {},
    weeklyReviews: {},
    trainingHistory: HistoryDomain.emptyTrainingHistory(),
    mechanics: { assessments: [], approvedInterventions: [] },
    nutrition: {
      selectedDate: current.openDate,
      targets: { calories: 0, protein: 0, carbs: 0, fat: 0, fluid: 0 },
      meals: {},
      savedMeals: [],
      hydration: {},
      hydrationEvents: {},
      hydrationPresets: [0.5, 0.75],
      sweatLoss: {},
      reminders: { enabled: false, intervalMinutes: 90, quietStart: "21:00", quietEnd: "07:00", trainingDaysOnly: true }
    },
    pbs: defaultPBs(),
    profile: {
      name: "Athlete",
      photoDataUrl: "",
      height: 0,
      weight: 0,
      throwingHand: "Right",
      role: "Starting pitcher",
      winterRotation: "Saturday",
      summerGames: "Friday & Sunday",
      summerTraining: "Tuesday & Thursday",
      gym: "",
      winterTeam: "Norths",
      summerTeam: "Coomera Cubs",
      appearance: "system",
      glassIntensity: "balanced",
      interfaceDensity: "comfortable",
      motionPreference: "system",
      navigationBehavior: "smart",
      programTemplate: "australian_two_season",
      trapBar: "",
      bench: "",
      squat: ""
    }
  };
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const defaults = initialState();
    return stored && stored.version === 1 ? hydrateState(stored, defaults) : defaults;
  } catch { return initialState(); }
}

function hydrateState(stored, defaults = initialState()) {
  const isDylanProfile = stored.profile?.name === "Dylan Sippel";
  const nutritionDefaults = isDylanProfile
    ? { ...defaults.nutrition.targets, protein: 180, fluid: 4.5 }
    : defaults.nutrition.targets;
  return {
    ...defaults,
    ...stored,
    onboardingComplete: stored.onboardingComplete ?? Boolean(stored.profile?.name && stored.profile.name !== "Athlete"),
    profile: { ...defaults.profile, ...(stored.profile || {}) },
    pbs: mergePBs(stored.pbs),
    pre: stored.pre && typeof stored.pre === "object" ? stored.pre : {},
    completedTasks: stored.completedTasks && typeof stored.completedTasks === "object" ? stored.completedTasks : {},
    skippedTasks: stored.skippedTasks && typeof stored.skippedTasks === "object" ? stored.skippedTasks : {},
    taskCompletionUpdatedAt: stored.taskCompletionUpdatedAt && typeof stored.taskCompletionUpdatedAt === "object" ? stored.taskCompletionUpdatedAt : {},
    post: stored.post && typeof stored.post === "object" ? stored.post : {},
    healthPrefill: sanitizeHealthPrefill(stored.healthPrefill),
    pulseImports: stored.pulseImports && typeof stored.pulseImports === "object" ? stored.pulseImports : {},
    bullpens: stored.bullpens && typeof stored.bullpens === "object" ? stored.bullpens : {},
    weeklyReviews: stored.weeklyReviews && typeof stored.weeklyReviews === "object" ? stored.weeklyReviews : {},
    trainingHistory: HistoryDomain.hydrateTrainingHistory(stored.trainingHistory),
    nutrition: {
      selectedDate: stored.nutrition?.selectedDate || defaults.nutrition.selectedDate,
      targets: { ...nutritionDefaults, ...(stored.nutrition?.targets || {}) },
      meals: stored.nutrition?.meals && typeof stored.nutrition.meals === "object" ? stored.nutrition.meals : {},
      savedMeals: Array.isArray(stored.nutrition?.savedMeals) ? stored.nutrition.savedMeals : [],
      hydration: stored.nutrition?.hydration && typeof stored.nutrition.hydration === "object" ? stored.nutrition.hydration : {},
      hydrationEvents: stored.nutrition?.hydrationEvents && typeof stored.nutrition.hydrationEvents === "object" ? stored.nutrition.hydrationEvents : {},
      hydrationPresets: Array.isArray(stored.nutrition?.hydrationPresets) && stored.nutrition.hydrationPresets.length
        ? stored.nutrition.hydrationPresets.map(Number).filter((value) => value > 0 && value <= 5).slice(0, 4)
        : defaults.nutrition.hydrationPresets,
      sweatLoss: stored.nutrition?.sweatLoss && typeof stored.nutrition.sweatLoss === "object" ? stored.nutrition.sweatLoss : {},
      reminders: { ...defaults.nutrition.reminders, ...(stored.nutrition?.reminders || {}) }
    },
    mechanics: {
      assessments: Array.isArray(stored.mechanics?.assessments) ? stored.mechanics.assessments : [],
      approvedInterventions: Array.isArray(stored.mechanics?.approvedInterventions) ? stored.mechanics.approvedInterventions : []
    },
    page: "dashboard",
    selectedWeek: defaults.selectedWeek,
    selectedDay: defaults.selectedDay,
    lastOpenDate: defaults.lastOpenDate
  };
}

function sanitizeHealthPrefill(records) {
  if (!records || typeof records !== "object" || Array.isArray(records)) return {};
  return Object.fromEntries(Object.entries(records).map(([date, record]) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) return [date, record];
    const sources = record.sources && typeof record.sources === "object" ? { ...record.sources } : {};
    if (sources.oura?.data && typeof sources.oura.data === "object") {
      const { ouraData, ...summary } = sources.oura.data;
      sources.oura = { ...sources.oura, data: summary };
    }
    return [date, { ...record, sources }];
  }));
}

let state = loadState();
let activeModalTask = null;
let activeSkipTask = null;
let activePlanStage = { date: "", stage: null };
let mobileMoreOpen = false;
const launchParams = new URLSearchParams(window.location.search);
if (["dashboard", "session", "annual", "analytics", "nutrition", "mechanics", "profile", "integrations"].includes(launchParams.get("page"))) {
  state.page = launchParams.get("page");
}

const integrationState = {
  loading: false,
  healthLoadingDate: "",
  healthHistoryLoading: false,
  oura: { configured: false, connected: false, scopes: "", updatedAt: "", error: "" },
  apple: { connected: false, lastUploadAt: "", error: "" },
  appleUploadToken: localStorage.getItem(APPLE_UPLOAD_TOKEN_STORAGE) || "",
  appleEndpoint: `${window.location.origin}/api/integrations/apple/ingest`,
  revealAppleToken: false
};

const nutritionUi = {
  analyzing: false,
  analyzingText: false,
  mealDescription: "",
  lookingUpBarcode: false,
  lookingUpRestaurant: false,
  searchingFood: false,
  foodQuery: "",
  foodResults: [],
  searchMessage: "",
  searchError: "",
  photoMessage: "",
  photoError: "",
  draft: null,
  photoUrls: {}
};

const mechanicsMediaState = {
  loading: false,
  uploading: false,
  analyzing: false,
  videos: [],
  error: ""
};

const bullpenUi = {
  date: "",
  target: null,
  actual: null,
  pitchType: "four_seam",
  result: "called_strike",
  velocity: "",
  notes: ""
};

let smartNavigationCondensed = false;
let previousScrollY = window.scrollY || 0;

function normalizeSyncKey(value = "") {
  const normalized = String(value).trim().replace(/[^a-f0-9]/gi, "").toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : "";
}

const savedSyncKey = normalizeSyncKey(localStorage.getItem(SYNC_KEY_STORAGE) || "");
function storedArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

const cloudSync = {
  key: savedSyncKey,
  status: savedSyncKey ? "connecting" : "local",
  message: savedSyncKey ? "Connecting…" : "Saved on this device",
  lastSyncedAt: localStorage.getItem(SYNC_LAST_STORAGE) || "",
  revision: 0,
  ready: false,
  dirty: false,
  timer: null,
  inFlight: null,
  applyingRemote: false,
  revealKey: false,
  pendingChanges: storedArray(SYNC_PENDING_STORAGE),
  recentSaves: storedArray(SYNC_HISTORY_STORAGE)
};

const accountAuth = {
  loading: true,
  signedIn: false,
  user: null,
  workspaceReady: false,
  passkeys: [],
  error: ""
};

function authErrorMessage(result, fallback = "Sign-in could not be completed") {
  return result?.error?.message || result?.error?.statusText || fallback;
}

function promiseWithTimeout(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]).finally(() => window.clearTimeout(timer));
}

async function accountRequest(path, options = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options.timeoutMs || 12_000);
  try {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Your account could not be loaded");
    return result;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The secure account connection timed out. Check your internet connection and try again.");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function loadAccountPasskeys() {
  if (!accountAuth.signedIn || !window.PitchingAuth) return;
  try {
    const result = await window.PitchingAuth.listPasskeys();
    accountAuth.passkeys = Array.isArray(result?.data) ? result.data : [];
  } catch {
    accountAuth.passkeys = [];
  }
}

async function initializeAccountAuth() {
  accountAuth.loading = true;
  accountAuth.error = "";
  try {
    if (!window.PitchingAuth) throw new Error("The secure sign-in module did not load");
    const sessionResult = await promiseWithTimeout(
      window.PitchingAuth.getSession(),
      12_000,
      "The secure sign-in check timed out. Check your internet connection and try again."
    );
    if (sessionResult?.error) throw new Error(authErrorMessage(sessionResult));
    if (!sessionResult?.data?.user) {
      accountAuth.signedIn = false;
      accountAuth.user = null;
      accountAuth.workspaceReady = false;
      cloudSync.ready = false;
      setCloudStatus("local", "Sign in to load your secure autosave");
      return false;
    }
    let status = await accountRequest("/api/account/status");
    if (!status.signedIn) throw new Error("Your sign-in session could not be verified");
    if (!status.workspaceReady) {
      status = await accountRequest("/api/account/workspace", {
        method: "POST",
        body: { legacySyncKey: savedSyncKey || undefined }
      });
    }
    const accountKey = normalizeSyncKey(status.syncKey);
    if (!accountKey) throw new Error("Your encrypted workspace could not be unlocked");
    accountAuth.signedIn = true;
    accountAuth.user = status.user || sessionResult.data.user;
    accountAuth.workspaceReady = true;
    cloudSync.key = accountKey;
    cloudSync.ready = false;
    localStorage.setItem(SYNC_KEY_STORAGE, accountKey);
    await initializeCloudSync();
    await loadAccountPasskeys();
    return true;
  } catch (error) {
    accountAuth.signedIn = false;
    accountAuth.user = null;
    accountAuth.workspaceReady = false;
    accountAuth.error = error.message || "Sign-in could not be completed";
    return false;
  } finally {
    accountAuth.loading = false;
  }
}

function saveState(options = {}) {
  if (options.touch !== false) state.syncUpdatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (options.cloud !== false) {
    recordPendingSync(options.label || "Training data");
    scheduleCloudSave();
  }
}

function persistSyncJournal() {
  localStorage.setItem(SYNC_PENDING_STORAGE, JSON.stringify(cloudSync.pendingChanges.slice(-20)));
  localStorage.setItem(SYNC_HISTORY_STORAGE, JSON.stringify(cloudSync.recentSaves.slice(-20)));
  if (cloudSync.lastSyncedAt) localStorage.setItem(SYNC_LAST_STORAGE, cloudSync.lastSyncedAt);
}

function recordPendingSync(label = "Training data") {
  const now = new Date().toISOString();
  cloudSync.pendingChanges.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label, changedAt: now });
  cloudSync.pendingChanges = cloudSync.pendingChanges.slice(-20);
  persistSyncJournal();
  updateCloudStatusUI();
}

function groupSyncKey(value = cloudSync.key) {
  return String(value).match(/.{1,8}/g)?.join("-") || "";
}

function generateSyncKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveCloudEncryptionKey(syncKey) {
  const material = new TextEncoder().encode(`pitching-os-data-v1:${syncKey}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function cloudSnapshot() {
  const { page, selectedWeek, selectedDay, lastOpenDate, editingPost, trainingHistory, ...data } = state;
  return { ...data, version: 1 };
}

async function encryptJsonEnvelope(value, syncKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveCloudEncryptionKey(syncKey);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return JSON.stringify({ version: 1, iv: bytesToBase64Url(iv), data: bytesToBase64Url(new Uint8Array(ciphertext)) });
}

async function decryptJsonEnvelope(payload, syncKey) {
  const envelope = JSON.parse(payload);
  if (envelope?.version !== 1 || typeof envelope.iv !== "string" || typeof envelope.data !== "string") throw new Error("Unsupported cloud backup");
  const key = await deriveCloudEncryptionKey(syncKey);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(envelope.iv) }, key, base64UrlToBytes(envelope.data));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function encryptCloudSnapshot(snapshot, syncKey) {
  return encryptJsonEnvelope(snapshot, syncKey);
}

async function decryptCloudSnapshot(payload, syncKey) {
  const parsed = await decryptJsonEnvelope(payload, syncKey);
  if (!parsed || parsed.version !== 1 || typeof parsed.pre !== "object" || typeof parsed.post !== "object") throw new Error("Invalid cloud backup");
  return parsed;
}

function recordTimestamp(record, fallback = 0) {
  if (!record || typeof record !== "object") return fallback;
  for (const key of ["updatedAt", "fetchedAt", "recordedAt", "completedAt", "submittedAt", "createdAt", "approvedAt"]) {
    const parsed = Date.parse(record[key] || "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function mergeRecordMaps(remoteMap = {}, localMap = {}, remoteFallback = 0, localFallback = 0) {
  const output = {};
  for (const key of new Set([...Object.keys(remoteMap || {}), ...Object.keys(localMap || {})])) {
    const remote = remoteMap?.[key];
    const local = localMap?.[key];
    if (remote === undefined) output[key] = local;
    else if (local === undefined) output[key] = remote;
    else output[key] = recordTimestamp(local, localFallback) >= recordTimestamp(remote, remoteFallback) ? local : remote;
  }
  return output;
}

function mergeTaskCompletion(remoteMap = {}, localMap = {}, remoteUpdated = {}, localUpdated = {}) {
  const output = {};
  for (const key of new Set([...Object.keys(remoteMap || {}), ...Object.keys(localMap || {})])) {
    const remoteTime = Date.parse(remoteUpdated?.[key] || "") || 0;
    const localTime = Date.parse(localUpdated?.[key] || "") || 0;
    output[key] = remoteTime || localTime
      ? [...(localTime >= remoteTime ? localMap?.[key] || [] : remoteMap?.[key] || [])]
      : [...new Set([...(remoteMap?.[key] || []), ...(localMap?.[key] || [])])];
  }
  return output;
}

function mergeTaskSkips(remoteMap = {}, localMap = {}, remoteUpdated = {}, localUpdated = {}) {
  const output = {};
  for (const date of new Set([...Object.keys(remoteMap || {}), ...Object.keys(localMap || {})])) {
    const remoteTime = Date.parse(remoteUpdated?.[date] || "") || 0;
    const localTime = Date.parse(localUpdated?.[date] || "") || 0;
    if (remoteTime || localTime) {
      output[date] = { ...(localTime >= remoteTime ? localMap?.[date] || {} : remoteMap?.[date] || {}) };
      continue;
    }
    output[date] = { ...(remoteMap?.[date] || {}), ...(localMap?.[date] || {}) };
  }
  return output;
}

function mergeTimestampMaps(remoteMap = {}, localMap = {}) {
  const output = {};
  for (const key of new Set([...Object.keys(remoteMap || {}), ...Object.keys(localMap || {})])) {
    const remoteTime = Date.parse(remoteMap?.[key] || "") || 0;
    const localTime = Date.parse(localMap?.[key] || "") || 0;
    output[key] = localTime >= remoteTime ? localMap?.[key] : remoteMap?.[key];
  }
  return output;
}

function mergeRecordsById(remoteItems = [], localItems = [], remoteFallback = 0, localFallback = 0) {
  const output = new Map();
  for (const item of [...remoteItems, ...localItems]) {
    const id = item?.id || JSON.stringify(item);
    const existing = output.get(id);
    if (!existing) {
      output.set(id, item);
      continue;
    }
    const itemFallback = localItems.includes(item) ? localFallback : remoteFallback;
    const existingFallback = localItems.includes(existing) ? localFallback : remoteFallback;
    if (recordTimestamp(item, itemFallback) >= recordTimestamp(existing, existingFallback)) output.set(id, item);
  }
  return [...output.values()];
}

function mergeMealMaps(remoteMeals = {}, localMeals = {}, remoteFallback = 0, localFallback = 0) {
  const output = {};
  for (const day of new Set([...Object.keys(remoteMeals || {}), ...Object.keys(localMeals || {})])) {
    output[day] = mergeRecordsById(remoteMeals?.[day] || [], localMeals?.[day] || [], remoteFallback, localFallback);
  }
  return output;
}

function mergeBullpenMaps(remoteBullpens = {}, localBullpens = {}, remoteFallback = 0, localFallback = 0) {
  const output = {};
  for (const date of new Set([...Object.keys(remoteBullpens || {}), ...Object.keys(localBullpens || {})])) {
    const remote = remoteBullpens?.[date] || {};
    const local = localBullpens?.[date] || {};
    const latest = recordTimestamp(local, localFallback) >= recordTimestamp(remote, remoteFallback) ? local : remote;
    output[date] = {
      ...latest,
      entries: mergeRecordsById(remote.entries, local.entries, remoteFallback, localFallback)
        .sort((left, right) => recordTimestamp(left) - recordTimestamp(right)),
      updatedAt: new Date(Math.max(recordTimestamp(remote, remoteFallback), recordTimestamp(local, localFallback))).toISOString()
    };
  }
  return output;
}

function mergePersonalBests(remotePBs = {}, localPBs = {}) {
  const remote = mergePBs(remotePBs);
  const local = mergePBs(localPBs);
  const merged = defaultPBs();
  const chooseRecord = (remoteRecord, localRecord) => {
    const remoteUpdated = Date.parse(remoteRecord?.updatedAt || "") || 0;
    const localUpdated = Date.parse(localRecord?.updatedAt || "") || 0;
    if (remoteUpdated || localUpdated) return localUpdated >= remoteUpdated ? localRecord : remoteRecord;
    return Number(localRecord?.value || 0) >= Number(remoteRecord?.value || 0) ? localRecord : remoteRecord;
  };
  for (const key of Object.keys(merged.lifts)) {
    merged.lifts[key] = chooseRecord(remote.lifts[key], local.lifts[key]);
    merged.trainingMaxes.lifts[key] = chooseRecord(
      remote.trainingMaxes.lifts[key],
      local.trainingMaxes.lifts[key]
    );
  }
  for (const key of Object.keys(merged.velocity)) {
    merged.velocity[key] = chooseRecord(remote.velocity[key], local.velocity[key]);
    merged.trainingMaxes.velocity[key] = chooseRecord(
      remote.trainingMaxes.velocity[key],
      local.trainingMaxes.velocity[key]
    );
  }
  const history = new Map();
  for (const item of [...remote.history, ...local.history]) {
    const id = item.id || [item.category, item.key, item.value, item.date, item.recordedAt].join("|");
    history.set(id, item);
  }
  merged.history = [...history.values()]
    .sort((left, right) => recordTimestamp(left) - recordTimestamp(right))
    .slice(-100);
  return merged;
}

function mergeCloudStates(remoteState, localState) {
  const remoteTime = Date.parse(remoteState?.syncUpdatedAt || "") || 0;
  const localTime = Date.parse(localState?.syncUpdatedAt || "") || 0;
  const latest = localTime >= remoteTime ? localState : remoteState;
  const older = localTime >= remoteTime ? remoteState : localState;
  const remoteNutrition = remoteState?.nutrition || {};
  const localNutrition = localState?.nutrition || {};
  const remoteMechanics = remoteState?.mechanics || {};
  const localMechanics = localState?.mechanics || {};
  return {
    ...older,
    ...latest,
    version: 1,
    pre: mergeRecordMaps(remoteState?.pre, localState?.pre, remoteTime, localTime),
    post: mergeRecordMaps(remoteState?.post, localState?.post, remoteTime, localTime),
    healthPrefill: mergeRecordMaps(remoteState?.healthPrefill, localState?.healthPrefill, remoteTime, localTime),
    pulseImports: mergeRecordMaps(remoteState?.pulseImports, localState?.pulseImports, remoteTime, localTime),
    bullpens: mergeBullpenMaps(remoteState?.bullpens, localState?.bullpens, remoteTime, localTime),
    weeklyReviews: mergeRecordMaps(remoteState?.weeklyReviews, localState?.weeklyReviews, remoteTime, localTime),
    completedTasks: mergeTaskCompletion(remoteState?.completedTasks, localState?.completedTasks, remoteState?.taskCompletionUpdatedAt, localState?.taskCompletionUpdatedAt),
    skippedTasks: mergeTaskSkips(remoteState?.skippedTasks, localState?.skippedTasks, remoteState?.taskCompletionUpdatedAt, localState?.taskCompletionUpdatedAt),
    taskCompletionUpdatedAt: mergeTimestampMaps(remoteState?.taskCompletionUpdatedAt, localState?.taskCompletionUpdatedAt),
    pbs: mergePersonalBests(remoteState?.pbs, localState?.pbs),
    nutrition: {
      ...(localTime >= remoteTime ? remoteNutrition : localNutrition),
      ...(localTime >= remoteTime ? localNutrition : remoteNutrition),
      meals: mergeMealMaps(remoteNutrition.meals, localNutrition.meals, remoteTime, localTime),
      savedMeals: mergeRecordsById(remoteNutrition.savedMeals, localNutrition.savedMeals, remoteTime, localTime),
      hydration: mergeRecordMaps(remoteNutrition.hydration, localNutrition.hydration, remoteTime, localTime),
      hydrationEvents: mergeMealMaps(remoteNutrition.hydrationEvents, localNutrition.hydrationEvents, remoteTime, localTime),
      sweatLoss: mergeRecordMaps(remoteNutrition.sweatLoss, localNutrition.sweatLoss, remoteTime, localTime)
    },
    mechanics: {
      assessments: mergeRecordsById(remoteMechanics.assessments, localMechanics.assessments, remoteTime, localTime),
      approvedInterventions: mergeRecordsById(remoteMechanics.approvedInterventions, localMechanics.approvedInterventions, remoteTime, localTime)
    },
    syncUpdatedAt: new Date().toISOString()
  };
}

function syncStatusLabel(status = cloudSync.status) {
  return ({ local: "This device", connecting: "Connecting", saving: "Saving", synced: "Synced", offline: "Offline", error: "Sync issue" })[status] || "This device";
}

function updateCloudStatusUI() {
  document.querySelectorAll("[data-sync-status]").forEach((element) => {
    element.textContent = syncStatusLabel();
    element.dataset.status = cloudSync.status;
    if (element.classList.contains("status")) {
      element.classList.remove("green", "yellow", "blue", "gray");
      element.classList.add(cloudSync.status === "synced" ? "green" : cloudSync.status === "error" || cloudSync.status === "offline" ? "yellow" : cloudSync.status === "local" ? "gray" : "blue");
    }
  });
  document.querySelectorAll("[data-sync-message]").forEach((element) => { element.textContent = cloudSync.message; });
  document.querySelectorAll("[data-sync-time]").forEach((element) => {
    element.textContent = cloudSync.lastSyncedAt ? `Last saved ${new Date(cloudSync.lastSyncedAt).toLocaleString("en-AU")}` : "Not yet saved to Cloudflare";
  });
  document.querySelectorAll("[data-sync-pending]").forEach((element) => {
    const count = cloudSync.pendingChanges.length;
    element.textContent = count ? `${count} local change${count === 1 ? "" : "s"} waiting` : "No local changes waiting";
  });
}

function setCloudStatus(status, message) {
  cloudSync.status = status;
  cloudSync.message = message;
  updateCloudStatusUI();
}

async function cloudRequest(method = "GET", body) {
  if (!cloudSync.key) throw new Error("Cloud autosave is not connected");
  const response = await fetch("/api/sync", {
    method,
    headers: {
      Authorization: `Bearer ${cloudSync.key}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || "Cloud autosave is unavailable");
    error.code = result.code || "";
    error.currentRevision = Number(result.currentRevision || 0);
    throw error;
  }
  return result;
}

function appendTrainingHistory(collection, date, type, payload, options = {}) {
  state.trainingHistory = HistoryDomain.appendHistoryEvent(
    state.trainingHistory,
    collection,
    date,
    type,
    payload,
    options
  );
  return HistoryDomain.latestEvent(state.trainingHistory, collection, date);
}

async function historyRequest(method = "GET", body, query = "") {
  if (!cloudSync.key) throw new Error("Cloud autosave is not connected");
  const response = await fetch(`/api/history${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${cloudSync.key}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Immutable training history is unavailable");
  return result;
}

async function pushPendingTrainingHistory() {
  const pending = HistoryDomain.pendingHistoryEvents(state.trainingHistory);
  if (!cloudSync.key || !pending.length) return;
  for (let index = 0; index < pending.length; index += 20) {
    const batch = pending.slice(index, index + 20);
    const events = await Promise.all(batch.map(async (event) => ({
      id: event.id,
      eventType: HISTORY_EVENT_TYPE[event.collection],
      sessionDay: event.date,
      occurredAt: event.occurredAt,
      encryptedPayload: await encryptJsonEnvelope(event, cloudSync.key)
    })));
    const result = await historyRequest("POST", { events });
    state.trainingHistory = HistoryDomain.markHistoryEventsUploaded(
      state.trainingHistory,
      batch.map((event) => event.id),
      result.createdAt || new Date().toISOString()
    );
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function loadRemoteTrainingHistory() {
  if (!cloudSync.key) return;
  let cursor = null;
  let pageCount = 0;
  do {
    const query = cursor
      ? `?limit=500&after=${encodeURIComponent(cursor.occurredAt)}&afterId=${encodeURIComponent(cursor.id)}`
      : "?limit=500";
    const result = await historyRequest("GET", undefined, query);
    const decrypted = [];
    for (const row of result.events || []) {
      const event = await decryptJsonEnvelope(row.encryptedPayload, cloudSync.key);
      if (!event || event.id !== row.id || event.date !== row.sessionDay || HISTORY_EVENT_TYPE[event.collection] !== row.eventType) {
        throw new Error("A training-history record failed its integrity check");
      }
      decrypted.push(event);
    }
    state.trainingHistory = HistoryDomain.importRemoteHistoryEvents(
      state.trainingHistory,
      decrypted,
      new Date().toISOString()
    );
    cursor = result.nextCursor || null;
    pageCount += 1;
    if (pageCount > 100) throw new Error("Training history exceeded the safe transfer limit");
  } while (cursor);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function integrationRequest(path, options = {}) {
  if (!cloudSync.key) throw new Error("Turn on cloud autosave first so the health connection has a private account key");
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${cloudSync.key}`,
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store"
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Health connection is unavailable");
  return result;
}

async function privateApiRequest(path, options = {}) {
  if (!cloudSync.key) throw new Error("Turn on cloud autosave first");
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${cloudSync.key}`, ...(options.headers || {}) },
    body: options.body,
    cache: "no-store"
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The request could not be completed");
  return result;
}

async function nutritionApiRequest(path, options = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options.timeoutMs || 45_000);
  try {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: {
        ...(cloudSync.key ? { Authorization: `Bearer ${cloudSync.key}` } : {}),
        ...(options.headers || {})
      },
      body: options.body,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) throw new Error("Your sign-in expired. Sign in again, then retry.");
      if (response.status === 429) throw new Error("The nutrition service is busy. Wait a minute, then retry.");
      throw new Error(result.error || "Nutrition could not complete that request.");
    }
    return result;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Nutrition took too long to respond. Check your connection and retry.");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function loadNutritionPhotoUrls(renderAfter = true) {
  if (!cloudSync.key) return;
  const ids = [...new Set(Object.values(state.nutrition?.meals || {}).flat().map((meal) => meal.photoId).filter(Boolean))];
  if (!ids.length) return;
  const replies = await Promise.allSettled(ids.map(async (id) => {
    await nutritionApiRequest(`/api/nutrition/photos/${encodeURIComponent(id)}`, { method: "DELETE" });
    return id;
  }));
  const deleted = new Set(replies.filter((reply) => reply.status === "fulfilled").map((reply) => reply.value));
  if (!deleted.size) return;
  for (const [date, meals] of Object.entries(state.nutrition.meals || {})) {
    state.nutrition.meals[date] = meals.map((meal) => deleted.has(meal.photoId) ? { ...meal, photoId: "" } : meal);
  }
  for (const reply of replies) {
    if (reply.status === "fulfilled") delete nutritionUi.photoUrls[reply.value];
  }
  saveState({ label: "Nutrition log" });
  if (renderAfter) render(true);
}

async function loadMechanicsVideos(renderAfter = true) {
  if (!cloudSync.key) {
    mechanicsMediaState.videos = [];
    return;
  }
  mechanicsMediaState.loading = true;
  if (renderAfter) render(true);
  try {
    const result = await privateApiRequest("/api/mechanics/videos");
    mechanicsMediaState.videos = Array.isArray(result.videos) ? result.videos : [];
    mechanicsMediaState.error = "";
  } catch (error) {
    mechanicsMediaState.error = error.message;
  } finally {
    mechanicsMediaState.loading = false;
    if (renderAfter) render(true);
  }
}

async function loadIntegrationStatuses(renderAfter = true) {
  if (!cloudSync.key) {
    integrationState.oura = { configured: false, connected: false, scopes: "", updatedAt: "", error: "" };
    integrationState.apple = { connected: false, lastUploadAt: "", error: "" };
    if (renderAfter) render(true);
    return;
  }
  integrationState.loading = true;
  if (renderAfter) render(true);
  const [ouraResult, appleResult] = await Promise.allSettled([
    integrationRequest("/api/integrations/oura/status"),
    integrationRequest("/api/integrations/apple/status")
  ]);
  integrationState.oura = ouraResult.status === "fulfilled"
    ? { ...integrationState.oura, ...ouraResult.value, error: "" }
    : { ...integrationState.oura, error: ouraResult.reason?.message || "Oura status unavailable" };
  integrationState.apple = appleResult.status === "fulfilled"
    ? { ...integrationState.apple, ...appleResult.value, error: "" }
    : { ...integrationState.apple, error: appleResult.reason?.message || "Apple Health status unavailable" };
  integrationState.loading = false;
  if (renderAfter) render(true);
}

function sleepQualityFromScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= 85) return 5;
  if (value >= 70) return 4;
  if (value >= 55) return 3;
  if (value >= 40) return 2;
  return 1;
}

async function loadHealthPrefill(date, force = false, renderAfter = true) {
  if (!cloudSync.key || (state.pre[date] && !force)) return;
  if (integrationState.healthLoadingDate === date) return;
  integrationState.healthLoadingDate = date;
  if (renderAfter) render(true);
  try {
    const suffix = force ? "&refresh=1" : "";
    const result = await integrationRequest(`/api/integrations/daily?day=${encodeURIComponent(date)}${suffix}`);
    state.healthPrefill[date] = { ...result, fetchedAt: new Date().toISOString() };
    if (state.pre[date]) refreshSubmittedHealthCheck(date);
    saveState();
  } catch (error) {
    state.healthPrefill[date] = { error: error.message, fetchedAt: new Date().toISOString() };
    saveState({ cloud: false });
  } finally {
    integrationState.healthLoadingDate = "";
    if (renderAfter) render(true);
  }
}

async function loadHealthHistory(force = false, renderAfter = true) {
  if (!cloudSync.key || integrationState.healthHistoryLoading) return;
  const lastFetch = Date.parse(state.healthHistoryFetchedAt || "") || 0;
  if (!force && Date.now() - lastFetch < 12 * 60 * 60 * 1000) return;
  integrationState.healthHistoryLoading = true;
  try {
    const end = brisbaneToday();
    const result = await integrationRequest(`/api/integrations/history?days=28&end=${encodeURIComponent(end)}&refresh=1`);
    const fetchedAt = new Date().toISOString();
    for (const [date, record] of Object.entries(result.records || {})) {
      const existing = state.healthPrefill[date];
      const incoming = { ...record, fetchedAt };
      state.healthPrefill[date] = !existing || recordTimestamp(incoming) >= recordTimestamp(existing) ? incoming : existing;
    }
    state.healthHistoryFetchedAt = fetchedAt;
    saveState();
  } catch (error) {
    console.error("Connected health history refresh failed", error);
  } finally {
    integrationState.healthHistoryLoading = false;
    if (renderAfter) render(true);
  }
}

function healthPrefillValues(date, stored = {}) {
  const health = state.healthPrefill[date] || {};
  const merged = health.merged || {};
  const oura = health.sources?.oura?.data || {};
  return {
    ...stored,
    sleepHours: stored.sleepHours ?? merged.sleepHours ?? "",
    bodyweight: stored.bodyweight ?? merged.bodyweightKg ?? state.profile.weight,
    sleepQuality: stored.sleepQuality ?? sleepQualityFromScore(merged.sleepScore),
    sleepScore: stored.sleepScore ?? merged.sleepScore ?? "",
    ouraReadinessScore: stored.ouraReadinessScore ?? merged.readinessScore ?? "",
    restingHeartRate: stored.restingHeartRate ?? merged.restingHeartRate ?? "",
    hrvMs: stored.hrvMs ?? merged.hrvMs ?? "",
    ouraActivityScore: stored.ouraActivityScore ?? oura.activityScore ?? "",
    ouraSteps: stored.ouraSteps ?? oura.steps ?? "",
    ouraStressHighMinutes: stored.ouraStressHighMinutes ?? oura.stressHighMinutes ?? "",
    ouraRecoveryHighMinutes: stored.ouraRecoveryHighMinutes ?? oura.recoveryHighMinutes ?? "",
    ouraTemperatureDeviation: stored.ouraTemperatureDeviation ?? oura.temperatureDeviation ?? "",
    ouraSpO2: stored.ouraSpO2 ?? oura.spo2Average ?? "",
    ouraRestMode: stored.ouraRestMode ?? (oura.restMode ? "yes" : "no")
  };
}

function importedHealthValues(date) {
  const health = state.healthPrefill[date] || {};
  const merged = health.merged || {};
  const oura = health.sources?.oura?.data || {};
  const values = {};
  const assign = (key, value) => {
    if (value !== null && value !== undefined && value !== "") values[key] = value;
  };
  assign("sleepHours", merged.sleepHours);
  assign("bodyweight", merged.bodyweightKg);
  assign("sleepScore", merged.sleepScore);
  assign("sleepQuality", sleepQualityFromScore(merged.sleepScore));
  assign("ouraReadinessScore", merged.readinessScore);
  assign("restingHeartRate", merged.restingHeartRate);
  assign("hrvMs", merged.hrvMs);
  assign("ouraActivityScore", oura.activityScore);
  assign("ouraSteps", oura.steps);
  assign("ouraStressHighMinutes", oura.stressHighMinutes);
  assign("ouraRecoveryHighMinutes", oura.recoveryHighMinutes);
  assign("ouraTemperatureDeviation", oura.temperatureDeviation);
  assign("ouraSpO2", oura.spo2Average);
  if (typeof oura.restMode === "boolean") values.ouraRestMode = oura.restMode ? "yes" : "no";
  return values;
}

function refreshSubmittedHealthCheck(date) {
  const existing = state.pre[date];
  if (!existing) return;
  const imported = importedHealthValues(date);
  const changed = Object.entries(imported).some(([key, value]) => String(existing[key] ?? "") !== String(value ?? ""));
  if (!changed) return;
  const next = { ...existing, ...imported };
  const readiness = calculateReadiness(next, date);
  const occurredAt = new Date().toISOString();
  state.pre[date] = {
    ...next,
    ...readiness,
    hrvSource: readiness.hrvSource,
    restingHeartRateSource: readiness.restingHeartRateSource,
    sleepHoursSource: readiness.sleepSource,
    updatedAt: occurredAt
  };
  if (!["reduced", "recovery"].includes(readiness.planLevel)) delete state.pre[date].manualOverride;
  if (next.bodyweight) state.profile.weight = Number(next.bodyweight);
  const event = appendTrainingHistory("checkIns", date, "connected_health_refresh", {
    runId: state.pre[date]?.runId || "",
    response: { ...state.pre[date] },
    changedFields: Object.keys(imported)
  }, {
    occurredAt,
    supersedesId: existing.historyId || ""
  });
  state.pre[date].historyId = event.id;
  capturePlanSnapshot(date, "plan_reassigned_after_health_refresh");
}

async function pushCloudState() {
  if (!cloudSync.key || !cloudSync.ready || cloudSync.applyingRemote) return;
  if (cloudSync.inFlight) return cloudSync.inFlight;
  const pendingAtStart = cloudSync.pendingChanges.map((item) => ({ ...item }));
  const pendingIds = new Set(pendingAtStart.map((item) => item.id));
  cloudSync.dirty = false;
  setCloudStatus("saving", "Encrypting and saving changes…");
  cloudSync.inFlight = (async () => {
    let payload = await encryptCloudSnapshot(cloudSnapshot(), cloudSync.key);
    let result;
    try {
      result = await cloudRequest("PUT", { payload, expectedRevision: cloudSync.revision });
    } catch (error) {
      if (error.code !== "sync_conflict") throw error;
      const remote = await fetchCloudState();
      if (!remote.found) {
        cloudSync.revision = 0;
      } else {
        const navigation = { page: state.page, selectedWeek: state.selectedWeek, selectedDay: state.selectedDay, lastOpenDate: state.lastOpenDate };
        const trainingHistory = state.trainingHistory;
        state = { ...hydrateState(mergeCloudStates(remote.data, cloudSnapshot())), ...navigation, trainingHistory };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        cloudSync.revision = remote.revision;
        cloudSync.lastSyncedAt = remote.updatedAt;
        persistSyncJournal();
      }
      payload = await encryptCloudSnapshot(cloudSnapshot(), cloudSync.key);
      result = await cloudRequest("PUT", { payload, expectedRevision: cloudSync.revision });
    }
    await pushPendingTrainingHistory();
    cloudSync.revision = Number(result.revision || cloudSync.revision);
    cloudSync.lastSyncedAt = result.updatedAt || new Date().toISOString();
    const syncedItems = pendingAtStart.map((item) => ({ ...item, syncedAt: cloudSync.lastSyncedAt }));
    cloudSync.recentSaves = [...cloudSync.recentSaves, ...syncedItems].slice(-20);
    cloudSync.pendingChanges = cloudSync.pendingChanges.filter((item) => !pendingIds.has(item.id));
    persistSyncJournal();
    setCloudStatus("synced", "Encrypted cloud autosave is up to date");
  })().catch((error) => {
    cloudSync.dirty = true;
    setCloudStatus(navigator.onLine ? "error" : "offline", navigator.onLine ? error.message : "Saved locally; cloud will retry when online");
    throw error;
  }).finally(() => {
    cloudSync.inFlight = null;
    if (cloudSync.dirty && navigator.onLine) window.setTimeout(() => scheduleCloudSave(), cloudSync.status === "synced" ? 0 : 5000);
  });
  return cloudSync.inFlight;
}

function scheduleCloudSave() {
  cloudSync.dirty = true;
  if (!cloudSync.key || !cloudSync.ready || cloudSync.applyingRemote) return;
  window.clearTimeout(cloudSync.timer);
  setCloudStatus("saving", "Changes saved here; cloud save queued");
  cloudSync.timer = window.setTimeout(() => {
    pushCloudState().catch(() => {});
  }, CLOUD_SYNC_DEBOUNCE_MS);
}

function applyCloudState(remoteState) {
  cloudSync.applyingRemote = true;
  const trainingHistory = state.trainingHistory;
  state = hydrateState(remoteState);
  state.trainingHistory = trainingHistory;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  cloudSync.applyingRemote = false;
  activeModalTask = null;
  activeSkipTask = null;
  render();
}

async function fetchCloudState() {
  const result = await cloudRequest("GET");
  if (!result.found) return { found: false, revision: 0 };
  const data = await decryptCloudSnapshot(result.payload, cloudSync.key);
  return { found: true, data, revision: Number(result.revision || 0), updatedAt: result.updatedAt || "" };
}

async function reconcileCloudSync(options = {}) {
  if (!cloudSync.key) return;
  setCloudStatus("connecting", "Checking the latest encrypted save…");
  const remote = await fetchCloudState();
  if (!remote.found) {
    if (options.requireExisting) throw new Error("No saved data was found for that recovery key");
    cloudSync.ready = true;
    await pushCloudState();
    return;
  }
  cloudSync.revision = remote.revision;
  cloudSync.lastSyncedAt = remote.updatedAt;
  persistSyncJournal();
  cloudSync.ready = true;
  const remoteTime = Date.parse(remote.data.syncUpdatedAt || 0) || 0;
  const localTime = Date.parse(state.syncUpdatedAt || 0) || 0;
  if (!options.preferRemote && cloudSync.dirty && remoteTime !== localTime) {
    const navigation = { page: state.page, selectedWeek: state.selectedWeek, selectedDay: state.selectedDay, lastOpenDate: state.lastOpenDate };
    const trainingHistory = state.trainingHistory;
    state = { ...hydrateState(mergeCloudStates(remote.data, cloudSnapshot())), ...navigation, trainingHistory };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    await pushCloudState();
  } else if (options.preferRemote || remoteTime > localTime) {
    applyCloudState(remote.data);
    setCloudStatus("synced", "Latest encrypted save loaded on this device");
  } else if (localTime > remoteTime) {
    await pushCloudState();
  } else {
    setCloudStatus("synced", "Encrypted cloud autosave is up to date");
  }
  await loadRemoteTrainingHistory();
  await pushPendingTrainingHistory();
}

async function enableCloudSync() {
  cloudSync.key = generateSyncKey();
  cloudSync.ready = true;
  cloudSync.revealKey = true;
  localStorage.setItem(SYNC_KEY_STORAGE, cloudSync.key);
  await pushCloudState();
  state.page = "profile";
  render(true);
}

async function connectExistingCloudSync(value) {
  const key = normalizeSyncKey(value);
  if (!key) throw new Error("Enter the complete 64-character recovery key");
  const previousKey = cloudSync.key;
  cloudSync.key = key;
  cloudSync.ready = false;
  try {
    await reconcileCloudSync({ requireExisting: true, preferRemote: true });
    localStorage.setItem(SYNC_KEY_STORAGE, key);
    cloudSync.revealKey = false;
    state.page = "profile";
    render(true);
  } catch (error) {
    cloudSync.key = previousKey;
    cloudSync.ready = Boolean(previousKey);
    throw error;
  }
}

function disconnectCloudSync() {
  window.clearTimeout(cloudSync.timer);
  cloudSync.key = "";
  cloudSync.ready = false;
  cloudSync.dirty = false;
  cloudSync.revealKey = false;
  localStorage.removeItem(SYNC_KEY_STORAGE);
  setCloudStatus("local", "Cloud disconnected; new changes stay on this device");
  render(true);
}

async function deleteCloudCopy() {
  await cloudRequest("DELETE");
  disconnectCloudSync();
}

async function initializeCloudSync() {
  if (!cloudSync.key) {
    setCloudStatus("local", "Saved automatically on this device");
    return;
  }
  try {
    await reconcileCloudSync();
  } catch (error) {
    cloudSync.ready = true;
    setCloudStatus(navigator.onLine ? "error" : "offline", navigator.onLine ? error.message : "Saved locally; cloud will retry when online");
  }
}

function selectedWeekPlan() { return getWeekPlan(state.selectedWeek, state.pbs); }
function selectedDate(day = state.selectedDay) { return isoDate(addDays(selectedWeekPlan().start, day)); }

function syncToTodayIfNeeded(force = false) {
  const current = todaySelection();
  const alreadyCurrent = state.lastOpenDate === current.openDate && state.selectedWeek === current.selectedWeek && state.selectedDay === current.selectedDay;
  if (!force && alreadyCurrent) return;
  state.selectedWeek = current.selectedWeek;
  state.selectedDay = current.selectedDay;
  state.lastOpenDate = current.openDate;
  state.nutrition.selectedDate = current.openDate;
  activeModalTask = null;
  activeSkipTask = null;
  saveState({ cloud: false, touch: false });
  render();
}

function suggestedVelocityPBType() {
  const phase = selectedWeekPlan().phase.id;
  if (isSummerCompetitionPhase(phase) && [4, 6].includes(state.selectedDay)) return "gameFastball";
  if (!isSummerCompetitionPhase(phase) && state.selectedDay === 2 && !isTransitionPhase(phase)) return "pulldown";
  if (isWinterCompetitionPhase(phase) && state.selectedDay === 5) return "gameFastball";
  return "";
}

function applyPersonalBestResults(values, date) {
  state.pbs = mergePBs(state.pbs);
  const updates = [];
  const results = [];
  let e1rm = 0;
  const occurredAt = new Date().toISOString();

  const velocityType = values.velocityType;
  const velocity = Number(values.bestVelo || 0);
  if (VELOCITY_PB_LABELS[velocityType] && velocity > 0) {
    const resultId = mediaId("result");
    const previous = Number(state.pbs.velocity[velocityType].value || 0);
    const isPersonalBest = velocity > previous;
    const result = {
      id: resultId,
      category: "velocity",
      key: velocityType,
      label: VELOCITY_PB_LABELS[velocityType],
      value: velocity,
      unit: "mph",
      kind: "tested",
      source: "Session check-out",
      date,
      recordedAt: occurredAt,
      isPersonalBest
    };
    results.push(result);
    appendTrainingHistory("performanceResults", date, "velocity_result_recorded", result, { occurredAt });
    if (isPersonalBest) {
      const record = { value: velocity, kind: "tested", source: "Session check-out", date, updatedAt: occurredAt, resultId };
      state.pbs.velocity[velocityType] = record;
      state.pbs.trainingMaxes.velocity[velocityType] = { ...record };
      updates.push({ ...result, previous });
    }
  }

  const liftKey = values.pbLift;
  const weight = Number(values.bestSetWeight || 0);
  const resultType = values.liftResultType || "estimated";
  if (LIFT_PB_LABELS[liftKey] && weight > 0) {
    const resultId = mediaId("result");
    e1rm = resultType === "tested"
      ? round(weight, 1)
      : estimatedOneRepMax(weight, values.bestSetReps, values.bestSetRpe);
    if (e1rm > 0) {
      const current = state.pbs.lifts[liftKey];
      const previous = Number(current.value || 0);
      const kind = resultType === "tested" ? "tested" : "estimated";
      const source = kind === "tested"
        ? `${weight} kg tested 1RM`
        : `${weight} kg × ${values.bestSetReps} @ RPE ${values.bestSetRpe}`;
      const canReplaceBest = e1rm > previous && (kind === "tested" || current.kind !== "tested");
      const result = {
        id: resultId,
        category: "lift",
        key: liftKey,
        label: LIFT_PB_LABELS[liftKey],
        value: e1rm,
        unit: "kg",
        kind,
        source,
        workingSet: {
          weight,
          reps: Number(values.bestSetReps || 0),
          rpe: Number(values.bestSetRpe || 0)
        },
        date,
        recordedAt: occurredAt,
        isPersonalBest: canReplaceBest
      };
      results.push(result);
      appendTrainingHistory("performanceResults", date, "strength_result_recorded", result, { occurredAt });
      if (canReplaceBest) {
        const record = { value: e1rm, kind, source, date, updatedAt: occurredAt, resultId };
        state.pbs.lifts[liftKey] = record;
        state.pbs.trainingMaxes.lifts[liftKey] = { ...record };
        updates.push({ ...result, previous });
      }
    }
  }

  if (results.length) state.pbs.history = [...state.pbs.history, ...results].slice(-250);
  return { updates, results, e1rm };
}

function pbUpdateMessage(updates) {
  if (!updates.length) return "";
  return updates.map((item) => {
    const label = item.kind === "estimated" ? `${item.label} e1RM` : item.label;
    const previous = item.previous ? `, previous ${item.previous} ${item.unit}` : "";
    return `${label}: ${item.value} ${item.unit}${previous}`;
  }).join(" · ");
}

function task(id, stage, stageTitle, stageDescription, name, prescription, cue, details = {}) {
  return { id, stage, stageTitle, stageDescription, name, prescription, cue, ...details };
}

function basePrep(prefix, emphasis = "throwing") {
  return [
    task(`${prefix}-heat`, 1, "Prepare", "Raise temperature before mobility or throwing.", "Raise tissue temperature", "5 minutes easy bike, jog or brisk walk", "Finish warm—not tired—and able to breathe through your nose.", {
      setup: "Choose the lowest-impact option available. Keep the pace conversational.",
      execution: "Build gradually across five minutes. Do not sprint or chase calories.",
      rest: "Move directly into the mobility flow.",
      stop: "Stop for dizziness, chest symptoms, or pain that changes your gait."
    }),
    task(`${prefix}-mobility`, 1, "Prepare", "Raise temperature before mobility or throwing.", "Dynamic mobility flow", "Ankle rock 8/side · 90/90 switch 6/side · adductor rock 6/side · World's Greatest Stretch (lunge + rotation) 4/side · open book 5/side", "Use controlled range. Do not force the shoulder into end range before it is warm.", {
      setup: "Move continuously on a mat or clear section of turf.",
      execution: "Exhale into each position, then return under control. For World's Greatest Stretch, step into a long lunge, bring the same-side elbow toward the inside of the lead foot only as far as comfortable, then rotate that arm upward. The goal is usable range, not a stretch test.",
      rest: "Minimal; approximately 4–6 minutes total.",
      stop: "Shorten any range that creates sharp, pinching, or nerve-like symptoms."
    }),
    task(`${prefix}-scap`, 1, "Prepare", "Raise temperature before mobility or throwing.", "Scapular and cuff activation", "Scap push-up 2 × 8 · band external rotation 1 × 12/side · wall slide 1 × 8", `Keep the neck relaxed and prepare the shoulder for ${emphasis}.`, {
      setup: "Use a light band. Position the ribs over the pelvis rather than arching the lower back.",
      execution: "Move the shoulder blade smoothly around the rib cage. External rotation should be light and controlled.",
      rest: "20–30 seconds between movements.",
      stop: "Do not push through anterior shoulder or biceps pain."
    })
  ];
}

function plyoTask(prefix, index, name, prescription, intent, cue) {
  return task(`${prefix}-plyo-${index}`, 2, "Plyo Ball Preparation", "Constraint work; no pivot pickoffs.", name, `${prescription} · ${intent}% perceived effort`, cue, {
    setup: "Throw into a durable plyo wall or net with a clear rebound area. Confirm the ball is intact before use.",
    execution: name.includes("Reverse")
      ? "Face away from the wall, sequence the torso and arm smoothly, and finish balanced. Do not turn this into a max-effort heave."
      : name.includes("Roll-In")
        ? "Use a controlled roll-in, organize the lead leg, and let the arm follow the body rather than racing ahead."
        : name.includes("Rocker")
          ? "Rock through the hips, maintain direction to the target, and allow a complete follow-through."
          : "Build rhythm through the walking delivery, stay directional, and finish under control.",
    rest: "15–20 seconds between throws; 45–60 seconds between ball weights.",
    stop: "Stop for pain, loss of arm path, or a clear drop in movement quality. Plyo Ball throws are not a substitute for a coached return-to-throw plan."
  });
}

function armCare(prefix, volume = "normal") {
  const sets = volume === "low" ? "1 set each" : "2 sets each";
  return [
    task(`${prefix}-armcare`, 5, "Arm Care", "Restore motion and finish with low-fatigue cuff/scap work.", "Post-throw arm-care circuit", `${sets}: band row × 12 · external rotation × 10/side · serratus wall slide × 8 · forearm pronation/supination × 10/side`, "Smooth reps only; this is not a burnout circuit.", {
      setup: "Use a light band and a controlled forearm implement. Keep the shoulder relaxed.",
      execution: "Finish every repetition with two or more reps in reserve. Pair breathing with deliberate shoulder-blade motion.",
      rest: "20–30 seconds between movements.",
      stop: "If symptoms increase during the circuit, stop and record them in the post-session questionnaire."
    })
  ];
}

function recoveryTasks(prefix, game = false) {
  return [
    task(`${prefix}-fuel`, 6, "Recover", "Record the basics that support the next session.", "Post-session fuel and fluids", game ? "35–45 g protein + carbohydrate-rich meal; replace measured sweat losses" : "30–40 g protein + carbohydrates within the next meal; drink to thirst and replace sweat losses", "Use urine colour and body-mass change as context; do not force a fixed fluid target.", {
      setup: "Have food and fluids available before the session starts.",
      execution: "Aim for a normal mixed meal. If a same-day meal is delayed, use a practical snack or shake.",
      rest: "Begin within 60–90 minutes unless a medical or nutrition plan says otherwise.",
      stop: "Individual medical and nutrition needs override this general target."
    }),
    task(`${prefix}-sleep`, 6, "Recover", "Record the basics that support the next session.", "Recovery plan", game ? "10-minute easy walk · light range of motion · target 8–9 hours sleep" : "5–10 minutes down-regulation · target 8–9 hours sleep", "Normatec can be used for comfort, but it does not replace sleep, food, or load management.", {
      setup: "Choose an easy walk or relaxed breathing position.",
      execution: "Bring breathing and arousal down gradually. Keep mobility gentle.",
      rest: "Complete once after the session.",
      stop: "Ice only for symptom management under appropriate guidance; do not use it to hide worsening pain."
    })
  ];
}

function recoveryOnlySession(week, day) {
  const label = plannedDayLabel(week.phase.id, day);
  return {
    title: `${DAY_NAMES[day]} · Health hold`,
    focus: "Recovery and qualified review",
    duration: "15–30 min",
    stress: "Held",
    description: `The planned ${label[0].toLowerCase()} session has been replaced because the pre-session answers triggered a health hold.`,
    tasks: [
      task("hold-review", 1, "Health Hold", "No throwing or lifting is assigned while symptoms need review.", "Contact your athletic trainer, physiotherapist or doctor", "Arrange review before resuming loaded throwing", "Pain and illness thresholds are safety prompts, not a diagnosis.", {
        setup: "Share the location, severity, onset and behaviour of symptoms with a qualified clinician.",
        execution: "Follow their instructions. If symptoms are urgent or severe, seek urgent care.",
        rest: "No training prescription applies until reviewed.",
        stop: "Do not use readiness scores to clear yourself for throwing."
      }),
      task("hold-walk", 2, "Optional Recovery", "Only complete activities that do not worsen symptoms.", "Easy walk or complete rest", "10–20 minutes at conversational pace, only if symptom-free", "Choose complete rest if walking changes symptoms.", {
        setup: "Flat surface and comfortable footwear.", execution: "Easy pace only.", rest: "As needed.", stop: "Stop immediately if symptoms increase."
      }),
      task("hold-note", 3, "Document", "Capture useful information for follow-up.", "Record symptom notes", "Location · onset · severity · what changes it", "Accurate notes are more useful than pushing through a session.", {
        setup: "Use the post-session notes field.", execution: "Be specific and concise.", rest: "Not applicable.", stop: "Not applicable."
      })
    ]
  };
}

const MECHANICS_INTERVENTIONS = {
  sequence: {
    label: "Kinetic sequence",
    drill: "Step-behind medicine-ball shot put",
    drillDose: "2 × 3/side · 2–3 kg · 65–75% · full reset",
    drillCue: "Pelvis initiates, trunk follows, arm finishes. Use the drill to explore timing—not to force more separation.",
    gymTarget: "cable chop",
    gymCue: "Sequence the pelvis and trunk without adding load or sets."
  },
  lowerHalf: {
    label: "Lower-half transfer",
    drill: "Lateral bound to lead-leg stick",
    drillDose: "2 × 3/side · submax distance · 2-second stick",
    drillCue: "Own the lead hip and knee before adding speed. Keep the landing quiet and stable.",
    gymTarget: "rear-foot-elevated split squat",
    gymCue: "Emphasize lead-leg force acceptance and stable foot pressure; replace one accessory set rather than adding volume."
  },
  trunk: {
    label: "Trunk direction and timing",
    drill: "Rocker throw — direction constraint",
    drillDose: "2 × 4 · 225 g · 60–70% perceived effort",
    drillCue: "Stay through the target and keep trunk rotation timed to lead-foot acceptance. Do not chase a bigger angle.",
    gymTarget: "cable chop",
    gymCue: "Keep ribs stacked over pelvis and move through controlled rotation."
  },
  armTiming: {
    label: "Arm timing",
    drill: "Walking wind-up throw — timing constraint",
    drillDose: "2 × 4 · 450 g · 60–70% perceived effort",
    drillCue: "Let the body organize the arm. Finish balanced; do not force layback or external rotation.",
    gymTarget: "chest-supported row",
    gymCue: "Use smooth scapular motion and leave at least three reps in reserve."
  },
  release: {
    label: "Release consistency",
    drill: "Fastball target-line catch",
    drillDose: "8–12 throws · 60–75 ft · 60–70% · one target",
    drillCue: "Repeat direction and finish position. Stop before fatigue changes release height or direction.",
    gymTarget: "pallof",
    gymCue: "Prioritize trunk control and breathing without chasing fatigue."
  },
  deceleration: {
    label: "Deceleration and finish",
    drill: "Reverse throw — controlled finish",
    drillDose: "1 × 5 · 1,000 g · 50–60% perceived effort",
    drillCue: "Use a smooth arm path and balanced finish. This is patterning, not a heavy-effort deceleration test.",
    gymTarget: "row",
    gymCue: "Control the eccentric and stop well before fatigue changes shoulder position."
  }
};

function mechanicsProposals(assessment) {
  if (!assessment || assessment.analyzable === false || assessment.captureQuality?.decision === "fail") return [];
  const supportedIssues = new Set(Array.isArray(assessment.aiInterventions) ? assessment.aiInterventions.map((item) => item.issue) : []);
  const ratings = ["sequence", "lowerHalf", "trunk", "armTiming", "release", "deceleration"]
    .map((key) => ({ key, rating: Number(assessment[`${key}Rating`] || 0) }))
    .filter((item) => item.rating > 0 && item.rating <= 2)
    .filter((item) => assessment.source !== "aiVideoScreen" || supportedIssues.has(item.key))
    .sort((left, right) => left.rating - right.rating)
    .slice(0, 1);
  return ratings.map(({ key, rating }) => {
    const aiPriority = Array.isArray(assessment.aiInterventions)
      ? assessment.aiInterventions.find((item) => item.issue === key)
      : null;
    return {
      id: `${assessment.id}-${key}`,
      assessmentId: assessment.id,
      issue: key,
      rating,
      ...MECHANICS_INTERVENTIONS[key],
      rationale: aiPriority?.rationale || ""
    };
  });
}

function mechanicsEfficiency(assessment) {
  const values = ["sequence", "lowerHalf", "trunk", "armTiming", "release", "deceleration"]
    .map((key) => Number(assessment[`${key}Rating`] || 0))
    .filter((value) => value > 0);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length / 5 * 100) : 0;
}

function applyMechanicsToSession(session, date, day) {
  if (day >= 4 || /health hold/i.test(session.title)) return session;
  const intervention = (state.mechanics?.approvedInterventions || []).filter((item) => item.active !== false).at(-1);
  if (!intervention) return session;
  const focusTask = task(`mechanics-${date}-${intervention.issue}`, 2, "Mechanics Microdose", "Approved screening focus; low volume and non-diagnostic.", intervention.drill, intervention.drillDose, intervention.drillCue, {
    setup: "Use the same camera angle or coaching view when reassessing. Complete this only when the daily readiness plan allows normal or reduced throwing.",
    execution: intervention.drillCue,
    rest: "45–75 seconds between sets; full reset between reps.",
    stop: "Stop for pain, loss of coordination or any attempt to force a joint angle.",
    adapted: true,
    adaptationNote: `Approved after the ${intervention.label.toLowerCase()} assessment. This is a screening intervention, not a diagnosis.`
  });
  const tasks = session.tasks.map((item) => {
    const text = `${item.name} ${item.stageTitle}`.toLowerCase();
    if (!intervention.gymTarget || !text.includes(intervention.gymTarget)) return item;
    return {
      ...item,
      cue: `${item.cue} Mechanics focus: ${intervention.gymCue}`,
      adapted: true,
      adaptationNote: `Gym emphasis approved from the ${intervention.label.toLowerCase()} assessment. No extra sets were added.`
    };
  });
  const nextStage = tasks.findIndex((item) => item.stage > 2);
  tasks.splice(nextStage === -1 ? tasks.length : nextStage, 0, focusTask);
  return { ...session, description: `${session.description} Approved mechanics focus: ${intervention.label.toLowerCase()}.`, tasks };
}

function standardSession(week, day) {
  const p = `w${week.week}-d${day}`;
  if (day === 0) {
    return {
      title: "Monday · Recovery + Whole-Body Force",
      focus: "Restore the arm, then build force",
      duration: "90–105 min",
      stress: "Moderate",
      description: "Throwing quality stays easy. The gym sequence is a low-volume ballistic primer, primary strength, unilateral strength, upper-body push/pull, then hamstring, trunk and carry work.",
      tasks: [
        ...basePrep(p, "recovery throwing"),
        plyoTask(p, 1, "Plyo Ball Reverse Throw — 2,000 g", "1 × 5", 50, "Heavy-ball patterning only; keep the trunk and arm moving together."),
        plyoTask(p, 2, "Plyo Ball Reverse Throw — 1,000 g", "1 × 6", 55, "Smooth acceleration and a balanced finish."),
        plyoTask(p, 3, "Plyo Ball Roll-In Throw — 450 g", "2 × 5", 60, "Organize the lead leg and throw through the target."),
        plyoTask(p, 4, "Plyo Ball Rocker Throw — 225 g", "2 × 4", 60, "Use rhythm; do not chase ball speed on a recovery day."),
        task(`${p}-catch`, 3, "Throw", "Low-intent catch precedes the lift because pitching skill remains the priority.", "Recovery catch", "45–60 total throws · 60–75 ft · 50–60% effort", "Loose arc, clean direction, no pull-downs and no aggressive compression throws.", {
          setup: "Begin at close range and add distance only when the arm feels free.",
          execution: "Use a relaxed tempo. The session should improve, not test, how the arm feels.",
          rest: "Natural catch-play rhythm.",
          stop: "Stop if soreness increases, mechanics change, or the arm does not loosen after the initial progression."
        }),
        task(`${p}-gym-warm`, 4, "Whole-Body Force", "Power first, then primary strength, secondary work and arm care.", "Low-volume power primer", "Med-ball rotational scoop toss 2 × 3/side · broad jump 2 × 2", "Every rep is fast. Reset fully and stick each landing.", {
          setup: "Use a 2–3 kg medicine ball and a non-slip jump area.", execution: "Throw or jump only when fully set. No fatigue sets.", rest: "45–60 seconds between med-ball sets; 60–90 seconds between jumps.", stop: "Stop when distance, speed or landing quality drops."
        }),
        task(`${p}-deadlift`, 4, "Whole-Body Force", "Power first, then primary strength, secondary work and arm care.", "Trap bar deadlift", week.mondayLift, "Reset each rep, brace before the pull, and finish tall without leaning back.", {
          setup: "Use high or low handles consistently. Warm up with 3–4 progressive sets before the prescribed work.",
          execution: "Drive the floor away and keep the bar centred. Week 1 target is RPE 7–8 with crisp reps.",
          rest: "3–4 minutes between work sets.",
          stop: "End the set for loss of spinal position, grip failure that changes technique, or RPE above 8.5 in-season."
        }),
        task(`${p}-rfess`, 4, "Whole-Body Force", "Power first, then primary strength, secondary work and arm care.", "Rear-foot-elevated split squat", "3 × 5/leg @ RPE 7 · 24–28 kg dumbbells as tolerated", "Use lifting straps if grip limits the legs after deadlifts.", {
          setup: "Rear foot on a low bench; front foot far enough forward to keep the whole foot down.", execution: "Lower in 2–3 seconds, stay stacked over the front leg, then drive up without bouncing.", rest: "90–120 seconds between legs/sets.", stop: "Reduce load if balance or front-foot pressure is lost."
        }),
        task(`${p}-bench`, 4, "Whole-Body Force", "Power first, then primary strength, secondary work and arm care.", "Bench press", strengthPrescription("benchPress", 3, 5, 70, "3 × 5 @ RPE 7 · suggested start 50–52.5 kg"), "Keep the shoulder blades controlled; leave at least three reps in reserve.", {
          setup: "Use a comfortable grip, stable feet and a spotter or safeties.", execution: "Lower with control and press smoothly. Avoid grinding or bouncing the bar.", rest: "2 minutes.", stop: "Stop for anterior shoulder, biceps or elbow pain."
        }),
        task(`${p}-row`, 4, "Whole-Body Force", "Power first, then primary strength, secondary work and arm care.", "Chest-supported dumbbell row", "3 × 8 @ RPE 7", "Pause briefly with the shoulder blade back; do not shrug.", {
          setup: "Incline bench at a comfortable angle with the chest fully supported.", execution: "Row toward the lower ribs and control the return.", rest: "75–90 seconds.", stop: "Reduce load if the neck or upper trap dominates."
        }),
        task(`${p}-nordic`, 4, "Whole-Body Force", "Power first, then primary strength, secondary work and arm care.", "Nordic hamstring curl", "2 × 4 · 3–4 second eccentric", "Keep the hips extended and use the hands to catch the descent.", {
          setup: "Secure the ankles with a pad or partner.", execution: "Lower only as far as you can control. Use the hands to assist the return.", rest: "90 seconds.", stop: "Stop for cramping or loss of hip position."
        }),
        task(`${p}-trunk`, 4, "Whole-Body Force", "Power first, then primary strength, secondary work and arm care.", "Pallof press + farmer carry", "Pallof press 2 × 8/side · farmer carry 2 × 20 m (no straps)", "Brace without holding your breath; carry tall and controlled.", {
          setup: "Cable/band at sternum height; carry space clear.", execution: "Resist rotation on the press. Use the carry as deliberate grip work, not a max test.", rest: "45–60 seconds.", stop: "End the carry before posture or grip fails."
        }),
        task(`${p}-aerobic`, 5, "Condition", "Build aerobic capacity after strength without adding another high-speed exposure.", "Low-impact aerobic base", "15–20 minutes bike or incline walk · RPE 2–3/10 · conversational pace", "This is conditioning at low mechanical cost, not a test and not proof of faster recovery.", {
          setup: "Choose a bike or incline walk after lifting. Keep resistance low enough to breathe in complete sentences.", execution: "Hold a steady output and finish with the same posture and breathing control you started with.", rest: "Continuous easy work.", stop: "Stop if symptoms rise, gait changes, or the session starts to feel like interval training."
        }),
        ...armCare(p),
        ...recoveryTasks(p)
      ]
    };
  }

  if (day === 1) {
    return {
      title: "Tuesday · Command + Acceleration",
      focus: "Moderate throwing quality",
      duration: "70–85 min",
      stress: "Moderate",
      description: "No true long toss and no pull-downs. The ceiling stays below Wednesday velocity intent.",
      tasks: [
        ...basePrep(p, "command throwing"),
        task(`${p}-sprint`, 2, "Speed", "Short acceleration volume while fresh.", "Acceleration quality", "2 × 10 m build-up · 3 × 20 m @ 85–90% · 2 min rest", "Smooth projection and full recovery; this is speed practice, not fatigue conditioning.", {
          setup: "Use flat turf and complete two rehearsal starts.", execution: "Push for the first steps, then rise naturally. Keep shoulders relaxed and make every repetition look alike.", rest: "Two minutes between 20 m efforts; walk and breathe easily.", stop: "Stop if speed drops, mechanics change, or hamstring/calf tightness appears."
        }),
        plyoTask(p, 1, "Plyo Ball Reverse Throw — 1,000 g", "1 × 6", 60, "Smooth arm path and complete finish."),
        plyoTask(p, 2, "Plyo Ball Roll-In Throw — 450 g", "2 × 5", 65, "Lead-leg stability before arm acceleration."),
        plyoTask(p, 3, "Plyo Ball Rocker Throw — 225 g", "2 × 4", 70, "Direct energy through the target."),
        plyoTask(p, 4, "Plyo Ball Walking Windup — 150 g", "2 × 3", 70, "Rhythm and direction; no velocity chase."),
        task(`${p}-command`, 3, "Throw", "Command volume stays moderate before Wednesday.", "Flat-ground command", "45–55 total throws · 90–120 ft · 65–75% effort", "Suggested finish: 10 fastballs glove-side, 10 arm-side, 8 changeups, 4–6 breaking balls. No throw above 80%.", {
          setup: "Complete easy catch first, then work from a stable flat-ground position.", execution: "Choose one clear target per throw. Reset rather than rushing misses.", rest: "Normal catch rhythm; 20–30 seconds between pitch-type blocks.", stop: "Stop if command worsens with fatigue or the arm feels slower than it did during catch."
        }),
        ...armCare(p, "low"),
        ...recoveryTasks(p)
      ]
    };
  }

  if (day === 2) {
    return {
      title: "Wednesday · Velocity + Whole-Body Power",
      focus: "Highest training intent of the week",
      duration: "85–100 min",
      stress: "High",
      description: "Pulldowns are the primary high-speed exposure. The post-throw gym block is capped at roughly 30–40 minutes: rotation, jumps, explosive press, pull, single-leg hinge and trunk.",
      tasks: [
        ...basePrep(p, "high-intent throwing"),
        task(`${p}-sprintprep`, 2, "High-Intent Prep", "Potentiate without accumulating sprint fatigue.", "Sprint mechanics", "A-march 1 × 10 m · ankling 1 × 10 m · 3 × 10 m progressive starts", "Last start reaches about 85%; save the highest intent for throwing.", {
          setup: "Flat turf and 10 metres of run-out.", execution: "Crisp contacts and relaxed upper body.", rest: "45–60 seconds.", stop: "Do not continue if stride mechanics change."
        }),
        plyoTask(p, 1, "Plyo Ball Reverse Throw — 1,000 g", "1 × 5", 65, "Create rhythm without using the heavy ball as a max-effort throw."),
        plyoTask(p, 2, "Plyo Ball Roll-In Throw — 450 g", "1 × 5", 75, "Fast lower half with a connected arm."),
        plyoTask(p, 3, "Plyo Ball Rocker Throw — 225 g", "1 × 4", 80, "Firm direction and full deceleration."),
        plyoTask(p, 4, "Plyo Ball Walking Windup — 150 g", "2 × 3", 85, "Accelerate only while positions stay organized."),
        plyoTask(p, 5, "Plyo Ball Walking Windup — 125 g", "2 × 2", 85, "Fast but controlled; stop before timing gets early."),
        plyoTask(p, 6, "Plyo Ball Walking Windup — 100 g", "2 × 2", 85, "The lightest ball is a speed exposure, not permission to lose direction."),
        task(`${p}-build`, 3, "Throw", "Build distance and intent gradually before the measured set.", "Catch-play build-up", "Close catch → 60 → 90 → 120 → 150 ft · 35–50 throws", "Add distance only when the previous distance feels clean. No aggressive return throws before the pulldown set.", {
          setup: "Use a marked throwing lane and a catcher who can maintain a consistent rhythm.", execution: "Progress from arc to firmer line as the arm warms. Stay below max intent.", rest: "Normal catch rhythm.", stop: "Do not begin pulldowns unless the arm feels fully warm and symptom-free."
        }),
        task(`${p}-pulldown`, 3, "Throw", "Build distance and intent gradually before the measured set.", "High-intent pulldowns", isWinterCompetitionPhase(week.phase.id) || week.phase.id === "summer_break" || week.phase.id === "preseason" ? week.throwing : "6–10 throws according to the selected week", "Full run-in rhythm, clear direction and complete deceleration. Radar is feedback, not the goal of every throw.", {
          setup: "Use a safe lane, regulation baseball unless a qualified coach prescribes otherwise, and a calibrated radar position.", execution: "First rep at about 90%; build only if movement stays clean. Record peak and best-five average.", rest: "75–120 seconds between measured throws.", stop: "Stop for pain, a velocity drop greater than 2 mph on two consecutive throws, or loss of direction."
        }),
        task(`${p}-medball`, 4, "Whole-Body Power", "Keep this block to roughly 30–40 minutes after pulldowns.", "Rotational med-ball shot put", "2 × 3/side · 2–3 kg", "Throw before lifting while rotational speed is highest.", {
          setup: "Athletic stance perpendicular to a sturdy wall.", execution: "Sequence hip, trunk and arm; finish balanced.", rest: "45–60 seconds.", stop: "Stop when speed or direction drops."
        }),
        task(`${p}-jumps`, 4, "Whole-Body Power", "Keep this block to roughly 30–40 minutes after pulldowns.", "Broad jump + trap bar jump", "Broad jump 2 × 2 · trap bar jump 3 × 3 @ 30 kg", "Reset every rep. Bar speed and landing quality matter more than load.", {
          setup: "Use bumper plates and enough space. Start trap bar load at 30 kg total unless equipment dictates otherwise.", execution: "Jump vertically with the trap bar; land softly and fully reset.", rest: "60–90 seconds.", stop: "End if jump height clearly drops or landing becomes noisy."
        }),
        task(`${p}-pushpress`, 4, "Whole-Body Power", "Keep this block to roughly 30–40 minutes after pulldowns.", "Push press", strengthPrescription("pushPress", 3, 3, 60, "3 × 3 @ 35 kg · RPE 6–7"), "Short dip, vertical drive, and fast lockout. This is a learned power drill, not a max test.", {
          setup: "Front-rack the bar comfortably and rehearse with the empty bar.", execution: "Dip straight down, drive through the floor, then finish with the arms.", rest: "2 minutes.", stop: "Stop for shoulder pain, unstable lockout, or slow reps."
        }),
        task(`${p}-chin`, 4, "Whole-Body Power", "Keep this block to roughly 30–40 minutes after pulldowns.", "Chin-up", "2 × 5 · bodyweight · 2–3 reps in reserve", "Start from an active shoulder and avoid reaching the chin by extending the neck.", {
          setup: "Use a grip width that feels natural.", execution: "Pull smoothly, control the descent and avoid swinging.", rest: "90 seconds.", stop: "Use assistance if the last rep slows or shoulder position is lost."
        }),
        task(`${p}-hinge`, 4, "Whole-Body Power", "Keep this block to roughly 30–40 minutes after pulldowns.", "Single-leg Romanian deadlift", "2 × 5/leg @ RPE 6–7 · straps allowed", "Square the hips and reach long through the free leg.", {
          setup: "Hold one or two dumbbells; use light fingertip support if balance is limiting.", execution: "Hinge through the stance hip and return without twisting.", rest: "75 seconds.", stop: "Reduce range or load if the lower back takes over."
        }),
        task(`${p}-chop`, 4, "Whole-Body Power", "Keep this block to roughly 30–40 minutes after pulldowns.", "Half-kneeling cable chop", "2 × 6/side · controlled", "Move through the trunk without yanking through the shoulder.", {
          setup: "Inside knee down with cable above shoulder height.", execution: "Brace, rotate through usable range and control the return.", rest: "45 seconds.", stop: "Stop for shoulder or back discomfort."
        }),
        ...armCare(p, "low"),
        ...recoveryTasks(p)
      ]
    };
  }

  if (day === 3) {
    return {
      title: "Thursday · Recovery + Aerobic Restore",
      focus: "Move, throw easily, restore",
      duration: "55–70 min",
      stress: "Low",
      description: "No step-behinds, underload velocity throws, lifting or sprinting.",
      tasks: [
        ...basePrep(p, "recovery throwing"),
        plyoTask(p, 1, "Plyo Ball Reverse Throw — 1,000 g", "1 × 5", 50, "Easy rhythm and full exhale."),
        plyoTask(p, 2, "Plyo Ball Roll-In Throw — 450 g", "1 × 5", 50, "Quiet effort; clean lead-leg organization."),
        plyoTask(p, 3, "Plyo Ball Rocker Throw — 225 g", "1 × 4", 50, "Finish balanced and loose."),
        task(`${p}-catch`, 3, "Throw", "The arm should feel better at the finish than at the start.", "Recovery catch", "35–40 throws · 60 ft · about 50%", "Use a relaxed arc and stop before any fatigue appears.", {
          setup: "Begin at 30–45 ft and move back only if comfortable.", execution: "Smooth catch-play rhythm and relaxed grip pressure.", rest: "Natural rhythm.", stop: "Stop if soreness rises instead of falling."
        }),
        task(`${p}-zone2`, 4, "Condition", "Maintain the aerobic base without adding meaningful impact or neural fatigue.", "Low-intensity aerobic base", "20–25 minutes bike or incline walk · RPE 2–3/10", "Use the talk test: complete sentences should remain easy. Do not chase sweat, distance or calories.", {
          setup: "Choose the low-impact mode least likely to irritate the legs or arm.", execution: "Hold a steady easy output. This develops aerobic capacity; it is not a guarantee of accelerated recovery.", rest: "Continuous.", stop: "Reduce intensity or stop if breathing becomes laboured, symptoms rise, or leg heaviness increases."
        }),
        ...armCare(p),
        ...recoveryTasks(p)
      ]
    };
  }

  if (day === 4) {
    return {
      title: "Friday · Primer + Whole-Body Microdose",
      focus: "Finish fresher than you started",
      duration: "35–50 min",
      stress: "Low",
      description: "No game-speed fastballs. The 15–20 minute gym microdose uses fast outputs first, then minimal activation before Saturday competition.",
      tasks: [
        ...basePrep(p, "pregame primer throwing"),
        plyoTask(p, 1, "Plyo Ball Reverse Throw — 1,000 g", "1 × 4", 55, "Easy rhythm only."),
        plyoTask(p, 2, "Plyo Ball Roll-In Throw — 450 g", "1 × 4", 60, "Crisp lead-leg block without max intent."),
        plyoTask(p, 3, "Plyo Ball Rocker Throw — 225 g", "1 × 3", 60, "Finish loose and directional."),
        plyoTask(p, 4, "Plyo Ball Walking Windup — 150 g", "1 × 2", 65, "Two clean rhythm throws; stop there."),
        task(`${p}-catch`, 3, "Throw", "Touch-and-feel only.", "Primer catch", "20–25 throws · 60–90 ft · 50–60%", "No pull-downs, no compression throws and no radar.", {
          setup: "Start close and use a relaxed catch partner.", execution: "Find rhythm and stop while the arm feels lively.", rest: "Natural rhythm.", stop: "End immediately if the session begins to feel like work."
        }),
        task(`${p}-medball`, 4, "Whole-Body Primer", "Fast, low-volume outputs precede light activation.", "Med-ball scoop toss", "2 × 2/side · 2 kg", "Full reset and maximum crispness without straining.", {
          setup: "Use a light medicine ball and stable wall.", execution: "Quick hip turn and balanced finish.", rest: "45–60 seconds.", stop: "Stop after any slower rep."
        }),
        task(`${p}-jump`, 4, "Whole-Body Primer", "Fast, low-volume outputs precede light activation.", "Pogo + vertical jump", "Pogo 2 × 6 · vertical jump 2 × 2", "Stiff, quiet contacts on pogos; full recovery before jumps.", {
          setup: "Flat, forgiving surface.", execution: "Keep contacts short and jumps crisp.", rest: "45–60 seconds.", stop: "Stop for calf or Achilles tightness."
        }),
        task(`${p}-landmine`, 4, "Whole-Body Primer", "Fast, low-volume outputs precede light activation.", "Half-kneeling landmine push press", "2 × 3/side @ RPE 5–6", "Accelerate the bar and leave plenty in reserve.", {
          setup: "Use a secure landmine attachment and staggered half-kneeling stance.", execution: "Short dip, drive and smooth return.", rest: "60 seconds.", stop: "Reduce load if bar speed is not obvious."
        }),
        task(`${p}-iso`, 4, "Whole-Body Primer", "Fast, low-volume outputs precede light activation.", "Split-squat isometric + band row", "Split-squat iso 1 × 15 sec/side · band row 2 × 6 fast", "Create tension without shaking; rows stay snappy.", {
          setup: "Choose a mid-range split-squat position and medium band.", execution: "Hold stable posture, then perform fast but controlled rows.", rest: "45 seconds.", stop: "End before fatigue or tremor increases."
        }),
        ...armCare(p, "low"),
        ...recoveryTasks(p)
      ]
    };
  }

  if (day === 5) {
    return {
      title: "Saturday · Game Day",
      focus: "Prepare, compete, recover",
      duration: "Game dependent",
      stress: "Very high",
      description: "The bullpen builds intent progressively. The app records pitches and true PULSE values after the game when available.",
      tasks: [
        ...basePrep(p, "game pitching"),
        task(`${p}-sprints`, 2, "Game Warm-up", "Progress from movement quality to game speed.", "Sprint build-ups", "2 × 10 m · 2 × 20 m · final rep about 90%", "Full recovery and relaxed speed.", {
          setup: "Flat turf with clear run-out.", execution: "Increase speed gradually on each repetition.", rest: "60–90 seconds.", stop: "Stop for any lower-body symptom."
        }),
        plyoTask(p, 1, "Plyo Ball Reverse Throw — 1,000 g", "1 × 4", 60, "Game-day rhythm without fatigue."),
        plyoTask(p, 2, "Plyo Ball Roll-In Throw — 450 g", "1 × 4", 65, "Lead-leg timing and direction."),
        plyoTask(p, 3, "Plyo Ball Rocker Throw — 225 g", "1 × 3", 70, "Crisp but controlled."),
        plyoTask(p, 4, "Plyo Ball Walking Windup — 150 g", "1 × 2", 70, "Two rhythm throws; avoid chasing plyo velocity."),
        task(`${p}-catch`, 3, "Throw", "Use the same progression each start so readiness is comparable.", "Pregame catch", "Close catch → 60 → 90 → 120 ft · 25–40 throws", "Build line and intent gradually; keep early throws easy.", {
          setup: "Coordinate timing with the catcher and game schedule.", execution: "Progress only when the previous distance feels clean.", rest: "Natural rhythm.", stop: "If pain or unexpected weakness appears, tell the coach/medical staff before the bullpen."
        }),
        task(`${p}-bullpen`, 3, "Throw", "Use the same progression each start so readiness is comparable.", "Pregame bullpen", "Approximately 20–30 pitches: fastball build → changeup → breaking ball → game sequence", "Do not turn the bullpen into a velocity test. Finish with the pitches needed for the first inning.", {
          setup: "Mound, catcher, target and game balls ready.", execution: "Gradually increase intent, then finish with a short game-sequence block.", rest: "Game-normal rhythm; step off when needed.", stop: "Report pain or inability to command normal pitches."
        }),
        task(`${p}-game`, 4, "Compete", "Game workload is logged in the post-session form.", "Game appearance", "Team pitch/inning limits apply", "Compete with the established game plan; do not use this app to override coach or medical limits.", {
          setup: "Confirm the day's pitch limit and communication plan before first pitch.", execution: "Use normal between-inning recovery and report symptoms promptly.", rest: "Game dependent.", stop: "Team medical and coaching decisions take priority."
        }),
        ...armCare(p, "low"),
        ...recoveryTasks(p, true)
      ]
    };
  }

  return {
    title: "Sunday · Complete Rest",
    focus: "Recover and review",
    duration: "20–40 min optional",
    stress: "Recovery",
    description: "No throwing or lifting during Winter Ball. The health check-in still captures how the arm responded to Saturday.",
    tasks: [
      task(`${p}-off`, 1, "Rest", "No throwing and no lifting.", "Complete training rest", "No baseball throwing · no gym session", "An easy walk is optional; the purpose is to absorb the week.", {
        setup: "Keep the day unscheduled where possible.", execution: "Choose restful activity and normal daily movement.", rest: "All day.", stop: "If symptoms from Saturday are worsening, seek qualified review."
      }),
      task(`${p}-walk`, 2, "Restore", "Gentle movement is optional.", "Walk + mobility", "20–30 minute easy walk · 8–10 minute gentle mobility", "Mobility should feel restorative, not like another workout.", {
        setup: "Comfortable shoes and easy terrain.", execution: "Conversational pace; gentle hips, thoracic spine and ankles afterward.", rest: "As needed.", stop: "Skip any movement that increases soreness."
      }),
      task(`${p}-review`, 3, "Review", "Use the week's data to guide the next plan.", "Weekly review and meal preparation", "Review velocity, pitches, soreness, sleep and completion", "One difficult day matters less than a pattern across multiple days.", {
        setup: "Open Analytics and the Annual Plan.", execution: "Note trends and scheduling changes for the next week.", rest: "Not applicable.", stop: "Do not diagnose injury risk from a single readiness score."
      })
    ]
  };
}

function summerSession(week, day) {
  const p = `w${week.week}-d${day}-summer`;
  const fridayDate = isoDate(addDays(week.start, 4));
  const fridayPitches = Number(state.post[fridayDate]?.gamePitches || 0);
  const appearedFriday = fridayPitches > 0;

  if (day === 0) {
    return {
      title: "Monday · Post-Game Recovery",
      focus: "Restore after Sunday competition",
      duration: "35–55 min",
      stress: "Low",
      description: "Summer Monday is no longer the heavy force day. Sunday game workload gets first priority.",
      tasks: [
        ...basePrep(p, "post-game recovery"),
        plyoTask(p, 1, "Plyo Ball Reverse Throw — 1,000 g", "1 × 5", 45, "Only if the arm feels better as the warm-up progresses."),
        plyoTask(p, 2, "Plyo Ball Roll-In Throw — 450 g", "1 × 4", 50, "Easy rhythm; no underload balls today."),
        task(`${p}-catch`, 3, "Throw", "Sunday workload determines whether catch is useful.", "Optional recovery catch", "20–35 throws · 45–60 ft · 45–55%", "If you pitched Sunday, use team recovery guidance; complete rest may be more appropriate.", {
          setup: "Begin close with a relaxed partner.", execution: "Easy arc only.", rest: "Natural rhythm.", stop: "Stop if the arm does not loosen."
        }),
        task(`${p}-aerobic`, 4, "Restore", "Optional low-intensity movement after Sunday competition.", "Optional easy aerobic work", "12–20 minutes bike or walk · RPE 2–3/10", "Keep the talk test comfortable. Active recovery has inconsistent performance benefits, so omit it if complete rest feels better.", {
          setup: "Choose a low-impact mode only after the arm and legs pass the daily check-in.", execution: "Use a steady easy pace and finish before fatigue accumulates.", rest: "Continuous.", stop: "Stop if fatigue or soreness rises."
        }),
        ...armCare(p, "low"),
        ...recoveryTasks(p)
      ]
    };
  }

  if (day === 1 || day === 3) {
    const isThursday = day === 3;
    return {
      title: `${DAY_NAMES[day]} · Team Training`,
      focus: isThursday ? "Prepare for Friday game" : "Practice quality",
      duration: "Team session dependent",
      stress: isThursday ? "Low–moderate" : "Moderate",
      description: isThursday
        ? "Thursday volume is capped so it does not become a third high-stress day before Friday and Sunday games."
        : "Tuesday is the higher-volume team practice window. Wednesday remains the main strength day.",
      tasks: [
        ...basePrep(p, "team practice"),
        plyoTask(p, 1, "Plyo Ball Reverse Throw — 1,000 g", "1 × 5", isThursday ? 50 : 60, "Smooth patterning."),
        plyoTask(p, 2, "Plyo Ball Roll-In Throw — 450 g", "1 × 5", isThursday ? 55 : 65, "Organize the lead leg and stay directional."),
        plyoTask(p, 3, "Plyo Ball Rocker Throw — 225 g", "1 × 4", isThursday ? 60 : 70, "Finish under control."),
        plyoTask(p, 4, "Plyo Ball Walking Windup — 150 g", isThursday ? "1 × 2" : "2 × 3", isThursday ? 60 : 70, "Rhythm only; no radar chase."),
        task(`${p}-practice-throw`, 3, "Team Throwing", "Record team throwing and any mound work accurately.", isThursday ? "Pregame practice throwing" : "Team practice throwing", isThursday ? "25–40 throws · 60–90 ft · mostly 50–70%" : "40–60 throws · distance and intensity set by team plan", isThursday ? "Finish feeling fresh for Friday. No extra pulldowns." : "Do not add unscheduled high-intent throws after practice.", {
          setup: "Confirm the day's team throwing and field-work plan.", execution: "Tag mound throws, long toss and high-effort throws separately in the post form.", rest: "Team dependent.", stop: "Tell the coach if arm status differs from the pre-session check-in."
        }),
        task(`${p}-team`, 4, "Team Practice", "Practice volume includes fielding, conditioning and any bullpen work.", "Complete team training", isThursday ? "Keep conditioning and extra throwing low volume" : "Complete assigned baseball work; record session duration and RPE", "The team plan takes priority; this dashboard records rather than duplicates it.", {
          setup: "Review practice schedule before starting.", execution: "Avoid unlogged extra throwing.", rest: "Team dependent.", stop: "Medical or coaching restrictions override the session."
        }),
        ...armCare(p, "low"),
        ...recoveryTasks(p)
      ]
    };
  }

  if (day === 2) {
    return {
      title: "Wednesday · Whole-Body Strength Maintenance",
      focus: "Main summer gym exposure",
      duration: "60–75 min",
      stress: "Moderate",
      description: "One concise mid-week whole-body exposure maintains power and strength between Tuesday/Thursday team training and Friday/Sunday games. Power comes first, followed by one primary lift, unilateral work, push/pull and trunk.",
      tasks: [
        ...basePrep(p, "strength training"),
        task(`${p}-catch`, 2, "Throw", "Keep this exposure low-to-moderate between team practices.", "Easy catch", "30–45 throws · 60–90 ft · 50–65%", "No pulldowns and no true long toss during two-game summer weeks.", {
          setup: "Use a relaxed catch partner.", execution: "Build only to the distance needed to feel loose.", rest: "Natural rhythm.", stop: "Stop if Tuesday workload has not recovered."
        }),
        task(`${p}-power`, 3, "Whole-Body Gym", "Fast outputs occur before strength work.", "Med-ball shot put + broad jump", "Shot put 2 × 3/side · broad jump 2 × 2", "Full reset; every rep fast and clean.", {
          setup: "2–3 kg ball and clear jump area.", execution: "Throw and jump with full intent but minimal volume.", rest: "60 seconds.", stop: "Stop on output drop."
        }),
        task(`${p}-deadlift`, 3, "Whole-Body Gym", "Fast outputs occur before strength work.", "Trap bar deadlift", week.mondayLift, "Maintain strength without grinding.", {
          setup: "Use progressive warm-up sets.", execution: "Crisp reps at RPE 6–7.", rest: "2.5–3 minutes.", stop: "End sets before bar speed or position degrades."
        }),
        task(`${p}-split`, 3, "Whole-Body Gym", "Fast outputs occur before strength work.", "Rear-foot-elevated split squat", "2 × 5/leg @ RPE 6–7 · straps allowed", "Maintain single-leg strength with low soreness cost.", {
          setup: "Low rear-foot support and stable front foot.", execution: "Controlled descent and crisp drive.", rest: "90 seconds.", stop: "Reduce load if balance is the limiter."
        }),
        task(`${p}-upper`, 3, "Whole-Body Gym", "Fast outputs occur before strength work.", "Bench press + chest-supported row", `${strengthPrescription("benchPress", 2, 5, 67, "Bench 2 × 5 @ RPE 6–7")} · row 2 × 8 @ RPE 7`, "Pair the lifts without rushing; shoulder comfort governs pressing range.", {
          setup: "Use safeties for bench and a supported row bench.", execution: "Smooth, submaximal reps.", rest: "75–90 seconds between exercises.", stop: "Stop pressing for shoulder or biceps symptoms."
        }),
        task(`${p}-trunk`, 3, "Whole-Body Gym", "Fast outputs occur before strength work.", "Pallof press", "2 × 8/side", "Resist rotation and breathe behind the brace.", {
          setup: "Cable or band at sternum height.", execution: "Press without trunk shift.", rest: "30–45 seconds.", stop: "Reduce tension if posture changes."
        }),
        ...armCare(p, "low"),
        ...recoveryTasks(p)
      ]
    };
  }

  if (day === 4 || day === 6) {
    const gameName = day === 4 ? "Friday" : "Sunday";
    return {
      title: `${gameName} · Game Day`,
      focus: "Compete and log actual workload",
      duration: "Game dependent",
      stress: "Very high",
      description: day === 4 ? "Friday is the first weekly game window. Your actual appearance determines Saturday." : "Sunday is the second game window; Monday becomes recovery-first.",
      tasks: [
        ...basePrep(p, "game performance"),
        task(`${p}-builds`, 2, "Game Warm-up", "Build speed without fatigue.", "Sprint build-ups", "2 × 10 m · 2 × 20 m progressive", "Last rep about 90%; full recovery.", {
          setup: "Flat turf.", execution: "Smooth acceleration.", rest: "60–90 seconds.", stop: "Stop for lower-body symptoms."
        }),
        plyoTask(p, 1, "Plyo Ball Reverse Throw — 1,000 g", "1 × 4", 60, "Game-day rhythm."),
        plyoTask(p, 2, "Plyo Ball Roll-In Throw — 450 g", "1 × 4", 65, "Crisp lead-leg timing."),
        plyoTask(p, 3, "Plyo Ball Rocker Throw — 225 g", "1 × 3", 70, "Finish balanced."),
        plyoTask(p, 4, "Plyo Ball Walking Windup — 150 g", "1 × 2", 70, "Stop before fatigue."),
        task(`${p}-pregame`, 3, "Throw", "Use team role and appearance plan.", "Pregame catch and bullpen", "Catch 25–40 throws · bullpen only if scheduled to pitch", "Relievers should avoid unnecessary bullpen pitches if they are not entering.", {
          setup: "Confirm role and pitch limits with the coach.", execution: "Build intent progressively.", rest: "Game dependent.", stop: "Report pain or unexpected weakness."
        }),
        task(`${p}-game`, 4, "Compete", "Record pitches even if you do not take the mound.", "Game appearance", "Team role and pitch limits apply", "The dashboard never overrides coaching or medical decisions.", {
          setup: "Know the communication and pitch-limit plan.", execution: "Log game pitches and PULSE metrics after the appearance.", rest: "Game dependent.", stop: "Team staff have final authority."
        }),
        ...armCare(p, "low"),
        ...recoveryTasks(p, true)
      ]
    };
  }

  if (appearedFriday) {
    return {
      title: "Saturday · Post-Appearance Recovery",
      focus: `Recover from ${fridayPitches} Friday pitches`,
      duration: "25–45 min",
      stress: "Low",
      description: "Because Friday game pitches were logged, Saturday automatically switches from primer to recovery.",
      tasks: [
        ...basePrep(p, "recovery"),
        plyoTask(p, 1, "Plyo Ball Reverse Throw — 1,000 g", "1 × 4", 45, "Optional only if symptom-free."),
        task(`${p}-catch`, 3, "Throw", "Use team recovery guidance after an appearance.", "Optional recovery catch", "15–25 throws · 45–60 ft · 45–50%", "Complete rest is acceptable if the arm is not improving during warm-up.", {
          setup: "Begin close.", execution: "Easy arc.", rest: "Natural.", stop: "Stop if symptoms rise."
        }),
        task(`${p}-walk`, 4, "Restore", "Optional low-intensity movement only.", "Optional walk + mobility", "10–20 minute walk · 6–8 minutes gentle mobility", "Use this only if it improves how you feel; complete rest is acceptable before Sunday.", {
          setup: "Easy terrain.", execution: "Conversational pace with no conditioning target.", rest: "As needed.", stop: "Stop for symptom change or rising fatigue."
        }),
        ...armCare(p, "low"),
        ...recoveryTasks(p)
      ]
    };
  }

  return {
    title: "Saturday · Sunday Primer",
    focus: "Low-fatigue readiness",
    duration: "35–50 min",
    stress: "Low",
    description: "No Friday game pitches were logged, so Saturday shows a short primer for Sunday. If you threw but forgot to log it, enter Friday workload first.",
    tasks: [
      ...basePrep(p, "pregame primer"),
      plyoTask(p, 1, "Plyo Ball Reverse Throw — 1,000 g", "1 × 4", 50, "Easy rhythm."),
      plyoTask(p, 2, "Plyo Ball Roll-In Throw — 450 g", "1 × 4", 55, "Crisp and controlled."),
      task(`${p}-catch`, 3, "Throw", "Keep the arm moving without a high-intent exposure.", "Primer catch", "20–25 throws · 60–75 ft · 50–60%", "No pulldowns and no game-speed finish.", {
        setup: "Relaxed catch partner.", execution: "Finish while fresh.", rest: "Natural.", stop: "End as soon as it feels like work."
      }),
      task(`${p}-primer`, 4, "Microdose", "Fast and minimal.", "Med-ball scoop toss + pogo", "Scoop toss 2 × 3/side · pogo 2 × 8", "Crisp output only.", {
        setup: "2 kg medicine ball and flat surface.", execution: "Full reset.", rest: "45 seconds.", stop: "Stop on output drop."
      }),
      ...armCare(p, "low"),
      ...recoveryTasks(p)
    ]
  };
}

function transitionWednesdaySession(week) {
  const day = 2;
  const p = `w${week.week}-d${day}-transition`;
  return {
    title: "Wednesday · Reduced Throw + Whole-Body Rebuild",
    focus: "Restore movement without a velocity exposure",
    duration: "65–85 min",
    stress: "Low–moderate",
    description: "Transition Wednesday deliberately removes pulldowns and underload speed throws. The gym keeps technique and force qualities without creating a recovery hole.",
    tasks: [
      ...basePrep(p, "easy catch and strength training"),
      plyoTask(p, 1, "Plyo Ball Reverse Throw — 1,000 g", "1 × 5", 50, "Smooth patterning only."),
      plyoTask(p, 2, "Plyo Ball Roll-In Throw — 450 g", "1 × 4", 55, "Stay directional and finish balanced."),
      task(`${p}-catch`, 3, "Throw", "Keep the arm moving without a high-intent stimulus.", "Easy catch", "30–45 throws · 60–90 ft · 50–65%", "No pulldowns, aggressive compression throws or radar work.", {
        setup: "Begin close and add distance only when the arm feels free.", execution: "Use a relaxed arc and consistent direction.", rest: "Natural catch rhythm.", stop: "Stop if soreness rises or the arm does not loosen."
      }),
      task(`${p}-power`, 4, "Whole-Body Rebuild", "Use a small fast-output dose before strength.", "Med-ball scoop toss + broad jump", "2 × 3/side · broad jump 2 × 2", "Fast, low-volume reps with full resets.", {
        setup: "Use a 2 kg ball and clear landing space.", execution: "Finish balanced and stick each landing.", rest: "60 seconds.", stop: "Stop on any output drop."
      }),
      task(`${p}-deadlift`, 4, "Whole-Body Rebuild", "Retain strength at a low fatigue cost.", "Trap bar deadlift", week.mondayLift, "Crisp technique and at least three reps in reserve.", {
        setup: "Complete progressive warm-up sets.", execution: "Brace, drive the floor away and finish tall.", rest: "2.5–3 minutes.", stop: "Stop for position loss or RPE above 7."
      }),
      task(`${p}-secondary`, 4, "Whole-Body Rebuild", "Keep the session balanced without chasing soreness.", "Split squat + chest-supported row", "2 × 6/leg @ RPE 6 · row 2 × 8 @ RPE 6–7", "Use straps on split squats if grip limits the legs.", {
        setup: "Stable front foot and supported row bench.", execution: "Controlled reps with no grinders.", rest: "75–90 seconds.", stop: "Reduce load for balance loss or shoulder symptoms."
      }),
      ...armCare(p, "low"),
      ...recoveryTasks(p)
    ]
  };
}

function nonCompetitionSaturdaySession(week) {
  const day = 5;
  const p = `w${week.week}-d${day}-development`;
  const transition = isTransitionPhase(week.phase.id);
  const breakWeek = week.phase.id === "summer_break" ? week.week - 23 : -1;
  const moundBuild = week.phase.id === "preseason" || breakWeek >= 3;
  const throwingName = moundBuild ? "Controlled mound build" : transition ? "Optional recovery catch" : "Distance catch build";
  const throwingDose = moundBuild
    ? (week.phase.id === "preseason" ? "25–40 pitch bullpen · 70–85% · full recovery" : "20–35 pitch bullpen · 70–85% · no velocity chase")
    : transition
      ? "20–30 throws · 45–75 ft · 45–55% · optional if the arm feels better"
      : "40–55 throws · build to 120–180 ft · 60–75% · no pulldowns";
  return {
    title: moundBuild ? "Saturday · Mound Development" : transition ? "Saturday · Optional Recovery" : "Saturday · Throwing Development",
    focus: moundBuild ? "Build game-ready shapes without game fatigue" : transition ? "Absorb the season" : "Rebuild distance and rhythm",
    duration: transition ? "25–45 min optional" : "55–75 min",
    stress: transition ? "Low" : "Moderate",
    description: "No league game is assumed in this calendar block. This session preserves the weekly rhythm without falsely labelling an unpublished fixture as Game Day.",
    tasks: [
      ...basePrep(p, moundBuild ? "mound throwing" : "developmental catch"),
      plyoTask(p, 1, "Plyo Ball Reverse Throw — 1,000 g", "1 × 5", transition ? 45 : 55, "Smooth rhythm and a balanced finish."),
      plyoTask(p, 2, "Plyo Ball Roll-In Throw — 450 g", "1 × 4", transition ? 50 : 65, "Organize the lead leg without chasing speed."),
      task(`${p}-throw`, 3, "Throw", "The Saturday exposure changes with the calendar phase.", throwingName, throwingDose, moundBuild ? "Prioritize fastball command and finish with a small game-sequence block." : "Build only while direction and arm speed stay clean.", {
        setup: moundBuild ? "Confirm mound, catcher and pitch target before starting." : "Use a safe throwing lane with marked distances.",
        execution: moundBuild ? "Progress from catch into a short bullpen; cap secondary-pitch volume." : "Add distance gradually and return on a relaxed line.",
        rest: moundBuild ? "20–30 seconds between pitches; 2–3 minutes between blocks." : "Natural catch rhythm.",
        stop: "Stop for pain, loss of command/direction, or a clear drop in arm speed."
      }),
      ...armCare(p, "low"),
      ...recoveryTasks(p)
    ]
  };
}

function sessionHasGame(session) {
  return session.tasks.some((item) => item.stageTitle === "Compete" || /game appearance/i.test(item.name));
}

function taskWorkloadType(item) {
  const text = `${item.stageTitle} ${item.stageDescription} ${item.name} ${item.prescription}`.toLowerCase();
  const titleAndName = `${item.stageTitle} ${item.name}`.toLowerCase();
  if (/game appearance|\bcompete\b/.test(titleAndName)) return "game";
  if (/arm care|health hold|post-session fuel|recovery plan|weekly review|complete training rest|document/.test(titleAndName)) return "restore";
  if (/prepare|activation|tissue temperature|dynamic mobility/.test(titleAndName)) return "prepare";
  if (/pulldown|high-intent|measured throw|velocity exposure|game-intent/.test(titleAndName)) return "highThrow";
  if (/plyo ball/.test(titleAndName)) return "plyo";
  if (/\bthrow\b|catch|bullpen|mound|pregame/.test(text)) return "throw";
  if (/sprint|jump|bound|med-ball|medicine ball|power|force|deadlift|squat|press|chin-up|row|romanian|split squat|gym|microdose/.test(text)) return "output";
  if (/zone 2|aerobic|conditioning|tempo|bike|jog|walk/.test(text)) return "conditioning";
  return "accessory";
}

function adaptTaskForReadiness(item, planLevel, gameDay) {
  if (!["reduced", "recovery"].includes(planLevel)) return item;
  const type = taskWorkloadType(item);
  const originalPrescription = item.originalPrescription || item.prescription;
  const adapted = { ...item, originalPrescription, adapted: true };

  if (type === "restore" || type === "prepare") return { ...adapted, adapted: false };

  if (type === "game") {
    adapted.prescription = `${originalPrescription} · Readiness action: coach and medical staff confirm availability, role and pitch limit before the warm-up`;
    adapted.cue = "The game is not automatically cancelled. Do not add extra throwing, and escalate any symptoms before taking the mound.";
    adapted.adaptationNote = "Competition decision retained for coach and medical review.";
    return adapted;
  }

  if (gameDay && (type === "throw" || type === "highThrow" || type === "plyo" || type === "output")) {
    adapted.prescription = planLevel === "recovery"
      ? `Readiness-modified game warm-up · remove optional volume · no extra velocity work · staff confirm pitch cap before throwing`
      : `Readiness-modified game warm-up · complete about 75–80% of optional volume · no extra velocity work`;
    adapted.cue = "Build gradually and stop if the arm, movement quality or energy does not improve. The team’s medical and coaching plan has final authority.";
    adapted.adaptationNote = `Original plan: ${originalPrescription}`;
    return adapted;
  }

  if (type === "highThrow") {
    adapted.name = planLevel === "recovery" ? "Recovery catch — replaces high-intent throwing" : `${item.name} — reduced dose`;
    adapted.prescription = planLevel === "recovery"
      ? "25–35 throws · 45–75 ft · 50–60% · no pulldowns, radar, mound work or aggressive return throws"
      : "Complete 75% of the assigned measured throws · cap at 90–92% perceived intent · no bonus throws";
    adapted.cue = planLevel === "recovery"
      ? "This is a recovery exposure, not a velocity session. Finish only if the arm feels better as the progression continues."
      : "Keep only high-quality reps and end the set at the first meaningful drop in command, velocity or movement quality.";
    adapted.adaptationNote = `Original plan: ${originalPrescription}`;
    return adapted;
  }

  if (type === "throw") {
    adapted.prescription = planLevel === "recovery"
      ? "Complete about 50% of the assigned volume · 45–75 ft · cap at 60% · no mound or high-intent finish"
      : "Complete about 75% of assigned volume · cap at the lower end of the listed distance and intent range";
    adapted.cue = "The readiness adjustment replaces the listed dose. Stop if movement quality or symptoms worsen during the build-up.";
    adapted.adaptationNote = `Original plan: ${originalPrescription}`;
    return adapted;
  }

  if (type === "plyo") {
    const keepRecoveryThrow = /reverse throw/i.test(item.name) && /1,000 g/i.test(item.name);
    adapted.prescription = planLevel === "recovery"
      ? keepRecoveryThrow ? "1 × 3 · 45–50% perceived effort · optional only if symptom-free" : "Omitted today by the readiness adjustment"
      : "Complete about 75% of listed reps · cap at 65–70% perceived effort · no velocity chase";
    adapted.cue = planLevel === "recovery" && !keepRecoveryThrow
      ? "Check this item after confirming it was intentionally omitted; do not make the volume up later."
      : "Use the minimum effective dose and preserve a smooth arm path.";
    adapted.adaptationNote = `Original plan: ${originalPrescription}`;
    return adapted;
  }

  if (type === "output") {
    adapted.prescription = planLevel === "recovery"
      ? "Recovery technique only · omit loaded jumps and ballistic work · 1–2 light sets at RPE 5–6 if movement feels better after warm-up"
      : "Remove the final work set · use no more than 90% of the listed load · cap at RPE 7 with no output drop";
    adapted.cue = "The readiness-adjusted prescription replaces the original dose; do not chase missed volume later in the week.";
    adapted.adaptationNote = `Original plan: ${originalPrescription}`;
    return adapted;
  }

  if (type === "conditioning") {
    adapted.prescription = planLevel === "recovery"
      ? "10–20 minutes easy Zone 1–2 movement if symptom-free; complete rest is acceptable"
      : "Complete about 75% of the listed duration or repetitions at conversational effort";
    adapted.adaptationNote = `Original plan: ${originalPrescription}`;
    return adapted;
  }

  adapted.prescription = planLevel === "recovery"
    ? "One easy set only if it improves how you feel; otherwise omit"
    : "Remove one set and keep at least three reps in reserve";
  adapted.adaptationNote = `Original plan: ${originalPrescription}`;
  return adapted;
}

function readinessAdjustedDuration(duration, factor) {
  const match = String(duration || "").match(/(\d+)\s*[–-]\s*(\d+)\s*min/i);
  if (!match || !Number.isFinite(factor) || factor >= 1) return duration;
  const rounded = (value) => Math.max(10, Math.round((value * factor) / 5) * 5);
  return `${rounded(Number(match[1]))}–${rounded(Number(match[2]))} min`;
}

function applyReadinessToSession(session, pre) {
  if (!pre || !["reduced", "recovery"].includes(pre.planLevel)) return session;
  const gameDay = sessionHasGame(session);
  const planLabel = pre.planLevel === "recovery" ? "Recovery modified" : "Volume reduced";
  const factor = Number(pre.workloadFactor || (pre.planLevel === "recovery" ? .5 : .75));
  const originalDescription = session.originalDescription || session.description;
  const description = session.adaptation
    ? session.description
    : `${planLabel}: ${pre.planLevel === "recovery" ? "throwing, gym, speed and conditioning have been replaced or sharply reduced" : "throwing, gym, speed and conditioning volume or intensity have been reduced"}. Warm-up, arm care, nutrition and recovery remain in place. ${originalDescription}`;
  return {
    ...session,
    stress: planLabel,
    duration: readinessAdjustedDuration(session.duration, factor),
    originalDescription,
    description,
    adaptation: {
      level: pre.planLevel,
      factor,
      gameDay,
      reasons: Array.isArray(pre.reasons) ? pre.reasons : []
    },
    tasks: session.tasks.map((item) => adaptTaskForReadiness(item, pre.planLevel, gameDay))
  };
}

function approvedWeeklyAdjustment(weekNumber) {
  const review = state.weeklyReviews?.[String(weekNumber - 1)];
  if (!review || review.decision !== "approved" || Number(review.targetWeek) !== Number(weekNumber)) return null;
  if (!review.proposal || !["reduced", "recovery"].includes(review.proposal.planLevel)) return null;
  return {
    planLevel: review.proposal.planLevel,
    workloadFactor: review.proposal.planLevel === "recovery" ? .5 : .75,
    reasons: [`Approved Week ${weekNumber - 1} review: ${review.proposal.rationale}`],
    source: "approved_weekly_review"
  };
}

function strictestPlanningAdjustment(daily, weekly) {
  if (!daily) return weekly;
  if (!weekly) return daily;
  const factor = (item) => Number(item?.workloadFactor ?? 1);
  return factor(daily) <= factor(weekly) ? daily : weekly;
}

function buildLiveSession(week = selectedWeekPlan(), day = state.selectedDay) {
  const date = isoDate(addDays(week.start, day));
  if (state.pre[date]?.risk === "red") return recoveryOnlySession(week, day);
  let session;
  if (isSummerCompetitionPhase(week.phase.id)) session = summerSession(week, day);
  else if (isTransitionPhase(week.phase.id) && day === 2) session = transitionWednesdaySession(week);
  else if (["transition", "transition_summer", "preseason", "summer_break"].includes(week.phase.id) && day === 5) session = nonCompetitionSaturdaySession(week);
  else session = standardSession(week, day);
  session = applyMechanicsToSession(session, date, day);
  const adjustment = strictestPlanningAdjustment(effectivePreForSession(state.pre[date]), approvedWeeklyAdjustment(week.week));
  return applyReadinessToSession(session, adjustment);
}

function getSession(week = selectedWeekPlan(), day = state.selectedDay) {
  const date = isoDate(addDays(week.start, day));
  const archivedPlan = state.pre[date] ? HistoryDomain.latestPlanPayload(state.trainingHistory, date) : null;
  if (archivedPlan?.session && typeof archivedPlan.session === "object") {
    const archivedSession = JSON.parse(JSON.stringify(archivedPlan.session));
    const adjustment = strictestPlanningAdjustment(effectivePreForSession(state.pre[date]), approvedWeeklyAdjustment(week.week));
    return applyReadinessToSession(archivedSession, adjustment);
  }
  return buildLiveSession(week, day);
}

function capturePlanSnapshot(date, reason, week = selectedWeekPlan(), day = state.selectedDay) {
  const session = buildLiveSession(week, day);
  return appendTrainingHistory("planSnapshots", date, reason, {
    date,
    week: week.week,
    day,
    phaseId: week.phase.id,
    planSource: "pitching_os",
    readinessPlanLevel: state.pre[date]?.planLevel || "unsubmitted",
    session: JSON.parse(JSON.stringify(session))
  });
}

function recordPlanChange(date, type, payload = {}) {
  return appendTrainingHistory("planChanges", date, type, {
    date,
    ...payload
  });
}

function migrateLegacyTrainingHistory() {
  if (state.trainingHistory.events.length) return false;
  const annualStart = parseDate(ANNUAL_START);
  const dates = [...new Set([
    ...Object.keys(state.pre || {}),
    ...Object.keys(state.post || {}),
    ...Object.keys(state.completedTasks || {})
  ])].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();

  for (const date of dates) {
    const diff = Math.floor((parseDate(date) - annualStart) / 86_400_000);
    const inAnnualPlan = diff >= 0 && diff < 364;
    const weekNumber = inAnnualPlan ? Math.floor(diff / 7) + 1 : 0;
    const day = inAnnualPlan ? diff % 7 : 0;
    const pre = state.pre[date];
    const post = state.post[date];
    const completedTaskIds = [...(state.completedTasks[date] || [])];

    if (pre) {
      const occurredAt = Number.isFinite(Date.parse(pre.updatedAt || "")) ? pre.updatedAt : new Date().toISOString();
      const runId = pre.runId || mediaId("session");
      const event = appendTrainingHistory("checkIns", date, "legacy_health_check_in_imported", {
        runId,
        response: { ...pre },
        migrationNote: "Imported from the pre-existing mutable device record."
      }, { occurredAt });
      state.pre[date] = { ...pre, runId, historyId: event.id };
      if (inAnnualPlan) {
        capturePlanSnapshot(date, "legacy_plan_reconstructed", getWeekPlan(weekNumber, state.pbs), day);
      }
    }

    if (completedTaskIds.length) {
      appendTrainingHistory("taskChanges", date, "legacy_task_completion_imported", {
        runId: state.pre[date]?.runId || "",
        completedTaskIds,
        migrationNote: "Imported as a completion summary because individual completion times were not available."
      }, { occurredAt: state.taskCompletionUpdatedAt?.[date] || new Date().toISOString() });
    }

    if (post) {
      const occurredAt = Number.isFinite(Date.parse(post.updatedAt || "")) ? post.updatedAt : new Date().toISOString();
      const event = appendTrainingHistory("checkOuts", date, "legacy_session_check_out_imported", {
        runId: state.pre[date]?.runId || "",
        checkInId: state.pre[date]?.historyId || "",
        planSnapshotId: HistoryDomain.latestEvent(state.trainingHistory, "planSnapshots", date)?.id || "",
        completedTaskIds,
        actual: { ...post },
        migrationNote: "Imported from the pre-existing mutable device record."
      }, { occurredAt });
      state.post[date] = { ...post, historyId: event.id };
    }
  }

  for (const result of state.pbs?.history || []) {
    if (!result?.date || !/^\d{4}-\d{2}-\d{2}$/.test(result.date)) continue;
    appendTrainingHistory("performanceResults", result.date, "legacy_performance_result_imported", {
      ...result,
      migrationNote: "Imported from the pre-existing performance history."
    }, {
      occurredAt: Number.isFinite(Date.parse(result.recordedAt || "")) ? result.recordedAt : new Date().toISOString()
    });
  }

  if (dates.length || state.pbs?.history?.length) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  }
  return false;
}

const NAV_ITEMS = [
  ["dashboard", "⌂", "Today"],
  ["session", "✓", "Plan"],
  ["annual", "▦", "Year"],
  ["analytics", "↗", "Progress"],
  ["nutrition", "◇", "Nutrition"],
  ["mechanics", "◎", "Biomechanics"],
  ["profile", "◉", "Athlete"],
  ["integrations", "⌁", "Connections"]
];

const PAGE_TITLES = {
  dashboard: ["Today", "Training, recovery and progress"],
  session: ["Daily plan", "Check in, train, check out"],
  annual: ["Annual plan", "Your date-aligned training year"],
  analytics: ["Progress", "Logged training and recovery trends"],
  nutrition: ["Nutrition", "Fuel, recover and keep it simple"],
  mechanics: ["Biomechanics", "Capture quality, movement evidence and measured report data"],
  profile: ["Athlete", "Profile, bests and data controls"],
  integrations: ["Connections", "Cloud sync, PULSE, Oura and Apple Health"]
};

function dayKey(week, day) { return isoDate(addDays(week.start, day)); }

function metricSourceForDate(date, metric) {
  const sources = state.healthPrefill[date]?.sources || {};
  if (sources.oura?.data?.[metric] !== null && sources.oura?.data?.[metric] !== undefined) return "oura";
  if (sources.appleHealth?.data?.[metric] !== null && sources.appleHealth?.data?.[metric] !== undefined) return "appleHealth";
  return "manual";
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function personalMetricBaseline(date, field, source) {
  if (!source || source === "manual") return { value: null, count: 0 };
  const sourceField = `${field}Source`;
  const samples = Object.entries(state.pre)
    .filter(([sampleDate, record]) => sampleDate < date && record?.[sourceField] === source)
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, 14)
    .map(([, record]) => Number(record[field]))
    .filter((value) => Number.isFinite(value) && value > 0);
  return { value: median(samples), count: samples.length };
}

function personalCheckInBaseline(date, field) {
  const allowZero = ["shoulder", "elbow", "forearm", "lat", "lower"].includes(field);
  const samples = Object.entries(state.pre)
    .filter(([sampleDate]) => sampleDate < date)
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, 14)
    .map(([, record]) => Number(record?.[field]))
    .filter((value) => Number.isFinite(value) && (allowZero ? value >= 0 : value > 0));
  return { value: median(samples), count: samples.length };
}

function subjectiveBaselinesForDate(date) {
  return Object.fromEntries(["sleepHours", "energy", "mood", "stress", "shoulder", "elbow"].map((field) => [field, personalCheckInBaseline(date, field)]));
}

function previousSessionContext(date) {
  const entry = Object.entries(state.post)
    .filter(([sampleDate]) => sampleDate < date && Math.round((parseDate(date) - parseDate(sampleDate)) / 86400000) <= 7)
    .sort(([left], [right]) => right.localeCompare(left))[0];
  if (!entry) return null;
  const [sessionDate, post] = entry;
  return {
    date: sessionDate,
    throws: Number(post.totalThrows || 0),
    highThrows: Number(post.highThrows || 0),
    srpe: Number(post.srpe || 0)
  };
}

function effectiveWorkloadFactor(pre) {
  if (!pre) return null;
  if (pre.manualOverride?.active && ["reduced", "recovery"].includes(pre.planLevel)) return 1;
  return Number(pre.workloadFactor ?? 1);
}

function effectivePreForSession(pre) {
  if (!pre?.manualOverride?.active || !["reduced", "recovery"].includes(pre.planLevel)) return pre;
  return { ...pre, planLevel: "full", workloadFactor: 1, manualRecommendation: pre.planLevel };
}

function calculateReadiness(values, date) {
  const sleep = clamp((Number(values.sleepHours) / 8.5) * 100, 0, 100);
  const sleepQuality = (Number(values.sleepQuality) / 5) * 100;
  const energy = (Number(values.energy) / 5) * 100;
  const mood = (Number(values.mood) / 5) * 100;
  const stress = ((6 - Number(values.stress)) / 5) * 100;
  const painValues = [values.shoulder, values.elbow, values.forearm, values.lat, values.lower].map(Number);
  const pain = 100 - (painValues.reduce((sum, item) => sum + item, 0) / painValues.length) * 10;
  const subjectiveScore = sleep * .2 + sleepQuality * .1 + energy * .15 + mood * .1 + stress * .15 + pain * .3;
  const ouraReadiness = Number(values.ouraReadinessScore);
  const ouraStressMinutes = Number(values.ouraStressHighMinutes);
  const ouraTemperatureDeviation = Number(values.ouraTemperatureDeviation);
  const ouraRestMode = values.ouraRestMode === "yes";
  let score = Number.isFinite(ouraReadiness) && ouraReadiness > 0
    ? subjectiveScore * .75 + ouraReadiness * .25
    : subjectiveScore;

  const hrvSource = metricSourceForDate(date, "hrvMs");
  const restingHeartRateSource = metricSourceForDate(date, "restingHeartRate");
  const sleepSource = metricSourceForDate(date, "sleepHours");
  const hrv = Number(values.hrvMs);
  const restingHeartRate = Number(values.restingHeartRate);
  const hrvBaseline = personalMetricBaseline(date, "hrvMs", hrvSource);
  const rhrBaseline = personalMetricBaseline(date, "restingHeartRate", restingHeartRateSource);
  const subjectiveBaselines = subjectiveBaselinesForDate(date);
  const signals = [];
  if (hrvBaseline.count >= 5 && Number.isFinite(hrv) && hrv > 0 && hrv < hrvBaseline.value * .8) {
    const change = Math.round((1 - hrv / hrvBaseline.value) * 100);
    signals.push({ type: "hrv", severity: "moderate", text: `${hrvSource === "oura" ? "Oura" : "Apple Health"} HRV is ${change}% below its recent same-source median` });
  }
  if (rhrBaseline.count >= 5 && Number.isFinite(restingHeartRate) && restingHeartRate > 0) {
    const threshold = Math.max(7, rhrBaseline.value * .1);
    if (restingHeartRate > rhrBaseline.value + threshold) {
      signals.push({ type: "rhr", severity: "moderate", text: `${restingHeartRateSource === "oura" ? "Oura" : "Apple Health"} resting heart rate is elevated versus its recent same-source median` });
    }
  }
  if (Number.isFinite(ouraStressMinutes) && ouraStressMinutes >= 180) {
    signals.push({ type: "oura_stress", severity: ouraStressMinutes >= 300 ? "high" : "moderate", text: `Oura recorded ${Math.round(ouraStressMinutes)} high-stress minutes` });
  }
  if (Number.isFinite(ouraTemperatureDeviation) && Math.abs(ouraTemperatureDeviation) >= .8) {
    signals.push({ type: "temperature", severity: Math.abs(ouraTemperatureDeviation) >= 1.2 ? "high" : "moderate", text: `Oura temperature deviation was ${ouraTemperatureDeviation > 0 ? "+" : ""}${ouraTemperatureDeviation.toFixed(1)}°C` });
  }
  if (ouraRestMode) signals.push({ type: "rest_mode", severity: "high", text: "Oura Rest Mode is active" });
  if (subjectiveBaselines.sleepHours.count >= 5 && Number(values.sleepHours) <= subjectiveBaselines.sleepHours.value - 1.5) {
    signals.push({ type: "sleep_baseline", severity: "moderate", text: `Sleep is ${round(subjectiveBaselines.sleepHours.value - Number(values.sleepHours), 1)} hours below your recent median` });
  }
  if (subjectiveBaselines.energy.count >= 5 && Number(values.energy) <= subjectiveBaselines.energy.value - 2) {
    signals.push({ type: "energy_baseline", severity: "moderate", text: "Energy is at least two points below your recent median" });
  }
  if (subjectiveBaselines.mood.count >= 5 && Number(values.mood) <= subjectiveBaselines.mood.value - 2) {
    signals.push({ type: "mood_baseline", severity: "moderate", text: "Mood / motivation is at least two points below your recent median" });
  }
  if (subjectiveBaselines.stress.count >= 5 && Number(values.stress) >= subjectiveBaselines.stress.value + 2) {
    signals.push({ type: "stress_baseline", severity: "moderate", text: "Life stress is at least two points above your recent median" });
  }
  if (values.previousSessionResponse === "worse") signals.push({ type: "previous_response", severity: "moderate", text: "You reported feeling worse after the previous logged session" });
  if (values.previousSessionResponse === "much_worse") signals.push({ type: "previous_response", severity: "high", text: "You reported feeling much worse after the previous logged session" });
  score -= Math.min(12, signals.length * 6);
  score = Math.round(clamp(score, 0, 100));

  const warningSigns = values.warningSigns === "yes";
  const redFlag = Number(values.shoulder) >= 5 || Number(values.elbow) >= 5 || values.illness === "yes" || warningSigns;
  const recoveryFlag = !redFlag && (
    score < 60 ||
    (Number.isFinite(ouraReadiness) && ouraReadiness > 0 && ouraReadiness < 60) ||
    (Number.isFinite(ouraStressMinutes) && ouraStressMinutes >= 300) ||
    ouraRestMode ||
    Number(values.stress) >= 5 ||
    Number(values.energy) <= 1 ||
    Number(values.sleepHours) < 5.5 ||
    painValues.some((value) => value >= 4) ||
    values.previousSessionResponse === "much_worse" ||
    signals.length >= 2
  );
  const reducedFlag = !redFlag && !recoveryFlag && (
    score < 75 ||
    (Number.isFinite(ouraReadiness) && ouraReadiness > 0 && ouraReadiness < 70) ||
    (Number.isFinite(ouraStressMinutes) && ouraStressMinutes >= 180) ||
    Number(values.stress) >= 4 ||
    Number(values.energy) <= 2 ||
    Number(values.sleepHours) < 6.5 ||
    painValues.some((value) => value >= 3) ||
    values.previousSessionResponse === "worse" ||
    signals.length === 1
  );

  const reasons = [];
  if (warningSigns) reasons.push("A new or worsening symptom warning sign was reported");
  if (values.illness === "yes") reasons.push("Illness symptoms were reported");
  if (Number(values.shoulder) >= 5) reasons.push(`Shoulder symptoms ${values.shoulder}/10`);
  if (Number(values.elbow) >= 5) reasons.push(`Elbow symptoms ${values.elbow}/10`);
  if (!redFlag && painValues.some((value) => value >= 3)) reasons.push("One or more soreness areas reached the workload-adjustment threshold");
  if (Number(values.sleepHours) < 6.5) reasons.push(`Sleep was ${values.sleepHours} hours`);
  if (Number(values.stress) >= 4) reasons.push(`Life stress was ${values.stress}/5`);
  if (Number(values.energy) <= 2) reasons.push(`Energy was ${values.energy}/5`);
  if (Number.isFinite(ouraReadiness) && ouraReadiness > 0 && ouraReadiness < 70) reasons.push(`Oura readiness was ${ouraReadiness}/100`);
  reasons.push(...signals.map((signal) => signal.text));

  const planLevel = redFlag ? "hold" : recoveryFlag ? "recovery" : reducedFlag ? "reduced" : "full";
  const risk = redFlag ? "red" : recoveryFlag ? "orange" : reducedFlag ? "yellow" : "green";
  return {
    score,
    risk,
    planLevel,
    workloadFactor: ({ full: 1, reduced: .75, recovery: .5, hold: 0 })[planLevel],
    reasons: reasons.length ? reasons : ["Readiness inputs are within the full-session guardrails"],
    signals,
    hrvSource,
    restingHeartRateSource,
    sleepSource,
    baselines: {
      hrv: hrvBaseline.count >= 5 ? Math.round(hrvBaseline.value * 10) / 10 : null,
      restingHeartRate: rhrBaseline.count >= 5 ? Math.round(rhrBaseline.value * 10) / 10 : null,
      hrvSamples: hrvBaseline.count,
      restingHeartRateSamples: rhrBaseline.count,
      subjective: Object.fromEntries(Object.entries(subjectiveBaselines).map(([field, baseline]) => [field, {
        value: baseline.count >= 5 ? round(baseline.value, 1) : null,
        count: baseline.count
      }]))
    }
  };
}

function completedForDate(date, session) {
  const completed = new Set(state.completedTasks[date] || []);
  const skipped = state.skippedTasks?.[date] || {};
  const completedCount = session.tasks.filter((item) => completed.has(item.id)).length;
  const skippedCount = session.tasks.filter((item) => !completed.has(item.id) && skipped[item.id]).length;
  return {
    count: completedCount + skippedCount,
    completed: completedCount,
    skipped: skippedCount,
    total: session.tasks.length
  };
}

function dayStatus(week, day) {
  const date = dayKey(week, day);
  if (state.post[date]) return "done";
  if (state.pre[date]) return "open";
  return "locked";
}

function weekCompletion(week) {
  let complete = 0;
  let total = 0;
  for (let day = 0; day < 7; day += 1) {
    const date = dayKey(week, day);
    const session = getSession(week, day);
    const progress = completedForDate(date, session);
    complete += progress.count;
    total += progress.total;
  }
  return total ? Math.round((complete / total) * 100) : 0;
}

function weekPostValues(week) {
  return Array.from({ length: 7 }, (_, day) => state.post[dayKey(week, day)] || null);
}

function showToast(message) {
  const root = document.querySelector("#toast-root");
  if (!root) return;
  root.innerHTML = `<div class="toast">${esc(message)}</div>`;
  window.setTimeout(() => { if (root) root.innerHTML = ""; }, 2800);
}

function athleteInitials(name = state.profile.name) {
  return String(name || "Athlete").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "A";
}

function avatarMarkup(className = "") {
  const photo = state.profile.photoDataUrl;
  return `<div class="avatar ${className}">${photo ? `<img src="${esc(photo)}" alt="${esc(state.profile.name)} profile photo">` : `<span>${esc(athleteInitials())}</span>`}</div>`;
}

function navIcon(id) {
  const paths = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    session: '<path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Z"/><path d="m8 12 2.2 2.2L16 8.5"/>',
    annual: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    nutrition: '<path d="M12 3v18M7 5v6a3 3 0 0 0 3 3h2M17 4v7M14 4v7a3 3 0 0 0 6 0V4"/>',
    mechanics: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    integrations: '<path d="M8 12a4 4 0 0 1 4-4h3M16 12a4 4 0 0 1-4 4H9"/><path d="m14 5 3 3-3 3M10 19l-3-3 3-3"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[id] || paths.dashboard}</svg>`;
}

function navButton(item, mobile = false) {
  const [id, , label] = item;
  if (mobile) return `<button class="${state.page === id ? "active" : ""}" data-action="nav" data-page="${id}"><span>${navIcon(id)}</span><small>${label}</small></button>`;
  return `<button class="nav-item ${state.page === id ? "active" : ""}" data-action="nav" data-page="${id}"><span class="nav-icon">${navIcon(id)}</span>${label}${id === "session" ? `<span class="nav-badge">${DAY_SHORT[state.selectedDay]}</span>` : ""}</button>`;
}

function appearancePreference() {
  return ["system", "dark", "light"].includes(state.profile.appearance) ? state.profile.appearance : "system";
}

function interfacePreferences() {
  return {
    glass: ["subtle", "balanced", "vivid"].includes(state.profile.glassIntensity) ? state.profile.glassIntensity : "balanced",
    density: ["comfortable", "compact"].includes(state.profile.interfaceDensity) ? state.profile.interfaceDensity : "comfortable",
    motion: ["system", "full", "reduced"].includes(state.profile.motionPreference) ? state.profile.motionPreference : "system",
    navigation: ["smart", "steady"].includes(state.profile.navigationBehavior) ? state.profile.navigationBehavior : "smart"
  };
}

function applyInterfacePreferences() {
  const preferences = interfacePreferences();
  document.documentElement.dataset.glass = preferences.glass;
  document.documentElement.dataset.density = preferences.density;
  document.documentElement.dataset.motion = preferences.motion;
  document.documentElement.dataset.navigation = preferences.navigation;
  return preferences;
}

function applyAppearancePreference() {
  const preference = appearancePreference();
  const resolved = preference === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#000000" : "#f7f7f9");
  applyInterfacePreferences();
  return { preference, resolved };
}

function renderOnboardingShell() {
  const suggestedName = accountAuth.user?.name || "";
  return `<div class="onboarding-shell"><main class="onboarding-card card"><div class="onboarding-brand"><img src="/mark.svg" alt=""><div><p class="eyebrow">Pitching OS</p><h1>Set up your athlete workspace.</h1><p>Your Google account now owns this encrypted workspace. The Australian template includes winter Saturday games and summer Tuesday/Thursday training with Friday/Sunday games.</p></div></div><form id="onboarding-form" class="form-grid onboarding-account-form"><div class="form-divider"><strong>Athlete details</strong><span>About one minute</span></div><div class="field full"><label>Name</label><input name="name" autocomplete="name" value="${esc(suggestedName)}" placeholder="Athlete name" required></div><div class="field"><label>Height (cm)</label><input name="height" type="number" min="100" max="230" required></div><div class="field"><label>Weight (kg)</label><input name="weight" type="number" min="35" max="250" step="0.1" required></div><div class="field"><label>Throwing hand</label><select name="throwingHand"><option>Right</option><option>Left</option></select></div><div class="field"><label>Role</label><select name="role"><option>Starting pitcher</option><option>Relief pitcher</option><option>Two-way player</option></select></div><div class="field"><label>Winter team</label><input name="winterTeam" placeholder="Norths"></div><div class="field"><label>Summer team</label><input name="summerTeam" placeholder="Coomera Cubs"></div><div class="field full"><label>Gym</label><input name="gym" placeholder="Your gym"></div><div class="form-actions"><button class="btn btn-dark">Create workspace</button></div></form><p class="onboarding-legal">Signed in as ${esc(accountAuth.user?.email || "")}. By continuing, you agree to the <a href="/terms.html" target="_blank" rel="noopener">terms</a> and acknowledge the <a href="/privacy.html" target="_blank" rel="noopener">privacy notice</a>. Pitching OS supports training decisions; it is not medical clearance.</p></main></div>`;
}

function renderAccountShell() {
  if (accountAuth.loading) {
    return `<div class="onboarding-shell"><main class="auth-card card"><img class="auth-mark" src="/mark.svg" alt=""><p class="eyebrow">Pitching OS</p><h1>Opening your workspace…</h1><p class="auth-copy">Checking your secure session and latest cloud save.</p><div class="auth-progress" aria-label="Loading"></div></main></div>`;
  }
  return `<div class="onboarding-shell"><main class="auth-card card"><img class="auth-mark" src="/mark.svg" alt=""><p class="eyebrow">Pitching OS</p><h1>Your training. One secure account.</h1><p class="auth-copy">Sign in once and your encrypted plan, health entries, PBs and progress follow you across devices automatically.</p>${accountAuth.error ? `<div class="alert warn"><strong>Connection issue</strong>${esc(accountAuth.error)}<button class="text-button" data-action="retry-connection">Try again</button></div>` : ""}<div class="auth-actions"><button class="btn btn-dark auth-primary" data-action="sign-in-google"><span class="google-g">G</span>Continue with Google</button><button class="btn btn-outline auth-primary" data-action="sign-in-passkey" ${window.PublicKeyCredential ? "" : "disabled"}>Use Face ID, Touch ID or passkey</button></div><p class="fineprint auth-note"><strong>First time:</strong> use Google, then add a passkey from Profile for faster sign-in. Your face or fingerprint stays on your device and is never received by Pitching OS.</p><p class="onboarding-legal">By continuing, you agree to the <a href="/terms.html" target="_blank" rel="noopener">terms</a> and acknowledge the <a href="/privacy.html" target="_blank" rel="noopener">privacy notice</a>.</p></main></div>`;
}

function renderShell() {
  if (accountAuth.loading || !accountAuth.signedIn) return renderAccountShell();
  if (!state.onboardingComplete) return renderOnboardingShell();
  const page = PAGE_TITLES[state.page] || PAGE_TITLES.dashboard;
  const week = selectedWeekPlan();
  const appearance = appearancePreference();
  const bottomItems = NAV_ITEMS.filter(([id]) => ["dashboard", "session", "analytics", "nutrition"].includes(id));
  const moreActive = ["annual", "mechanics", "profile", "integrations"].includes(state.page);
  return `
    <div class="app-shell theme-${seasonThemeForPhase(week.phase.id)} ${smartNavigationCondensed ? "nav-condensed" : ""}">
      <aside class="sidebar">
        <div class="brand"><img class="brand-mark" src="/mark.svg" alt=""><div><strong>Pitching OS</strong><span>${esc(state.profile.role)}</span></div></div>
        <div class="nav-label">Plan</div>
        <nav class="nav-list">${NAV_ITEMS.slice(0, 3).map((item) => navButton(item)).join("")}</nav>
        <div class="nav-label">Track</div>
        <nav class="nav-list">${NAV_ITEMS.slice(3, 6).map((item) => navButton(item)).join("")}</nav>
        <div class="nav-label">Settings</div>
        <nav class="nav-list">${NAV_ITEMS.slice(6).map((item) => navButton(item)).join("")}</nav>
        <button class="athlete-chip" data-action="nav" data-page="profile">${avatarMarkup()}<div><strong>${esc(state.profile.name)}</strong><small>${state.profile.throwingHand === "Left" ? "LHP" : "RHP"} · ${esc(state.profile.weight)} kg</small></div></button>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="top-context"><span class="context-mark"></span><div><strong class="desktop-context">Week ${week.week} · ${esc(week.phase.name)}</strong><strong class="mobile-context">${esc(page[0])}</strong><small>${formatDateRange(week.start, week.end)}</small></div></div>
          <div class="top-actions">
            <button class="sync-pill" data-action="nav" data-page="profile" aria-label="Open cloud autosave settings. ${cloudSync.pendingChanges.length} local changes waiting"><span class="sync-dot" data-sync-status data-status="${cloudSync.status}">${esc(syncStatusLabel())}</span></button>
            <button class="appearance-pill" data-action="cycle-appearance" aria-label="Change appearance. Current setting: ${esc(appearance)}" title="Appearance: ${esc(appearance)}"><span>${appearance === "dark" ? "◐" : appearance === "light" ? "○" : "A"}</span></button>
            <button class="today-button" data-action="open-selected-session">Open plan</button>
          </div>
        </header>
        <div class="content">${renderPage()}</div>
      </main>
      <nav class="bottom-nav" aria-label="Primary navigation">${bottomItems.map((item) => navButton(item, true)).join("")}<button class="${moreActive ? "active" : ""}" data-action="toggle-mobile-more"><span>${navIcon("profile")}</span><small>More</small></button></nav>
      ${mobileMoreOpen ? `<div class="mobile-sheet-backdrop" data-action="close-mobile-more"></div><aside class="mobile-sheet"><div class="mobile-sheet-head"><strong>More</strong><button data-action="close-mobile-more" aria-label="Close">×</button></div>${NAV_ITEMS.filter(([id]) => ["annual", "mechanics", "profile", "integrations"].includes(id)).map((item) => navButton(item)).join("")}</aside>` : ""}
    </div>
    ${activeModalTask ? renderTaskModal(activeModalTask) : ""}
    ${activeSkipTask ? renderTaskSkipModal(activeSkipTask, selectedDate()) : ""}
  `;
}

function renderPage() {
  if (state.page === "session") return renderSessionPage();
  if (state.page === "annual") return renderAnnualPage();
  if (state.page === "analytics") return renderAnalyticsPage();
  if (state.page === "nutrition") return renderNutritionPage();
  if (state.page === "mechanics") return renderMechanicsPage();
  if (state.page === "profile") return renderProfilePage();
  if (state.page === "integrations") return renderIntegrationsPage();
  return renderDashboard();
}

function weekStrip(week) {
  return `<div class="week-strip">${Array.from({ length: 7 }, (_, day) => {
    const date = addDays(week.start, day);
    const status = dayStatus(week, day);
    const isToday = brisbaneToday() === isoDate(date);
    return `<button class="day-chip ${status === "done" ? "done" : status === "locked" ? "locked" : ""} ${isToday ? "today" : ""}" data-action="select-day" data-day="${day}"><small>${DAY_SHORT[day]}</small><b>${formatDate(date, { day: "numeric" })}</b><span class="dot"></span></button>`;
  }).join("")}</div>`;
}

function plannedWorkloadChart(week) {
  const plannedStandard = plannedStressShape(week.phase.id);
  const adjusted = plannedStandard.map((planned, day) => {
    const pre = state.pre[dayKey(week, day)];
    return Math.round(planned * Number(effectiveWorkloadFactor(pre) ?? 1));
  });
  const actual = weekPostValues(week).map((post) => post ? Number(post.pulseWorkload || post.estimatedLoad || 0) : 0);
  const max = Math.max(100, ...plannedStandard, ...adjusted, ...actual);
  const width = 620;
  const height = 180;
  const barW = 46;
  const gap = 36;
  const left = 28;
  const bottom = 150;
  const bars = plannedStandard.map((planned, index) => {
    const x = left + index * (barW + gap);
    const pH = (planned / max) * 118;
    const dH = (adjusted[index] / max) * 118;
    const aH = (actual[index] / max) * 118;
    return `<rect x="${x}" y="${bottom - pH}" width="${barW}" height="${pH}" rx="8" fill="var(--line)"/><rect x="${x + 7}" y="${bottom - dH}" width="${barW - 14}" height="${dH}" rx="7" fill="var(--teal)" opacity=".52"/><rect x="${x + 15}" y="${bottom - aH}" width="${barW - 30}" height="${aH}" rx="5" fill="var(--blue)"/><text x="${x + barW / 2}" y="171" text-anchor="middle" font-size="10">${DAY_SHORT[index]}</text>`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Planned, readiness-adjusted and actual weekly workload chart"><line class="chart-axis" x1="20" y1="150" x2="605" y2="150"/>${bars}</svg></div><div class="chart-legend"><span><i class="legend-dot" style="background:var(--line)"></i>Original plan</span><span><i class="legend-dot" style="background:var(--teal);opacity:.62"></i>Readiness-adjusted</span><span><i class="legend-dot" style="background:var(--blue)"></i>Logged PULSE/manual</span></div>`;
}

function dataSourceTag(label, kind = "manual") {
  const descriptions = {
    sensor: "Imported from a connected sensor or health service",
    manual: "Entered or confirmed by the athlete",
    calculated: "Calculated from logged values",
    planned: "Scheduled by the training plan"
  };
  return `<span class="data-source ${esc(kind)}" title="${esc(descriptions[kind] || descriptions.manual)}">${esc(label)}</span>`;
}

function averageAvailable(values, digits = 1) {
  const available = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return available.length ? round(available.reduce((sum, value) => sum + value, 0) / available.length, digits) : null;
}

function weeklyReviewSummary(week = selectedWeekPlan()) {
  const dates = Array.from({ length: 7 }, (_, day) => dayKey(week, day));
  const pres = dates.map((date) => state.pre[date]).filter(Boolean);
  const posts = dates.map((date) => state.post[date]).filter(Boolean);
  const sleep = averageAvailable(pres.map((item) => item.sleepHours));
  const readiness = averageAvailable(pres.map((item) => item.score), 0);
  const rpe = averageAvailable(posts.map((item) => item.rpe));
  const totalThrows = posts.reduce((sum, item) => sum + Number(item.totalThrows || 0), 0);
  const highThrows = posts.reduce((sum, item) => sum + Number(item.highThrows || 0) + Number(item.gamePitches || 0), 0);
  const bestVelo = posts.map((item) => Number(item.bestVelo)).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => b - a)[0] || null;
  const soreness = [...pres.map((item) => Math.max(Number(item.shoulder || 0), Number(item.elbow || 0))), ...posts.map((item) => Math.max(Number(item.postShoulder || 0), Number(item.postElbow || 0)))];
  const maxSoreness = soreness.length ? Math.max(...soreness) : null;
  const worseResponse = pres.some((item) => ["worse", "much_worse"].includes(item.previousSessionResponse));
  const mealDays = dates.map((date) => nutritionMeals(date)).filter((items) => items.length);
  const protein = averageAvailable(mealDays.map((items) => items.reduce((sum, meal) => sum + Number(meal.protein || 0), 0)), 0);
  const hydrationDays = dates.map((date) => Number(state.nutrition.hydration?.[date])).filter((value) => Number.isFinite(value) && value > 0);
  const hydration = averageAvailable(hydrationDays);
  let proposal = { code: "maintain", planLevel: "full", title: "Maintain the planned structure", rationale: "Logged recovery and session responses do not support a pre-emptive volume reduction." };
  if (maxSoreness !== null && maxSoreness >= 5 || worseResponse) {
    proposal = { code: "review", planLevel: "full", title: "Review before changing next week", rationale: "Elevated arm symptoms or a worse-than-expected response was logged. The app will not prescribe through this signal or diagnose its cause." };
  } else if (readiness !== null && readiness < 65 || sleep !== null && sleep < 7) {
    proposal = { code: "reduce", planLevel: "reduced", title: "Propose a reduced week", rationale: "The week’s logged readiness or sleep was below the current planning guardrail. Approval would use the existing 75% session rules next week." };
  }
  const saved = state.weeklyReviews?.[String(week.week)];
  return {
    week: week.week,
    targetWeek: Math.min(52, week.week + 1),
    completedSessions: posts.length,
    checkIns: pres.length,
    sleep,
    readiness,
    rpe,
    totalThrows,
    highThrows,
    bestVelo,
    maxSoreness,
    protein,
    hydration,
    proposal: saved?.proposal || proposal,
    decision: saved?.decision || "pending",
    updatedAt: saved?.updatedAt || ""
  };
}

function renderWeeklyReviewCard(week = selectedWeekPlan(), compact = false) {
  const review = weeklyReviewSummary(week);
  const decisionCopy = review.decision === "approved" ? "Approved" : review.decision === "dismissed" ? "Not applied" : "Awaiting your decision";
  return `<article class="card card-pad weekly-review ${compact ? "compact" : ""}">
    <div class="card-head"><div><p class="eyebrow">Sunday review · Week ${review.week}</p><h3>${esc(review.proposal.title)}</h3><p>${esc(review.proposal.rationale)}</p></div><span class="status ${review.decision === "approved" ? "green" : review.decision === "dismissed" ? "gray" : "team"}">${esc(decisionCopy)}</span></div>
    <div class="review-metrics"><span><b>${review.completedSessions}</b>sessions</span><span><b>${review.totalThrows || "—"}</b>throws</span><span><b>${review.readiness ?? "—"}</b>avg score</span><span><b>${review.sleep ?? "—"}${review.sleep ? " h" : ""}</b>sleep</span><span><b>${review.maxSoreness ?? "—"}</b>max arm report</span><span><b>${review.bestVelo ?? "—"}${review.bestVelo ? " mph" : ""}</b>best velo</span></div>
    <div class="source-row">${dataSourceTag("Athlete logs", "manual")}${dataSourceTag("Weekly summary", "calculated")}</div>
    ${review.decision === "pending" ? `<div class="review-actions"><button class="btn btn-dark" data-action="weekly-review-decision" data-decision="approved" data-week="${review.week}">${review.proposal.code === "reduce" ? `Approve 75% rules for Week ${review.targetWeek}` : "Approve review note"}</button><button class="btn btn-outline" data-action="weekly-review-decision" data-decision="dismissed" data-week="${review.week}">Keep original plan</button></div>` : `<button class="text-button" data-action="weekly-review-reset" data-week="${review.week}">Change decision</button>`}
    <p class="fineprint"><strong>Approval boundary:</strong> nothing changes silently. A reduced proposal uses the app’s existing 75% rules in the following week only; it never adds or relocates a high-intent exposure. “Review” records context but does not change prescriptions.</p>
  </article>`;
}

function similarSessionComparison(date, session) {
  const targetDay = parseDate(date).getUTCDay();
  const category = sessionHasGame(session) ? "game" : session.tasks.some((item) => taskWorkloadType(item) === "highThrow") ? "high" : "standard";
  const matches = Object.entries(state.post)
    .filter(([sampleDate, post]) => {
      if (sampleDate >= date || parseDate(sampleDate).getUTCDay() !== targetDay) return false;
      if (category === "game") return Number(post.gamePitches || 0) > 0;
      if (category === "high") return Number(post.highThrows || 0) > 0 && !Number(post.gamePitches || 0);
      return !Number(post.gamePitches || 0);
    })
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, 4);
  if (!matches.length) return null;
  const posts = matches.map(([, post]) => post);
  return {
    count: matches.length,
    latestDate: matches[0][0],
    rpe: averageAvailable(posts.map((item) => item.rpe)),
    throws: averageAvailable(posts.map((item) => item.totalThrows), 0),
    bestVelo: averageAvailable(posts.map((item) => item.bestVelo)),
    postArm: averageAvailable(posts.map((item) => Math.max(Number(item.postShoulder || 0), Number(item.postElbow || 0))))
  };
}

function renderSimilarSessionComparison(date, session) {
  const comparison = similarSessionComparison(date, session);
  if (!comparison) return `<details class="card disclosure-card quiet-disclosure"><summary><span><strong>Similar sessions</strong><small>No prior comparable ${DAY_NAMES[state.selectedDay]} check-out yet</small></span><span>Show</span></summary><div class="disclosure-body"><div class="empty"><strong>Your first comparison is still ahead</strong>Complete the post-session check-out and this page will compare it with matching sessions, never a guessed benchmark.</div></div></details>`;
  return `<details class="card disclosure-card quiet-disclosure"><summary><span><strong>Similar sessions</strong><small>Last ${comparison.count} comparable ${DAY_NAMES[state.selectedDay]} logs</small></span><span>Show</span></summary><div class="disclosure-body"><div class="review-metrics"><span><b>${comparison.rpe ?? "—"}</b>avg RPE</span><span><b>${comparison.throws ?? "—"}</b>avg throws</span><span><b>${comparison.bestVelo ?? "—"}${comparison.bestVelo ? " mph" : ""}</b>avg best velo</span><span><b>${comparison.postArm ?? "—"}</b>avg post arm</span></div><div class="source-row">${dataSourceTag("Post-session logs", "manual")}${dataSourceTag(`Through ${formatDate(comparison.latestDate, { day: "numeric", month: "short" })}`, "calculated")}</div><p class="fineprint">This is a within-athlete comparison from matching weekdays and session type. Missing fields stay blank and are not estimated.</p></div></details>`;
}

function renderDashboard() {
  const week = selectedWeekPlan();
  const team = teamBrandForPhase(week.phase.id);
  const todayDate = selectedDate();
  const pre = state.pre[todayDate];
  const posts = weekPostValues(week).filter(Boolean);
  const totalThrows = posts.reduce((sum, post) => sum + Number(post.totalThrows || 0), 0);
  const highThrows = posts.reduce((sum, post) => sum + Number(post.highThrows || 0), 0);
  const srpe = posts.reduce((sum, post) => sum + Number(post.srpe || 0), 0);
  const completion = weekCompletion(week);
  const session = getSession(week, state.selectedDay);
  const progress = completedForDate(todayDate, session);
  const progressPercent = progress.total ? Math.round(progress.count / progress.total * 100) : 0;
  const water = Number(state.nutrition.hydration?.[todayDate] || 0);
  const waterTarget = Number(state.nutrition.targets?.fluid || 0);
  const healthSources = state.healthPrefill?.[todayDate]?.sources || {};
  const wearableLabel = healthSources.oura?.data ? "Oura + check-in" : healthSources.appleHealth?.data ? "Apple + check-in" : "Health check-in";
  const primaryAction = !pre ? "Complete check-in" : progress.count ? "Resume plan" : "Start plan";
  const priorityLabel = !pre
    ? "Complete the health check-in to set today’s workload"
    : progress.count === progress.total && progress.total
      ? "Today’s assigned work is resolved"
      : `${Math.max(0, progress.total - progress.count)} task${Math.max(0, progress.total - progress.count) === 1 ? "" : "s"} remaining`;
  return `
    <section class="page-head dashboard-page-head">
      <div class="dashboard-heading"><div class="team-logo-wrap"><img src="${esc(team.logo)}" alt="${esc(team.alt)}"></div><div><p class="eyebrow">Week ${week.week} · ${esc(week.phase.name)}</p><h2>${formatDate(parseDate(todayDate), { weekday: "long", day: "numeric", month: "long" })}</h2><p>${esc(week.focus)}.</p><span class="team-wordmark">${esc(team.name)}</span></div></div>
    </section>
    <section class="today-focus">
      <article class="card hero-session">
        <div class="hero-priority"><span class="kicker">${DAY_NAMES[state.selectedDay]} · ${pre ? "Check-in complete" : "Check-in required"}</span><span>${esc(priorityLabel)}</span></div>
        <h3>${esc(session.title.replace(`${DAY_NAMES[state.selectedDay]} · `, ""))}</h3>
        <p>${esc(session.description)}</p>
        <div class="hero-meta"><span><b>${esc(session.duration)}</b>Duration</span><span><b>${esc(session.stress)}</b>Stress</span><span><b>${session.tasks.length}</b>Tasks</span>${pre ? `<span><b>${Math.round(effectiveWorkloadFactor(pre) * 100)}%</b>Active dose</span>` : ""}</div>
        <button class="btn btn-primary hero-action" data-action="open-selected-session">${esc(primaryAction)} <span aria-hidden="true">→</span></button>
      </article>
    </section>
    <section class="grid metrics today-shortcuts" aria-label="Today at a glance">
      <button class="card metric metric-shortcut ${pre?.risk === "green" ? "good" : pre?.risk === "yellow" || pre?.risk === "orange" ? "warn" : "accent"}" data-action="open-selected-session"><span class="metric-label">Readiness</span><span class="metric-value">${pre?.score ?? "—"}</span><span class="metric-detail">${pre ? `${pre.score}/100 planning score` : "Complete today’s check-in"}</span>${dataSourceTag(wearableLabel, healthSources.oura?.data || healthSources.appleHealth?.data ? "sensor" : "manual")}<span class="metric-arrow" aria-hidden="true">›</span></button>
      <button class="card metric metric-shortcut accent" data-action="open-selected-session"><span class="metric-label">Active workload</span><span class="metric-value">${pre ? `${Math.round(effectiveWorkloadFactor(pre) * 100)}%` : "—"}</span><span class="metric-detail">${pre ? `${pre.manualOverride?.active ? "Manual return" : "Today’s approved dose"}` : "Plan remains locked"}</span>${dataSourceTag("Plan rules", "calculated")}<span class="metric-arrow" aria-hidden="true">›</span></button>
      <button class="card metric metric-shortcut good" data-action="open-selected-session"><span class="metric-label">Session progress</span><span class="metric-value">${progressPercent}%</span><span class="metric-detail">${progress.count} of ${progress.total} resolved${progress.skipped ? ` · ${progress.skipped} skipped` : ""}</span>${dataSourceTag("Task log", "manual")}<span class="metric-arrow" aria-hidden="true">›</span></button>
      <button class="card metric metric-shortcut warn" data-action="nav" data-page="nutrition"><span class="metric-label">Hydration</span><span class="metric-value">${water || "—"}${water ? " L" : ""}</span><span class="metric-detail">${waterTarget ? `${Math.round(water / waterTarget * 100)}% of ${waterTarget} L` : "Set a fluid target"}</span>${dataSourceTag("Fluid log", "manual")}<span class="metric-arrow" aria-hidden="true">›</span></button>
    </section>
    ${state.selectedDay === 6 ? renderWeeklyReviewCard(week, true) : ""}
    <details class="card disclosure-card quiet-disclosure"><summary><span><strong>This week</strong><small>${completion}% complete · ${totalThrows || 0} throws logged</small></span><span>Show</span></summary><div class="disclosure-body"><div class="card-head"><div><h3>${esc(weeklyRhythmText(week.phase.id))}</h3><p>${esc(week.focus)}</p></div><span class="status ${phaseStatusTone(week.phase.id)}">${esc(week.phase.name)}</span></div>${weekStrip(week)}<div class="mini-list dashboard-anchors"><div class="mini-row"><span class="mini-icon">01</span><div><strong>Primary strength</strong><p>${esc(week.mondayLift)}</p></div></div><div class="mini-row"><span class="mini-icon">02</span><div><strong>Throwing emphasis</strong><p>${esc(week.throwing)}</p></div></div><div class="mini-row"><span class="mini-icon">03</span><div><strong>Recovery rule</strong><p>${esc(week.recovery)}</p></div></div></div></div></details>
    <details class="card disclosure-card quiet-disclosure"><summary><span><strong>Workload and data detail</strong><small>${highThrows} high-effort/game throws · ${srpe || 0} session-RPE load</small></span><span>Show</span></summary><div class="disclosure-body">${plannedWorkloadChart(week)}<div class="source-row">${dataSourceTag("Original plan", "planned")}${dataSourceTag("App adjustment", "calculated")}${dataSourceTag("PULSE when entered", "sensor")}${dataSourceTag("Manual check-out", "manual")}</div><p class="fineprint">The logged bar uses PULSE workload only when entered; otherwise it uses the app’s manual session-load entry. Missing values remain blank. This chart is not an injury-risk model.</p></div></details>
  `;
}

function renderDayTabs(week) {
  return `<div class="day-tabs">${Array.from({ length: 7 }, (_, day) => {
    const date = addDays(week.start, day);
    const status = dayStatus(week, day);
    return `<button class="day-tab ${state.selectedDay === day ? "active" : ""} ${status === "done" ? "done" : ""}" data-action="select-day" data-day="${day}"><span>${formatDate(date, { day: "numeric", month: "short" })} · ${status}</span><strong>${DAY_NAMES[day]}</strong></button>`;
  }).join("")}</div>`;
}

function rangeValueText(name, value) {
  const fivePointLabels = {
    energy: ["", "Empty", "Low", "Okay", "Good", "Energised"],
    mood: ["", "Very low", "Low", "Okay", "Good", "Excellent"],
    stress: ["", "Low", "Manageable", "Moderate", "High", "Very high"]
  };
  const sorenessLabels = [
    "None",
    "Minimal",
    "Very mild",
    "Mild",
    "Mild–moderate",
    "Moderate",
    "Moderate–high",
    "High",
    "Very high",
    "Severe",
    "Maximum reported"
  ];
  const rpeLabels = [
    "",
    "Very easy",
    "Easy",
    "Easy–moderate",
    "Moderate",
    "Moderately hard",
    "Hard",
    "Very hard",
    "Very hard",
    "Near-maximal",
    "Maximal"
  ];
  if (fivePointLabels[name]?.[value]) return fivePointLabels[name][value];
  if (name === "rpe" && rpeLabels[value]) return rpeLabels[value];
  if (["shoulder", "elbow", "forearm", "lat", "lower", "postShoulder", "postElbow"].includes(name)) {
    return sorenessLabels[value] || `${value}`;
  }
  return `${value}`;
}

function defaultRangeValue(name, min, max) {
  const defaults = { energy: 4, mood: 4, stress: 2, rpe: 6 };
  return Math.min(max, Math.max(min, defaults[name] ?? (min === 0 ? 0 : min)));
}

function rangeField(name, label, value, min = 1, max = 5, help = "1 low · 5 high") {
  const numericValue = Math.min(max, Math.max(min, Math.round(Number(value) || min)));
  const progress = max === min ? 0 : ((numericValue - min) / (max - min)) * 100;
  const valueText = rangeValueText(name, numericValue);
  const resetValue = defaultRangeValue(name, min, max);
  return `<div class="field range-field"><div class="range-label-row"><label for="${name}">${label}</label><div class="range-controls"><output class="range-output" data-output="${name}" for="${name}" aria-live="polite"><strong data-range-number>${numericValue}</strong><span data-range-text>${esc(valueText)}</span></output><button class="range-reset" type="button" data-action="reset-range" data-target="${name}" data-value="${resetValue}">Reset</button></div></div><div class="range-wrap"><input id="${name}" name="${name}" type="range" min="${min}" max="${max}" step="1" value="${numericValue}" style="--range-progress:${progress}%" aria-valuetext="${esc(`${numericValue} of ${max}, ${valueText}`)}" data-range><div class="range-scale" aria-hidden="true"><span>${min}</span><span>${max}</span></div></div><small>${help}</small></div>`;
}

function baselinePreview(date) {
  const baselines = subjectiveBaselinesForDate(date);
  const items = [
    ["Sleep", baselines.sleepHours, "h"],
    ["Energy", baselines.energy, "/5"],
    ["Stress", baselines.stress, "/5"],
    ["Shoulder", baselines.shoulder, "/10"]
  ].filter(([, baseline]) => baseline.count >= 5);
  if (!items.length) return "";
  return `<div class="baseline-preview"><div><strong>Your recent normal</strong><span>Rolling median from up to 14 prior check-ins</span></div><div class="baseline-values">${items.map(([label, baseline, unit]) => `<span><b>${esc(baseline.value)}${unit}</b>${label}</span>`).join("")}</div></div>`;
}

function renderPreForm(date, stored = {}) {
  const values = healthPrefillValues(date, stored);
  const health = state.healthPrefill[date] || {};
  const sources = health.sources || {};
  const oura = sources.oura?.data || {};
  const previousSession = previousSessionContext(date);
  const imported = (metric) => metricSourceForDate(date, metric) !== "manual" ? "readonly aria-readonly=\"true\"" : "";
  const sourceNames = [sources.oura?.data ? "Oura" : "", sources.appleHealth?.data ? "Apple Health" : ""].filter(Boolean);
  const sourceLine = sourceNames.length
    ? `<div class="alert info health-prefill"><div><strong>Health data prefilled</strong>${esc(sourceNames.join(" + "))} supplied the available sleep, HRV, resting-heart-rate or bodyweight fields. Subjective readiness and soreness still require your input.</div><button class="btn btn-outline" type="button" data-action="refresh-health">Refresh</button></div>`
    : integrationState.healthLoadingDate === date
      ? `<div class="alert info health-prefill"><div><strong>Checking connected health sources…</strong>Oura and Apple Health values will appear here when available.</div></div>`
      : health.error
        ? `<div class="alert warn health-prefill"><div><strong>Health import unavailable</strong>${esc(health.error)}</div><button class="btn btn-outline" type="button" data-action="refresh-health">Try again</button></div>`
        : cloudSync.key
          ? `<div class="alert info health-prefill"><div><strong>No connected health values yet</strong>You can still complete the check-in manually.</div><button class="btn btn-outline" type="button" data-action="refresh-health">Check again</button></div>`
          : "";
  return `
    <article class="card gate">
      <div class="gate-icon">♡</div>
      <h3>Complete the health check-in</h3>
      <p>The daily plan stays hidden until this quick check is submitted. Your answers, recent baseline and available wearable data set today’s training level.</p>
      ${sourceLine}
      ${baselinePreview(date)}
      <form id="pre-form" class="form-grid" data-date="${date}">
        <div class="field"><label for="sleepHours">Sleep duration</label><input id="sleepHours" name="sleepHours" type="number" min="0" max="14" step="0.1" value="${esc(values.sleepHours)}" ${imported("sleepHours")} required><small>Hours last night${sources.oura?.data || sources.appleHealth?.data ? " · auto-imported" : ""}</small></div>
        <div class="field"><label for="bodyweight">Bodyweight</label><input id="bodyweight" name="bodyweight" type="number" min="40" max="160" step="0.1" value="${esc(values.bodyweight)}" ${imported("bodyweightKg")}><small>kg · Oura profile or Apple Health when available</small></div>
        <div class="field"><label for="sleepQuality">Sleep quality</label><select id="sleepQuality" name="sleepQuality" required><option value="">Select…</option>${[1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${Number(values.sleepQuality) === value ? "selected" : ""}>${value} · ${["", "Poor", "Below average", "Average", "Good", "Excellent"][value]}</option>`).join("")}</select><small>${values.sleepScore ? "Derived from the imported Oura sleep score" : "Required when no device score is available"}</small></div>
        ${rangeField("energy", "Energy", values.energy ?? 4, 1, 5, "1 empty · 5 energised")}
        ${rangeField("mood", "Mood / motivation", values.mood ?? 4, 1, 5, "1 low · 5 excellent")}
        ${rangeField("stress", "Life stress", values.stress ?? 2, 1, 5, "1 low · 5 very high")}
        ${previousSession ? `<div class="field"><label for="previousSessionResponse">Response to last session</label><select id="previousSessionResponse" name="previousSessionResponse" required><option value="">Select…</option><option value="better" ${values.previousSessionResponse === "better" ? "selected" : ""}>Better than expected</option><option value="as_expected" ${values.previousSessionResponse === "as_expected" ? "selected" : ""}>As expected</option><option value="worse" ${values.previousSessionResponse === "worse" ? "selected" : ""}>Worse than expected</option><option value="much_worse" ${values.previousSessionResponse === "much_worse" ? "selected" : ""}>Much worse than expected</option></select><small>${formatDate(previousSession.date, { weekday: "short", day: "numeric", month: "short" })} · ${previousSession.throws} throws · ${previousSession.srpe || 0} sRPE</small><input type="hidden" name="previousSessionDate" value="${previousSession.date}"></div>` : `<input type="hidden" name="previousSessionResponse" value="not_applicable">`}
        <div class="field warning-field"><label for="warningSigns">New warning signs?</label><select id="warningSigns" name="warningSigns" required><option value="">Select…</option><option value="no" ${values.warningSigns === "no" ? "selected" : ""}>No</option><option value="yes" ${values.warningSigns === "yes" ? "selected" : ""}>Yes — hold today’s plan</option></select><small>New sharp or worsening pain, weakness, numbness, or symptoms changing your throwing mechanics</small></div>
        <details class="advanced-fields field full">
          <summary>Imported health detail <span>${sources.oura?.data ? "Oura data available" : "Optional"}</span></summary>
          <div class="form-grid">
            <div class="field"><label for="ouraReadinessScore">Oura readiness score</label><input id="ouraReadinessScore" name="ouraReadinessScore" type="number" min="0" max="100" step="1" value="${esc(values.ouraReadinessScore)}" ${sources.oura?.data ? "readonly aria-readonly=\"true\"" : ""}><small>Oura’s score, kept separate from the Pitching OS score</small></div>
            <div class="field"><label for="sleepScore">Oura sleep score</label><input id="sleepScore" name="sleepScore" type="number" min="0" max="100" step="1" value="${esc(values.sleepScore)}" ${sources.oura?.data ? "readonly aria-readonly=\"true\"" : ""}><small>Imported after Oura sync when available</small></div>
            <div class="field"><label for="restingHeartRate">Resting heart rate</label><input id="restingHeartRate" name="restingHeartRate" type="number" min="20" max="240" step="0.1" value="${esc(values.restingHeartRate)}" ${imported("restingHeartRate")}><small>bpm · source shown after import</small></div>
            <div class="field"><label for="hrvMs">HRV</label><input id="hrvMs" name="hrvMs" type="number" min="0" max="500" step="0.1" value="${esc(values.hrvMs)}" ${imported("hrvMs")}><small>ms · source shown after import</small></div>
            ${sources.oura?.data ? `<div class="field full"><div class="oura-snapshot"><span><b>${esc(oura.activityScore ?? "—")}</b>Activity</span><span><b>${esc(oura.steps ?? "—")}</b>Steps</span><span><b>${esc(oura.stressHighMinutes ?? "—")}</b>Stress min</span><span><b>${esc(oura.recoveryHighMinutes ?? "—")}</b>Recovery min</span><span><b>${esc(oura.spo2Average ?? "—")}${oura.spo2Average ? "%" : ""}</b>SpO₂</span><span><b>${esc(oura.ringBatteryLevel ?? "—")}${oura.ringBatteryLevel !== null && oura.ringBatteryLevel !== undefined ? "%" : ""}</b>Ring</span></div></div>` : ""}
          </div>
          <small>Only fields returned by a connected source are imported. Missing values remain blank and are not guessed.</small>
        </details>
        <input type="hidden" name="ouraActivityScore" value="${esc(values.ouraActivityScore)}"><input type="hidden" name="ouraSteps" value="${esc(values.ouraSteps)}"><input type="hidden" name="ouraStressHighMinutes" value="${esc(values.ouraStressHighMinutes)}"><input type="hidden" name="ouraRecoveryHighMinutes" value="${esc(values.ouraRecoveryHighMinutes)}"><input type="hidden" name="ouraTemperatureDeviation" value="${esc(values.ouraTemperatureDeviation)}"><input type="hidden" name="ouraSpO2" value="${esc(values.ouraSpO2)}"><input type="hidden" name="ouraRestMode" value="${esc(values.ouraRestMode)}">
        ${rangeField("shoulder", "Shoulder soreness / pain", values.shoulder ?? 0, 0, 10, "0 none · 10 severe")}
        ${rangeField("elbow", "Elbow soreness / pain", values.elbow ?? 0, 0, 10, "0 none · 10 severe")}
        ${rangeField("forearm", "Forearm / grip", values.forearm ?? 0, 0, 10, "0 none · 10 severe")}
        ${rangeField("lat", "Lat / upper back", values.lat ?? 0, 0, 10, "0 none · 10 severe")}
        ${rangeField("lower", "Lower-body soreness", values.lower ?? 0, 0, 10, "0 none · 10 severe")}
        <div class="field"><label for="illness">Illness symptoms</label><select id="illness" name="illness"><option value="no" ${values.illness !== "yes" ? "selected" : ""}>No</option><option value="yes" ${values.illness === "yes" ? "selected" : ""}>Yes</option></select><small>Fever, infection symptoms or unusual malaise</small></div>
        <div class="field full"><label for="preNotes">Notes</label><textarea id="preNotes" name="notes" placeholder="Anything affecting today's plan?">${esc(values.notes || "")}</textarea></div>
        <div class="form-actions"><button class="btn btn-dark" type="submit">Set today’s plan</button></div>
      </form>
      <p class="fineprint"><strong>What this does:</strong> Pitching OS applies a transparent planning heuristic to the information above and returns 100%, 75%, 50% or a hold. Personal baselines require at least five prior check-ins and use a rolling median, not an injury-risk prediction. This is not diagnosis or medical clearance. New or worsening pain, illness, weakness, numbness or altered mechanics needs qualified clinical or coaching review. Data is saved on this device${cloudSync.key ? " and encrypted before cloud autosave." : "; cross-device access requires encrypted cloud autosave."}</p>
    </article>
  `;
}

function riskAlert(pre) {
  const reasons = Array.isArray(pre.reasons) ? pre.reasons.slice(0, 4) : [];
  const reasonList = reasons.length ? `<ul class="adaptation-reasons">${reasons.map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul>` : "";
  if (pre.manualOverride?.active && ["reduced", "recovery"].includes(pre.planLevel)) return `<div class="alert warn adaptation-alert session-status"><span class="session-status-icon" aria-hidden="true">↺</span><div><strong>Original plan restored manually</strong><span>Pitching OS recommended ${Math.round(Number(pre.workloadFactor || 1) * 100)}% workload. The active plan is the original 100% schedule; this is a recorded training choice, not medical clearance.</span>${reasonList}</div></div>`;
  if (pre.risk === "red") return `<div class="alert danger adaptation-alert session-status"><span class="session-status-icon" aria-hidden="true">!</span><div><strong>Health hold</strong><span>The planned session has been replaced with recovery and qualified review.</span>${reasonList}</div></div>`;
  if (pre.risk === "orange") return `<div class="alert recovery adaptation-alert session-status"><span class="session-status-icon" aria-hidden="true">50</span><div><strong>Recovery-modified session · about 50% workload</strong><span>Throwing, plyos, gym, speed and conditioning have been replaced or sharply reduced. Warm-up and recovery stay in place.</span>${reasonList}</div></div>`;
  if (pre.risk === "yellow") return `<div class="alert warn adaptation-alert session-status"><span class="session-status-icon" aria-hidden="true">75</span><div><strong>Reduced session · about 75% workload</strong><span>The prescriptions below already show today’s adjusted dose across throwing, gym, speed and conditioning.</span>${reasonList}</div></div>`;
  return `<div class="alert success adaptation-alert session-status"><span class="session-status-icon" aria-hidden="true">100</span><div><strong>Full session available</strong><span>Inputs are within the full-session guardrails. Continue to monitor symptoms and movement quality.</span>${reasonList}</div></div>`;
}

function renderAdjustmentSummary(pre) {
  const recommended = Math.round(Number(pre.workloadFactor ?? 1) * 100);
  const active = Math.round(Number(effectiveWorkloadFactor(pre) ?? 1) * 100);
  const baselineSignals = (pre.signals || []).filter((signal) => ["hrv", "rhr", "sleep_baseline", "energy_baseline", "mood_baseline", "stress_baseline", "previous_response"].includes(signal.type));
  const subjectiveBaselines = Object.values(pre.baselines?.subjective || {});
  const baselineAvailable = pre.baselines?.hrv !== null && pre.baselines?.hrv !== undefined
    || pre.baselines?.restingHeartRate !== null && pre.baselines?.restingHeartRate !== undefined
    || subjectiveBaselines.some((baseline) => baseline?.value !== null && baseline?.value !== undefined);
  const baselineCopy = baselineSignals.length
    ? esc(baselineSignals.map((signal) => signal.text).join(" · "))
    : baselineAvailable
      ? "No qualifying deviation from the available rolling baseline."
      : "Still learning—five prior observations are required before a personal baseline is used.";
  return `<details class="card disclosure-card quiet-disclosure adjustment-summary"><summary><span><strong>Why today’s workload is ${active}%</strong><small>Readiness inputs, baseline context and plan guardrails</small></span><span>Show</span></summary><div class="disclosure-body"><div class="adjustment-flow"><span><small>Original plan</small><strong>100%</strong></span><i>→</i><span><small>App recommendation</small><strong>${recommended}%</strong></span><i>→</i><span class="active"><small>Active today</small><strong>${active}%</strong></span></div><p><strong>Baseline/context:</strong> ${baselineCopy}</p><p class="fineprint"><strong>Core rule:</strong> readiness can remove or reduce work, but it never schedules an extra high-intent exposure or moves one beside another high-intent/game day.</p></div></details>`;
}

function renderReadinessOverride(pre, date) {
  if (pre.planLevel === "hold") return `<article class="card override-card"><strong>Hold cannot be overridden here</strong><p>New/worsening warning signs, illness, or elevated shoulder/elbow symptoms require qualified review before returning to the planned session.</p></article>`;
  if (pre.manualOverride?.active && ["reduced", "recovery"].includes(pre.planLevel)) return `<article class="card override-card"><div><strong>Manual choice recorded</strong><p>${esc(pre.manualOverride.reason)}${pre.manualOverride.notes ? ` · ${esc(pre.manualOverride.notes)}` : ""}</p></div><button class="btn btn-outline" data-action="remove-readiness-override">Use app recommendation</button></article>`;
  if (!["reduced", "recovery"].includes(pre.planLevel)) return "";
  return `<details class="card disclosure-card override-disclosure"><summary><span><strong>Restore the original plan</strong><small>Optional manual training choice</small></span><span>Show</span></summary><div class="disclosure-body"><form id="readiness-override-form" class="form-grid" data-date="${date}"><div class="field full"><label for="overrideReason">Reason</label><select id="overrideReason" name="reason" required><option value="">Select…</option><option value="Wearable data does not match how I feel">Wearable data does not match how I feel</option><option value="Known non-training stress has resolved">Known non-training stress has resolved</option><option value="Reviewed with a qualified coach or clinician">Reviewed with a qualified coach or clinician</option><option value="Other recorded reason">Other</option></select></div><div class="field full"><label for="overrideNotes">Optional detail</label><textarea id="overrideNotes" name="notes" placeholder="Record useful context without adding sensitive detail."></textarea></div><label class="check-line field full"><input type="checkbox" name="acknowledged" value="yes" required><span>I understand this restores only the original session, adds no extra work, cannot override a health hold, and is not medical clearance.</span></label><div class="form-actions"><button class="btn btn-dark" type="submit">Restore original plan</button></div></form></div></details>`;
}

function renderTasks(session, date) {
  const completed = new Set(state.completedTasks[date] || []);
  const skipped = state.skippedTasks?.[date] || {};
  const stages = [...new Set(session.tasks.map((item) => item.stage))];
  const isResolved = (item) => completed.has(item.id) || Boolean(skipped[item.id]);
  const firstIncompleteStage = stages.find((stage) => session.tasks.some((item) => item.stage === stage && !isResolved(item)));
  const preferredStage = activePlanStage.date === date && stages.includes(Number(activePlanStage.stage))
    ? Number(activePlanStage.stage)
    : null;
  const openStage = preferredStage ?? firstIncompleteStage;
  return stages.map((stage) => {
    const tasks = session.tasks.filter((item) => item.stage === stage);
    const first = tasks[0];
    const completedCount = tasks.filter((item) => completed.has(item.id)).length;
    const skippedCount = tasks.filter((item) => !completed.has(item.id) && skipped[item.id]).length;
    const resolvedCount = completedCount + skippedCount;
    const stageComplete = resolvedCount === tasks.length;
    const stageOpen = stage === openStage;
    const progressLabel = skippedCount ? `${skippedCount} skipped` : stageComplete ? "Complete" : "done";
    return `<details class="card task-stage ${stageComplete ? "stage-complete" : stageOpen ? "stage-current" : ""}" data-plan-stage="${stage}" ${stageOpen ? "open" : ""}><summary class="stage-head"><span class="stage-number">${stage}</span><span class="stage-copy"><strong>${esc(first.stageTitle)}</strong><small>${esc(first.stageDescription)}</small></span><span class="stage-progress" aria-label="${resolvedCount} of ${tasks.length} tasks resolved${skippedCount ? `, ${skippedCount} skipped` : ""}"><strong>${resolvedCount}/${tasks.length}</strong><small>${esc(progressLabel)}</small></span><span class="stage-chevron" aria-hidden="true"></span></summary><div class="task-list">${tasks.map((item) => {
      const done = completed.has(item.id);
      const skip = !done ? skipped[item.id] : null;
      const canSkip = item.stageTitle !== "Health Hold";
      return `<article class="task ${done ? "completed" : ""} ${skip ? "skipped" : ""} ${item.adapted ? "task-adapted" : ""}" data-task-row="${item.id}"><input class="task-check" type="checkbox" aria-label="${skip ? "Skipped" : "Complete"} ${esc(item.name)}" data-action="toggle-task" data-task="${item.id}" ${done ? "checked" : ""} ${skip ? "disabled" : ""}><div><div class="task-title">${esc(item.name)}${item.adapted ? `<span class="adaptive-badge">Adjusted</span>` : ""}${skip ? `<span class="skip-badge">Skipped</span>` : ""}</div><div class="task-prescription">${esc(item.prescription)}</div><p class="task-cue">${esc(item.cue)}</p>${skip ? `<p class="task-skip-note"><strong>${esc(skip.reason)}</strong>${skip.notes ? ` · ${esc(skip.notes)}` : ""}</p>` : ""}</div><div class="task-actions"><button class="task-details" data-action="task-details" data-task="${item.id}">Details</button>${skip ? `<button class="task-skip undo" data-action="undo-skip-task" data-task="${item.id}">Undo skip</button>` : canSkip && !done ? `<button class="task-skip" data-action="skip-task" data-task="${item.id}">Skip</button>` : ""}</div></article>`;
    }).join("")}</div></details>`;
  }).join("");
}

const BULLPEN_PITCH_TYPES = {
  four_seam: "4-seam",
  two_seam: "2-seam",
  cutter: "Cutter",
  changeup: "Changeup",
  slider: "Slider",
  curveball: "Curveball",
  splitter: "Splitter",
  other: "Other"
};

const BULLPEN_RESULTS = {
  called_strike: "Called strike",
  swinging_strike: "Swinging strike",
  foul: "Foul",
  ball: "Ball",
  in_play: "In play",
  take: "No result / take"
};

function bullpenForDate(date) {
  const record = state.bullpens?.[date];
  return record && Array.isArray(record.entries) ? record : { entries: [], updatedAt: "" };
}

function sessionHasBullpenChart(session) {
  if (/health hold/i.test(session.title)) return false;
  return session.tasks.some((item) => /\b(bullpen|mound (?:touch|session|build|work)|live hitters?|simulated innings?)\b/i.test(`${item.name} ${item.prescription}`));
}

function bullpenInsideZone(point) {
  return Boolean(point) && point.x >= 20 && point.x <= 80 && point.y >= 15 && point.y <= 85;
}

function bullpenPitchScore(entry) {
  if (!entry?.target || !entry?.actual) return 0;
  const distance = Math.hypot(Number(entry.actual.x) - Number(entry.target.x), Number(entry.actual.y) - Number(entry.target.y));
  const proximity = clamp(100 - distance * 2, 0, 100);
  const zoneIntentMatch = bullpenInsideZone(entry.target) === bullpenInsideZone(entry.actual) ? 100 : 0;
  return Math.round(proximity * .8 + zoneIntentMatch * .2);
}

function bullpenSummary(entries) {
  if (!entries.length) return { score: 0, targetHits: 0, targetRate: 0, strikes: 0, strikeRate: 0, miss: "No pitches charted" };
  const scored = entries.map((entry) => ({
    ...entry,
    distance: Math.hypot(Number(entry.actual.x) - Number(entry.target.x), Number(entry.actual.y) - Number(entry.target.y)),
    score: bullpenPitchScore(entry)
  }));
  const targetHits = scored.filter((entry) => entry.distance <= 10).length;
  const strikes = scored.filter((entry) => bullpenInsideZone(entry.actual)).length;
  const dx = scored.reduce((sum, entry) => sum + Number(entry.actual.x) - Number(entry.target.x), 0) / scored.length;
  const dy = scored.reduce((sum, entry) => sum + Number(entry.actual.y) - Number(entry.target.y), 0) / scored.length;
  const horizontal = Math.abs(dx) < 2 ? "centred" : `${Math.round(Math.abs(dx))}% ${dx > 0 ? "right" : "left"}`;
  const vertical = Math.abs(dy) < 2 ? "level" : `${Math.round(Math.abs(dy))}% ${dy > 0 ? "low" : "high"}`;
  return {
    score: Math.round(scored.reduce((sum, entry) => sum + entry.score, 0) / scored.length),
    targetHits,
    targetRate: Math.round(targetHits / scored.length * 100),
    strikes,
    strikeRate: Math.round(strikes / scored.length * 100),
    miss: `${horizontal} · ${vertical}`
  };
}

function resetBullpenDraft(date = selectedDate()) {
  bullpenUi.date = date;
  bullpenUi.target = null;
  bullpenUi.actual = null;
  bullpenUi.pitchType = "four_seam";
  bullpenUi.result = "called_strike";
  bullpenUi.velocity = "";
  bullpenUi.notes = "";
}

function bullpenDraftForDate(date) {
  if (bullpenUi.date !== date) resetBullpenDraft(date);
  return bullpenUi;
}

function bullpenPlot(mode, entries, draft) {
  const isTarget = mode === "target";
  const pending = isTarget ? draft.target : draft.actual;
  const markers = entries.map((entry, index) => {
    const point = isTarget ? entry.target : entry.actual;
    if (!point) return "";
    return `<g class="bullpen-marker ${isTarget ? "intended" : "actual"}"><circle cx="${point.x}" cy="${point.y}" r="3.7"/><text x="${point.x}" y="${point.y + 1.35}">${index + 1}</text></g>`;
  }).join("");
  const pendingMarker = pending ? `<g class="bullpen-marker pending ${isTarget ? "intended" : "actual"}"><circle cx="${pending.x}" cy="${pending.y}" r="4.6"/><text x="${pending.x}" y="${pending.y + 1.35}">+</text></g>` : "";
  return `<div class="bullpen-map-wrap"><div><strong>${isTarget ? "Intended target" : "Actual pitch"}</strong><small>Catcher's view · tap to place</small></div><button type="button" class="bullpen-map" data-action="plot-bullpen-location" data-location="${mode}" aria-label="Plot ${isTarget ? "intended target" : "actual pitch location"}"><svg viewBox="0 0 100 100" role="img" aria-label="${isTarget ? "Intended target" : "Actual pitch"} chart"><rect class="bullpen-zone" x="20" y="15" width="60" height="70" rx="1"/><path class="bullpen-gridline" d="M40 15v70M60 15v70M20 38.33h60M20 61.67h60"/><path class="bullpen-plate" d="M37 91h26l-5 6H42Z"/>${markers}${pendingMarker}</svg></button></div>`;
}

function renderBullpenChart(date) {
  const entries = bullpenForDate(date).entries;
  const draft = bullpenDraftForDate(date);
  const summary = bullpenSummary(entries);
  const recent = entries.slice(-8).reverse();
  return `<article class="card card-pad bullpen-card">
    <div class="card-head"><div><p class="eyebrow">Bullpen command</p><h3>Intent → execution</h3><p>Plot the catcher's target and where the pitch actually finished. Each saved pitch updates the generated command score.</p></div><span class="bullpen-score" aria-label="Bullpen command score">${entries.length ? summary.score : "—"}<small>/100</small></span></div>
    <section class="bullpen-metrics"><div><span>Charted</span><strong>${entries.length}</strong></div><div><span>Within target ring</span><strong>${entries.length ? `${summary.targetRate}%` : "—"}</strong></div><div><span>In strike zone</span><strong>${entries.length ? `${summary.strikeRate}%` : "—"}</strong></div><div><span>Average miss</span><strong>${esc(summary.miss)}</strong></div></section>
    <div class="bullpen-charts">${bullpenPlot("target", entries, draft)}${bullpenPlot("actual", entries, draft)}</div>
    <form id="bullpen-pitch-form" class="bullpen-entry-form" data-date="${date}">
      <div class="field"><label>Pitch</label><select name="pitchType" data-bullpen-draft>${Object.entries(BULLPEN_PITCH_TYPES).map(([value, label]) => `<option value="${value}" ${draft.pitchType === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
      <div class="field"><label>Result</label><select name="result" data-bullpen-draft>${Object.entries(BULLPEN_RESULTS).map(([value, label]) => `<option value="${value}" ${draft.result === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
      <div class="field"><label>Velocity (optional)</label><input name="velocity" data-bullpen-draft type="number" min="0" max="120" step="0.1" value="${esc(draft.velocity)}" placeholder="mph"></div>
      <div class="field bullpen-note"><label>Note (optional)</label><input name="notes" data-bullpen-draft maxlength="120" value="${esc(draft.notes)}" placeholder="Count, cue or miss context"></div>
      <div class="bullpen-entry-actions"><button class="btn btn-dark" ${draft.target && draft.actual ? "" : "disabled"}>Save pitch</button><button type="button" class="btn btn-outline" data-action="reset-bullpen-draft">Clear points</button>${entries.length ? `<button type="button" class="text-button danger-text" data-action="delete-bullpen-pitch" data-pitch="${esc(entries.at(-1).id)}">Undo last</button>` : ""}</div>
    </form>
    ${recent.length ? `<div class="bullpen-pitch-strip">${recent.map((entry, index) => `<div><span>${entries.length - index}</span><strong>${esc(BULLPEN_PITCH_TYPES[entry.pitchType] || "Pitch")}</strong><small>${bullpenPitchScore(entry)} · ${esc(BULLPEN_RESULTS[entry.result] || "No result")}${entry.velocity ? ` · ${esc(entry.velocity)} mph` : ""}</small><button type="button" data-action="delete-bullpen-pitch" data-pitch="${esc(entry.id)}" aria-label="Delete pitch ${entries.length - index}">×</button></div>`).join("")}</div>` : ""}
    <p class="fineprint"><strong>Score definition:</strong> 80% target proximity and 20% whether the actual location matched the intended in-zone/out-of-zone decision. The visible target ring is the 10-point tolerance. Locations are manually plotted, not measured by ball-tracking hardware.</p>
  </article>`;
}

function renderPostForm(date, post = null, progress = null) {
  const velocityType = post?.velocityType ?? suggestedVelocityPBType();
  const pulse = state.pulseImports?.[date] || {};
  const skippedCount = Number(progress?.skipped ?? Object.keys(state.skippedTasks?.[date] || {}).length);
  if (post && state.editingPost !== date) {
    const pbNotice = post.pbUpdates?.length ? `<div class="alert success" style="margin-top:14px"><strong>New personal best</strong>${esc(pbUpdateMessage(post.pbUpdates))}. Future percentage-based loads have been recalculated.</div>` : "";
    return `<article class="card card-pad"><div class="card-head"><div><h3>Session checked out</h3><p>${esc(post.completedAt || "Saved")}${post.skippedTaskCount ? ` · ${esc(post.skippedTaskCount)} skipped` : ""}</p></div><span class="status green">Complete</span></div><div class="grid three"><div class="focus-box"><span>Session load</span><strong>${esc(post.srpe)} sRPE</strong></div><div class="focus-box"><span>Throws</span><strong>${esc(post.totalThrows || 0)} total · ${esc(post.highThrows || 0)} high</strong></div><div class="focus-box"><span>Post soreness</span><strong>Shoulder ${esc(post.postShoulder)}/10 · Elbow ${esc(post.postElbow)}/10</strong></div></div>${pbNotice}<button class="btn btn-outline" style="margin-top:15px" data-action="edit-post">Edit check-out</button></article>`;
  }
  return `
    <article class="card gate" id="post-card">
      <div class="gate-icon">✓</div><h3>Plan resolved—check out</h3><p>Record what actually happened.${skippedCount ? ` ${skippedCount} task${skippedCount === 1 ? " was" : "s were"} skipped and will remain separate from completed work.` : ""} PULSE fields are optional and remain separate from the manual workload estimate.</p>
      <form id="post-form" class="form-grid" data-date="${date}">
        <div class="field"><label for="duration">Duration</label><input id="duration" name="duration" type="number" min="1" max="360" step="1" value="${esc(post?.duration ?? 75)}" required><small>Minutes</small></div>
        ${rangeField("rpe", "Session RPE", post?.rpe ?? 6, 1, 10, "1 very easy · 10 maximal")}
        <div class="field"><label for="lowThrows">Low-intent throws</label><input id="lowThrows" name="lowThrows" type="number" min="0" step="1" value="${esc(post?.lowThrows ?? 0)}"></div>
        <div class="field"><label for="moderateThrows">Moderate throws</label><input id="moderateThrows" name="moderateThrows" type="number" min="0" step="1" value="${esc(post?.moderateThrows ?? 0)}"></div>
        <div class="field"><label for="highThrows">High-effort throws</label><input id="highThrows" name="highThrows" type="number" min="0" step="1" value="${esc(post?.highThrows ?? pulse.highThrows ?? 0)}"><small>PULSE defines these from torque history; use its value when available</small></div>
        <div class="field"><label for="gamePitches">Game pitches</label><input id="gamePitches" name="gamePitches" type="number" min="0" step="1" value="${esc(post?.gamePitches ?? 0)}"></div>
        <div class="form-divider"><strong>Velocity result</strong><span>A new value only updates the matching PB when it is higher.</span></div>
        <div class="field"><label for="velocityType">Velocity category</label><select id="velocityType" name="velocityType"><option value="" ${velocityType === "" ? "selected" : ""}>Do not compare to a PB</option><option value="pulldown" ${velocityType === "pulldown" ? "selected" : ""}>Pulldown velocity</option><option value="gameFastball" ${velocityType === "gameFastball" ? "selected" : ""}>Game fastball velocity</option></select></div>
        <div class="field"><label for="bestVelo">Best velocity</label><input id="bestVelo" name="bestVelo" type="number" min="0" max="120" step="0.1" value="${esc(post?.bestVelo ?? "")}" placeholder="mph"></div>
        <div class="field"><label for="top5Velo">Best-five average</label><input id="top5Velo" name="top5Velo" type="number" min="0" max="120" step="0.1" value="${esc(post?.top5Velo ?? "")}" placeholder="mph"></div>
        <div class="form-divider"><strong>Strength result</strong><span>Optional. A working set calculates an estimated 1RM using reps and RPE; a tested max uses the entered load directly.</span></div>
        <div class="field"><label for="pbLift">Lift</label><select id="pbLift" name="pbLift"><option value="">No lift result</option>${Object.entries(LIFT_PB_LABELS).map(([key, label]) => `<option value="${key}" ${post?.pbLift === key ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></div>
        <div class="field"><label for="liftResultType">Result type</label><select id="liftResultType" name="liftResultType"><option value="estimated" ${post?.liftResultType !== "tested" ? "selected" : ""}>Working set → estimate 1RM</option><option value="tested" ${post?.liftResultType === "tested" ? "selected" : ""}>Tested 1RM</option></select></div>
        <div class="field"><label for="bestSetWeight">Best-set load</label><input id="bestSetWeight" name="bestSetWeight" type="number" min="0" step="0.5" value="${esc(post?.bestSetWeight ?? "")}" placeholder="kg"></div>
        <div class="field"><label for="bestSetReps">Completed reps</label><input id="bestSetReps" name="bestSetReps" type="number" min="1" max="20" step="1" value="${esc(post?.bestSetReps ?? "")}" placeholder="Required for estimate"></div>
        <div class="field"><label for="bestSetRpe">Set RPE</label><input id="bestSetRpe" name="bestSetRpe" type="number" min="1" max="10" step="0.5" value="${esc(post?.bestSetRpe ?? "")}" placeholder="Required for estimate"></div>
        <div class="form-divider"><strong>PULSE sensor result</strong><span>${pulse.source ? "Prefilled from a previously imported record. Review before saving." : "Optional. Open live PULSE DASH from Integrations, then enter the official sensor values here."}</span></div>
        <div class="field"><label for="pulseTotalThrows">PULSE total throws</label><input id="pulseTotalThrows" name="pulseTotalThrows" type="number" min="0" step="1" value="${esc(post?.pulseTotalThrows ?? pulse.totalThrows ?? "")}" placeholder="Optional sensor value"></div>
        <div class="field"><label for="pulseWorkload">PULSE 1-day workload</label><input id="pulseWorkload" name="pulseWorkload" type="number" min="0" step="0.1" value="${esc(post?.pulseWorkload ?? pulse.pulseWorkload ?? "")}" placeholder="Optional sensor value"></div>
        <div class="field"><label for="acRatio">PULSE A:C ratio</label><input id="acRatio" name="acRatio" type="number" min="0" step="0.01" value="${esc(post?.acRatio ?? pulse.acRatio ?? "")}" placeholder="Optional sensor value"></div>
        <div class="field"><label for="pulseArmSpeed">PULSE arm speed</label><input id="pulseArmSpeed" name="pulseArmSpeed" type="number" min="0" step="0.1" value="${esc(post?.pulseArmSpeed ?? pulse.pulseArmSpeed ?? "")}" placeholder="Optional sensor value"></div>
        <div class="field"><label for="pulseTorque">PULSE torque</label><input id="pulseTorque" name="pulseTorque" type="number" min="0" step="0.1" value="${esc(post?.pulseTorque ?? pulse.pulseTorque ?? "")}" placeholder="Optional sensor value"></div>
        <div class="field"><label for="pulseBallVelocity">PULSE ball velocity</label><input id="pulseBallVelocity" name="pulseBallVelocity" type="number" min="0" max="120" step="0.1" value="${esc(post?.pulseBallVelocity ?? pulse.pulseBallVelocity ?? "")}" placeholder="mph"></div>
        ${rangeField("postShoulder", "Post-session shoulder", post?.postShoulder ?? 0, 0, 10, "0 none · 10 severe")}
        ${rangeField("postElbow", "Post-session elbow", post?.postElbow ?? 0, 0, 10, "0 none · 10 severe")}
        <div class="field full"><label for="postNotes">Session notes</label><textarea id="postNotes" name="notes" placeholder="Command, velocity, fatigue, changes, coach notes…">${esc(post?.notes || "")}</textarea></div>
        <div class="form-actions"><button class="btn btn-dark" type="submit">Save check-out</button></div>
      </form>
    </article>
  `;
}

function renderSessionPage() {
  const week = selectedWeekPlan();
  const date = selectedDate();
  const pre = state.pre[date];
  const session = getSession(week, state.selectedDay);
  const progress = completedForDate(date, session);
  const percent = progress.total ? Math.round(progress.count / progress.total * 100) : 0;
  const allResolved = progress.total > 0 && progress.count === progress.total;
  const post = state.post[date];
  return `
    <section class="page-head session-page-head">
      <div><p class="eyebrow">Week ${week.week} · ${formatDate(addDays(week.start, state.selectedDay), { weekday: "long", day: "numeric", month: "long" })}</p><h2>${esc(session.title)}</h2><p>${esc(session.description)}</p></div>
      <div class="annual-controls"><button class="btn btn-outline" data-action="previous-week">← Week</button><button class="btn btn-outline" data-action="next-week">Week →</button></div>
    </section>
    ${renderDayTabs(week)}
    ${!pre ? renderPreForm(date) : `
      <div class="session-layout">
        <div>
          <div class="session-status-wrap">${riskAlert(pre)}</div>
          ${renderReadinessOverride(pre, date)}
          <section class="session-task-stack" aria-label="Today’s workout stages">${renderTasks(session, date)}</section>
          ${sessionHasBullpenChart(session) ? renderBullpenChart(date) : ""}
          ${allResolved ? renderPostForm(date, post, progress) : `<article class="card gate"><div class="gate-icon">🔒</div><h3>Post-session check-out locked</h3><p>Complete or skip each assigned task first. Skipped work stays separate from completed work and requires a recorded reason.</p></article>`}
          <section class="session-supporting-context" aria-label="Supporting session context">${renderAdjustmentSummary(pre)}${renderSimilarSessionComparison(date, session)}</section>
        </div>
        <aside class="sticky-panel">
          <article class="card readiness-card ${pre.risk}"><div class="readiness-score"><div class="score-orb">${pre.score}</div><div><span class="status ${pre.risk}">${pre.manualOverride?.active ? "manual 100%" : pre.planLevel || pre.risk}</span><p>Pitching OS planning score · not medical clearance</p></div></div><p class="readiness-scope">Applies to throwing, plyos, gym, speed and conditioning. Warm-up, arm care, fuel and recovery remain.</p></article>
          <article class="card card-pad"><div class="card-head"><div><h3>Session progress</h3><p>${progress.count} of ${progress.total} resolved${progress.skipped ? ` · ${progress.skipped} skipped` : ""}</p></div><strong>${percent}%</strong></div><div class="session-progress"><span style="width:${percent}%"></span></div><div class="session-stat"><span>${esc(session.duration)}</span><span>${esc(session.stress)} stress</span></div></article>
          <article class="card card-pad"><div class="card-head"><div><h3>Today's guardrails</h3></div></div><div class="mini-list"><div class="mini-row"><span class="mini-icon">1</span><div><strong>No pain progression</strong><p>Stop if symptoms rise or mechanics change.</p></div></div><div class="mini-row"><span class="mini-icon">2</span><div><strong>Quality over volume</strong><p>Rest enough to preserve the assigned intent.</p></div></div><div class="mini-row"><span class="mini-icon">3</span><div><strong>Log actual work</strong><p>Use PULSE values when available.</p></div></div></div></article>
          <button class="btn btn-outline" data-action="redo-pre">Redo health check-in</button>
        </aside>
      </div>
    `}
  `;
}

function renderTaskModal(item) {
  const adaptation = item.adapted && item.adaptationNote ? `<div class="detail-block adaptation-detail"><span>Readiness adjustment</span><p>${esc(item.adaptationNote)}</p></div>` : "";
  return `<div class="modal-backdrop" data-action="close-modal"><article class="modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title" data-modal><header class="modal-head"><div><h2 id="task-modal-title">${esc(item.name)}</h2><p>${esc(item.prescription)}</p></div><button class="modal-close" data-action="close-modal" aria-label="Close">×</button></header><div class="modal-body">${adaptation}<div class="detail-block"><span>Why it is here</span><p>${esc(item.cue)}</p></div><div class="detail-block"><span>Setup</span><p>${esc(item.setup || "Follow the session setup and use appropriate space and equipment.")}</p></div><div class="detail-block"><span>Execution</span><p>${esc(item.execution || "Use controlled, high-quality repetitions.")}</p></div><div class="detail-block"><span>Rest</span><p>${esc(item.rest || "Rest enough to preserve quality.")}</p></div><div class="detail-block"><span>Stop rule</span><p>${esc(item.stop || "Stop for pain or loss of movement quality.")}</p></div></div></article></div>`;
}

function renderTaskSkipModal(item, date) {
  return `<div class="modal-backdrop" data-action="close-modal"><article class="modal skip-modal" role="dialog" aria-modal="true" aria-labelledby="skip-modal-title" data-modal><header class="modal-head"><div><p class="eyebrow">Daily plan</p><h2 id="skip-modal-title">Skip ${esc(item.name)}?</h2><p>Skipping resolves this task without recording it as completed.</p></div><button class="modal-close" data-action="close-modal" aria-label="Close">×</button></header><div class="modal-body"><form id="task-skip-form" class="form-grid" data-date="${esc(date)}" data-task="${esc(item.id)}"><div class="field full"><label for="taskSkipReason">Reason</label><select id="taskSkipReason" name="reason" required><option value="">Select a reason…</option><option value="Readiness-adjusted omission">Readiness-adjusted omission</option><option value="Pain or symptom response">Pain or symptom response</option><option value="Coach or clinician direction">Coach or clinician direction</option><option value="Equipment unavailable">Equipment unavailable</option><option value="Time constraint">Time constraint</option><option value="Other recorded reason">Other</option></select></div><div class="field full"><label for="taskSkipNotes">Optional note</label><textarea id="taskSkipNotes" name="notes" maxlength="240" placeholder="Add useful context for your session history."></textarea></div><p class="fineprint field full"><strong>What this means:</strong> the task will count as resolved for check-out, stay labelled Skipped, and sync with your account. It is not recorded as completed and does not add workload.</p><div class="form-actions"><button class="btn btn-outline" type="button" data-action="close-modal">Cancel</button><button class="btn btn-dark" type="submit">Skip task</button></div></form></div></article></div>`;
}

function renderAnnualPage() {
  const week = selectedWeekPlan();
  const phase = week.phase;
  const annualWeeks = annualWeeksForState();
  return `
    <section class="page-head">
      <div><p class="eyebrow">13 July 2026 – 11 July 2027</p><h2>Your date-aligned 52-week map.</h2><p>Official FNCBA dates, the athlete-provided Coomera opener and later GBL planning dates remain clearly separated.</p></div>
      <div class="annual-controls"><select class="select" data-action="week-select">${annualWeeks.map((item) => `<option value="${item.week}" ${item.week === week.week ? "selected" : ""}>Week ${item.week} · ${esc(item.phase.name)}</option>`).join("")}</select><button class="btn btn-dark" data-action="nav" data-page="session">Open week</button></div>
    </section>
    <section class="season-calendar-grid">${SEASON_CALENDAR.map((item) => `<article class="card season-calendar-card"><div class="season-calendar-head"><span class="schedule-badge ${item.tone}">${esc(item.status)}</span><strong>${esc(item.dates)}</strong></div><h3>${esc(item.name)}</h3><p>${esc(item.detail)}</p><a href="${esc(item.href)}" target="_blank" rel="noreferrer">Open source ↗</a></article>`).join("")}</section>
    <section class="phase-band">${PHASES.map((item) => `<button class="phase-segment ${item.id === phase.id ? "active" : ""}" data-action="select-week" data-week="${item.weeks[0]}"><span>${item.weeks[0] === item.weeks[1] ? `Week ${item.weeks[0]}` : `Weeks ${item.weeks[0]}–${item.weeks[1]}`}</span><strong>${esc(item.name)}</strong></button>`).join("")}</section>
    <article class="card week-card" style="border-left-color:${phase.color}">
      <div class="week-card-head"><div><p class="eyebrow">Week ${week.week} · ${formatDateRange(week.start, week.end)}</p><h3>${esc(week.focus)}</h3><p>${esc(phase.summary)}</p></div><span class="status ${phaseStatusTone(phase.id)}">${esc(phase.name)}</span></div>
      <div class="competition-line"><span class="schedule-badge ${esc(week.scheduleTone)}">${esc(week.scheduleStatus)}</span><strong>${esc(week.competition)}</strong></div>
      <div class="week-focus-grid"><div class="focus-box"><span>Primary strength</span><strong>${esc(week.mondayLift)}</strong></div><div class="focus-box"><span>Throwing emphasis</span><strong>${esc(week.throwing)}</strong></div><div class="focus-box"><span>Recovery rule</span><strong>${esc(week.recovery)}</strong></div><div class="focus-box"><span>Weekly rhythm</span><strong>${esc(weeklyRhythmText(week.phase.id))}</strong></div></div>
    </article>
    <details class="card disclosure-card quiet-disclosure">
      <summary><span><strong>Browse all 52 weeks</strong><small>Select a row to inspect that week</small></span><span>Show</span></summary>
      <div class="disclosure-body"><div class="table-wrap"><table><thead><tr><th>Week</th><th>Dates</th><th>Phase</th><th>Competition</th><th>Objective</th><th>Primary lift</th><th>Throwing</th></tr></thead><tbody>${annualWeeks.map((item) => `<tr class="selectable ${item.week === week.week ? "current" : ""}" data-action="select-week" data-week="${item.week}"><td><strong>${item.week}</strong></td><td>${formatDateRange(item.start, item.end)}</td><td>${esc(item.phase.name)}</td><td>${esc(item.competition)}</td><td>${esc(item.focus)}</td><td>${esc(item.mondayLift)}</td><td>${esc(item.throwing)}</td></tr>`).join("")}</tbody></table></div></div>
    </details>
    <p class="fineprint annual-fineprint"><strong>Date status:</strong> FNCBA dates marked confirmed come from the published draw. Friday 2 October is labelled athlete-provided because it comes from your Coomera Cubs schedule. Later GBL dates stay labelled planning until the relevant fixture is published.</p>
  `;
}

function allLoggedDays() {
  const dates = [...new Set([...Object.keys(state.pre), ...Object.keys(state.post)])].sort();
  return dates.map((date) => ({ date, pre: state.pre[date] || null, post: state.post[date] || null }));
}

function ouraTrendDays() {
  const dates = [...new Set([...Object.keys(state.healthPrefill || {}), ...Object.keys(state.pre || {})])].sort();
  return dates.map((date) => {
    const imported = state.healthPrefill?.[date]?.sources?.oura?.data || {};
    const pre = state.pre?.[date] || {};
    return {
      date,
      readiness: imported.readinessScore ?? pre.ouraReadinessScore,
      sleep: imported.sleepScore ?? pre.sleepScore,
      activity: imported.activityScore ?? pre.ouraActivityScore,
      stress: imported.stressHighMinutes ?? pre.ouraStressHighMinutes,
      recovery: imported.recoveryHighMinutes ?? pre.ouraRecoveryHighMinutes,
      spo2: imported.spo2Average ?? pre.ouraSpO2,
      hrv: imported.hrvMs ?? pre.hrvMs,
      restingHeartRate: imported.restingHeartRate ?? pre.restingHeartRate
    };
  });
}

function lineChart(data, getter, color, label) {
  const points = data.map((item, index) => ({ value: Number(getter(item)), label: formatDate(item.date, { day: "numeric", month: "short" }), index })).filter((item) => Number.isFinite(item.value) && item.value > 0);
  if (!points.length) return `<div class="chart-empty"><div><strong>No ${esc(label.toLowerCase())} data yet</strong><br>Values appear after daily check-ins and check-outs.</div></div>`;
  const width = 640, height = 190, left = 34, right = 18, top = 18, bottom = 32;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const pad = Math.max((max - min) * .2, max * .05, 1);
  const lo = Math.max(0, min - pad), hi = max + pad;
  const x = (i) => left + (i / Math.max(points.length - 1, 1)) * (width - left - right);
  const y = (value) => top + (1 - (value - lo) / Math.max(hi - lo, 1)) * (height - top - bottom);
  const path = points.map((point, i) => `${i ? "L" : "M"}${x(i)},${y(point.value)}`).join(" ");
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)} trend"><line class="chart-axis" x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}"/><path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${points.map((point, i) => `<circle class="chart-point" cx="${x(i)}" cy="${y(point.value)}" r="4" stroke="${color}" stroke-width="3"><title>${point.label}: ${point.value}</title></circle>`).join("")}<text x="${left}" y="${height-8}" font-size="10">${points[0].label}</text><text x="${width-right}" y="${height-8}" text-anchor="end" font-size="10">${points.at(-1).label}</text></svg></div>`;
}

function renderAnalyticsPage() {
  const entries = allLoggedDays();
  const ouraEntries = ouraTrendDays();
  const posts = entries.filter((item) => item.post);
  const totalThrows = posts.reduce((sum, item) => sum + Number(item.post.totalThrows || 0), 0);
  const totalHigh = posts.reduce((sum, item) => sum + Number(item.post.highThrows || 0), 0);
  const avgReadinessValues = entries.filter((item) => item.pre).map((item) => Number(item.pre.score));
  const avgReadiness = avgReadinessValues.length ? Math.round(avgReadinessValues.reduce((a, b) => a + b, 0) / avgReadinessValues.length) : 0;
  const avgRpe = posts.length ? round(posts.reduce((sum, item) => sum + Number(item.post.rpe || 0), 0) / posts.length, 1) : 0;
  return `
    <section class="page-head"><div><p class="eyebrow">Logged, not guessed</p><h2>See the pattern.</h2><p>PULSE fields show only values you enter from the sensor. Session-RPE and the manual load index are clearly labelled estimates.</p></div><button class="btn btn-outline" data-action="export">Export data</button></section>
    ${renderWeeklyReviewCard(selectedWeekPlan())}
    <details class="card disclosure-card quiet-disclosure data-legend"><summary><span><strong>How to read the data</strong><small>Every number has a source</small></span><span>Show</span></summary><div class="disclosure-body"><div class="source-row">${dataSourceTag("Sensor / imported", "sensor")}${dataSourceTag("Athlete confirmed", "manual")}${dataSourceTag("Calculated estimate", "calculated")}${dataSourceTag("Scheduled plan", "planned")}</div><p class="fineprint">Sensor labels identify imported values, not guaranteed accuracy. Calculated labels are transparent arithmetic or planning rules. Missing data remains blank.</p></div></details>
    <section class="grid metrics">
      <article class="card metric good"><span class="metric-label">Average plan score</span><div class="metric-value">${avgReadiness || "—"}</div><div class="metric-detail">Pitching OS · ${avgReadinessValues.length} check-ins</div></article>
      <article class="card metric blue"><span class="metric-label">Total throws</span><div class="metric-value">${totalThrows || "—"}</div><div class="metric-detail">${totalHigh} high-effort logged</div></article>
      <article class="card metric warn"><span class="metric-label">Average session RPE</span><div class="metric-value">${avgRpe || "—"}</div><div class="metric-detail">Across ${posts.length} sessions</div></article>
      <article class="card metric accent"><span class="metric-label">Sessions</span><div class="metric-value">${posts.length}</div><div class="metric-detail">Completed check-outs</div></article>
    </section>
    <section class="grid three" style="margin-bottom:18px">
      <article class="card card-pad pb-card"><span>Trap bar training max</span><strong>${state.pbs.lifts.trapBarDeadlift.value || "—"} kg</strong><small>${state.pbs.lifts.trapBarDeadlift.kind === "estimated" ? "Estimated 1RM from a logged set" : "Tested or manually entered PB"} · percentages recalculate from this value</small></article>
      <article class="card card-pad pb-card"><span>Pulldown PB</span><strong>${state.pbs.velocity.pulldown.value || "—"}${state.pbs.velocity.pulldown.value ? " mph" : ""}</strong><small>Updated from pulldown check-outs</small></article>
      <article class="card card-pad pb-card"><span>Game fastball PB</span><strong>${state.pbs.velocity.gameFastball.value || "—"}${state.pbs.velocity.gameFastball.value ? " mph" : ""}</strong><small>Updated from game check-outs</small></article>
    </section>
    <section class="grid two">
      <article class="card card-pad"><div class="card-head"><div><h3>Plan score trend</h3><p>Pitching OS questionnaire and available wearable inputs</p></div></div>${lineChart(entries.filter((item) => item.pre), (item) => item.pre.score, "var(--blue)", "Pitching OS plan score")}<p class="fineprint">This 0–100 score is an app planning heuristic. It is not a validated readiness, fatigue or injury-risk measure.</p></article>
      <article class="card card-pad"><div class="card-head"><div><h3>Best velocity</h3><p>Pulldown or game value entered at check-out</p></div></div>${lineChart(posts, (item) => item.post.bestVelo, "var(--teal)", "Best velocity")}</article>
      <article class="card card-pad"><div class="card-head"><div><h3>Bodyweight</h3><p>Morning check-in trend</p></div></div>${lineChart(entries.filter((item) => item.pre), (item) => item.pre.bodyweight, "var(--teal)", "Bodyweight")}</article>
      <article class="card card-pad"><div class="card-head"><div><h3>Session RPE</h3><p>Your post-session rating</p></div></div>${lineChart(posts, (item) => item.post.rpe, "var(--blue)", "Session RPE")}</article>
    </section>
    <details class="card disclosure-card quiet-disclosure"><summary><span><strong>PULSE sensor trends</strong><small>Only sensor values you enter or import</small></span><span>Show</span></summary><div class="disclosure-body grid two">
      <article><div class="card-head"><div><h3>1-day workload</h3><p>Blank days are not estimated</p></div></div>${lineChart(posts, (item) => item.post.pulseWorkload, "var(--blue)", "PULSE workload")}</article>
      <article><div class="card-head"><div><h3>Arm speed</h3><p>PULSE field only</p></div></div>${lineChart(posts, (item) => item.post.pulseArmSpeed, "var(--teal)", "PULSE arm speed")}</article>
      <article><div class="card-head"><div><h3>Torque</h3><p>PULSE field only</p></div></div>${lineChart(posts, (item) => item.post.pulseTorque, "var(--blue)", "PULSE torque")}</article>
      <p class="fineprint"><strong>Connection status:</strong> Pitching OS links to the official PULSE dashboard but does not have a published Driveline personal API connection. A PULSE value appears here only after it is entered or imported into this app.</p>
    </div></details>
    <details class="card disclosure-card quiet-disclosure"><summary><span><strong>Oura recovery trends</strong><small>Values returned by Oura Cloud API v2</small></span><span>Show</span></summary><div class="disclosure-body">
      <p class="fineprint disclosure-intro"><strong>Source:</strong> these charts use Oura fields only. Missing or delayed ring-sync days remain blank; Pitching OS does not fill them with estimates.</p>
      <section class="grid two">
        <article><div class="card-head"><div><h3>Oura readiness</h3><p>Oura’s daily score</p></div></div>${lineChart(ouraEntries, (item) => item.readiness, "var(--blue)", "Oura readiness")}</article>
        <article><div class="card-head"><div><h3>Oura sleep</h3><p>Oura’s daily score</p></div></div>${lineChart(ouraEntries, (item) => item.sleep, "var(--teal)", "Oura sleep")}</article>
        <article><div class="card-head"><div><h3>Oura activity</h3><p>Oura’s daily score</p></div></div>${lineChart(ouraEntries, (item) => item.activity, "var(--blue)", "Oura activity")}</article>
        <article><div class="card-head"><div><h3>High-stress minutes</h3><p>Oura daytime stress field</p></div></div>${lineChart(ouraEntries, (item) => item.stress, "var(--teal)", "Oura high-stress minutes")}</article>
        <article><div class="card-head"><div><h3>HRV</h3><p>Nightly average returned by Oura</p></div></div>${lineChart(ouraEntries, (item) => item.hrv, "var(--blue)", "Oura HRV")}</article>
        <article><div class="card-head"><div><h3>Blood oxygen</h3><p>Average SpO₂ when Oura returns it</p></div></div>${lineChart(ouraEntries, (item) => item.spo2, "var(--teal)", "Oura blood oxygen")}</article>
      </section>
    </div></details>
    <details class="card disclosure-card quiet-disclosure"><summary><span><strong>Recent sessions</strong><small>Latest 12 check-outs</small></span><span>Show</span></summary><div class="disclosure-body">${posts.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>RPE</th><th>sRPE</th><th>Throws</th><th>High effort</th><th>PULSE load</th><th>Best velo</th><th>PB</th></tr></thead><tbody>${posts.slice(-12).reverse().map((item) => `<tr><td>${formatDate(item.date, { day: "numeric", month: "short", year: "numeric" })}</td><td>${esc(item.post.rpe)}</td><td>${esc(item.post.srpe)}</td><td>${esc(item.post.totalThrows)}</td><td>${esc(item.post.highThrows)}</td><td>${esc(item.post.pulseWorkload || "—")}</td><td>${esc(item.post.bestVelo || "—")}</td><td>${item.post.pbUpdates?.length ? `<span class="pb-badge">New PB</span>` : "—"}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty"><strong>No sessions logged yet</strong>Complete a daily pre-check, session and post-check to populate analytics.</div>`}</div></details>
  `;
}

function nutritionDate() {
  return /^\d{4}-\d{2}-\d{2}$/.test(state.nutrition?.selectedDate || "") ? state.nutrition.selectedDate : brisbaneToday();
}

function nutritionMeals(date = nutritionDate()) {
  return Array.isArray(state.nutrition?.meals?.[date]) ? state.nutrition.meals[date].filter((item) => !item.deletedAt) : [];
}

function nutritionTotals(date = nutritionDate()) {
  const meals = nutritionMeals(date);
  return meals.reduce((totals, meal) => ({
    calories: totals.calories + Number(meal.calories || 0),
    protein: totals.protein + Number(meal.protein || 0),
    carbs: totals.carbs + Number(meal.carbs || 0),
    fat: totals.fat + Number(meal.fat || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function nutritionProgress(label, value, target, unit, tone = "blue") {
  const percent = Number(target) > 0 ? clamp(Math.round(Number(value) / Number(target) * 100), 0, 130) : 0;
  return `<article class="card metric ${tone}"><span class="metric-label">${esc(label)}</span><div class="metric-value">${Math.round(Number(value))}${unit}</div><div class="nutrition-progress"><i style="width:${Math.min(percent, 100)}%"></i></div><div class="metric-detail">${Number(target) > 0 ? `${percent}% of ${esc(target)}${unit}` : "Set a target below"}</div></article>`;
}

function waterBottleTracker(date, water, target) {
  const logged = clamp(round(Number(water || 0), 2), 0, 20);
  const goal = clamp(round(Number(target || 0), 2), 0, 15);
  const rawPercent = goal > 0 ? Math.round(logged / goal * 100) : 0;
  const fillPercent = clamp(rawPercent, 0, 100);
  const fillY = round(311 - (238 * fillPercent / 100), 1);
  const remaining = goal > 0 ? Math.max(round(goal - logged, 2), 0) : 0;
  const over = goal > 0 ? Math.max(round(logged - goal, 2), 0) : 0;
  const complete = goal > 0 && logged >= goal;
  const clipId = `water-clip-${String(date).replace(/[^0-9]/g, "")}`;
  const gradientId = `water-gradient-${String(date).replace(/[^0-9]/g, "")}`;
  const status = !goal
    ? "Set a fluid target below to track progress"
    : complete
      ? `Target reached${over ? ` · ${over} L over` : ""}`
      : logged
        ? `${remaining} L to go`
        : `Start filling toward ${goal} L`;
  const events = Array.isArray(state.nutrition.hydrationEvents?.[date]) ? state.nutrition.hydrationEvents[date] : [];
  const undoable = [...events].reverse().find((item) => !item.undoneAt);
  const presets = [...new Set((state.nutrition.hydrationPresets || [0.5, 0.75]).map(Number).filter((value) => value > 0 && value <= 5))].slice(0, 4);
  const sweat = state.nutrition.sweatLoss?.[date] || {};
  const reminders = state.nutrition.reminders || {};
  const notificationState = typeof Notification === "undefined" ? "Unavailable in this browser" : Notification.permission === "granted" ? "Allowed on this device" : Notification.permission === "denied" ? "Blocked in device settings" : "Not enabled on this device";
  return `<article class="card water-tracker ${complete ? "complete" : ""}" data-water-fill="${fillPercent}">
    <form id="nutrition-water-form" class="water-tracker-grid">
      <div class="water-visual-wrap">
        <button class="water-bottle-button" name="litres" value="0.25" aria-label="Add 250 millilitres of water. Current total ${logged} litres.">
          <svg class="water-bottle-svg" viewBox="0 0 180 350" aria-hidden="true" focusable="false">
            <defs>
              <clipPath id="${clipId}"><path d="M70 47v16c0 9-12 12-20 25-8 13-12 27-12 44v158c0 22 11 32 31 32h42c20 0 31-10 31-32V132c0-17-4-31-12-44-8-13-20-16-20-25V47Z"/></clipPath>
              <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="water-stop-bright"/><stop offset="1" class="water-stop-deep"/></linearGradient>
            </defs>
            <g clip-path="url(#${clipId})" class="water-liquid" style="opacity:${fillPercent > 0 ? 1 : 0}">
              <rect x="34" y="${fillY}" width="112" height="${round(330 - fillY, 1)}" fill="url(#${gradientId})"/>
              <path class="water-wave water-wave-back" d="M-180 ${fillY} Q-135 ${fillY - 8} -90 ${fillY}T0 ${fillY}T90 ${fillY}T180 ${fillY}T270 ${fillY}T360 ${fillY}V340H-180Z"/>
              <path class="water-wave water-wave-front" d="M-180 ${fillY + 4} Q-135 ${fillY + 13} -90 ${fillY + 4}T0 ${fillY + 4}T90 ${fillY + 4}T180 ${fillY + 4}T270 ${fillY + 4}T360 ${fillY + 4}V340H-180Z"/>
              <circle class="water-bubble bubble-one" cx="68" cy="278" r="4"/><circle class="water-bubble bubble-two" cx="112" cy="245" r="3"/><circle class="water-bubble bubble-three" cx="91" cy="300" r="2.5"/>
            </g>
            <path class="water-bottle-shell" d="M70 47v16c0 9-12 12-20 25-8 13-12 27-12 44v158c0 22 11 32 31 32h42c20 0 31-10 31-32V132c0-17-4-31-12-44-8-13-20-16-20-25V47Z"/>
            <rect class="water-bottle-cap" x="65" y="22" width="50" height="29" rx="8"/>
            <path class="water-bottle-shine" d="M57 103c-7 12-9 24-9 42v116"/>
            ${complete ? `<g class="water-target-check"><circle cx="90" cy="178" r="29"/><path d="m76 178 10 10 19-22"/></g>` : ""}
          </svg>
          <span class="water-tap-hint">Tap bottle · +250 mL</span>
        </button>
      </div>
      <div class="water-panel">
        <div><p class="eyebrow">Hydration</p><h3>Fill your bottle.</h3><p>Log what you actually drink. The moving water follows today’s saved total on every signed-in device.</p></div>
        <div class="water-readout" role="status" aria-live="polite"><strong>${logged} L</strong><span>${goal ? `of ${goal} L · ${rawPercent}%` : "No target set"}</span></div>
        <div class="water-progress-track" aria-hidden="true"><i style="width:${fillPercent}%"></i></div>
        <p class="water-status ${complete ? "complete" : ""}">${complete ? "✓ " : ""}${esc(status)}</p>
        <div class="water-buttons" aria-label="Adjust water total">
          <button name="litres" value="-0.25" aria-label="Remove 250 millilitres">−250 mL</button>
          <button name="litres" value="0.25">+250 mL</button>
          ${presets.map((value) => `<button name="litres" value="${value}">+${Math.round(value * 1000)} mL</button>`).join("")}
          <button class="text-button danger-text water-reset" name="litres" value="reset">Reset today</button>
        </div>
        ${undoable ? `<button type="button" class="text-button water-undo" data-action="undo-water" data-date="${date}">Undo last change</button>` : ""}
        <p class="fineprint">This records fluid volume only. Your target should reflect your sports-dietitian plan and measured sweat losses rather than a generic formula.</p>
      </div>
    </form>
    <details class="water-tools"><summary>Hydration tools</summary><div class="water-tools-grid">
      <form id="nutrition-hydration-presets-form" class="form-grid"><div class="form-divider"><strong>Your bottle sizes</strong><span>Shown as quick-add buttons</span></div><div class="field"><label>First bottle (L)</label><input name="presetOne" type="number" min="0.1" max="5" step="0.05" value="${esc(presets[0] || 0.5)}" required></div><div class="field"><label>Second bottle (L)</label><input name="presetTwo" type="number" min="0.1" max="5" step="0.05" value="${esc(presets[1] || 0.75)}" required></div><div class="form-actions"><button class="btn btn-outline">Save bottle sizes</button></div></form>
      <form id="nutrition-sweat-form" class="form-grid" data-date="${date}"><div class="form-divider"><strong>Measured sweat-loss worksheet</strong><span>Field estimate, not a prescription</span></div><div class="field"><label>Bodyweight before (kg)</label><input name="preKg" type="number" min="35" max="250" step="0.1" value="${esc(sweat.preKg ?? "")}" required></div><div class="field"><label>Bodyweight after (kg)</label><input name="postKg" type="number" min="35" max="250" step="0.1" value="${esc(sweat.postKg ?? "")}" required></div><div class="field"><label>Fluid during (L)</label><input name="fluidLitres" type="number" min="0" max="10" step="0.05" value="${esc(sweat.fluidLitres ?? "")}" required></div><div class="field"><label>Urine during (L)</label><input name="urineLitres" type="number" min="0" max="5" step="0.05" value="${esc(sweat.urineLitres ?? 0)}"></div><div class="field"><label>Session duration (min)</label><input name="durationMinutes" type="number" min="10" max="600" step="1" value="${esc(sweat.durationMinutes ?? "")}" required></div>${Number(sweat.sweatRate) > 0 ? `<div class="field sweat-result"><span>Saved field estimate</span><strong>${esc(sweat.sweatLossLitres)} L · ${esc(sweat.sweatRate)} L/h</strong></div>` : ""}<div class="form-actions"><button class="btn btn-outline">Calculate and save</button></div><p class="fineprint full"><strong>Equation:</strong> pre-session kg − post-session kg + fluid consumed − urine, using the common field approximation that 1 kg body-mass change is about 1 L. Conditions, scale error and clothing moisture can change the result.</p></form>
      <form id="nutrition-reminders-form" class="form-grid"><div class="form-divider"><strong>Schedule-aware reminders</strong><span>${esc(notificationState)}</span></div><div class="field"><label>Reminder interval</label><select name="intervalMinutes"><option value="60" ${Number(reminders.intervalMinutes) === 60 ? "selected" : ""}>Every 60 minutes</option><option value="90" ${Number(reminders.intervalMinutes) === 90 ? "selected" : ""}>Every 90 minutes</option><option value="120" ${Number(reminders.intervalMinutes) === 120 ? "selected" : ""}>Every 120 minutes</option></select></div><div class="field"><label>Days</label><select name="trainingDaysOnly"><option value="yes" ${reminders.trainingDaysOnly !== false ? "selected" : ""}>Training/game days only</option><option value="no" ${reminders.trainingDaysOnly === false ? "selected" : ""}>Every day</option></select></div><div class="field"><label>Quiet time starts</label><input name="quietStart" type="time" value="${esc(reminders.quietStart || "21:00")}"></div><div class="field"><label>Quiet time ends</label><input name="quietEnd" type="time" value="${esc(reminders.quietEnd || "07:00")}"></div><div class="form-actions"><button class="btn btn-outline" data-enable-reminders="true">${reminders.enabled ? "Update reminders" : "Enable reminders"}</button></div><p class="fineprint full">Browser reminders run only while the installed web app or browser is allowed to operate. They stop after the logged target is reached and never create a medical hydration prescription.</p></form>
    </div></details>
  </article>`;
}

function recordHydrationChange(date, nextValue, label = "Water adjustment") {
  const previous = clamp(round(Number(state.nutrition.hydration?.[date] || 0), 2), 0, 20);
  const next = clamp(round(Number(nextValue || 0), 2), 0, 20);
  const now = new Date().toISOString();
  state.nutrition.hydration[date] = next;
  state.nutrition.hydrationEvents[date] = [...(state.nutrition.hydrationEvents?.[date] || []), {
    id: mediaId("water"), previous, next, delta: round(next - previous, 2), label, createdAt: now, updatedAt: now
  }].slice(-50);
}

function isQuietClock(now, start = "21:00", end = "07:00") {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (value) => {
    const [hours, mins] = String(value || "").split(":").map(Number);
    return Number.isFinite(hours) && Number.isFinite(mins) ? hours * 60 + mins : 0;
  };
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  return startMinutes === endMinutes ? false : startMinutes > endMinutes
    ? minutes >= startMinutes || minutes < endMinutes
    : minutes >= startMinutes && minutes < endMinutes;
}

function currentDateIsScheduledTrainingDay() {
  const current = todaySelection();
  const week = getWeekPlan(current.selectedWeek, state.pbs);
  return Number(plannedStressShape(week.phase.id)[current.selectedDay] || 0) > 0;
}

function checkHydrationReminder() {
  const settings = state.nutrition?.reminders || {};
  if (!settings.enabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (settings.trainingDaysOnly !== false && !currentDateIsScheduledTrainingDay()) return;
  const now = new Date();
  if (isQuietClock(now, settings.quietStart, settings.quietEnd)) return;
  const today = brisbaneToday();
  const logged = Number(state.nutrition.hydration?.[today] || 0);
  const target = Number(state.nutrition.targets?.fluid || 0);
  if (target > 0 && logged >= target) return;
  const last = Number(localStorage.getItem(HYDRATION_REMINDER_STORAGE) || 0);
  const interval = clamp(Number(settings.intervalMinutes || 90), 30, 240) * 60_000;
  if (!last) {
    localStorage.setItem(HYDRATION_REMINDER_STORAGE, String(now.getTime()));
    return;
  }
  if (now.getTime() - last < interval) return;
  new Notification("Hydration check", { body: target ? `${logged} L logged of your ${target} L target. Add only what you have actually drunk.` : "Log the fluid you have actually drunk." });
  localStorage.setItem(HYDRATION_REMINDER_STORAGE, String(now.getTime()));
}

function nutritionSourceLabel(source) {
  return ({
    photo_ai: "Photo estimate",
    text_ai: "Description estimate",
    official_menu: "Official brand/menu source",
    barcode: "Product label database",
    nutrition_label: "Nutrition label",
    ausnut: "AUSNUT food profile",
    measured: "Measured serving",
    manual: "Manual entry"
  })[source] || "Manual entry";
}

function nutritionSourceTone(source) {
  return ["nutrition_label", "measured", "barcode", "ausnut", "official_menu"].includes(source) ? "green" : ["photo_ai", "text_ai"].includes(source) ? "yellow" : "gray";
}

function nutritionDraftCard() {
  const draft = nutritionUi.draft;
  if (!draft) return "";
  const photo = draft.photoUrl ? `<img class="meal-draft-photo" src="${esc(draft.photoUrl)}" alt="Meal awaiting confirmation">` : "";
  const sourceNote = draft.source === "photo_ai"
    ? "The camera cannot know exact portion weight, hidden oil or recipe ingredients. Correct anything that looks wrong, then save."
    : draft.source === "text_ai"
      ? "This is an estimate from your description. Correct portions, ingredients and values before saving."
      : draft.source === "official_menu"
        ? "An exact official brand or menu source was found. Confirm the menu variant and amount eaten before saving."
    : draft.source === "barcode"
      ? "Values came from the product record. Check the package label and adjust for the amount you actually ate."
      : "Edit any field before saving.";
  return `<article class="card card-pad nutrition-draft">
    <div class="card-head"><div><p class="eyebrow">Review before it counts</p><h3>${draft.editing ? "Edit saved meal" : "Confirm this meal"}</h3><p>${esc(sourceNote)}</p></div><span class="status ${nutritionSourceTone(draft.source)}">${esc(nutritionSourceLabel(draft.source))}</span></div>
    <div class="nutrition-draft-layout">${photo}<form id="nutrition-confirm-form" class="form-grid">
      <input type="hidden" name="id" value="${esc(draft.id || "")}"><input type="hidden" name="photoId" value="${esc(draft.photoId || "")}"><input type="hidden" name="source" value="${esc(draft.source || "manual")}">
      <div class="field full"><label>Food / meal name</label><input name="name" value="${esc(draft.name || "")}" required></div>
      <div class="field"><label>Serving eaten</label><input name="serving" value="${esc(draft.serving || "")}" placeholder="e.g. 1 pack, 320 g, 1 bowl"></div>
      <div class="field"><label>Meal time</label><input name="loggedAt" type="time" value="${esc(draft.loggedAt || new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }))}"></div>
      <div class="field"><label>Confidence</label><select name="confidence"><option value="verified" ${draft.confidence === "verified" ? "selected" : ""}>Verified from label/weight</option><option value="high" ${draft.confidence === "high" ? "selected" : ""}>High estimate</option><option value="medium" ${draft.confidence === "medium" ? "selected" : ""}>Medium estimate</option><option value="low" ${draft.confidence === "low" ? "selected" : ""}>Low estimate</option></select></div>
      <div class="field"><label>Calories</label><input name="calories" type="number" min="0" max="5000" step="1" value="${esc(draft.calories ?? "")}" required></div>
      <div class="field"><label>Protein (g)</label><input name="protein" type="number" min="0" max="500" step="0.1" value="${esc(draft.protein ?? "")}" required></div>
      <div class="field"><label>Carbohydrate (g)</label><input name="carbs" type="number" min="0" max="800" step="0.1" value="${esc(draft.carbs ?? "")}" required></div>
      <div class="field"><label>Fat (g)</label><input name="fat" type="number" min="0" max="500" step="0.1" value="${esc(draft.fat ?? "")}" required></div>
      <div class="field full"><label>Notes</label><input name="notes" value="${esc(draft.notes || "")}" placeholder="Sauce, oil, portion correction, brand…"></div>
      ${draft.assumptions?.length ? `<div class="field full"><div class="alert warn"><strong>Estimate assumptions</strong>${draft.assumptions.map((item) => esc(item)).join(" · ")}</div></div>` : ""}
      ${draft.sourceUrl ? `<div class="field full"><a class="source-link" href="${esc(draft.sourceUrl)}" target="_blank" rel="noopener">Open the original nutrition source ↗</a></div>` : ""}
      <div class="form-actions"><button class="btn btn-dark" type="button" data-action="save-nutrition-draft">${draft.editing ? "Save changes" : "Add to today"}</button><button class="btn btn-outline" type="button" data-action="discard-nutrition-draft">Discard</button></div>
    </form></div>
  </article>`;
}

function nutritionWeekSeries(date = nutritionDate()) {
  const end = parseDate(date);
  return Array.from({ length: 7 }, (_, index) => {
    const day = isoDate(addDays(end, index - 6));
    const totals = nutritionTotals(day);
    return { date: day, calories: totals.calories, protein: totals.protein };
  });
}

function renderNutritionPage() {
  const date = nutritionDate();
  const meals = nutritionMeals(date);
  const totals = nutritionTotals(date);
  const targets = state.nutrition.targets;
  const water = Number(state.nutrition.hydration?.[date] || 0);
  const savedMeals = Array.isArray(state.nutrition.savedMeals) ? state.nutrition.savedMeals.filter((item) => !item.deletedAt) : [];
  const nutritionReady = accountAuth.signedIn || Boolean(cloudSync.key);
  const verifiedCount = meals.filter((meal) => ["verified", "high"].includes(meal.confidence) && !["photo_ai", "text_ai"].includes(meal.source)).length;
  const estimatedCount = meals.filter((meal) => ["photo_ai", "text_ai"].includes(meal.source)).length;
  const week = nutritionWeekSeries(date);
  const mealLogCard = `<article class="card card-pad meal-composer nutrition-photo-priority"><div class="card-head"><div><p class="eyebrow">Log a meal</p><h3>Tell it or show it.</h3><p>Type what you had, upload a photo, or take one now. You always review the result before it counts.</p></div><span class="status team">AI-assisted</span></div>
    <form id="nutrition-text-form" class="meal-description-form"><div class="field"><label>What did you have?</label><textarea name="description" rows="3" minlength="3" maxlength="700" placeholder="e.g. Grill'd Simply Grill'd burger and regular chips, or 200 g chicken with 1.5 cups rice and vegetables" required>${esc(nutritionUi.mealDescription)}</textarea><small>Include a brand, restaurant, exact menu item and portion when known. Named items trigger an official-source search first.</small></div><button class="btn btn-dark" ${nutritionReady && !nutritionUi.analyzingText ? "" : "disabled"}>${nutritionUi.analyzingText ? "Checking meal…" : "Analyse description"}</button></form>
    <div class="meal-or"><span>or use a photo</span></div>
    <div class="meal-photo-inline"><input id="nutrition-photo-notes" aria-label="Optional meal photo notes" placeholder="Optional: portion, brand, sauce or hidden ingredients"><div class="meal-photo-actions"><button type="button" class="btn btn-outline" data-action="choose-meal-photo" ${nutritionReady && !nutritionUi.analyzing ? "" : "disabled"}>${nutritionUi.analyzing ? "Analysing…" : "Choose Photo"}</button><button type="button" class="btn btn-outline" data-action="take-meal-photo" ${nutritionReady && !nutritionUi.analyzing ? "" : "disabled"}>Take Photo</button></div><input id="meal-photo-library" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/dng,image/x-adobe-dng,.heic,.heif,.dng" hidden ${nutritionReady && !nutritionUi.analyzing ? "" : "disabled"}><input id="meal-photo-camera" type="file" accept="image/*" capture="environment" hidden ${nutritionReady && !nutritionUi.analyzing ? "" : "disabled"}></div>
    ${nutritionUi.searchError ? `<div class="alert warn"><strong>Could not analyse description</strong>${esc(nutritionUi.searchError)}</div>` : ""}${nutritionUi.searchMessage ? `<div class="alert info" role="status" aria-live="polite"><strong>${nutritionUi.analyzingText ? "Working on it" : "Ready to review"}</strong>${esc(nutritionUi.searchMessage)}</div>` : ""}${nutritionUi.photoError ? `<div class="alert warn"><strong>Could not analyse photo</strong>${esc(nutritionUi.photoError)} <button type="button" class="text-button" data-action="choose-meal-photo">Try another photo</button></div>` : ""}${nutritionUi.photoMessage ? `<div class="alert info" role="status" aria-live="polite"><strong>${nutritionUi.analyzing ? "Working on it" : "Ready to review"}</strong>${esc(nutritionUi.photoMessage)}</div>` : ""}
    ${nutritionReady ? `<details class="inline-fineprint"><summary>Accuracy and photo privacy</summary><p class="fineprint">Exact named brand/menu items are only labelled verified when an official current source supports the item and serving. Otherwise the result stays an editable estimate. Photos are compressed, analysed once and deleted; only confirmed values enter encrypted autosave.</p></details>` : `<div class="alert info"><strong>Sign-in needed</strong>Reconnect your account, then retry.</div>`}
  </article>`;
  const foodSearchResults = nutritionUi.foodResults.length ? `<div class="food-search-results" aria-live="polite">${nutritionUi.foodResults.map((product, index) => {
    const values = product.perServing && Object.values(product.perServing).some((value) => value !== null) ? product.perServing : product.per100g;
    return `<button type="button" class="food-result" data-action="select-food-search-result" data-index="${index}"><span>${product.imageUrl ? `<img src="${esc(product.imageUrl)}" alt="">` : `<b>◇</b>`}</span><span><strong>${esc([product.brand, product.name].filter(Boolean).join(" · ") || "Unnamed product")}</strong><small>${esc(product.servingSize || (product.perServing ? "Per serving" : "Per 100 g"))} · ${values.calories ?? "—"} kcal · P ${values.protein ?? "—"} · C ${values.carbs ?? "—"} · F ${values.fat ?? "—"}</small></span><em>Use</em></button>`;
  }).join("")}</div>` : "";
  const foodSearchCard = `<article class="card card-pad nutrition-search-card"><div class="card-head"><div><p class="eyebrow">No photo?</p><h3>Search a packaged food</h3><p>Enter a brand and product, choose the match, then confirm the serving.</p></div></div><form id="nutrition-food-search-form" class="inline-log-form"><div class="field"><label>Brand or food</label><input name="query" value="${esc(nutritionUi.foodQuery)}" placeholder="Chobani Fit yoghurt" minlength="2" required></div><button class="btn btn-dark" ${nutritionReady && !nutritionUi.searchingFood ? "" : "disabled"}>${nutritionUi.searchingFood ? "Searching…" : "Search"}</button></form>${nutritionUi.searchError ? `<div class="alert warn"><strong>Search failed</strong>${esc(nutritionUi.searchError)} <button type="submit" form="nutrition-food-search-form" class="text-button">Retry</button></div>` : ""}${nutritionUi.searchMessage ? `<p class="search-feedback" aria-live="polite">${esc(nutritionUi.searchMessage)}</p>` : ""}${foodSearchResults}<details class="inline-fineprint"><summary>About food search data</summary><p class="fineprint">Results come from Open Food Facts community label records. Match the exact package and confirm its serving before saving.</p></details></article>`;
  return `
    <section class="page-head nutrition-page-head"><div><p class="eyebrow">Nutrition</p><h2>Log a meal.</h2><p>Photo or plain language first. Review once, then it is added to your day.</p></div><div class="nutrition-date-control"><button class="btn btn-outline" data-action="nutrition-date-shift" data-days="-1" aria-label="Previous day">←</button><input id="nutrition-date" type="date" aria-label="Nutrition log date" value="${esc(date)}"><button class="btn btn-outline" data-action="nutrition-date-shift" data-days="1" aria-label="Next day">→</button></div></section>
    ${mealLogCard}
    ${nutritionDraftCard()}
    ${savedMeals.length ? `<article class="card card-pad saved-meals"><div class="card-head"><div><p class="eyebrow">One tap</p><h3>Saved meals</h3><p>Reuse a meal, then edit today’s serving if it changed.</p></div></div><div class="saved-meal-list">${savedMeals.map((meal) => `<div class="saved-meal"><button type="button" data-action="log-saved-meal" data-saved-meal="${esc(meal.id)}"><strong>${esc(meal.name)}</strong><small>${Math.round(Number(meal.calories || 0))} kcal · P ${round(meal.protein, 1)} · ${esc(meal.serving || "saved serving")}</small></button><button type="button" class="text-button danger-text" data-action="delete-saved-meal" data-saved-meal="${esc(meal.id)}" aria-label="Delete saved meal ${esc(meal.name)}">×</button></div>`).join("")}</div></article>` : ""}
    <section class="grid metrics">
      ${nutritionProgress("Calories", totals.calories, targets.calories, " kcal", "accent")}
      ${nutritionProgress("Protein", totals.protein, targets.protein, " g", "good")}
      ${nutritionProgress("Carbohydrate", totals.carbs, targets.carbs, " g", "blue")}
      ${nutritionProgress("Water", water, targets.fluid, " L", "warn")}
    </section>
    ${waterBottleTracker(date, water, targets.fluid)}
    <details class="card disclosure-card quiet-disclosure"><summary><span><strong>Exact lookup and manual tools</strong><small>Packaged-food search, barcode, official menu lookup and measured entry</small></span><span>Show</span></summary><div class="disclosure-body">${foodSearchCard}<section class="nutrition-log-grid ${nutritionUi.draft ? "has-draft" : ""}">
      <article class="card card-pad nutrition-quick"><div class="card-head"><div><h3>Scan a packaged food</h3><p>Use the barcode and the package serving amount</p></div><span class="status green">Label data</span></div>
        <form id="nutrition-barcode-form" class="inline-log-form"><div class="field"><label>Barcode number</label><input name="barcode" inputmode="numeric" pattern="[0-9 ]{8,18}" placeholder="Enter or paste barcode" required></div><button class="btn btn-outline" ${nutritionReady && !nutritionUi.lookingUpBarcode ? "" : "disabled"}>${nutritionUi.lookingUpBarcode ? "Looking up…" : "Look up"}</button></form>
        <p class="fineprint"><strong>Accuracy:</strong> barcode records come from an external product database and may be incomplete or outdated. Check the package label and confirm the amount eaten.</p>
      </article>
      <article class="card card-pad nutrition-quick"><div class="card-head"><div><h3>Restaurant or food chain</h3><p>Looks for the chain's own published menu nutrition first</p></div><span class="status team">Official-source search</span></div>
        <form id="nutrition-restaurant-form" class="form-grid"><div class="field"><label>Restaurant / chain</label><input name="restaurant" placeholder="e.g. Grill'd" required></div><div class="field"><label>Menu item</label><input name="item" placeholder="e.g. Simply Grill'd" required></div><div class="form-actions"><button class="btn btn-outline" ${nutritionReady && !nutritionUi.lookingUpRestaurant ? "" : "disabled"}>${nutritionUi.lookingUpRestaurant ? "Checking official sources…" : "Find exact item"}</button></div></form>
        <p class="fineprint"><strong>Source rule:</strong> an item is labelled official only when the exact chain item is supported by the chain’s published nutrition. If it cannot be verified, the app says so instead of inventing a result.</p>
      </article>
      <article class="card card-pad nutrition-quick"><div class="card-head"><div><h3>Quick measured entry</h3><p>For food weighed on a scale or copied from a label</p></div><span class="status green">User verified</span></div>
        <form id="nutrition-manual-form" class="form-grid"><div class="field full"><label>Food / meal</label><input name="name" placeholder="Chicken rice bowl" required></div><div class="field"><label>Serving eaten</label><input name="serving" placeholder="320 g"></div><div class="field"><label>Source</label><select name="source"><option value="measured">Measured serving</option><option value="nutrition_label">Nutrition label</option><option value="ausnut">AUSNUT profile</option><option value="manual">Manual entry</option></select></div><div class="field"><label>Calories</label><input name="calories" type="number" min="0" max="5000" required></div><div class="field"><label>Protein (g)</label><input name="protein" type="number" min="0" max="500" step="0.1" required></div><div class="field"><label>Carbs (g)</label><input name="carbs" type="number" min="0" max="800" step="0.1" required></div><div class="field"><label>Fat (g)</label><input name="fat" type="number" min="0" max="500" step="0.1" required></div><div class="form-actions"><button class="btn btn-outline">Review entry</button></div></form>
      </article>
    </section></div></details>
    <section class="grid two" style="margin-top:18px">
      <article class="card card-pad"><div class="card-head"><div><h3>${formatDate(date, { weekday: "long", day: "numeric", month: "long" })}</h3><p>${meals.length} meal${meals.length === 1 ? "" : "s"} · ${verifiedCount} label/measured · ${estimatedCount} photo estimate${estimatedCount === 1 ? "" : "s"}</p></div><span class="status ${estimatedCount ? "yellow" : meals.length ? "green" : "gray"}">${meals.length ? `${Math.round(totals.calories)} kcal` : "No meals"}</span></div>
        ${meals.length ? `<div class="meal-list">${meals.slice().reverse().map((meal) => {
          const photoUrl = meal.photoId ? nutritionUi.photoUrls[meal.photoId] : "";
          return `<div class="meal-row">${photoUrl ? `<img src="${esc(photoUrl)}" alt="${esc(meal.name)}">` : `<span class="meal-placeholder">◇</span>`}<div><strong>${esc(meal.name)}</strong><p>${meal.loggedAt ? `${esc(meal.loggedAt)} · ` : ""}${esc(meal.serving || "Serving not recorded")} · ${Math.round(Number(meal.calories))} kcal · P ${round(meal.protein, 1)} · C ${round(meal.carbs, 1)} · F ${round(meal.fat, 1)}</p><small><span class="status ${nutritionSourceTone(meal.source)}">${esc(nutritionSourceLabel(meal.source))}</span> ${esc(meal.confidence || "unrated")} confidence</small></div><div class="meal-actions"><button class="text-button" data-action="save-meal-template" data-meal="${esc(meal.id)}">Save meal</button><button class="text-button" data-action="edit-meal" data-meal="${esc(meal.id)}">Edit</button><button class="text-button danger-text" data-action="delete-meal" data-meal="${esc(meal.id)}">Delete</button></div></div>`;
        }).join("")}</div>` : `<div class="empty"><strong>No food logged</strong>Take a photo for the quickest start.</div>`}
      </article>
      <article class="card card-pad"><div class="card-head"><div><h3>Seven-day calories</h3><p>Estimates and verified entries remain labelled in the meal log</p></div></div>${lineChart(week, (item) => item.calories, "var(--blue)", "Calories")}</article>
      <article class="card card-pad"><div class="card-head"><div><h3>Seven-day protein</h3><p>Logged grams per day</p></div></div>${lineChart(week, (item) => item.protein, "var(--teal)", "Protein")}</article>
      <article class="card card-pad"><div class="card-head"><div><h3>Daily targets</h3><p>Targets are athlete settings, not generated medical prescriptions</p></div></div><form id="nutrition-targets-form" class="form-grid"><div class="field"><label>Calories (kcal)</label><input name="calories" type="number" min="0" max="10000" value="${esc(targets.calories || "")}" placeholder="Set target"></div><div class="field"><label>Protein (g)</label><input name="protein" type="number" min="0" max="500" value="${esc(targets.protein || "")}"></div><div class="field"><label>Carbohydrate (g)</label><input name="carbs" type="number" min="0" max="1000" value="${esc(targets.carbs || "")}" placeholder="Set target"></div><div class="field"><label>Fat (g)</label><input name="fat" type="number" min="0" max="500" value="${esc(targets.fat || "")}" placeholder="Set target"></div><div class="field"><label>Fluid (L)</label><input name="fluid" type="number" min="0" max="15" step="0.1" value="${esc(targets.fluid || "")}"></div><div class="form-actions"><button class="btn btn-outline">Save targets</button></div></form><div class="alert info"><strong>Accuracy rule</strong>A target should come from your sports dietitian or a deliberate bodyweight/performance plan. The app tracks it; it does not pretend a single generic formula is exact.</div></article>
    </section>`;
}

function mechanicsRatingOptions(selected = "") {
  return `<option value="">Not rated</option>${[1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${Number(selected) === value ? "selected" : ""}>${value} · ${["Major constraint", "Needs work", "Functional", "Efficient", "Strong repeatable pattern"][value - 1]}</option>`).join("")}`;
}

function mechanicsMetric(value, unit = "°") {
  return Number(value) ? `${esc(value)}${unit}` : "—";
}

function renderMechanicsPageLegacy() {
  const assessments = [...(state.mechanics?.assessments || [])].sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const latest = assessments.at(-1);
  const proposals = latest ? mechanicsProposals(latest) : [];
  const approved = state.mechanics?.approvedInterventions || [];
  const latestScore = latest?.efficiency || 0;
  const confidenceLabel = latest?.source === "markerLab" ? "High · marker-based lab" : latest?.source === "calibratedMarkerless" ? "Moderate–high · calibrated markerless" : latest?.source === "coachReview" ? "Coach-rated" : "Screening only · 2D video";
  return `
    <section class="page-head"><div><p class="eyebrow">Screen, measure, then confirm</p><h2>Biomechanics without false precision.</h2><p>Track hip–shoulder separation, maximum external rotation (“layback”), timing and movement ratings. Two-dimensional video values are screening estimates; calibrated multi-camera or laboratory data should be entered as the higher-confidence source.</p></div></section>
    <section class="grid metrics">
      <article class="card metric accent"><span class="metric-label">Latest efficiency</span><div class="metric-value">${latestScore || "—"}${latestScore ? "%" : ""}</div><div class="metric-detail">Average of six analyst ratings</div></article>
      <article class="card metric blue"><span class="metric-label">Hip–shoulder</span><div class="metric-value">${latest ? mechanicsMetric(latest.hipShoulderSeparation) : "—"}</div><div class="metric-detail">At front-foot contact</div></article>
      <article class="card metric warn"><span class="metric-label">Max external rotation</span><div class="metric-value">${latest ? mechanicsMetric(latest.layback) : "—"}</div><div class="metric-detail">Never force this angle</div></article>
      <article class="card metric good"><span class="metric-label">Confidence</span><div class="metric-value metric-text">${latest ? esc(confidenceLabel) : "—"}</div><div class="metric-detail">Source-specific interpretation</div></article>
    </section>
    <section class="grid two">
      <article class="card card-pad"><div class="card-head"><div><h3>Movement efficiency trend</h3><p>Within-athlete tracking; not an injury-risk score</p></div></div>${lineChart(assessments, (item) => item.efficiency, "#007aff", "Mechanics efficiency")}</article>
      <article class="card card-pad"><div class="card-head"><div><h3>Measurement trend</h3><p>Hip–shoulder separation at front-foot contact</p></div></div>${lineChart(assessments, (item) => item.hipShoulderSeparation, "#af52de", "Hip shoulder separation")}</article>
    </section>
    <section class="grid two" style="margin-top:18px">
      <article class="card card-pad"><div class="card-head"><div><h3>New mechanics assessment</h3><p>Enter values from a coach, video screen or biomechanics provider</p></div></div>
        <div class="alert info"><strong>Capture standard</strong>For repeatable 2D screening, record high-frame-rate open-side and behind-pitcher views with the full body and ball visible, fixed camera position, good light and the same mound distance. Do not compare a 2D angle directly with a 3D lab norm.</div>
        <form id="mechanics-form" class="form-grid" style="margin-top:16px">
          <div class="field"><label for="mechanicsDate">Assessment date</label><input id="mechanicsDate" name="date" type="date" value="${brisbaneToday()}" required></div>
          <div class="field"><label for="mechanicsSource">Measurement source</label><select id="mechanicsSource" name="source"><option value="video2d">2D video screening</option><option value="coachReview">Coach review</option><option value="calibratedMarkerless">Calibrated multi-camera markerless</option><option value="markerLab">Marker-based biomechanics lab</option></select></div>
          <div class="field"><label>Pitch type / intent</label><input name="pitchContext" placeholder="Fastball · mound · 90%"></div>
          <div class="field"><label>Ball velocity</label><input name="velocity" type="number" min="0" max="120" step="0.1" placeholder="mph"></div>
          <div class="form-divider"><strong>Measured kinematics</strong><span>Leave blank when the source cannot measure the value reliably.</span></div>
          <div class="field"><label>Hip–shoulder separation at foot contact</label><input name="hipShoulderSeparation" type="number" min="-30" max="90" step="0.1" placeholder="degrees"></div>
          <div class="field"><label>Maximum shoulder external rotation (“layback”)</label><input name="layback" type="number" min="0" max="220" step="0.1" placeholder="degrees"></div>
          <div class="field"><label>Arm slot at release</label><input name="armSlot" type="number" min="0" max="180" step="0.1" placeholder="degrees"></div>
          <div class="field"><label>Stride length</label><input name="stridePercentHeight" type="number" min="0" max="150" step="0.1" placeholder="% of height"></div>
          <div class="field"><label>Trunk forward tilt at release</label><input name="trunkTilt" type="number" min="-30" max="90" step="0.1" placeholder="degrees"></div>
          <div class="field"><label>Pelvis-to-trunk peak timing</label><input name="pelvisTrunkTiming" type="number" min="-300" max="300" step="1" placeholder="milliseconds"></div>
          <div class="form-divider"><strong>Analyst ratings</strong><span>1–5 ratings create the efficiency trend and intervention proposals.</span></div>
          ${[["sequence", "Kinetic sequence"], ["lowerHalf", "Lower-half transfer"], ["trunk", "Trunk direction/timing"], ["armTiming", "Arm timing"], ["release", "Release consistency"], ["deceleration", "Deceleration/finish"]].map(([key, label]) => `<div class="field"><label>${label}</label><select name="${key}Rating">${mechanicsRatingOptions()}</select></div>`).join("")}
          <div class="field full"><label>Analyst notes</label><textarea name="notes" placeholder="What was observed, frame rate/camera setup, within-athlete comparison and uncertainty…"></textarea></div>
          <div class="form-actions"><button class="btn btn-dark" type="submit">Save assessment</button></div>
        </form>
      </article>
      <div class="grid">
        <article class="card card-pad"><div class="card-head"><div><h3>Recommended focus</h3><p>Generated only from analyst ratings of 1–2</p></div><span class="status ${proposals.length ? "yellow" : "gray"}">${proposals.length ? `${proposals.length} proposal${proposals.length === 1 ? "" : "s"}` : "No current flag"}</span></div>
          ${proposals.length ? `<div class="mechanics-proposals">${proposals.map((item) => {
            const exists = approved.some((approvedItem) => approvedItem.id === item.id);
            return `<div class="mechanics-proposal"><div><strong>${esc(item.label)}</strong><p>${esc(item.drill)} · ${esc(item.drillDose)}</p><small>Gym emphasis: ${esc(item.gymCue)}</small></div><button class="btn ${exists ? "btn-soft" : "btn-outline"}" data-action="approve-mechanics" data-proposal="${esc(item.id)}" ${exists ? "disabled" : ""}>${exists ? "Applied" : "Review & apply"}</button></div>`;
          }).join("")}</div>` : `<div class="empty"><strong>No low-rated category</strong>Enter an assessment to generate a maximum of two low-volume proposals.</div>`}
          <div class="alert warn" style="margin-top:14px"><strong>Approval rule</strong>The app never changes the program from a raw angle alone. Only an analyst rating can generate a proposal, and you must approve it before it appears in eligible Mon–Thu sessions.</div>
        </article>
        <article class="card card-pad"><div class="card-head"><div><h3>Applied mechanics focus</h3><p>Most recently approved focus is active</p></div></div>${approved.length ? `<div class="mechanics-proposals">${approved.slice().reverse().map((item) => `<div class="mechanics-proposal"><div><strong>${esc(item.label)}</strong><p>${esc(item.drill)} · ${esc(item.drillDose)}</p></div><button class="text-button ${item.active === false ? "" : "danger-text"}" data-action="toggle-mechanics" data-intervention="${esc(item.id)}">${item.active === false ? "Reactivate" : "Pause"}</button></div>`).join("")}</div>` : `<div class="empty"><strong>No focus applied</strong>Approved changes will appear here and sync across devices.</div>`}</article>
      </div>
    </section>
    <article class="card card-pad" style="margin-top:18px"><div class="card-head"><div><h3>Assessment history</h3><p>Same-athlete, same-source trends are the most useful comparison</p></div></div>${assessments.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Source</th><th>Efficiency</th><th>Hip–shoulder</th><th>Layback</th><th>Arm slot</th><th>Velocity</th></tr></thead><tbody>${assessments.slice().reverse().map((item) => `<tr><td>${formatDate(item.date, { day: "numeric", month: "short", year: "numeric" })}</td><td>${esc(item.sourceLabel)}</td><td>${esc(item.efficiency)}%</td><td>${mechanicsMetric(item.hipShoulderSeparation)}</td><td>${mechanicsMetric(item.layback)}</td><td>${mechanicsMetric(item.armSlot)}</td><td>${Number(item.velocity) ? `${esc(item.velocity)} mph` : "—"}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty"><strong>No assessment saved</strong>Add a screening or imported measurement to begin the within-athlete trend.</div>`}</article>
  `;
}

function renderMechanicsPage() {
  const assessments = [...(state.mechanics?.assessments || [])].sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const screeningAssessments = assessments.filter((item) => item.source === "aiVideoScreen" || (!item.source && Number(item.efficiency)) || ["video2d", "coachReview"].includes(item.source));
  const measuredAssessments = assessments.filter((item) => ["threeMotionReport", "calibratedMarkerless", "markerLab"].includes(item.source));
  const latestScreen = screeningAssessments.at(-1);
  const latestMeasured = measuredAssessments.at(-1);
  const proposals = latestScreen ? mechanicsProposals(latestScreen) : [];
  const approved = state.mechanics?.approvedInterventions || [];
  const videos = mechanicsMediaState.videos;
  const uploadReady = Boolean(cloudSync.key && cloudSync.ready);
  const capture = latestScreen?.captureQuality || {};
  const captureDecision = capture.decision || (latestScreen ? "legacy" : "none");
  const capturePass = latestScreen && latestScreen.analyzable !== false && captureDecision !== "fail";
  const reportMetrics = [
    ["Hip–shoulder", "hipShoulderSeparation", "°", "Provider event definition"],
    ["External rotation", "layback", "°", "Maximum shoulder ER"],
    ["Stride length", "stridePercentHeight", "%", "Percentage of height"],
    ["Trunk flexion", "trunkTilt", "°", "At ball release"],
    ["Hand speed", "throwingHandSpeed", " mph", "Reported hand speed"],
    ["Knee extension", "kneeExtensionVelocity", "°/s", "Reported angular velocity"]
  ];
  const ratingLabels = [
    ["sequenceRating", "Sequence"], ["lowerHalfRating", "Lower half"], ["trunkRating", "Trunk"],
    ["armTimingRating", "Arm timing"], ["releaseRating", "Release"], ["decelerationRating", "Deceleration"]
  ];
  const phaseNames = ["Windup", "Stride", "Arm cocking", "Arm acceleration", "Arm deceleration", "Follow-through"];
  const phaseReview = phaseNames.map((phase) => latestScreen?.phaseReview?.find((item) => item.phase === phase) || { phase, visible: false, finding: "Not established from this capture", visibleEvidence: "No supported event evidence was returned.", confidence: "low", view: "not visible" });
  const latestAnalysis = latestScreen ? `
    <article class="card card-pad ai-analysis biomechanics-report">
      <div class="card-head"><div><p class="eyebrow">Latest phone-video screen</p><h3>${esc(latestScreen.sourceLabel || "AI movement screen")}</h3><p>${formatDate(latestScreen.date, { day: "numeric", month: "long", year: "numeric" })} · ${esc(latestScreen.pitchContext || "Pitch context not supplied")}</p></div><div class="report-actions"><span class="status ${captureDecision === "pass" ? "green" : captureDecision === "limited" ? "yellow" : "gray"}">${captureDecision === "legacy" ? "Legacy screen" : `Capture ${esc(captureDecision)}`}</span><button class="text-button" data-action="print-biomechanics">Print report</button></div></div>
      <div class="capture-quality-summary"><div class="capture-score ${captureDecision}"><strong>${Number.isFinite(Number(capture.score)) ? Math.round(Number(capture.score)) : "—"}</strong><span>Capture quality${Number.isFinite(Number(capture.score)) ? "/100" : ""}</span></div><div><strong>${capturePass ? "Usable for qualitative screening" : "Capture failed the analysis gate"}</strong><p>${esc(latestScreen.confidenceReason || "The analysis is limited to what the supplied phone views visibly support.")}</p></div></div>
      ${!capturePass ? `<div class="alert warn"><strong>No movement rating or training change was produced.</strong>${capture.blockers?.length ? esc(capture.blockers.join(" · ")) : "Record another pitch with the full body visible, a fixed camera and less motion blur."}</div>` : `
        <p class="analysis-summary">${esc(latestScreen.summary || "No written summary was returned.")}</p>
        ${proposals[0] ? `<div class="mechanics-primary-finding"><span>Primary training hypothesis</span><strong>${esc(proposals[0].label)}</strong><p>${esc(proposals[0].rationale || "Review the visible evidence before applying this focus.")}</p></div>` : ""}
        <div class="rating-strip">${ratingLabels.map(([key, label]) => `<div><span>${esc(label)}</span><strong>${Number(latestScreen[key]) || "—"}${Number(latestScreen[key]) ? "/5" : ""}</strong><small>Screened</small></div>`).join("")}</div>
        <div class="biomechanics-phase-head"><div><p class="eyebrow">Phase review</p><h3>Evidence through the delivery</h3></div><span class="status gray">Qualitative</span></div>
        <div class="phase-timeline">${phaseReview.map((item, index) => `<div class="phase-event ${item.visible ? "visible" : "unavailable"}"><span>${index + 1}</span><div><strong>${esc(item.phase)}</strong><p>${esc(item.finding || "Not established")}</p><small>${esc(item.view || "not visible")} · ${esc(item.confidence || "low")} confidence${item.visibleEvidence ? ` · ${esc(item.visibleEvidence)}` : ""}</small></div></div>`).join("")}</div>`}
      <details class="inline-disclosure"><summary>Capture audit, observations and limits</summary>
        <div class="capture-audit-grid">${[["Full body", capture.fullBody], ["Motion blur", capture.blur], ["Camera stability", capture.cameraStability], ["Event visibility", capture.eventVisibility], ["View consistency", capture.viewConsistency]].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value || "Not established")}</strong></div>`).join("")}</div>
        ${latestScreen.observations?.length ? `<div class="observation-list">${latestScreen.observations.map((item) => `<div><span class="confidence-dot ${esc(item.confidence || "low")}"></span><p><strong>${esc(item.phase)} · ${esc(item.view || "view not labelled")}</strong>${esc(item.finding)}<small>${esc(item.visibleEvidence)}</small></p></div>`).join("")}</div>` : ""}
        ${latestScreen.screening ? `<div class="screening-grid">${Object.entries(latestScreen.screening).map(([key, value]) => `<div><span>${esc(key.replace(/([A-Z])/g, " $1"))}</span><strong>${esc(value || "Not visible")}</strong></div>`).join("")}</div>` : ""}
        ${latestScreen.limitations?.length ? `<ul class="plain-list">${latestScreen.limitations.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}
      </details>
    </article>` : `<article class="card card-pad ai-analysis mechanics-empty-report"><span class="mechanics-empty-mark">◎</span><strong>No biomechanics screen yet</strong><p>Upload one standardized open-side or rear-view pitch. Dual view of the same delivery gives the strongest qualitative screen.</p></article>`;
  return `
    <section class="page-head compact-head mechanics-page-head"><div><p class="eyebrow">Biomechanics</p><h2>Pitching movement, with evidence attached.</h2><p>Capture quality first, phase-by-phase visual screening second, measured kinematics only from a validated provider.</p></div></section>
    <section class="card mechanics-command-card biomechanics-command-card">
      <div><span class="status team">Biomechanics workspace</span><h3>${latestScreen ? "Review the delivery. Change one thing." : "Build a repeatable movement baseline."}</h3><p>${latestScreen ? esc(latestScreen.summary || "Your latest evidence-labelled screen is below.") : "Record a fixed open-side or rear view. Open-side best supports lateral sequencing; rear view supports direction and plane. Neither turns phone video into calibrated 3D motion capture."}</p><div class="mechanics-command-actions"><a class="btn btn-dark" href="#mechanics-capture">${latestScreen ? "New assessment" : "Start assessment"}</a><a class="btn btn-outline" href="https://portal.3motionai.com" target="_blank" rel="noopener noreferrer">Open 3motionAI ↗</a></div></div>
      <div class="mechanics-flow" aria-label="Biomechanics workflow"><div class="active"><b>1</b><span>Capture<small>Quality gate</small></span></div><i></i><div class="${latestScreen ? "active" : ""}"><b>2</b><span>Screen<small>Six phases</small></span></div><i></i><div class="${latestMeasured ? "active" : ""}"><b>3</b><span>Measure<small>Validated source</small></span></div><i></i><div class="${approved.some((item) => item.active !== false) ? "active" : ""}"><b>4</b><span>Train<small>One approved focus</small></span></div></div>
    </section>
    <section class="mechanics-evidence-bar biomechanics-evidence-bar" aria-label="Biomechanics evidence levels"><div><span class="evidence-icon">1</span><p><strong>Phone-video screen</strong>Visible movement organisation with view, confidence and capture-quality labels. No calculated joint angles.</p></div><div><span class="evidence-icon measured">2</span><p><strong>Validated kinematics</strong>Exact values from 3motionAI, calibrated markerless capture or a marker-based lab, stored with the named source.</p></div><div><span class="evidence-icon">3</span><p><strong>Training decision</strong>One evidence-linked hypothesis. Nothing enters the program until you approve it.</p></div></section>
    <section class="card card-pad mechanics-metric-report">
      <div class="card-head"><div><p class="eyebrow">Measured kinematics</p><h3>${latestMeasured ? "Latest provider-reported measurements" : "No validated measurements connected"}</h3><p>${latestMeasured ? `${esc(latestMeasured.sourceLabel)} · ${formatDate(latestMeasured.date, { day: "numeric", month: "short", year: "numeric" })}` : "Phone-film values stay blank by design. Import a provider report below when one exists."}</p></div><span class="status ${latestMeasured ? "green" : "gray"}">${latestMeasured ? "Reported source" : "Not measured"}</span></div>
      <div class="mechanics-metric-grid">${reportMetrics.map(([label, key, unit, detail]) => `<div><span>${esc(label)}</span><strong>${latestMeasured && Number(latestMeasured[key]) ? `${esc(latestMeasured[key])}${esc(unit)}` : "—"}</strong><small>${latestMeasured && Number(latestMeasured[key]) ? esc(detail) : "Validated source required"}</small></div>`).join("")}</div>
    </section>
    <section class="mechanics-main biomechanics-main">
      <article class="card card-pad mechanics-upload-card" id="mechanics-capture">
        <div class="card-head"><div><h3>New phone-video assessment</h3><p>Open-side or rear view · dual view preferred · same pitch and intent</p></div><span class="status ${uploadReady ? "green" : "gray"}">${mechanicsMediaState.analyzing ? "Analysing" : mechanicsMediaState.uploading ? "Saving" : uploadReady ? "Ready" : "Cloud sync needed"}</span></div>
        <div class="capture-essentials"><div><b>1</b><span><strong>Choose an honest camera view</strong>Open-side: hip height and perpendicular to the throwing line. Rear: centred behind the rubber at a safe distance. Use a fixed support.</span></div><div><b>2</b><span><strong>Full body for the entire pitch</strong>Show both feet, head, throwing hand, rubber, stride contact, release and finish without panning or zooming.</span></div><div><b>3</b><span><strong>Bright, high-frame-rate capture</strong>Use the same device/settings each test. 1080p at 120–240 fps is preferred; 60 fps minimum for this screen.</span></div></div>
        <form id="mechanics-video-form" class="form-grid quiet-form">
          <div class="field"><label>Capture date</label><input name="capturedOn" type="date" value="${brisbaneToday()}" required></div>
          <div class="field"><label>Pitch type</label><select name="pitchType"><option value="" selected>Not supplied</option><option>Fastball</option><option>Changeup</option><option>Slider</option><option>Curveball</option><option>Cutter</option><option>Other</option></select></div>
          <div class="field"><label>Throwing surface</label><select name="surface"><option value="mound">Mound</option><option value="flat_ground">Flat ground</option><option value="pulldown">Pulldown</option></select></div>
          <div class="field"><label>Intent (%)</label><input name="intent" type="number" min="40" max="100" step="1" placeholder="Optional perceived effort"></div>
          <div class="field"><label>Radar velocity (mph)</label><input name="velocity" type="number" min="30" max="120" step="0.1" placeholder="Optional measured context"></div>
          <div class="field"><label>Session note</label><input name="notes" placeholder="e.g. fresh, second bullpen fastball"></div>
          <div class="field full capture-file-field"><label>Open-side video <span>Optional · lateral sequencing</span></label><input name="openSideVideo" type="file" accept="video/mp4,video/quicktime,video/webm,.mov" ${uploadReady && !mechanicsMediaState.uploading ? "" : "disabled"}><small>Add this view for lateral timing context. One trimmed pitch · MP4, MOV or WebM · 2–30 seconds · under 95 MB.</small></div>
          <div class="field full capture-file-field"><label>Rear-view video <span>Optional · direction and plane</span></label><input name="rearVideo" type="file" accept="video/mp4,video/quicktime,video/webm,.mov" ${uploadReady && !mechanicsMediaState.uploading ? "" : "disabled"}><small>Add at least one view. Rear-only screens stay limited and will not estimate hip–shoulder separation or layback. Film safely behind the rubber.</small></div>
          <fieldset class="capture-confirmations full"><legend>Capture check</legend><label><input name="fixedCamera" type="checkbox" required> Camera stayed fixed and the full body remained visible.</label><label><input name="brightCapture" type="checkbox" required> Lighting is bright enough to see the throwing arm and ball release region.</label><label><input name="singlePitch" type="checkbox" required> Each file contains the same single pitch and is trimmed to 2–30 seconds.</label></fieldset>
          <div class="form-actions"><button class="btn btn-dark" ${uploadReady && !mechanicsMediaState.uploading ? "" : "disabled"}>${mechanicsMediaState.analyzing ? "Checking capture & analysing…" : mechanicsMediaState.uploading ? "Saving private film…" : "Run assessment"}</button></div>
        </form>
        <details class="inline-disclosure"><summary>What this assessment can and cannot do</summary><p>The app checks capture usability, reviews the six accepted pitching phases—windup, stride, arm cocking, arm acceleration, arm deceleration and follow-through—and attaches view-specific evidence and confidence. It cannot derive validated 3D kinematics, forces, torques, tissue load, injury probability or a medical diagnosis from ordinary phone footage.</p></details>
        <p class="fineprint"><strong>Method boundary:</strong> single-camera markerless systems can be validated when they use a purpose-built capture and trained measurement pipeline. This app’s AI contact-sheet review is a qualitative screen only. Failed capture quality produces no ratings or training recommendation.</p>
      </article>
      ${latestAnalysis}
      <article class="card card-pad mechanics-focus-card"><div class="card-head"><div><h3>Training translation</h3><p>One primary hypothesis, explicitly approved</p></div><span class="status ${proposals.length ? "yellow" : "gray"}">${proposals.length ? "1 review" : "No change"}</span></div>
        ${proposals.length ? `<div class="mechanics-proposals">${proposals.map((item) => { const exists = approved.some((entry) => entry.id === item.id && entry.active !== false); return `<div class="mechanics-proposal"><div><strong>${esc(item.label)}</strong>${item.rationale ? `<p>${esc(item.rationale)}</p>` : ""}<p>${esc(item.drill)} · ${esc(item.drillDose)}</p><small>Gym cue: ${esc(item.gymCue)}</small></div><button class="btn ${exists ? "btn-soft" : "btn-outline"}" data-action="approve-mechanics" data-proposal="${esc(item.id)}" ${exists ? "disabled" : ""}>${exists ? "Active" : "Review & apply"}</button></div>`; }).join("")}</div>` : `<div class="empty"><strong>Base program retained</strong>${latestScreen && !capturePass ? "The capture was not usable, so no training hypothesis was created." : "No sufficiently supported priority was identified."}</div>`}
        <p class="fineprint"><strong>Program control:</strong> approval adds one low-volume microdose and related cues to eligible early-week sessions. It never adds a high-intent exposure. Readiness reductions and health holds still override it. Stop if the drill causes pain or worsens movement.</p>
      </article>
      <article class="card card-pad mechanics-focus-card"><div class="card-head"><div><h3>Active focus</h3><p>Only the latest active focus flows into the plan</p></div></div>${approved.filter((item) => item.active !== false).length ? `<div class="mechanics-proposals">${approved.filter((item) => item.active !== false).slice(-1).map((item) => `<div class="mechanics-proposal"><div><strong>${esc(item.label)}</strong><p>${esc(item.drill)} · ${esc(item.drillDose)}</p></div><button class="text-button danger-text" data-action="toggle-mechanics" data-intervention="${esc(item.id)}">Pause</button></div>`).join("")}</div>` : `<div class="empty"><strong>No focus active</strong>The base program stays unchanged.</div>`}</article>
    </section>
    <details class="card disclosure-card provider-import" style="margin-top:14px"><summary><span><strong>Add 3motionAI report values</strong><small>Optional · exact values from an existing pitching report</small></span><span>Open</span></summary><div class="disclosure-body">
      <div class="provider-intro"><div><span class="status green">Higher-confidence layer</span><h3>Keep provider data separate from the AI screen.</h3><p>Pitching OS does not have a live 3motionAI API connection. 3motionAI advertises SDK/API access for enterprise integrations; until credentials and documentation are supplied, enter only numbers shown in your original report.</p></div><a class="btn btn-outline" href="https://3motionai.com/baseballanalytics/" target="_blank" rel="noopener noreferrer">About 3motionAI ↗</a></div>
      <form id="mechanics-form" class="form-grid mechanics-report-form">
        <input name="source" type="hidden" value="threeMotionReport">
        <div class="field"><label>Assessment date</label><input name="date" type="date" value="${brisbaneToday()}" required></div>
        <div class="field"><label>Pitch context</label><input name="pitchContext" placeholder="Fastball · mound · intent"></div>
        <div class="field"><label>Provider assessment ID</label><input name="providerReference" placeholder="Optional report or athlete ID"></div>
        <div class="field"><label>Report / software version</label><input name="protocolVersion" placeholder="Optional version shown on report"></div>
        <div class="field"><label>Ball velocity (mph)</label><input name="velocity" type="number" min="0" max="120" step="0.1" placeholder="Leave blank if absent"></div>
        <div class="field"><label>Throwing-hand speed (mph)</label><input name="throwingHandSpeed" type="number" min="0" max="150" step="0.1" placeholder="Exact report value"></div>
        <div class="field"><label>Hip–shoulder separation (°)</label><input name="hipShoulderSeparation" type="number" min="-30" max="120" step="0.1"></div>
        <div class="field"><label>Maximum external rotation (°)</label><input name="layback" type="number" min="0" max="240" step="0.1"></div>
        <div class="field"><label>Stride length (% height)</label><input name="stridePercentHeight" type="number" min="0" max="160" step="0.1"></div>
        <div class="field"><label>Trunk flexion at release (°)</label><input name="trunkTilt" type="number" min="-30" max="120" step="0.1"></div>
        <div class="field"><label>Elbow flexion (°)</label><input name="elbowFlexion" type="number" min="0" max="180" step="0.1"></div>
        <div class="field"><label>Shoulder abduction (°)</label><input name="shoulderAbduction" type="number" min="0" max="180" step="0.1"></div>
        <div class="field"><label>Horizontal abduction (°)</label><input name="horizontalAbduction" type="number" min="-90" max="180" step="0.1"></div>
        <div class="field"><label>Knee flexion (°)</label><input name="kneeFlexion" type="number" min="0" max="180" step="0.1"></div>
        <div class="field"><label>Knee-extension velocity (°/s)</label><input name="kneeExtensionVelocity" type="number" min="0" max="3000" step="1"></div>
        <div class="field full"><label>Kinematic sequence / ball-path notes</label><textarea name="reportNotes" placeholder="Optional: copy the provider’s written result without interpretation"></textarea></div>
        <div class="form-actions"><button class="btn btn-dark" type="submit">Save report values</button></div>
      </form>
      <p class="fineprint"><strong>Source rule:</strong> saving this form records athlete-entered values from a named provider report. It does not verify the report, create a live connection, or turn these numbers into an injury-risk score. Training stays unchanged unless you separately approve a focus.</p>
    </div></details>
    <details class="card disclosure-card" style="margin-top:14px"><summary><span><strong>Film library</strong><small>${videos.length} private clip${videos.length === 1 ? "" : "s"}</small></span><span>View</span></summary><div class="disclosure-body"><div class="card-head"><div></div><button class="btn btn-outline" data-action="reload-mechanics-videos" ${mechanicsMediaState.loading ? "disabled" : ""}>${mechanicsMediaState.loading ? "Refreshing…" : "Refresh"}</button></div>${mechanicsMediaState.error ? `<div class="alert warn"><strong>Film library unavailable</strong>${esc(mechanicsMediaState.error)}</div>` : videos.length ? `<div class="mechanics-video-grid">${videos.map((video) => `<div class="mechanics-video"><video controls playsinline preload="metadata" src="${esc(video.playbackUrl)}"></video><div><strong>${esc(video.pitchContext || video.fileName)}</strong><p>${formatDate(video.capturedOn || video.createdAt.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })} · ${esc(String(video.angle || "view").replace("_", " "))}</p><button class="text-button danger-text" data-action="delete-mechanics-video" data-video="${esc(video.id)}">Delete</button></div></div>`).join("")}</div>` : `<div class="empty"><strong>No film uploaded</strong>Your saved clips will appear here.</div>`}</div></details>
    <details class="card disclosure-card quiet-disclosure"><summary><span><strong>Biomechanics history and trends</strong><small>${measuredAssessments.length} measured report${measuredAssessments.length === 1 ? "" : "s"} · ${screeningAssessments.length} video screen${screeningAssessments.length === 1 ? "" : "s"}</small></span><span>Show</span></summary><div class="disclosure-body"><div class="grid two">
      <article><div class="card-head"><div><h3>Hip–shoulder separation</h3><p>Only provider or lab-reported values</p></div></div>${lineChart(measuredAssessments, (item) => item.hipShoulderSeparation, "var(--team-primary)", "Hip–shoulder separation")}</article>
      <article><div class="card-head"><div><h3>External rotation</h3><p>Only provider or lab-reported values</p></div></div>${lineChart(measuredAssessments, (item) => item.layback, "var(--team-secondary)", "Maximum external rotation")}</article>
      <article><div class="card-head"><div><h3>Video-screen trend</h3><p>Average of six qualitative ratings; compare only standardized captures</p></div></div>${lineChart(screeningAssessments.filter((item) => item.analyzable !== false), (item) => item.efficiency, "var(--team-primary)", "AI screening score")}</article>
      <article><div class="card-head"><div><h3>Velocity context</h3><p>Only values supplied with the clip or report</p></div></div>${lineChart(assessments, (item) => item.velocity, "var(--team-secondary)", "Velocity")}</article>
    </div><div class="card-head biomechanics-history-head"><div><h3>Assessment register</h3><p>Source, capture quality and context remain attached to every result</p></div></div>${assessments.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Source</th><th>Capture</th><th>Context</th><th>Velocity</th></tr></thead><tbody>${assessments.slice().reverse().map((item) => `<tr><td>${formatDate(item.date, { day: "numeric", month: "short", year: "numeric" })}</td><td>${esc(item.sourceLabel || item.source || "Assessment")}</td><td>${item.source === "aiVideoScreen" ? item.captureQuality?.score ? `${esc(item.captureQuality.score)}/100 · ${esc(item.captureQuality.decision || "screen")}` : "Legacy screen" : "Provider data"}</td><td>${esc(item.pitchContext || "—")}</td><td>${Number(item.velocity) ? `${esc(item.velocity)} mph` : "—"}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty"><strong>No assessments saved</strong>Your source-labelled assessment history will appear here.</div>`}</div></details>
  `;
}

function pbSummary(record, unit = "kg") {
  if (!Number(record?.value)) return "Not established";
  const kind = record.kind === "estimated" ? "estimated 1RM" : "PB";
  return `${record.value} ${unit} · ${kind}${record.date ? ` · ${formatDate(record.date, { day: "numeric", month: "short", year: "numeric" })}` : ""}`;
}

function percentageTable(liftKey) {
  const record = state.pbs.trainingMaxes.lifts[liftKey];
  const percentages = [60, 65, 70, 75, 80, 85, 90];
  if (!Number(record?.value)) return `<div class="empty"><strong>No training max established</strong>Log a tested max or qualifying working set to calculate loads.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Percent</th>${percentages.map((value) => `<th>${value}%</th>`).join("")}</tr></thead><tbody><tr><td><strong>Load</strong></td>${percentages.map((value) => `<td>${roundToIncrement(record.value * value / 100, 2.5)} kg</td>`).join("")}</tr></tbody></table></div><p class="fineprint"><strong>Calculation:</strong> loads are rounded to the nearest 2.5 kg from the current ${record.kind === "tested" ? "tested" : "estimated"} training max. A working-set estimate never replaces a tested PB. Manual corrections are recorded rather than erasing earlier results.</p>`;
}

function renderCloudSyncCard() {
  const passkeyCount = accountAuth.passkeys.length;
  return `
    <article class="card card-pad cloud-card">
      <div class="card-head"><div><h3>Account and autosave</h3><p data-sync-message>${esc(cloudSync.message)}</p></div><span class="status ${cloudSync.status === "synced" ? "green" : cloudSync.status === "error" || cloudSync.status === "offline" ? "yellow" : "team"}" data-sync-status data-status="${cloudSync.status}">${esc(syncStatusLabel())}</span></div>
      <div class="account-sync-wrap">
        <div class="account-identity">${accountAuth.user?.image ? `<img src="${esc(accountAuth.user.image)}" alt="">` : `<span>${esc((accountAuth.user?.name || "A").slice(0, 1).toUpperCase())}</span>`}<div><strong>${esc(accountAuth.user?.name || "Athlete")}</strong><small>${esc(accountAuth.user?.email || "")}</small></div></div>
        <div class="cloud-actions"><button class="btn btn-outline" data-action="add-passkey">${passkeyCount ? "Add another passkey" : "Add Face ID / passkey"}</button><button class="btn btn-dark" data-action="sync-now">Sync now</button></div>
      </div>
      <div class="sync-foot"><span data-sync-time>${cloudSync.lastSyncedAt ? `Last saved ${new Date(cloudSync.lastSyncedAt).toLocaleString("en-AU")}` : "Preparing your first cloud save"}</span><div><span class="passkey-count">${passkeyCount} passkey${passkeyCount === 1 ? "" : "s"}</span><button class="text-button" data-action="sign-out">Sign out</button></div></div>
      <details class="sync-journal"><summary><span data-sync-pending>${cloudSync.pendingChanges.length ? `${cloudSync.pendingChanges.length} local change${cloudSync.pendingChanges.length === 1 ? "" : "s"} waiting` : "No local changes waiting"}</span><span>View save detail</span></summary><div>${cloudSync.pendingChanges.length ? `<ul>${cloudSync.pendingChanges.slice().reverse().map((item) => `<li><strong>${esc(item.label)}</strong><span>Changed ${new Date(item.changedAt).toLocaleString("en-AU")}</span></li>`).join("")}</ul>` : `<p>Every local change in this browser has reached the encrypted cloud snapshot.</p>`}${cloudSync.recentSaves.length ? `<p class="fineprint"><strong>Most recent confirmed item:</strong> ${esc(cloudSync.recentSaves.at(-1).label)} reached Cloudflare ${new Date(cloudSync.recentSaves.at(-1).syncedAt).toLocaleString("en-AU")}.</p>` : ""}</div></details>
      <p class="fineprint sync-explainer"><strong>How this works:</strong> your browser encrypts the training snapshot before Cloudflare stores it. After a verified sign-in, the service can unlock the account’s workspace key so another device can decrypt the same data. This is account-based encryption, not zero-knowledge storage.</p>
    </article>`;
}

function renderProfilePage() {
  const p = state.profile;
  const pb = state.pbs;
  return `
    <section class="page-head"><div><p class="eyebrow">Athlete settings</p><h2>${esc(p.name)}</h2><p>Profile, performance baselines and encrypted cross-device autosave.</p></div></section>
    <article class="card card-pad profile-hero">${avatarMarkup("avatar-large")}<div class="profile-identity"><h2>${esc(p.name)}</h2><p>${esc(p.throwingHand)}-handed · ${esc(p.role)} · ${esc(p.gym)}</p><div class="photo-actions"><label class="btn btn-outline" for="profile-photo-file">Choose photo</label><input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden><button class="text-button danger-text" data-action="remove-profile-photo" ${p.photoDataUrl ? "" : "disabled"}>Remove</button><small>Square-cropped and compressed on this device. Included in encrypted cloud autosave.</small></div></div><div class="profile-stats"><div><strong>${esc(p.height)}</strong><span>cm</span></div><div><strong>${esc(p.weight)}</strong><span>kg</span></div><div><strong>52</strong><span>weeks</span></div></div></article>
    <section class="grid two" style="margin-top:18px">
      <article class="card card-pad"><div class="card-head"><div><h3>Athlete profile</h3><p>Identity, teams and interface</p></div></div><form id="profile-form" class="form-grid"><div class="field"><label>Name</label><input name="name" value="${esc(p.name)}"></div><div class="field"><label>Gym</label><input name="gym" value="${esc(p.gym)}"></div><div class="field"><label>Height (cm)</label><input name="height" type="number" value="${esc(p.height)}"></div><div class="field"><label>Weight (kg)</label><input name="weight" type="number" step="0.1" value="${esc(p.weight)}"></div><div class="field"><label>Role</label><input name="role" value="${esc(p.role)}"></div><div class="field"><label>Throwing hand</label><select name="throwingHand"><option ${p.throwingHand === "Right" ? "selected" : ""}>Right</option><option ${p.throwingHand === "Left" ? "selected" : ""}>Left</option></select></div><div class="field"><label>Appearance</label><select name="appearance"><option value="system" ${appearancePreference() === "system" ? "selected" : ""}>Match device</option><option value="dark" ${appearancePreference() === "dark" ? "selected" : ""}>Dark</option><option value="light" ${appearancePreference() === "light" ? "selected" : ""}>Light</option></select></div><div class="field"><label>Glass intensity</label><select name="glassIntensity"><option value="subtle" ${interfacePreferences().glass === "subtle" ? "selected" : ""}>Subtle</option><option value="balanced" ${interfacePreferences().glass === "balanced" ? "selected" : ""}>Balanced</option><option value="vivid" ${interfacePreferences().glass === "vivid" ? "selected" : ""}>Vivid</option></select></div><div class="field"><label>Layout density</label><select name="interfaceDensity"><option value="comfortable" ${interfacePreferences().density === "comfortable" ? "selected" : ""}>Comfortable</option><option value="compact" ${interfacePreferences().density === "compact" ? "selected" : ""}>Compact</option></select></div><div class="field"><label>Motion</label><select name="motionPreference"><option value="system" ${interfacePreferences().motion === "system" ? "selected" : ""}>Match device</option><option value="full" ${interfacePreferences().motion === "full" ? "selected" : ""}>Full</option><option value="reduced" ${interfacePreferences().motion === "reduced" ? "selected" : ""}>Reduced</option></select></div><div class="field"><label>Navigation</label><select name="navigationBehavior"><option value="smart" ${interfacePreferences().navigation === "smart" ? "selected" : ""}>Smart collapse</option><option value="steady" ${interfacePreferences().navigation === "steady" ? "selected" : ""}>Always expanded</option></select></div><div class="field"><label>Winter team</label><input name="winterTeam" value="${esc(p.winterTeam || "")}"></div><div class="field"><label>Summer team</label><input name="summerTeam" value="${esc(p.summerTeam || "")}"></div><div class="form-actions"><button class="btn btn-dark" type="submit">Save profile</button></div></form><p class="fineprint"><strong>Team colour rule:</strong> winter uses Norths colours and summer uses Coomera Cubs colours. These controls change density, motion and glass depth without replacing team identity.</p></article>
      <details class="card disclosure-card"><summary><span><strong>Performance records</strong><small>PBs and training maxima are kept separate</small></span><span>Show</span></summary><div class="disclosure-body"><div class="mini-list"><div class="mini-row"><span class="mini-icon">DL</span><div><strong>Trap bar deadlift PB</strong><p>${esc(pbSummary(pb.lifts.trapBarDeadlift))}</p><small>Training max: ${esc(pbSummary(pb.trainingMaxes.lifts.trapBarDeadlift))}</small></div></div><div class="mini-row"><span class="mini-icon">BP</span><div><strong>Bench press PB</strong><p>${esc(pbSummary(pb.lifts.benchPress))}</p><small>Training max: ${esc(pbSummary(pb.trainingMaxes.lifts.benchPress))}</small></div></div><div class="mini-row"><span class="mini-icon">SQ</span><div><strong>Back squat PB</strong><p>${esc(pbSummary(pb.lifts.backSquat))}</p><small>Training max: ${esc(pbSummary(pb.trainingMaxes.lifts.backSquat))}</small></div></div><div class="mini-row"><span class="mini-icon">PP</span><div><strong>Push press PB</strong><p>${esc(pbSummary(pb.lifts.pushPress))}</p><small>Training max: ${esc(pbSummary(pb.trainingMaxes.lifts.pushPress))}</small></div></div><div class="mini-row"><span class="mini-icon">V</span><div><strong>Pulldown / game velocity</strong><p>${pb.velocity.pulldown.value ? `${esc(pb.velocity.pulldown.value)} mph` : "—"} / ${pb.velocity.gameFastball.value ? `${esc(pb.velocity.gameFastball.value)} mph` : "—"}</p></div></div></div><p class="fineprint"><strong>Update rule:</strong> every entered performance result is retained. A higher tested max can update a tested PB. A working-set estimate can establish or improve an estimated training max, but it never replaces a tested PB. Lower results remain in immutable history.</p></div></details>
    </section>
    <section style="margin-top:18px">${renderCloudSyncCard()}</section>
    <details class="card disclosure-card quiet-disclosure"><summary><span><strong>Edit bests and calculations</strong><small>Baselines and trap-bar percentage table</small></span><span>Show</span></summary><div class="disclosure-body"><section class="grid two">
      <article class="card card-pad"><div class="card-head"><div><h3>Edit PB baselines</h3><p>Use this to correct or establish a tested max</p></div></div><form id="pb-form" class="form-grid"><div class="field"><label>Trap bar deadlift 1RM/e1RM (kg)</label><input name="trapBarDeadlift" type="number" min="0" step="0.5" value="${esc(pb.lifts.trapBarDeadlift.value || "")}"></div><div class="field"><label>Bench press 1RM (kg)</label><input name="benchPress" type="number" min="0" step="0.5" value="${esc(pb.lifts.benchPress.value || "")}"></div><div class="field"><label>Back squat 1RM (kg)</label><input name="backSquat" type="number" min="0" step="0.5" value="${esc(pb.lifts.backSquat.value || "")}"></div><div class="field"><label>Push press 1RM (kg)</label><input name="pushPress" type="number" min="0" step="0.5" value="${esc(pb.lifts.pushPress.value || "")}"></div><div class="field"><label>Pulldown PB (mph)</label><input name="pulldown" type="number" min="0" max="120" step="0.1" value="${esc(pb.velocity.pulldown.value || "")}"></div><div class="field"><label>Game fastball PB (mph)</label><input name="gameFastball" type="number" min="0" max="120" step="0.1" value="${esc(pb.velocity.gameFastball.value || "")}"></div><div class="form-actions"><button class="btn btn-dark" type="submit">Save PB baselines</button></div></form></article>
      <article class="card card-pad"><div class="card-head"><div><h3>Trap bar percentage table</h3><p>Based on the current ${pb.trainingMaxes.lifts.trapBarDeadlift.kind === "estimated" ? "estimated" : "tested"} training max</p></div></div>${percentageTable("trapBarDeadlift")}</article>
    </section></div></details>
    <details class="card disclosure-card quiet-disclosure"><summary><span><strong>Schedule, backup and reset</strong><small>Advanced workspace controls</small></span><span>Show</span></summary><div class="disclosure-body"><section class="grid two">
      <article class="card card-pad"><div class="card-head"><div><h3>Schedule rules</h3></div></div><div class="mini-list"><div class="mini-row"><span class="mini-icon">W</span><div><strong>FNCBA Winter 2026</strong><p>Official Division 1 draw through 5 Sep · velocity Wed · game Sat</p></div></div><div class="mini-row"><span class="mini-icon">S</span><div><strong>GBL Summer 2026/27</strong><p>First game Fri 2 Oct (athlete-provided) · training Tue/Thu · games Fri/Sun · later draw pending</p></div></div><div class="mini-row"><span class="mini-icon">G</span><div><strong>Gym structure</strong><p>Whole-body sessions; power before strength; summer volume condensed</p></div></div></div></article>
      <article class="card card-pad"><div class="card-head"><div><h3>Backup and reset</h3><p>Portable file backup and data controls</p></div></div><div class="grid"><button class="btn btn-dark" data-action="export">Export backup</button><button class="btn btn-outline" data-action="import">Import backup</button><button class="btn btn-danger" data-action="reset">Reset tracking data</button>${accountAuth.signedIn ? `<button class="text-button danger-text" data-action="delete-account">Permanently delete account and cloud data</button>` : ""}<input id="import-file" type="file" accept="application/json" hidden></div><p class="fineprint"><strong>Reset tracking data</strong> starts a new local/cloud snapshot. <strong>Delete account</strong> also removes authentication, immutable history, integrations and private media and cannot be undone.</p></article>
    </section></div></details>
  `;
}

function renderIntegrationsPage() {
  const oura = integrationState.oura;
  const apple = integrationState.apple;
  const pulseImportCount = Object.keys(state.pulseImports || {}).length;
  const requiredOuraScopes = ["daily", "email", "personal", "heartrate", "tag", "workout", "session", "spo2", "ring_configuration", "stress", "heart_health"];
  const grantedOuraScopes = new Set(String(oura.scopes || "").split(/[\s,]+/).filter(Boolean).map((scope) => scope.replace(/^extapi:/, "").replace(/^spo2Daily$/, "spo2")));
  const fullOuraAccess = oura.connected && requiredOuraScopes.every((scope) => grantedOuraScopes.has(scope));
  const ouraStatus = !cloudSync.key ? "Cloud sync needed" : fullOuraAccess ? "Requested scopes granted" : oura.connected ? "Limited scopes" : oura.configured ? "Ready to connect" : "OAuth app pending";
  const ouraTone = fullOuraAccess ? "green" : oura.connected || oura.error ? "yellow" : "gray";
  const ouraActions = !cloudSync.key
    ? `<button class="btn btn-outline" data-action="nav" data-page="profile">Turn on cloud sync</button>`
    : oura.connected
      ? `<div class="integration-actions">${fullOuraAccess ? `<button class="btn btn-outline" data-action="refresh-health">Refresh today</button>` : `<button class="btn btn-dark" data-action="connect-oura">Reconnect with all data</button>`}<button class="text-button danger-text" data-action="disconnect-oura">Disconnect</button></div>`
      : `<button class="btn btn-dark" data-action="connect-oura" ${!oura.configured || integrationState.loading ? "disabled" : ""}>Connect Oura</button>`;
  const appleStatus = !cloudSync.key ? "Cloud sync needed" : apple.connected ? "Bridge enabled" : "Ready to set up";
  const appleTone = apple.connected ? "green" : apple.error ? "yellow" : "gray";
  const appleActions = !cloudSync.key
    ? `<button class="btn btn-outline" data-action="nav" data-page="profile">Turn on cloud sync</button>`
    : apple.connected
      ? `<div class="integration-actions"><button class="btn btn-outline" data-action="setup-apple">Replace upload key</button><button class="text-button danger-text" data-action="disconnect-apple">Disconnect</button></div>`
      : `<button class="btn btn-dark" data-action="setup-apple">Create iPhone upload key</button>`;
  const uploadTokenDisplay = integrationState.appleUploadToken
    ? integrationState.revealAppleToken ? integrationState.appleUploadToken.match(/.{1,8}/g)?.join("-") : "••••••••-••••••••-••••••••-••••••••-••••••••-••••••••-••••••••-••••••••"
    : "Generate or replace the key on this device to display it";
  return `
    <section class="page-head"><div><p class="eyebrow">Automatic daily health import</p><h2>Connect your recovery data.</h2><p>Oura fills sleep and readiness through its official OAuth flow. Apple Health uses a private iPhone bridge because HealthKit is not accessible from an ordinary webpage.</p></div><button class="btn btn-outline" data-action="reload-integrations">Check connections</button></section>
    <section class="grid">
      <article class="card integration"><div class="integration-icon">☁</div><div><h3>Cloudflare encrypted autosave</h3><p>Your signed-in account loads the same browser-encrypted training snapshot on every device automatically.</p></div><button class="btn btn-outline" data-action="nav" data-page="profile">Manage account</button></article>
      <article class="card integration"><div class="integration-icon">⚾</div><div><h3>Driveline PULSE Live</h3><p>Open the official live PULSE DASH and record its sensor result at daily check-out. Pitching OS is ready for an automatic partner connection, but Driveline does not currently publish a personal OAuth/API that this app can connect to honestly.</p><small>${pulseImportCount ? `${pulseImportCount} previously imported sensor record${pulseImportCount === 1 ? "" : "s"} preserved` : "Official sensor fields remain available: throw count, high-effort throws, workload, A:C ratio, arm speed, torque and ball velocity"}</small></div><div class="integration-control"><span class="status team">Official app link</span><div class="integration-actions"><a class="btn btn-dark" href="https://pulsethrow.drivelinebaseball.com" target="_blank" rel="noopener">Open live PULSE DASH</a><a class="text-button" href="https://help.drivelinebaseball.com/portal/en/newticket" target="_blank" rel="noopener">Request API access</a></div></div></article>
      <article class="card integration"><div class="integration-icon">◉</div><div><h3>Oura Cloud API v2</h3><p>Requests the Oura categories listed in the connection consent, then imports fields that Oura’s API actually returns. Relevant sleep, readiness, stress, temperature, HRV, resting-heart-rate and Rest Mode fields can inform the daily planning rule.</p><small>${fullOuraAccess ? `All 11 requested application scopes were granted` : oura.connected ? `Current granted scopes: ${esc(oura.scopes || "daily only")}` : "Oura shows every requested permission before approval"}</small>${oura.error ? `<small class="integration-error">${esc(oura.error)}</small>` : ""}</div><div class="integration-control"><span class="status ${ouraTone}">${esc(ouraStatus)}</span>${ouraActions}</div></article>
      <article class="card integration"><div class="integration-icon">♥</div><div><h3>Apple Health</h3><p>Accepts an approved daily summary from your private iPhone Shortcut or HealthKit companion: sleep, HRV, resting heart rate and bodyweight.</p>${apple.lastUploadAt ? `<small>Last upload ${esc(new Date(apple.lastUploadAt).toLocaleString("en-AU"))}</small>` : apple.error ? `<small class="integration-error">${esc(apple.error)}</small>` : ""}</div><div class="integration-control"><span class="status ${appleTone}">${esc(appleStatus)}</span>${appleActions}</div></article>
    </section>
    <details class="card disclosure-card quiet-disclosure"><summary><span><strong>Daily plan adjustment and Apple setup</strong><small>How connected data is used</small></span><span>Show</span></summary><div class="disclosure-body"><section class="grid two">
      <article class="card card-pad"><div class="card-head"><div><h3>Daily autofill</h3><p>What happens before your questionnaire</p></div><span class="status ${oura.connected || apple.connected ? "green" : "gray"}">${oura.connected || apple.connected ? "Active" : "Waiting for connection"}</span></div><div class="mini-list"><div class="mini-row"><span class="mini-icon">1</span><div><strong>Use the Brisbane date</strong><p>The app opens the matching day in the annual plan.</p></div></div><div class="mini-row"><span class="mini-icon">2</span><div><strong>Import fields the provider returns</strong><p>Available objective fields are shown read-only. Missing, delayed or unavailable provider fields remain blank.</p></div></div><div class="mini-row"><span class="mini-icon">3</span><div><strong>Ask what a wearable cannot know</strong><p>Arm symptoms, illness, mood and life context still require your input.</p></div></div></div><p class="fineprint"><strong>Oura limit:</strong> approving every requested scope does not mean every value shown in the Oura app is available through its API, and synced data can arrive later.</p></article>
      <article class="card card-pad"><div class="card-head"><div><h3>Readiness-guided workload</h3><p>Visible, conservative daily adjustments</p></div><span class="status team">Adaptive</span></div><div class="mini-list"><div class="mini-row"><span class="mini-icon">1</span><div><strong>Full</strong><p>Normal plan when questionnaire and available wearable data stay inside guardrails.</p></div><div class="value">100%</div></div><div class="mini-row"><span class="mini-icon">2</span><div><strong>Reduced</strong><p>About 75% volume with lower intent when readiness falls or one biometric flag appears.</p></div><div class="value">75%</div></div><div class="mini-row"><span class="mini-icon">3</span><div><strong>Recovery modified</strong><p>About 50% and no high intent when readiness is poor, stress is very high or two biometric flags appear.</p></div><div class="value">50%</div></div><div class="mini-row"><span class="mini-icon">4</span><div><strong>Health hold</strong><p>Illness or significant shoulder/elbow symptoms replace training with recovery guidance. Games still require staff confirmation.</p></div><div class="value">0%</div></div></div></article>
      <article class="card card-pad"><div class="card-head"><div><h3>Apple Health iPhone bridge</h3><p>Private daily automation setup</p></div><span class="status ${apple.connected ? "green" : "gray"}">${apple.connected ? "Key created" : "Not configured"}</span></div>
        <div class="setup-secret"><span>Upload address</span><code>${esc(integrationState.appleEndpoint)}</code><button class="btn btn-outline" data-action="copy-apple-endpoint">Copy</button></div>
        <div class="setup-secret"><span>Private upload key</span><code>${esc(uploadTokenDisplay)}</code><div class="integration-actions"><button class="btn btn-outline" data-action="reveal-apple-token" ${!integrationState.appleUploadToken ? "disabled" : ""}>${integrationState.revealAppleToken ? "Hide" : "Show"}</button><button class="btn btn-outline" data-action="copy-apple-token" ${!integrationState.appleUploadToken ? "disabled" : ""}>Copy</button></div></div>
        <ol class="setup-steps"><li>On iPhone, create a Shortcut that reads the previous night's Sleep Analysis plus the latest HRV, resting heart rate and body mass.</li><li>Add <strong>Get Contents of URL</strong>, choose POST and use the upload address above.</li><li>Add the header <strong>Authorization</strong> with value <strong>Bearer [your private upload key]</strong>.</li><li>Send JSON keys <code>day</code>, <code>sleepHours</code>, <code>hrvMs</code>, <code>restingHeartRate</code> and <code>bodyweightKg</code>.</li><li>Create a daily Personal Automation after your watch/ring finishes syncing and select <strong>Run Immediately</strong>.</li></ol>
        <div class="alert warn"><strong>Apple requirement</strong>Health permissions must be granted on the iPhone. This is a user-created Shortcut upload, not a direct Apple Health or HealthKit connection, and the website cannot grant or bypass HealthKit permission.</div>
      </article>
    </section></div></details>
    <details class="card disclosure-card quiet-disclosure"><summary><span><strong>Data sources and privacy</strong><small>What is measured, estimated and stored</small></span><span>Show</span></summary><div class="disclosure-body"><section class="grid two">
      <article class="card card-pad"><div class="card-head"><div><h3>Data priority</h3><p>What the dashboard trusts</p></div></div><div class="mini-list"><div class="mini-row"><span class="mini-icon">1</span><div><strong>Actual game and sensor data</strong><p>Pitches, PULSE workload, high-effort throws.</p></div></div><div class="mini-row"><span class="mini-icon">2</span><div><strong>Your session log</strong><p>Duration, RPE, soreness, velocity and notes.</p></div></div><div class="mini-row"><span class="mini-icon">3</span><div><strong>Planning estimates</strong><p>Used only for the week shape, never labelled as sensor data.</p></div></div></div></article>
      <article class="card card-pad"><div class="card-head"><div><h3>Privacy model</h3><p>Current release</p></div><div class="integration-actions"><a class="text-button" href="/privacy.html" target="_blank" rel="noopener">Privacy</a><a class="text-button" href="/terms.html" target="_blank" rel="noopener">Terms</a></div></div><p class="fineprint"><strong>Training log:</strong> the browser encrypts it before Cloudflare autosave. After verified sign-in, the service can unwrap the account workspace key so another device can decrypt the same snapshot. This is account-based encryption, not zero-knowledge storage.</p><p class="fineprint"><strong>Passkeys:</strong> only a public key and device label are stored. Face ID, Touch ID and device passcodes remain on the device.</p><p class="fineprint"><strong>Oura connection:</strong> OAuth tokens and server-cached API snapshots use separate server-side AES-GCM encryption. You may disconnect and delete cached snapshots. Encryption reduces exposure; it does not make any online system risk-free.</p><p class="fineprint"><strong>Medical status:</strong> this app is a training planner and log, not medical software, diagnosis, injury prediction or clearance to participate.</p></article>
    </section></div></details>
  `;
}

function updateSmartNavigation(force = false) {
  const preferences = interfacePreferences();
  const current = window.scrollY || 0;
  const movingDown = current > previousScrollY + 5;
  const movingUp = current < previousScrollY - 5;
  if (preferences.navigation !== "smart" || current < 34) smartNavigationCondensed = false;
  else if (movingDown && current > 64) smartNavigationCondensed = true;
  else if (movingUp) smartNavigationCondensed = false;
  previousScrollY = current;
  if (force || document.querySelector(".app-shell")?.classList.contains("nav-condensed") !== smartNavigationCondensed) {
    document.querySelector(".app-shell")?.classList.toggle("nav-condensed", smartNavigationCondensed);
  }
}

function render(preserveScroll = false) {
  applyAppearancePreference();
  const scroll = preserveScroll ? window.scrollY : 0;
  const update = () => {
    const app = document.querySelector("#app");
    app.innerHTML = renderShell();
    app.querySelectorAll(".field").forEach((field, index) => {
      const label = field.querySelector(":scope > label:not([for])");
      const control = field.querySelector(":scope > input:not([type='hidden']), :scope > select, :scope > textarea");
      if (!label || !control) return;
      if (!control.id) {
        const formName = field.closest("form")?.id || "page";
        const controlName = control.name || control.type || "control";
        control.id = `field-${formName}-${controlName}-${index}`.replace(/[^a-zA-Z0-9_-]/g, "-");
      }
      label.htmlFor = control.id;
    });
    app.querySelectorAll("button[data-action]:not([type])").forEach((button) => {
      button.type = "button";
    });
    if (preserveScroll) window.scrollTo(0, scroll);
    else window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    updateSmartNavigation(true);
  };
  if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const transition = document.startViewTransition(update);
    // Browsers reject `finished` when a reload or a newer render interrupts the
    // transition. The page has already updated successfully, so consume that
    // expected cancellation instead of reporting a false application error.
    [transition.ready, transition.updateCallbackDone, transition.finished].forEach((promise) => promise?.catch(() => {}));
  } else update();
}

async function decodeProfileImage(file) {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Safari can display some iPhone formats that createImageBitmap cannot decode.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The profile photo could not be read"));
    reader.readAsDataURL(blob);
  });
}

async function compressedProfilePhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  if (file.size > 10_000_000) throw new Error("Choose a photo smaller than 10 MB");
  const source = await decodeProfileImage(file);
  try {
    const side = Math.min(source.width, source.height);
    const sourceX = Math.max(0, (source.width - side) / 2);
    const sourceY = Math.max(0, (source.height - side) / 2);
    const renderAt = async (size, quality) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { alpha: false });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(source.image, sourceX, sourceY, side, side, 0, 0, size, size);
      return (await canvasBlob(canvas, "image/webp", quality)) || (await canvasBlob(canvas, "image/jpeg", quality));
    };
    let blob = await renderAt(320, .82);
    if (!blob) throw new Error("This browser could not resize the photo");
    if (blob.size > 180_000) blob = await renderAt(240, .7);
    if (!blob || blob.size > 240_000) throw new Error("The photo could not be compressed enough for secure sync");
    return blobDataUrl(blob);
  } finally {
    source.close();
  }
}

async function compressedMealPhoto(file) {
  const extension = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  const isDng = ["dng"].includes(extension) || ["image/dng", "image/x-adobe-dng"].includes(file.type);
  const isHeic = ["heic", "heif"].includes(extension) || ["image/heic", "image/heif"].includes(file.type);
  if (!file.type.startsWith("image/") && !["jpg", "jpeg", "png", "webp", "heic", "heif", "dng"].includes(extension)) throw new Error("Choose a JPEG, PNG, WebP, HEIC, HEIF or ProRAW DNG photo");
  if (file.size > (isDng ? 80_000_000 : 20_000_000)) throw new Error(isDng ? "Choose a ProRAW photo smaller than 80 MB" : "Choose a photo smaller than 20 MB");
  const readableFile = isDng ? await dngPreview(file) : file;
  let source;
  try {
    source = await decodeProfileImage(readableFile);
  } catch (error) {
    if (isHeic && file.size <= 20_000_000) {
      return new Blob([file], { type: extension === "heif" || file.type === "image/heif" ? "image/heif" : "image/heic" });
    }
    throw new Error(isDng ? "This ProRAW file did not contain a readable preview" : "This iPhone photo could not be decoded");
  }
  try {
    const maxSide = 768;
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source.image, 0, 0, canvas.width, canvas.height);
    let blob = await canvasBlob(canvas, "image/webp", .78);
    if (!blob || blob.size > 1_250_000) blob = await canvasBlob(canvas, "image/jpeg", .7);
    if (!blob || blob.size > 1_500_000) throw new Error("The photo could not be prepared for fast analysis");
    return blob;
  } finally {
    source.close();
  }
}

async function dngPreview(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let start = -1;
  let bestStart = -1;
  let bestEnd = -1;
  for (let index = 0; index < bytes.length - 1; index += 1) {
    if (start < 0 && bytes[index] === 0xff && bytes[index + 1] === 0xd8) {
      start = index;
      index += 1;
      continue;
    }
    if (start >= 0 && bytes[index] === 0xff && bytes[index + 1] === 0xd9) {
      const end = index + 2;
      if (end - start > bestEnd - bestStart) {
        bestStart = start;
        bestEnd = end;
      }
      start = -1;
      index += 1;
    }
  }
  if (bestStart < 0 || bestEnd - bestStart < 10_000) throw new Error("This ProRAW file did not contain a readable preview");
  return new Blob([bytes.subarray(bestStart, bestEnd)], { type: "image/jpeg" });
}

function foodProductDraft(product) {
  const values = product.perServing && Object.values(product.perServing).some((value) => value !== null) ? product.perServing : product.per100g;
  return {
    id: mediaId("meal"),
    loggedAt: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }),
    name: [product.brand, product.name].filter(Boolean).join(" · ") || "Packaged food",
    serving: product.servingSize || (product.perServing ? "1 serving" : "100 g"),
    calories: values.calories ?? "",
    protein: values.protein ?? "",
    carbs: values.carbs ?? "",
    fat: values.fat ?? "",
    source: "barcode",
    confidence: product.dataWarnings?.length ? "medium" : "high",
    notes: product.code ? `Barcode ${product.code}` : "Open Food Facts search",
    sourceUrl: product.code ? `https://world.openfoodfacts.org/product/${product.code}` : "",
    assumptions: product.dataWarnings?.length ? ["The product database reported quality warnings; compare with the package label."] : ["Confirm the exact package, serving size and amount eaten before saving."]
  };
}

async function analyzeSelectedMealPhoto(file) {
  const notes = document.querySelector("#nutrition-photo-notes")?.value || "";
  nutritionUi.analyzing = true;
  nutritionUi.photoError = "";
  nutritionUi.photoMessage = "Preparing the photo…";
  render(true);
  try {
    const blob = await compressedMealPhoto(file);
    nutritionUi.photoMessage = "Reading the meal… this normally takes about 10–20 seconds.";
    render(true);
    const query = new URLSearchParams({ day: nutritionDate(), notes });
    const result = await nutritionApiRequest(`/api/nutrition/analyze?${query}`, {
      method: "POST",
      headers: { "Content-Type": blob.type },
      body: blob,
      timeoutMs: 45_000
    });
    const previewUrl = URL.createObjectURL(blob);
    replaceNutritionDraft({
      id: mediaId("meal"),
      loggedAt: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }),
      photoId: "",
      photoUrl: previewUrl,
      name: result.estimate.name,
      serving: "1 photographed plate",
      calories: result.estimate.calories,
      protein: result.estimate.protein,
      carbs: result.estimate.carbs,
      fat: result.estimate.fat,
      confidence: result.estimate.confidence,
      source: "photo_ai",
      notes,
      items: result.estimate.items,
      assumptions: result.estimate.assumptions
    });
    nutritionUi.photoMessage = "Analysis complete. Review every field before adding it to the log.";
    showToast("Photo analysed and discarded. Review the estimate, then tap Add to today.");
  } catch (error) {
    nutritionUi.photoError = error.message || "The meal photo could not be analysed.";
    showToast(nutritionUi.photoError);
  } finally {
    nutritionUi.analyzing = false;
    render(true);
  }
}

function waitForMediaEvent(element, eventName, timeoutMs = 12_000) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Video ${eventName} timed out`));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeout);
      element.removeEventListener(eventName, complete);
      element.removeEventListener("error", fail);
    };
    const complete = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("The video could not be decoded on this device")); };
    element.addEventListener(eventName, complete, { once: true });
    element.addEventListener("error", fail, { once: true });
  });
}

async function mechanicsContactSheet(captures) {
  const usableCaptures = (Array.isArray(captures) ? captures : [{ file: captures, label: "OPEN SIDE" }]).filter((item) => item?.file);
  if (!usableCaptures.length || usableCaptures.length > 2) throw new Error("Add one open-side or rear-view clip, or both views of the same pitch");
  const panelWidth = 360;
  const panelHeight = 203;
  const labelHeight = 46;
  const viewHeight = labelHeight + panelHeight * 2;
  const canvas = document.createElement("canvas");
  canvas.width = panelWidth * 4;
  canvas.height = viewHeight * usableCaptures.length;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#050506";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const points = [.04, .16, .28, .4, .52, .64, .76, .92];
  for (let captureIndex = 0; captureIndex < usableCaptures.length; captureIndex += 1) {
    const { file, label } = usableCaptures[captureIndex];
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    try {
      await waitForMediaEvent(video, "loadedmetadata");
      if (!Number.isFinite(video.duration) || video.duration < 2 || video.duration > 30) {
        throw new Error(`${label || "Pitch"} clip must be trimmed to 2–30 seconds`);
      }
      if (!video.videoWidth || !video.videoHeight) throw new Error(`${label || "Pitch"} clip has no readable video frames`);
      const viewTop = captureIndex * viewHeight;
      context.fillStyle = "#111114";
      context.fillRect(0, viewTop, canvas.width, labelHeight);
      context.fillStyle = "#fff";
      context.font = "700 18px -apple-system, BlinkMacSystemFont, system-ui";
      context.fillText(`${label || "PITCH VIEW"} · 8-FRAME SEQUENCE`, 18, viewTop + 29);
      for (let index = 0; index < points.length; index += 1) {
        const targetTime = Math.min(Math.max(.01, video.duration * points[index]), Math.max(.01, video.duration - .01));
        if (Math.abs(video.currentTime - targetTime) > .005) {
          video.currentTime = targetTime;
          await waitForMediaEvent(video, "seeked");
        }
        const column = index % 4;
        const row = Math.floor(index / 4);
        const scale = Math.min(panelWidth / video.videoWidth, panelHeight / video.videoHeight);
        const width = video.videoWidth * scale;
        const height = video.videoHeight * scale;
        const x = column * panelWidth + (panelWidth - width) / 2;
        const y = viewTop + labelHeight + row * panelHeight + (panelHeight - height) / 2;
        context.fillStyle = "#000";
        context.fillRect(column * panelWidth, viewTop + labelHeight + row * panelHeight, panelWidth, panelHeight);
        context.drawImage(video, x, y, width, height);
        context.fillStyle = "rgba(0,0,0,.76)";
        context.fillRect(column * panelWidth + 8, viewTop + labelHeight + row * panelHeight + 8, 98, 25);
        context.fillStyle = "#fff";
        context.font = "600 13px -apple-system, BlinkMacSystemFont, system-ui";
        context.fillText(`${index + 1} · ${targetTime.toFixed(2)}s`, column * panelWidth + 16, viewTop + labelHeight + row * panelHeight + 25);
      }
    } finally {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    }
  }
  const blob = await canvasBlob(canvas, "image/jpeg", .76);
  if (!blob || blob.size > 4_800_000) throw new Error("The video frames could not be prepared within the analysis limit");
  return blob;
}

function mediaId(prefix = "media") {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function releaseNutritionDraftPhoto(draft = nutritionUi.draft) {
  if (typeof draft?.photoUrl === "string" && draft.photoUrl.startsWith("blob:")) {
    URL.revokeObjectURL(draft.photoUrl);
  }
}

function replaceNutritionDraft(draft) {
  releaseNutritionDraftPhoto();
  nutritionUi.draft = draft;
}

async function saveNutritionDraft(form) {
  if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return false;
  const values = formValues(form);
  const date = nutritionDate();
  const draft = nutritionUi.draft || {};
  const legacyPhotoId = values.photoId || draft.photoId || "";
  const meal = {
    ...draft,
    ...values,
    id: values.id || draft.id || mediaId("meal"),
    photoId: "",
    calories: Number(values.calories || 0),
    protein: Number(values.protein || 0),
    carbs: Number(values.carbs || 0),
    fat: Number(values.fat || 0),
    confirmedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editing: undefined,
    photoUrl: undefined
  };
  const current = nutritionMeals(date);
  const existingIndex = current.findIndex((item) => item.id === meal.id);
  state.nutrition.meals[date] = existingIndex >= 0
    ? current.map((item, index) => index === existingIndex ? meal : item)
    : [...current, meal];
  releaseNutritionDraftPhoto(draft);
  nutritionUi.draft = null;
  saveState({ label: "Nutrition log" });
  render(true);
  if (legacyPhotoId) {
    try {
      await nutritionApiRequest(`/api/nutrition/photos/${encodeURIComponent(legacyPhotoId)}`, { method: "DELETE" });
      delete nutritionUi.photoUrls[legacyPhotoId];
    } catch {
      showToast("Meal saved, but an older stored photo could not yet be removed.");
      return true;
    }
  }
  showToast(existingIndex >= 0 ? "Meal updated and totals recalculated." : "Meal added and daily totals updated.");
  return true;
}

function currentSessionTask(taskId) {
  return getSession(selectedWeekPlan(), state.selectedDay).tasks.find((item) => item.id === taskId) || null;
}

function modalBackdropCapturedInteriorClick(eventTarget, actionTarget) {
  return Boolean(
    actionTarget?.classList?.contains("modal-backdrop")
    && eventTarget?.closest?.("[data-modal]")
  );
}

async function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "retry-connection") {
    accountAuth.loading = true;
    render(true);
    const connected = await initializeAccountAuth();
    render();
    showToast(connected ? "Account and cloud autosave reconnected." : accountAuth.error || "Sign in to reconnect.");
    return;
  }

  if (action === "sign-in-google") {
    accountAuth.error = "";
    accountAuth.loading = true;
    render(true);
    try {
      const result = await window.PitchingAuth.signInGoogle();
      if (result?.error) throw new Error(authErrorMessage(result));
    } catch (error) {
      accountAuth.loading = false;
      accountAuth.error = error.message || "Google sign-in could not start";
      render(true);
    }
    return;
  }
  if (action === "sign-in-passkey") {
    accountAuth.error = "";
    accountAuth.loading = true;
    render(true);
    try {
      const result = await window.PitchingAuth.signInPasskey();
      if (result?.error) throw new Error(authErrorMessage(result, "This passkey could not sign you in"));
      await initializeAccountAuth();
      render();
      if (accountAuth.signedIn) showToast("Signed in securely.");
    } catch (error) {
      accountAuth.loading = false;
      accountAuth.error = error.message || "Passkey sign-in could not be completed";
      render(true);
    }
    return;
  }
  if (action === "add-passkey") {
    try {
      const result = await window.PitchingAuth.addPasskey(`${navigator.platform || "Device"} · ${new Date().toLocaleDateString("en-AU")}`);
      if (result?.error) throw new Error(authErrorMessage(result, "The passkey could not be added"));
      await loadAccountPasskeys();
      render(true);
      showToast("Passkey added. You can now use Face ID, Touch ID or your device passcode.");
    } catch (error) {
      showToast(error.message || "The passkey could not be added.");
    }
    return;
  }
  if (action === "sign-out") {
    try {
      if (cloudSync.key && cloudSync.ready) await pushCloudState();
      const result = await window.PitchingAuth.signOut();
      if (result?.error) throw new Error(authErrorMessage(result, "Sign-out could not be completed"));
      localStorage.removeItem(SYNC_KEY_STORAGE);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SYNC_PENDING_STORAGE);
      localStorage.removeItem(SYNC_HISTORY_STORAGE);
      localStorage.removeItem(SYNC_LAST_STORAGE);
      cloudSync.pendingChanges = [];
      cloudSync.recentSaves = [];
      cloudSync.lastSyncedAt = "";
      cloudSync.key = "";
      cloudSync.ready = false;
      state = initialState();
      accountAuth.signedIn = false;
      accountAuth.user = null;
      accountAuth.workspaceReady = false;
      accountAuth.passkeys = [];
      accountAuth.loading = false;
      render();
    } catch (error) {
      showToast(error.message || "Sign-out could not be completed.");
    }
    return;
  }
  if (action === "delete-account") {
    const confirmation = window.prompt("This permanently deletes your account, encrypted training history, health connections and private media. Type DELETE to continue.");
    if (confirmation !== "DELETE") {
      if (confirmation !== null) showToast("Account deletion cancelled. The confirmation must be exactly DELETE.");
      return;
    }
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The account could not be deleted");
      [
        SYNC_KEY_STORAGE,
        STORAGE_KEY,
        SYNC_PENDING_STORAGE,
        SYNC_HISTORY_STORAGE,
        SYNC_LAST_STORAGE,
        APPLE_UPLOAD_TOKEN_STORAGE
      ].forEach((key) => localStorage.removeItem(key));
      cloudSync.key = "";
      cloudSync.ready = false;
      state = initialState();
      accountAuth.signedIn = false;
      accountAuth.user = null;
      accountAuth.workspaceReady = false;
      accountAuth.passkeys = [];
      render();
      showToast("Account and associated cloud data deleted.");
    } catch (error) {
      showToast(error.message || "The account could not be deleted.");
    }
    return;
  }
  if (action === "nav") {
    state.page = target.dataset.page;
    activeModalTask = null;
    activeSkipTask = null;
    mobileMoreOpen = false;
    saveState({ cloud: false, touch: false });
    render();
    if (state.page === "integrations") await loadIntegrationStatuses();
    if (state.page === "nutrition") await loadNutritionPhotoUrls();
    if (state.page === "mechanics") await loadMechanicsVideos();
    if (state.page === "session") await loadHealthPrefill(selectedDate());
    return;
  }
  if (action === "toggle-mobile-more") {
    mobileMoreOpen = !mobileMoreOpen;
    render(true);
    return;
  }
  if (action === "close-mobile-more") {
    mobileMoreOpen = false;
    render(true);
    return;
  }
  if (action === "cycle-appearance") {
    const order = ["dark", "light", "system"];
    state.profile.appearance = order[(order.indexOf(appearancePreference()) + 1) % order.length];
    saveState();
    render(true);
    showToast(`Appearance set to ${state.profile.appearance === "system" ? "match device" : state.profile.appearance}.`);
    return;
  }
  if (action === "reset-range") {
    const input = document.getElementById(target.dataset.target);
    if (!input?.matches("[data-range]")) return;
    input.value = target.dataset.value;
    updateRangeControl(input);
    return;
  }
  if (action === "nutrition-date-shift") {
    state.nutrition.selectedDate = isoDate(addDays(nutritionDate(), Number(target.dataset.days || 0)));
    releaseNutritionDraftPhoto();
    nutritionUi.draft = null;
    saveState({ cloud: false, touch: false });
    render();
    await loadNutritionPhotoUrls();
    return;
  }
  if (action === "choose-meal-photo") {
    document.getElementById("meal-photo-library")?.click();
    return;
  }
  if (action === "take-meal-photo") {
    document.getElementById("meal-photo-camera")?.click();
    return;
  }
  if (action === "discard-nutrition-draft") {
    const draft = nutritionUi.draft;
    releaseNutritionDraftPhoto(draft);
    nutritionUi.draft = null;
    render(true);
    if (draft?.photoId && !draft.editing) {
      nutritionApiRequest(`/api/nutrition/photos/${encodeURIComponent(draft.photoId)}`, { method: "DELETE" }).catch(() => {});
      delete nutritionUi.photoUrls[draft.photoId];
    }
    return;
  }
  if (action === "select-food-search-result") {
    const product = nutritionUi.foodResults[Number(target.dataset.index)];
    if (!product) return;
    replaceNutritionDraft(foodProductDraft(product));
    nutritionUi.searchMessage = "Product selected. Confirm the package serving and amount eaten.";
    render(true);
    document.querySelector(".nutrition-draft")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (action === "save-nutrition-draft") {
    await saveNutritionDraft(target.closest("form"));
    return;
  }
  if (action === "edit-meal") {
    const meal = nutritionMeals().find((item) => item.id === target.dataset.meal);
    if (!meal) return;
    replaceNutritionDraft({ ...meal, editing: true, photoUrl: meal.photoId ? nutritionUi.photoUrls[meal.photoId] || "" : "" });
    render(true);
    document.querySelector(".nutrition-draft")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (action === "delete-meal") {
    const date = nutritionDate();
    const meal = nutritionMeals(date).find((item) => item.id === target.dataset.meal);
    if (!meal || !window.confirm(`Delete ${meal.name}?`)) return;
    const now = new Date().toISOString();
    state.nutrition.meals[date] = (state.nutrition.meals[date] || []).map((item) => item.id === meal.id ? { ...item, deletedAt: now, updatedAt: now } : item);
    saveState({ label: "Nutrition log" });
    render(true);
    if (meal.photoId) {
      nutritionApiRequest(`/api/nutrition/photos/${encodeURIComponent(meal.photoId)}`, { method: "DELETE" }).catch(() => {});
      delete nutritionUi.photoUrls[meal.photoId];
    }
    showToast("Meal deleted.");
    return;
  }
  if (action === "save-meal-template") {
    const meal = nutritionMeals().find((item) => item.id === target.dataset.meal);
    if (!meal) return;
    const now = new Date().toISOString();
    const existing = (state.nutrition.savedMeals || []).find((item) => item.name === meal.name && item.serving === meal.serving);
    const template = {
      id: existing?.id || mediaId("savedmeal"),
      name: meal.name,
      serving: meal.serving || "",
      calories: Number(meal.calories || 0), protein: Number(meal.protein || 0), carbs: Number(meal.carbs || 0), fat: Number(meal.fat || 0),
      source: meal.source || "manual", confidence: meal.confidence || "unrated", notes: meal.notes || "", sourceUrl: meal.sourceUrl || "",
      savedAt: existing?.savedAt || now, updatedAt: now
    };
    state.nutrition.savedMeals = existing
      ? state.nutrition.savedMeals.map((item) => item.id === existing.id ? template : item)
      : [...(state.nutrition.savedMeals || []), template].slice(-20);
    saveState({ label: "Saved meals" });
    render(true);
    showToast(existing ? "Saved meal updated." : "Meal saved for one-tap logging.");
    return;
  }
  if (action === "log-saved-meal") {
    const template = (state.nutrition.savedMeals || []).find((item) => item.id === target.dataset.savedMeal && !item.deletedAt);
    if (!template) return;
    const date = nutritionDate();
    const now = new Date();
    const meal = {
      ...template,
      id: mediaId("meal"),
      loggedAt: now.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }),
      confirmedAt: now.toISOString(), updatedAt: now.toISOString(), photoId: "", savedAt: undefined
    };
    state.nutrition.meals[date] = [...nutritionMeals(date), meal];
    saveState({ label: "Nutrition log" });
    render(true);
    showToast(`${template.name} added. Edit today’s entry if the serving changed.`);
    return;
  }
  if (action === "delete-saved-meal") {
    const template = (state.nutrition.savedMeals || []).find((item) => item.id === target.dataset.savedMeal);
    if (!template || !window.confirm(`Remove ${template.name} from saved meals?`)) return;
    const now = new Date().toISOString();
    state.nutrition.savedMeals = state.nutrition.savedMeals.map((item) => item.id === template.id ? { ...item, deletedAt: now, updatedAt: now } : item);
    saveState({ label: "Saved meals" });
    render(true);
    showToast("Saved meal removed.");
    return;
  }
  if (action === "undo-water") {
    const date = target.dataset.date || nutritionDate();
    const events = state.nutrition.hydrationEvents?.[date] || [];
    const index = [...events].map((item, itemIndex) => ({ item, itemIndex })).reverse().find(({ item }) => !item.undoneAt)?.itemIndex;
    if (index === undefined) return;
    const now = new Date().toISOString();
    state.nutrition.hydration[date] = Number(events[index].previous || 0);
    state.nutrition.hydrationEvents[date] = events.map((item, itemIndex) => itemIndex === index ? { ...item, undoneAt: now, updatedAt: now } : item);
    saveState({ label: "Hydration log" });
    render(true);
    showToast(`Water returned to ${state.nutrition.hydration[date]} L.`);
    return;
  }
  if (action === "weekly-review-decision") {
    const weekNumber = clamp(Number(target.dataset.week), 1, 52);
    const week = getWeekPlan(weekNumber, state.pbs);
    const summary = weeklyReviewSummary(week);
    const now = new Date().toISOString();
    state.weeklyReviews[String(weekNumber)] = {
      week: weekNumber,
      targetWeek: summary.targetWeek,
      proposal: summary.proposal,
      decision: target.dataset.decision === "approved" ? "approved" : "dismissed",
      snapshot: { completedSessions: summary.completedSessions, totalThrows: summary.totalThrows, readiness: summary.readiness, sleep: summary.sleep, maxSoreness: summary.maxSoreness },
      decidedAt: now, updatedAt: now
    };
    saveState({ label: "Weekly review" });
    render(true);
    showToast(target.dataset.decision === "approved" ? "Weekly review approved. Only the stated next-week rule can apply." : "Original next-week plan retained.");
    return;
  }
  if (action === "weekly-review-reset") {
    const weekNumber = clamp(Number(target.dataset.week), 1, 52);
    delete state.weeklyReviews[String(weekNumber)];
    saveState({ label: "Weekly review" });
    render(true);
    showToast("Weekly review decision reopened.");
    return;
  }
  if (action === "reload-mechanics-videos") {
    await loadMechanicsVideos();
    return;
  }
  if (action === "delete-mechanics-video") {
    const video = mechanicsMediaState.videos.find((item) => item.id === target.dataset.video);
    if (!video || !window.confirm(`Delete ${video.pitchContext || video.fileName}?`)) return;
    try {
      await privateApiRequest(`/api/mechanics/videos/${encodeURIComponent(video.id)}`, { method: "DELETE" });
      mechanicsMediaState.videos = mechanicsMediaState.videos.filter((item) => item.id !== video.id);
      render(true);
      showToast("Pitching film deleted.");
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  if (action === "open-selected-session") {
    state.page = "session";
    saveState({ cloud: false, touch: false });
    render();
    await loadHealthPrefill(selectedDate());
    return;
  }
  if (action === "select-day") {
    state.selectedDay = Number(target.dataset.day);
    state.page = "session";
    activeModalTask = null;
    activeSkipTask = null;
    saveState({ cloud: false, touch: false });
    render();
    await loadHealthPrefill(selectedDate());
    return;
  }
  if (action === "plot-bullpen-location") {
    const date = selectedDate();
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const point = {
      x: round(clamp((event.clientX - rect.left) / rect.width * 100, 0, 100), 1),
      y: round(clamp((event.clientY - rect.top) / rect.height * 100, 0, 100), 1)
    };
    const draft = bullpenDraftForDate(date);
    if (target.dataset.location === "target") draft.target = point;
    else draft.actual = point;
    render(true);
    return;
  }
  if (action === "reset-bullpen-draft") {
    resetBullpenDraft(selectedDate());
    render(true);
    return;
  }
  if (action === "delete-bullpen-pitch") {
    const date = selectedDate();
    const record = bullpenForDate(date);
    const entries = record.entries.filter((entry) => entry.id !== target.dataset.pitch);
    state.bullpens[date] = { ...record, entries, updatedAt: new Date().toISOString() };
    saveState();
    render(true);
    showToast("Bullpen pitch removed and command score recalculated.");
    return;
  }
  if (action === "previous-week" || action === "next-week") {
    state.selectedWeek = clamp(state.selectedWeek + (action === "next-week" ? 1 : -1), 1, 52);
    activeModalTask = null;
    activeSkipTask = null;
    saveState({ cloud: false, touch: false });
    render();
    return;
  }
  if (action === "select-week") {
    state.selectedWeek = clamp(Number(target.dataset.week), 1, 52);
    activeModalTask = null;
    activeSkipTask = null;
    saveState({ cloud: false, touch: false });
    render();
    return;
  }
  if (action === "toggle-task") {
    const date = selectedDate();
    const taskId = target.dataset.task;
    const item = currentSessionTask(taskId);
    if (item) activePlanStage = { date, stage: item.stage };
    const current = new Set(state.completedTasks[date] || []);
    if (target.checked) current.add(taskId); else current.delete(taskId);
    const occurredAt = new Date().toISOString();
    state.completedTasks[date] = [...current];
    if (target.checked && state.skippedTasks?.[date]?.[taskId]) {
      delete state.skippedTasks[date][taskId];
    }
    state.taskCompletionUpdatedAt[date] = occurredAt;
    appendTrainingHistory("taskChanges", date, target.checked ? "task_completed" : "task_reopened", {
      runId: state.pre[date]?.runId || "",
      taskId,
      completed: Boolean(target.checked)
    }, { occurredAt });
    saveState({ label: "Session tasks" });
    render(true);
    return;
  }
  if (action === "task-details") {
    const item = currentSessionTask(target.dataset.task);
    if (item) activePlanStage = { date: selectedDate(), stage: item.stage };
    activeSkipTask = null;
    activeModalTask = item;
    render(true);
    return;
  }
  if (action === "skip-task") {
    const item = currentSessionTask(target.dataset.task);
    if (!item) return;
    if (item.stageTitle === "Health Hold") {
      showToast("Health-hold actions cannot be skipped. Follow the review guidance before resuming training.");
      return;
    }
    activePlanStage = { date: selectedDate(), stage: item.stage };
    activeModalTask = null;
    activeSkipTask = item;
    render(true);
    return;
  }
  if (action === "undo-skip-task") {
    const date = selectedDate();
    const taskId = target.dataset.task;
    const item = currentSessionTask(taskId);
    if (item) activePlanStage = { date, stage: item.stage };
    const skip = state.skippedTasks?.[date]?.[taskId];
    if (!skip) return;
    const occurredAt = new Date().toISOString();
    delete state.skippedTasks[date][taskId];
    state.taskCompletionUpdatedAt[date] = occurredAt;
    delete state.post[date];
    delete state.editingPost;
    appendTrainingHistory("taskChanges", date, "task_skip_reopened", {
      runId: state.pre[date]?.runId || "",
      taskId,
      priorSkip: { ...skip }
    }, { occurredAt });
    saveState({ label: "Session tasks" });
    render(true);
    showToast("Task returned to the plan.");
    return;
  }
  if (action === "close-modal") {
    if (modalBackdropCapturedInteriorClick(event.target, target)) return;
    activeModalTask = null;
    activeSkipTask = null;
    render(true);
    return;
  }
  if (action === "redo-pre") {
    const date = selectedDate();
    if (window.confirm("Start a new check-in revision? The prior plan, answers, task changes and check-out remain in immutable history.")) {
      const occurredAt = new Date().toISOString();
      recordPlanChange(date, "check_in_reopened", {
        priorRunId: state.pre[date]?.runId || "",
        priorCheckInId: state.pre[date]?.historyId || "",
        priorCheckOutId: state.post[date]?.historyId || ""
      });
      delete state.pre[date];
      delete state.completedTasks[date];
      delete state.skippedTasks[date];
      state.taskCompletionUpdatedAt[date] = occurredAt;
      delete state.post[date];
      delete state.editingPost;
      saveState({ label: "Check-in revision" });
      render();
    }
    return;
  }
  if (action === "remove-readiness-override") {
    const date = selectedDate();
    if (!state.pre[date]?.manualOverride?.active) return;
    if (!window.confirm("Return to the app-recommended workload? Today’s task completion and check-out will be cleared so the adjusted plan can be logged accurately.")) return;
    const occurredAt = new Date().toISOString();
    recordPlanChange(date, "manual_override_removed", {
      priorRunId: state.pre[date]?.runId || "",
      priorOverride: { ...state.pre[date].manualOverride }
    });
    delete state.pre[date].manualOverride;
    state.pre[date].updatedAt = occurredAt;
    delete state.completedTasks[date];
    delete state.skippedTasks[date];
    state.taskCompletionUpdatedAt[date] = occurredAt;
    delete state.post[date];
    delete state.editingPost;
    capturePlanSnapshot(date, "plan_reassigned_after_override_removed");
    saveState({ label: "Plan adjustment" });
    render();
    showToast("App-recommended workload restored.");
    return;
  }
  if (action === "edit-post") {
    state.editingPost = selectedDate();
    saveState({ cloud: false, touch: false });
    render(true);
    return;
  }
  if (action === "remove-profile-photo") {
    state.profile.photoDataUrl = "";
    saveState();
    render(true);
    showToast("Profile photo removed.");
    return;
  }
  if (action === "approve-mechanics") {
    const proposalId = target.dataset.proposal;
    const proposal = (state.mechanics?.assessments || []).flatMap(mechanicsProposals).find((item) => item.id === proposalId);
    if (!proposal) return;
    if (!window.confirm(`Apply ${proposal.label} as the active mechanics focus? This adds one low-volume drill to eligible Mon–Thu sessions and changes cues without adding gym sets.`)) return;
    state.mechanics.approvedInterventions = [...state.mechanics.approvedInterventions.map((item) => ({ ...item, active: false })).filter((item) => item.id !== proposal.id), { ...proposal, active: true, approvedAt: new Date().toISOString() }];
    saveState();
    render(true);
    showToast(`${proposal.label} focus applied to eligible sessions.`);
    return;
  }
  if (action === "print-biomechanics") {
    window.print();
    return;
  }
  if (action === "toggle-mechanics") {
    const id = target.dataset.intervention;
    state.mechanics.approvedInterventions = state.mechanics.approvedInterventions.map((item) => item.id === id ? { ...item, active: item.active === false } : item);
    saveState();
    render(true);
    showToast("Mechanics focus updated.");
    return;
  }
  if (action === "export") {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pitching-os-backup-${brisbaneToday()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Backup exported.");
    return;
  }
  if (action === "import") {
    document.querySelector("#import-file")?.click();
    return;
  }
  if (action === "reset") {
    const scope = cloudSync.key ? "this device and the connected cloud copy" : "this browser";
    if (window.confirm(`Start a new active tracking snapshot on ${scope}? Immutable session history will remain available.`)) {
      const trainingHistory = state.trainingHistory;
      state = initialState();
      state.trainingHistory = trainingHistory;
      saveState({ label: "Active tracking reset" });
      render();
      showToast("Active tracking reset. Historical session events were preserved.");
    }
    return;
  }
  if (action === "enable-sync") {
    try {
      await enableCloudSync();
      showToast("Cloud autosave is on. Copy your recovery key before using another device.");
    } catch (error) {
      setCloudStatus("error", error.message);
      render(true);
      showToast(error.message);
    }
    return;
  }
  if (action === "reveal-sync-key") {
    cloudSync.revealKey = !cloudSync.revealKey;
    render(true);
    return;
  }
  if (action === "copy-sync-key") {
    try {
      await navigator.clipboard.writeText(groupSyncKey());
      showToast("Recovery key copied. Keep it private.");
    } catch {
      cloudSync.revealKey = true;
      render(true);
      showToast("Copy was blocked, so the recovery key has been shown.");
    }
    return;
  }
  if (action === "sync-now") {
    try {
      cloudSync.ready = true;
      await pushCloudState();
      render(true);
      showToast("Encrypted data saved to Cloudflare.");
    } catch (error) {
      render(true);
      showToast(error.message);
    }
    return;
  }
  if (action === "disconnect-sync") {
    if (window.confirm("Disconnect cloud autosave on this device? Your local data and encrypted cloud copy will remain.")) {
      disconnectCloudSync();
      showToast("This device is now using local autosave only.");
    }
    return;
  }
  if (action === "delete-cloud-sync") {
    if (window.confirm("Permanently delete the encrypted cloud copy and disconnect this device? Local data will remain.")) {
      try {
        await deleteCloudCopy();
        showToast("Encrypted cloud copy deleted. Local data remains.");
      } catch (error) {
        setCloudStatus("error", error.message);
        render(true);
        showToast(error.message);
      }
    }
    return;
  }
  if (action === "integration-info") {
    showToast(target.dataset.integration === "oura" ? "Oura requires OAuth credentials and secure token storage." : "Apple Health requires an iOS HealthKit companion app.");
    return;
  }
  if (action === "reload-integrations") {
    await loadIntegrationStatuses();
    showToast("Connection status refreshed.");
    return;
  }
  if (action === "refresh-health") {
    const date = state.page === "integrations" ? brisbaneToday() : selectedDate();
    await loadHealthPrefill(date, true);
    const health = state.healthPrefill[date] || {};
    showToast(health.error ? health.error : "Today's connected health data was refreshed.");
    return;
  }
  if (action === "connect-oura") {
    try {
      const result = await integrationRequest("/api/integrations/oura/connect", { method: "POST" });
      if (!String(result.authorizeUrl || "").startsWith("https://cloud.ouraring.com/oauth/authorize")) throw new Error("Oura authorization address was invalid");
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  if (action === "disconnect-oura") {
    if (!window.confirm("Disconnect Oura and delete its cached health summaries from Pitching OS?")) return;
    try {
      await integrationRequest("/api/integrations/oura", { method: "DELETE" });
      for (const date of Object.keys(state.healthPrefill)) delete state.healthPrefill[date];
      saveState();
      await loadIntegrationStatuses();
      showToast("Oura disconnected.");
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  if (action === "setup-apple") {
    if (integrationState.apple.connected && !window.confirm("Replace the existing Apple Health upload key? The old iPhone automation will stop working.")) return;
    try {
      const result = await integrationRequest("/api/integrations/apple/setup", { method: "POST" });
      integrationState.appleUploadToken = result.uploadToken || "";
      integrationState.appleEndpoint = result.endpoint || integrationState.appleEndpoint;
      integrationState.revealAppleToken = true;
      localStorage.setItem(APPLE_UPLOAD_TOKEN_STORAGE, integrationState.appleUploadToken);
      await loadIntegrationStatuses();
      showToast("Private Apple Health upload key created. Add it to your iPhone automation.");
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  if (action === "reveal-apple-token") {
    integrationState.revealAppleToken = !integrationState.revealAppleToken;
    render(true);
    return;
  }
  if (action === "copy-apple-token") {
    if (!integrationState.appleUploadToken) return;
    try {
      await navigator.clipboard.writeText(integrationState.appleUploadToken);
      showToast("Apple Health upload key copied.");
    } catch {
      integrationState.revealAppleToken = true;
      render(true);
      showToast("Copy was blocked, so the key has been shown.");
    }
    return;
  }
  if (action === "copy-apple-endpoint") {
    try {
      await navigator.clipboard.writeText(integrationState.appleEndpoint);
      showToast("Apple Health upload address copied.");
    } catch {
      showToast("Copy was blocked. Press and hold the address to copy it.");
    }
    return;
  }
  if (action === "disconnect-apple") {
    if (!window.confirm("Disconnect Apple Health and delete its cached summaries from Pitching OS?")) return;
    try {
      await integrationRequest("/api/integrations/apple", { method: "DELETE" });
      integrationState.appleUploadToken = "";
      integrationState.revealAppleToken = false;
      localStorage.removeItem(APPLE_UPLOAD_TOKEN_STORAGE);
      for (const date of Object.keys(state.healthPrefill)) delete state.healthPrefill[date];
      saveState();
      await loadIntegrationStatuses();
      showToast("Apple Health bridge disconnected.");
    } catch (error) {
      showToast(error.message);
    }
  }
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();

  if (form.id === "onboarding-form") {
    const values = formValues(form);
    state.profile = {
      ...state.profile,
      ...values,
      height: Number(values.height),
      weight: Number(values.weight),
      programTemplate: "australian_two_season"
    };
    state.onboardingComplete = true;
    state.page = "dashboard";
    saveState();
    try {
      await pushCloudState();
      render();
      showToast("Workspace created and saved to your account.");
    } catch (error) {
      render();
      showToast(`Workspace created here. Cloud autosave will retry: ${error.message}`);
    }
    return;
  }

  if (form.id === "pre-form") {
    const values = formValues(form);
    const date = form.dataset.date;
    const readiness = calculateReadiness(values, date);
    const occurredAt = new Date().toISOString();
    const runId = mediaId("session");
    state.pre[date] = {
      ...values,
      ...readiness,
      runId,
      hrvSource: readiness.hrvSource,
      restingHeartRateSource: readiness.restingHeartRateSource,
      sleepHoursSource: readiness.sleepSource,
      submittedAt: new Date().toLocaleString("en-AU"),
      updatedAt: occurredAt
    };
    const checkInEvent = appendTrainingHistory("checkIns", date, "health_check_in_submitted", {
      runId,
      response: { ...state.pre[date] }
    }, { occurredAt });
    state.pre[date].historyId = checkInEvent.id;
    if (values.bodyweight) state.profile.weight = Number(values.bodyweight);
    delete state.completedTasks[date];
    delete state.skippedTasks[date];
    state.taskCompletionUpdatedAt[date] = occurredAt;
    delete state.post[date];
    capturePlanSnapshot(date, "plan_assigned_after_check_in");
    saveState();
    render();
    const planMessages = {
      hold: "Health hold applied. Training was replaced with recovery guidance.",
      recovery: `Readiness ${readiness.score}/100 · session changed to a recovery-modified workload.`,
      reduced: `Readiness ${readiness.score}/100 · session volume reduced to about 75%.`,
      full: `Readiness ${readiness.score}/100 · full session available.`
    };
    showToast(planMessages[readiness.planLevel]);
    return;
  }

  if (form.id === "task-skip-form") {
    const values = formValues(form);
    const date = form.dataset.date;
    const taskId = form.dataset.task;
    const item = getSession(selectedWeekPlan(), state.selectedDay).tasks.find((taskItem) => taskItem.id === taskId);
    if (!item || item.stageTitle === "Health Hold") {
      activeSkipTask = null;
      render(true);
      showToast("That task cannot be skipped.");
      return;
    }
    activePlanStage = { date, stage: item.stage };
    const occurredAt = new Date().toISOString();
    const current = new Set(state.completedTasks[date] || []);
    current.delete(taskId);
    state.completedTasks[date] = [...current];
    state.skippedTasks[date] = {
      ...(state.skippedTasks[date] || {}),
      [taskId]: {
        taskId,
        taskName: item.name,
        reason: values.reason,
        notes: values.notes || "",
        skippedAt: occurredAt,
        updatedAt: occurredAt
      }
    };
    state.taskCompletionUpdatedAt[date] = occurredAt;
    delete state.post[date];
    delete state.editingPost;
    appendTrainingHistory("taskChanges", date, "task_skipped", {
      runId: state.pre[date]?.runId || "",
      taskId,
      taskName: item.name,
      reason: values.reason,
      notes: values.notes || ""
    }, { occurredAt });
    activeSkipTask = null;
    saveState({ label: "Session tasks" });
    render(true);
    showToast(values.reason === "Pain or symptom response"
      ? "Task skipped. Stop if symptoms are worsening and record them at check-out."
      : "Task skipped and recorded in your session history.");
    return;
  }

  if (form.id === "readiness-override-form") {
    const values = formValues(form);
    const date = form.dataset.date;
    const pre = state.pre[date];
    if (!pre || !["reduced", "recovery"].includes(pre.planLevel) || pre.risk === "red" || pre.warningSigns === "yes") {
      showToast("The original plan cannot be restored while a health hold is active.");
      return;
    }
    if (values.acknowledged !== "yes") {
      showToast("Confirm the training-choice statement before restoring the original plan.");
      return;
    }
    const occurredAt = new Date().toISOString();
    state.pre[date].manualOverride = {
      active: true,
      reason: values.reason,
      notes: values.notes || "",
      acknowledged: true,
      createdAt: occurredAt,
      updatedAt: occurredAt
    };
    state.pre[date].updatedAt = occurredAt;
    recordPlanChange(date, "manual_override_applied", {
      runId: state.pre[date]?.runId || "",
      reason: values.reason,
      notes: values.notes || "",
      acknowledged: true
    });
    delete state.completedTasks[date];
    delete state.skippedTasks[date];
    state.taskCompletionUpdatedAt[date] = occurredAt;
    delete state.post[date];
    delete state.editingPost;
    capturePlanSnapshot(date, "plan_reassigned_after_manual_override");
    saveState({ label: "Plan adjustment" });
    render();
    showToast("Original plan restored. No extra work was added and the recommendation remains recorded.");
    return;
  }

  if (form.id === "bullpen-pitch-form") {
    const values = formValues(form);
    const date = form.dataset.date;
    const draft = bullpenDraftForDate(date);
    if (!draft.target || !draft.actual) {
      showToast("Plot both the intended target and actual pitch location first.");
      return;
    }
    const record = bullpenForDate(date);
    const now = new Date().toISOString();
    const entry = {
      id: mediaId("pitch"),
      target: { ...draft.target },
      actual: { ...draft.actual },
      pitchType: values.pitchType || draft.pitchType,
      result: values.result || draft.result,
      velocity: values.velocity === "" ? "" : Number(values.velocity),
      notes: String(values.notes || "").trim(),
      createdAt: now,
      updatedAt: now
    };
    state.bullpens[date] = { entries: [...record.entries, entry], updatedAt: now };
    const score = bullpenSummary(state.bullpens[date].entries).score;
    resetBullpenDraft(date);
    saveState();
    render(true);
    showToast(`Pitch saved · bullpen command score ${score}/100.`);
    return;
  }

  if (form.id === "post-form") {
    const values = formValues(form);
    const low = Number(values.lowThrows || 0);
    const moderate = Number(values.moderateThrows || 0);
    const high = Number(values.highThrows || 0);
    const game = Number(values.gamePitches || 0);
    const duration = Number(values.duration || 0);
    const rpe = Number(values.rpe || 0);
    const date = form.dataset.date;
    const priorPost = state.post[date] || null;
    const priorUpdates = priorPost?.pbUpdates || [];
    const pbResult = applyPersonalBestResults(values, date);
    const occurredAt = new Date().toISOString();
    const skippedTaskRecords = Object.values(state.skippedTasks?.[date] || {});
    const postRecord = {
      ...values,
      lowThrows: low,
      moderateThrows: moderate,
      highThrows: high,
      gamePitches: game,
      totalThrows: low + moderate + high + game,
      estimatedLoad: low + moderate * 2 + high * 4 + game * 5,
      srpe: duration * rpe,
      estimated1RM: pbResult.e1rm || "",
      pbUpdates: pbResult.updates.length ? pbResult.updates : priorUpdates,
      skippedTaskCount: skippedTaskRecords.length,
      skippedTasks: skippedTaskRecords.map((item) => ({ ...item })),
      completedAt: new Date().toLocaleString("en-AU"),
      updatedAt: occurredAt
    };
    const checkOutEvent = appendTrainingHistory("checkOuts", date, priorPost ? "session_check_out_corrected" : "session_check_out_submitted", {
      runId: state.pre[date]?.runId || "",
      checkInId: state.pre[date]?.historyId || "",
      planSnapshotId: HistoryDomain.latestEvent(state.trainingHistory, "planSnapshots", date)?.id || "",
      completedTaskIds: [...(state.completedTasks[date] || [])],
      skippedTasks: skippedTaskRecords.map((item) => ({ ...item })),
      actual: { ...postRecord }
    }, {
      occurredAt,
      supersedesId: priorPost?.historyId || ""
    });
    state.post[date] = { ...postRecord, historyId: checkOutEvent.id };
    delete state.editingPost;
    saveState({ label: priorPost ? "Check-out correction" : "Session check-out" });
    render();
    if (pbResult.updates.length) {
      showToast(`New PB saved · ${pbUpdateMessage(pbResult.updates)} · future percentages updated.`);
    } else {
      showToast(Number(values.postShoulder) >= 5 || Number(values.postElbow) >= 5 ? "Session saved. Elevated symptoms should be reviewed before the next throw." : "Session saved and analytics updated.");
    }
    return;
  }

  if (form.id === "nutrition-barcode-form") {
    const values = formValues(form);
    nutritionUi.lookingUpBarcode = true;
    render(true);
    try {
      const result = await nutritionApiRequest(`/api/nutrition/barcode?code=${encodeURIComponent(values.barcode)}`);
      if (!result.found) throw new Error("That barcode was not found. Use the label or photo option instead.");
      replaceNutritionDraft(foodProductDraft(result.product));
      showToast("Product found. Confirm the serving and label values.");
    } catch (error) {
      showToast(error.message);
    } finally {
      nutritionUi.lookingUpBarcode = false;
      render(true);
    }
    return;
  }

  if (form.id === "nutrition-text-form") {
    const values = formValues(form);
    nutritionUi.mealDescription = String(values.description || "").trim();
    nutritionUi.analyzingText = true;
    nutritionUi.searchError = "";
    nutritionUi.searchMessage = "Checking the description and any named brand or menu item…";
    render(true);
    try {
      const result = await nutritionApiRequest("/api/nutrition/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: nutritionDate(), description: nutritionUi.mealDescription }),
        timeoutMs: 60_000
      });
      replaceNutritionDraft({
        id: mediaId("meal"),
        name: result.estimate.name,
        serving: result.estimate.serving || "",
        loggedAt: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }),
        calories: result.estimate.calories,
        protein: result.estimate.protein,
        carbs: result.estimate.carbs,
        fat: result.estimate.fat,
        confidence: result.officialMatch ? "verified" : result.estimate.confidence,
        source: result.source || "text_ai",
        notes: nutritionUi.mealDescription,
        items: result.estimate.items,
        assumptions: result.estimate.assumptions,
        sourceUrl: result.sourceUrl || "",
        sourceTitle: result.sourceTitle || "",
        evidence: result.evidence || ""
      });
      nutritionUi.searchMessage = result.notice || "Meal ready to review.";
      showToast(result.officialMatch ? "Official nutrition source matched. Review the serving, then save." : "Meal estimated. Review the portions and values, then save.");
    } catch (error) {
      nutritionUi.searchError = error.message || "The meal description could not be analysed.";
      nutritionUi.searchMessage = "";
    } finally {
      nutritionUi.analyzingText = false;
      render(true);
    }
    return;
  }

  if (form.id === "nutrition-food-search-form") {
    const values = formValues(form);
    nutritionUi.foodQuery = String(values.query || "").trim();
    nutritionUi.searchingFood = true;
    nutritionUi.foodResults = [];
    nutritionUi.searchError = "";
    nutritionUi.searchMessage = "";
    render(true);
    try {
      const result = await nutritionApiRequest(`/api/nutrition/search?query=${encodeURIComponent(nutritionUi.foodQuery)}`);
      nutritionUi.foodResults = Array.isArray(result.results) ? result.results : [];
      nutritionUi.searchMessage = nutritionUi.foodResults.length
        ? `${nutritionUi.foodResults.length} matching label record${nutritionUi.foodResults.length === 1 ? "" : "s"}. Choose one to review.`
        : "No matching product-label record was found. Try a brand name, barcode or meal photo.";
    } catch (error) {
      nutritionUi.searchError = error.message || "Food search could not be completed.";
    } finally {
      nutritionUi.searchingFood = false;
      render(true);
    }
    return;
  }

  if (form.id === "nutrition-restaurant-form") {
    const values = formValues(form);
    nutritionUi.lookingUpRestaurant = true;
    render(true);
    try {
      const result = await nutritionApiRequest(`/api/nutrition/restaurant?restaurant=${encodeURIComponent(values.restaurant)}&item=${encodeURIComponent(values.item)}`);
      if (!result.found) throw new Error(result.reason || "No exact official nutrition result was found. Use a photo and add the restaurant/item as a note.");
      const item = result.result;
      replaceNutritionDraft({
        id: mediaId("meal"),
        loggedAt: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }),
        name: item.name,
        serving: item.serving,
        calories: item.calories ?? "",
        protein: item.protein ?? "",
        carbs: item.carbs ?? "",
        fat: item.fat ?? "",
        source: "official_menu",
        confidence: "verified",
        notes: item.evidence || "Official restaurant nutrition source",
        sourceUrl: item.sourceUrl,
        assumptions: [`Source: ${item.sourceTitle || item.sourceUrl}`, "Confirm the exact menu variant and serving before saving."]
      });
      showToast("Official-source result found. Check the menu variant, then save.");
    } catch (error) {
      showToast(error.message);
    } finally {
      nutritionUi.lookingUpRestaurant = false;
      render(true);
    }
    return;
  }

  if (form.id === "nutrition-manual-form") {
    const values = formValues(form);
    replaceNutritionDraft({
      id: mediaId("meal"),
      loggedAt: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }),
      ...values,
      confidence: ["nutrition_label", "measured", "ausnut"].includes(values.source) ? "verified" : "medium",
      editing: false
    });
    render(true);
    document.querySelector(".nutrition-draft")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (form.id === "nutrition-confirm-form") {
    await saveNutritionDraft(form);
    return;
  }

  if (form.id === "nutrition-water-form") {
    const value = event.submitter?.value;
    const date = nutritionDate();
    const current = Number(state.nutrition.hydration[date] || 0);
    const next = value === "reset" ? 0 : clamp(round(current + Number(value || 0), 2), 0, 20);
    recordHydrationChange(date, next, value === "reset" ? "Reset day" : `${Number(value) >= 0 ? "+" : ""}${round(Number(value), 2)} L`);
    saveState({ label: "Hydration log" });
    render(true);
    showToast(value === "reset" ? "Today’s water reset." : `Water updated to ${state.nutrition.hydration[date]} L.`);
    return;
  }

  if (form.id === "nutrition-hydration-presets-form") {
    const values = formValues(form);
    state.nutrition.hydrationPresets = [...new Set([Number(values.presetOne), Number(values.presetTwo)].filter((value) => value > 0 && value <= 5))];
    saveState({ label: "Hydration settings" });
    render(true);
    showToast("Bottle sizes saved.");
    return;
  }

  if (form.id === "nutrition-sweat-form") {
    const values = formValues(form);
    const preKg = Number(values.preKg);
    const postKg = Number(values.postKg);
    const fluidLitres = Number(values.fluidLitres || 0);
    const urineLitres = Number(values.urineLitres || 0);
    const durationMinutes = Number(values.durationMinutes);
    const rawLoss = preKg - postKg + fluidLitres - urineLitres;
    const sweatLossLitres = Math.max(round(rawLoss, 2), 0);
    const sweatRate = durationMinutes > 0 ? round(sweatLossLitres / (durationMinutes / 60), 2) : 0;
    const date = form.dataset.date || nutritionDate();
    state.nutrition.sweatLoss[date] = { preKg, postKg, fluidLitres, urineLitres, durationMinutes, sweatLossLitres, sweatRate, updatedAt: new Date().toISOString() };
    saveState({ label: "Sweat-loss worksheet" });
    render(true);
    showToast(rawLoss < 0 ? "Worksheet saved, but the result was below zero. Recheck scale, clothing and fluid entries." : `Field estimate saved · ${sweatLossLitres} L · ${sweatRate} L/h.`);
    return;
  }

  if (form.id === "nutrition-reminders-form") {
    const values = formValues(form);
    let permission = typeof Notification === "undefined" ? "unavailable" : Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    const enabled = permission === "granted";
    state.nutrition.reminders = {
      enabled,
      intervalMinutes: Number(values.intervalMinutes || 90),
      quietStart: values.quietStart || "21:00",
      quietEnd: values.quietEnd || "07:00",
      trainingDaysOnly: values.trainingDaysOnly !== "no"
    };
    localStorage.setItem(HYDRATION_REMINDER_STORAGE, String(Date.now()));
    saveState({ label: "Hydration settings" });
    render(true);
    showToast(enabled ? "Hydration reminders enabled on this device." : "Notifications were not allowed. Settings were saved, but reminders remain off.");
    return;
  }

  if (form.id === "nutrition-targets-form") {
    const values = formValues(form);
    state.nutrition.targets = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value || 0)]));
    saveState({ label: "Nutrition targets" });
    render(true);
    showToast("Nutrition targets saved.");
    return;
  }

  if (form.id === "profile-form") {
    const values = formValues(form);
    state.profile = { ...state.profile, ...values, height: Number(values.height), weight: Number(values.weight) };
    saveState();
    render(true);
    showToast("Athlete profile saved.");
    return;
  }

  if (form.id === "mechanics-video-form") {
    const values = formValues(form);
    const openSideFile = form.elements.openSideVideo?.files?.[0];
    const rearFile = form.elements.rearVideo?.files?.[0];
    if (!openSideFile && !rearFile) {
      showToast("Add an open-side or rear-view pitching clip.");
      return;
    }
    const captureFiles = [
      ...(openSideFile ? [{ file: openSideFile, angle: "open_side", label: "OPEN SIDE", id: mediaId("pitchvideo") }] : []),
      ...(rearFile ? [{ file: rearFile, angle: "rear", label: "REAR", id: mediaId("pitchvideo") }] : [])
    ];
    if (captureFiles.some((item) => item.file.size > 95_000_000)) {
      showToast("Each pitching video must be smaller than 95 MB.");
      return;
    }
    const pitchContext = [values.pitchType, String(values.surface || "").replace("_", " "), values.intent ? `${values.intent}% intent` : "Intent not supplied", values.velocity ? `${values.velocity} mph` : "", values.notes].filter(Boolean).join(" · ");
    const analysisAngle = openSideFile && rearFile ? "dual" : rearFile ? "rear" : "open_side";
    const primaryFile = openSideFile || rearFile;
    mechanicsMediaState.uploading = true;
    mechanicsMediaState.analyzing = true;
    render(true);
    let analysisSaved = false;
    let savedVideoCount = 0;
    let analysisError = "";
    let uploadError = "";
    const analysisQuery = new URLSearchParams({
      fileName: primaryFile.name,
      capturedOn: values.capturedOn,
      angle: analysisAngle,
      pitchContext,
      notes: values.notes || ""
    });
    try {
      const contactSheet = await mechanicsContactSheet(captureFiles);
      const result = await privateApiRequest(`/api/mechanics/analyze?${analysisQuery}`, {
        method: "POST",
        headers: { "Content-Type": contactSheet.type || "image/jpeg" },
        body: contactSheet
      });
      const assessment = {
        ...result.analysis,
        id: `${values.capturedOn}-${Date.now().toString(36)}`,
        videoId: captureFiles[0].id,
        videoIds: captureFiles.map((item) => item.id),
        pitchType: values.pitchType,
        surface: values.surface,
        intent: Number(values.intent || 0),
        velocity: values.velocity === "" ? "" : Number(values.velocity),
        recordedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      assessment.efficiency = mechanicsEfficiency(assessment);
      state.mechanics.assessments = [...state.mechanics.assessments, assessment].slice(-60);
      saveState();
      analysisSaved = true;
    } catch (error) {
      analysisError = error.message || "AI mechanics analysis was unavailable";
    } finally {
      mechanicsMediaState.analyzing = false;
    }
    try {
      const uploads = await Promise.allSettled(captureFiles.map((capture) => {
        const query = new URLSearchParams({
          fileName: capture.file.name,
          capturedOn: values.capturedOn,
          angle: capture.angle,
          pitchContext,
          notes: values.notes || ""
        });
        return privateApiRequest(`/api/mechanics/videos/${encodeURIComponent(capture.id)}?${query}`, {
          method: "PUT",
          headers: { "Content-Type": capture.file.type || (capture.file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4") },
          body: capture.file
        });
      }));
      savedVideoCount = uploads.filter((item) => item.status === "fulfilled").length;
      const failedUpload = uploads.find((item) => item.status === "rejected");
      if (failedUpload?.status === "rejected") uploadError = failedUpload.reason?.message || "One view could not be uploaded";
      await loadMechanicsVideos(false);
    } catch (error) {
      uploadError = error.message || "The video could not be uploaded";
    } finally {
      mechanicsMediaState.uploading = false;
      render(true);
    }
    const savedViewLabel = analysisAngle === "dual" ? "Dual-view" : analysisAngle === "rear" ? "Rear-view" : "Open-side";
    if (analysisSaved && savedVideoCount === captureFiles.length) showToast(`${savedViewLabel} assessment saved.`);
    else if (analysisSaved) showToast(`Screening saved. Film storage: ${uploadError || `${savedVideoCount}/${captureFiles.length} views saved`}`);
    else if (savedVideoCount) showToast(`Film saved. AI screening: ${analysisError}`);
    else showToast(`${analysisError}. ${uploadError}.`);
    return;
  }

  if (form.id === "mechanics-form") {
    const values = formValues(form);
    const sourceLabels = {
      video2d: "2D video screening",
      coachReview: "Coach review",
      calibratedMarkerless: "Calibrated markerless",
      markerLab: "Marker-based lab",
      threeMotionReport: "3motionAI report values · athlete-entered"
    };
    const numericFields = ["velocity", "throwingHandSpeed", "hipShoulderSeparation", "layback", "armSlot", "stridePercentHeight", "trunkTilt", "pelvisTrunkTiming", "elbowFlexion", "shoulderAbduction", "horizontalAbduction", "kneeFlexion", "kneeExtensionVelocity", "sequenceRating", "lowerHalfRating", "trunkRating", "armTimingRating", "releaseRating", "decelerationRating"];
    const assessment = {
      ...values,
      id: `${values.date}-${Date.now().toString(36)}`,
      sourceLabel: sourceLabels[values.source] || "Biomechanics assessment",
      recordedAt: new Date().toISOString()
    };
    for (const field of numericFields) assessment[field] = values[field] === "" ? "" : Number(values[field]);
    if (values.source === "threeMotionReport") {
      assessment.summary = values.reportNotes || "3motionAI pitching-report values entered by the athlete. Interpret them against the original provider report.";
      assessment.confidence = "reported";
    }
    assessment.efficiency = mechanicsEfficiency(assessment);
    state.mechanics.assessments = [...state.mechanics.assessments, assessment].slice(-60);
    saveState();
    render(true);
    const proposalCount = mechanicsProposals(assessment).length;
    showToast(`Mechanics assessment saved${proposalCount ? ` · ${proposalCount} focus proposal${proposalCount === 1 ? "" : "s"} ready for review` : ""}.`);
    return;
  }

  if (form.id === "pb-form") {
    const values = formValues(form);
    const date = brisbaneToday();
    const occurredAt = new Date().toISOString();
    const corrections = [];
    state.pbs = mergePBs(state.pbs);
    for (const key of Object.keys(LIFT_PB_LABELS)) {
      const value = Number(values[key] || 0);
      const existing = state.pbs.lifts[key];
      if (value === Number(existing?.value || 0)) continue;
      const resultId = mediaId("result");
      const record = value > 0
        ? { value, kind: "tested", source: "Manual PB correction", date, updatedAt: occurredAt, resultId }
        : { value: 0, kind: "unestablished", source: "Manual PB reset", date, updatedAt: occurredAt, resultId };
      const result = {
        id: resultId,
        category: "lift",
        key,
        label: LIFT_PB_LABELS[key],
        previous: Number(existing?.value || 0),
        value,
        unit: "kg",
        kind: "manual_correction",
        source: record.source,
        date,
        recordedAt: occurredAt,
        isPersonalBest: false
      };
      state.pbs.lifts[key] = record;
      state.pbs.trainingMaxes.lifts[key] = { ...record };
      corrections.push(result);
      appendTrainingHistory("performanceResults", date, "strength_record_corrected", result, { occurredAt });
    }
    for (const key of Object.keys(VELOCITY_PB_LABELS)) {
      const value = Number(values[key] || 0);
      const existing = state.pbs.velocity[key];
      if (value === Number(existing?.value || 0)) continue;
      const resultId = mediaId("result");
      const record = value > 0
        ? { value, kind: "tested", source: "Manual PB correction", date, updatedAt: occurredAt, resultId }
        : { value: 0, kind: "unestablished", source: "Manual PB reset", date, updatedAt: occurredAt, resultId };
      const result = {
        id: resultId,
        category: "velocity",
        key,
        label: VELOCITY_PB_LABELS[key],
        previous: Number(existing?.value || 0),
        value,
        unit: "mph",
        kind: "manual_correction",
        source: record.source,
        date,
        recordedAt: occurredAt,
        isPersonalBest: false
      };
      state.pbs.velocity[key] = record;
      state.pbs.trainingMaxes.velocity[key] = { ...record };
      corrections.push(result);
      appendTrainingHistory("performanceResults", date, "velocity_record_corrected", result, { occurredAt });
    }
    if (corrections.length) state.pbs.history = [...state.pbs.history, ...corrections].slice(-250);
    saveState({ label: "Performance record correction" });
    render(true);
    showToast(corrections.length ? "Performance records corrected. Training percentages were recalculated and earlier results were retained." : "No performance-record changes were needed.");
  }
}

function updateRangeControl(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Math.min(max, Math.max(min, Number(input.value)));
  const progress = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const valueText = rangeValueText(input.name, value);
  input.style.setProperty("--range-progress", `${progress}%`);
  input.setAttribute("aria-valuetext", `${value} of ${max}, ${valueText}`);
  const output = document.querySelector(`[data-output="${input.name}"]`);
  const numberOutput = output?.querySelector("[data-range-number]");
  const textOutput = output?.querySelector("[data-range-text]");
  if (numberOutput) numberOutput.textContent = `${value}`;
  if (textOutput) textOutput.textContent = valueText;
}

function handleInput(event) {
  if (event.target.matches("[data-range]")) {
    updateRangeControl(event.target);
  }
  if (event.target.matches("[data-bullpen-draft]")) {
    const draft = bullpenDraftForDate(selectedDate());
    draft[event.target.name] = event.target.value;
  }
}

async function handleChange(event) {
  if (event.target.matches("[data-bullpen-draft]")) {
    const draft = bullpenDraftForDate(selectedDate());
    draft[event.target.name] = event.target.value;
  }
  if (["meal-photo-library", "meal-photo-camera"].includes(event.target.id) && event.target.files?.[0]) {
    const file = event.target.files[0];
    event.target.value = "";
    await analyzeSelectedMealPhoto(file);
    return;
  }
  if (event.target.id === "nutrition-date") {
    state.nutrition.selectedDate = event.target.value || brisbaneToday();
    releaseNutritionDraftPhoto();
    nutritionUi.draft = null;
    saveState({ cloud: false, touch: false });
    render();
    await loadNutritionPhotoUrls();
    return;
  }
  if (event.target.id === "pulse-import-file" && event.target.files?.[0]) {
    try {
      const imported = parsePulseExport(await event.target.files[0].text());
      state.pulseImports = { ...(state.pulseImports || {}), ...imported };
      saveState();
      render(true);
      const count = Object.keys(imported).length;
      showToast(`${count} PULSE record${count === 1 ? "" : "s"} imported and queued for encrypted cloud sync.`);
    } catch (error) {
      showToast(error.message || "The PULSE/TRAQ file could not be imported.");
    }
    event.target.value = "";
    return;
  }
  if (event.target.id === "profile-photo-file" && event.target.files?.[0]) {
    try {
      state.profile.photoDataUrl = await compressedProfilePhoto(event.target.files[0]);
      saveState();
      render(true);
      showToast("Profile photo saved and queued for encrypted cloud sync.");
    } catch (error) {
      showToast(error.message || "The profile photo could not be saved.");
    }
    event.target.value = "";
    return;
  }
  if (event.target.matches("[data-action='week-select']")) {
    state.selectedWeek = clamp(Number(event.target.value), 1, 52);
    saveState({ cloud: false, touch: false });
    render();
    return;
  }
  if (event.target.id === "import-file" && event.target.files?.[0]) {
    try {
      const parsed = JSON.parse(await event.target.files[0].text());
      const incoming = parsed.data || parsed;
      if (!incoming || incoming.version !== 1 || typeof incoming.pre !== "object" || typeof incoming.post !== "object") throw new Error("Invalid backup");
      state = hydrateState(incoming);
      state.page = "profile";
      saveState();
      render();
      showToast("Backup imported.");
    } catch {
      showToast("That file is not a valid Pitching OS backup.");
    }
  }
}

document.addEventListener("click", handleClick);
document.addEventListener("submit", handleSubmit);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleChange);
document.addEventListener("toggle", (event) => {
  const details = event.target;
  if (!details?.matches?.("[data-plan-stage]")) return;
  const date = selectedDate();
  const stage = Number(details.dataset.planStage);
  if (details.open) activePlanStage = { date, stage };
  else if (activePlanStage.date === date && Number(activePlanStage.stage) === stage) activePlanStage = { date, stage: null };
}, true);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && (activeModalTask || activeSkipTask)) {
    activeModalTask = null;
    activeSkipTask = null;
    render(true);
  }
});

let reconnectPromise = null;

function refreshCurrentData(resetToToday = false) {
  syncToTodayIfNeeded(resetToToday);
  if (navigator.onLine && !accountAuth.loading && !accountAuth.signedIn) {
    reconnectPromise ||= initializeAccountAuth()
      .then(async (connected) => {
        if (connected && cloudSync.key) {
          await Promise.all([loadIntegrationStatuses(false), loadHealthPrefill(selectedDate(), false, false)]);
          render(true);
        }
      })
      .catch((error) => { accountAuth.error = error.message || "Connection could not be restored"; })
      .finally(() => { reconnectPromise = null; });
    return;
  }
  if (cloudSync.key && cloudSync.ready && navigator.onLine) {
    reconcileCloudSync()
      .then(() => Promise.all([loadIntegrationStatuses(false), loadHealthPrefill(selectedDate(), false, false)]))
      .then(() => render(true))
      .catch((error) => setCloudStatus("error", error.message));
  }
}

function launchIntegrationNotice() {
  const ouraResult = launchParams.get("oura");
  if (!ouraResult) return;
  const messages = {
    connected: "Oura connected. Today's available sleep and readiness data will now prefill automatically.",
    denied: "Oura access was not granted.",
    expired: "The Oura connection request expired. Start the connection again.",
    "invalid-state": "The Oura security check failed. Start the connection again.",
    failed: "Oura could not be connected. Check the application settings and try again."
  };
  showToast(messages[ouraResult] || "Oura connection updated.");
  launchParams.delete("oura");
  launchParams.delete("page");
  window.history.replaceState({}, "", window.location.pathname);
}

async function initializeApp() {
  try {
    const signedIn = await initializeAccountAuth();
    if (signedIn && cloudSync.key) {
      await loadIntegrationStatuses(false);
      await loadHealthPrefill(selectedDate(), false, false);
    }
  } catch (error) {
    accountAuth.error = error.message || "Your account could not be opened";
    accountAuth.loading = false;
  }
  render();
  launchIntegrationNotice();
  if (accountAuth.signedIn && cloudSync.key) loadHealthHistory(false).catch(() => {});
}

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
window.addEventListener("pageshow", () => refreshCurrentData(true));
window.addEventListener("scroll", () => updateSmartNavigation(), { passive: true });
window.addEventListener("online", () => refreshCurrentData(false));
window.addEventListener("offline", () => {
  if (cloudSync.key) setCloudStatus("offline", "Saved locally; cloud will retry when online");
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshCurrentData(true); });
window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  if (appearancePreference() === "system") applyAppearancePreference();
});
window.setInterval(() => {
  if (document.visibilityState === "visible" && navigator.onLine && cloudSync.key && cloudSync.ready && !cloudSync.inFlight) {
    reconcileCloudSync().catch((error) => setCloudStatus("error", error.message));
  }
}, 120_000);
window.setInterval(checkHydrationReminder, 60_000);
migrateLegacyTrainingHistory();
syncToTodayIfNeeded();
render();
initializeApp();
