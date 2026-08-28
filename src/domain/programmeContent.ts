/* eslint-disable */
// @ts-nocheck
/**
 * Programme content and session generation, extracted VERBATIM from the
 * prototype (`legacy/app.js`) by `scripts/extract-programme.mjs`.
 *
 * This is the athlete's actual training programme: real loads, throw counts,
 * distances, effort percentages and stop-criteria. It is the only surviving
 * record of it — the source manual could not be located — so it is copied
 * rather than reinterpreted. Do not "tidy" the prescriptions.
 *
 * The one change from the original is mechanical: the prototype read training
 * maxes from a page-wide `state` singleton, which is threaded through
 * `setProgrammeContext` here so the module stays free of globals.
 *
 * @ts-nocheck is deliberate and scoped to this file only. The contents are a
 * verbatim copy of code already proven in production; annotating it would mean
 * editing the prescriptions, which is exactly what must not happen. Type
 * safety is restored at the boundary by `programmeSessions.ts`, which wraps
 * this module in a typed API, and behaviour is pinned by tests.
 */

export interface ProgrammeContext {
  pbs?: { trainingMaxes?: { lifts?: Record<string, { value: number; kind?: string }> } };
  /** Post-session reports, keyed by ISO date. Friday's game pitch count
   *  determines whether Saturday is recovery or a primer. */
  post?: Record<string, { gamePitches?: number } | undefined>;
}

let ctx: ProgrammeContext = {};

/** Supply training maxes so strength prescriptions resolve to real loads. */
export function setProgrammeContext(next: ProgrammeContext): void {
  ctx = next ?? {};
}

const ANNUAL_START = "2026-07-13";

const SUMMER_FIRST_GAME = "2026-10-02";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const LEGACY_PHASE_TABLE = [
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

const summerFocus = [
  "Opening workload baseline", "Recover between two game windows", "Maintain strength and command", "Four-week deload review",
  "Build appearance consistency", "Protect high-effort throw spacing", "Maintain power microdose", "Term 4 deload",
  "Late-Term 4 performance", "Hold Term 4 workload", "Christmas-break entry", "Term 1 return", "Re-establish game rhythm",
  "Command under game fatigue", "Maintain bodyweight and speed", "Late-season deload", "Performance push",
  "Hold velocity deeper", "Pre-Easter taper"
];

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

function roundToIncrement(value, increment = 2.5) {
  return Math.round(Number(value) / increment) * increment;
}

function liftLoadFromPB(liftKey, percent, increment = 2.5) {
  const value = Number(ctx.pbs?.trainingMaxes?.lifts?.[liftKey]?.value || 0);
  return value > 0 ? roundToIncrement(value * Number(percent) / 100, increment) : 0;
}

function strengthPrescription(liftKey, sets, reps, percent, fallback) {
  const load = liftLoadFromPB(liftKey, percent);
  const trainingMax = ctx.pbs?.trainingMaxes?.lifts?.[liftKey];
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

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function round(value, places = 0) { const scale = 10 ** places; return Math.round(value * scale) / scale; }

function phaseForWeek(week) {
  return LEGACY_PHASE_TABLE.find((phase) => week >= phase.weeks[0] && week <= phase.weeks[1]) || LEGACY_PHASE_TABLE[0];
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

function todaySelection() {
  const now = parseDate(brisbaneToday());
  const start = parseDate(ANNUAL_START);
  const diff = Math.floor((now - start) / 86400000);
  const selectedWeek = clamp(Math.floor(diff / 7) + 1, 1, 52);
  const selectedDay = diff < 0 ? 0 : diff > 363 ? 6 : ((diff % 7) + 7) % 7;
  return { selectedWeek, selectedDay, openDate: brisbaneToday() };
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
  const fridayPitches = Number((ctx.post ?? {})[fridayDate]?.gamePitches || 0);
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

export {
  LEGACY_PHASE_TABLE,
  TRAP_BAR_WEEK_SPECS,
  ANNUAL_START,
  getWeekPlan,
  todaySelection,
  standardSession,
  summerSession,
  recoveryOnlySession,
  transitionWednesdaySession,
  nonCompetitionSaturdaySession,
  applyReadinessToSession,
  adaptTaskForReadiness,
  isSummerCompetitionPhase,
  isTransitionPhase,
  phaseForWeek as legacyPhaseForWeek,
  isoDate,
  addDays,
  parseDate,
};
