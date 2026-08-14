"use strict";
var PitchingDomain = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/domain/index.ts
  var index_exports = {};
  __export(index_exports, {
    ANNUAL_START: () => ANNUAL_START,
    COOMERA_OPENER_DATE: () => COOMERA_OPENER_DATE,
    INVALID_V2_BACKUP_KEY: () => INVALID_V2_BACKUP_KEY,
    LEGACY_BACKUP_KEY: () => LEGACY_BACKUP_KEY,
    LEGACY_STORAGE_KEY: () => LEGACY_STORAGE_KEY,
    PROGRAMME_PHASES: () => PROGRAMME_PHASES,
    ROOT_V1_KEYS: () => ROOT_V1_KEYS,
    STORAGE_KEY_V2: () => STORAGE_KEY_V2,
    buildGymRecoveryPlan: () => buildGymRecoveryPlan,
    buildThrowingRecoveryPlan: () => buildThrowingRecoveryPlan,
    calculateProvisionalThrowingLoad: () => calculateProvisionalThrowingLoad,
    calendarEventForDate: () => calendarEventForDate,
    canOverrideReadiness: () => canOverrideReadiness,
    classifyThrowingLoadTier: () => classifyThrowingLoadTier,
    coldPolicy: () => coldPolicy,
    createDatedSession: () => createDatedSession,
    createTaskState: () => createTaskState,
    datedTaskId: () => datedTaskId,
    evaluateReadiness: () => evaluateReadiness,
    evaluateSafety: () => evaluateSafety,
    getAnnualPlan: () => getAnnualPlan,
    getAnnualWeek: () => getAnnualWeek,
    getCalendarEvents: () => getCalendarEvents,
    getPhaseForWeek: () => getPhaseForWeek,
    isPosteriorStretchBlocked: () => isPosteriorStretchBlocked,
    isRecord: () => isRecord,
    isoDate: () => isoDate,
    migrateLocalStorage: () => migrateLocalStorage,
    migrateV1State: () => migrateV1State,
    migrateV2State: () => migrateV2State,
    parseAppStateV2: () => parseAppStateV2,
    parseBackupJson: () => parseBackupJson,
    parseLegacyV1Root: () => parseLegacyV1Root,
    postScapularRangeAnnotation: () => postScapularRangeAnnotation,
    programmeWeekForDate: () => programmeWeekForDate,
    protocolLengthForTier: () => protocolLengthForTier,
    schemaVersion: () => schemaVersion,
    taskProgress: () => taskProgress,
    transitionTaskState: () => transitionTaskState
  });

  // src/domain/annual-plan.ts
  var ANNUAL_START = "2026-07-13";
  var PROGRAMME_PHASES = Object.freeze([
    Object.freeze({ id: "winter_ball", name: "Winter Ball", startWeek: 1, endWeek: 12, summary: "Maintain competition performance while progressing force to power." }),
    Object.freeze({ id: "transition", name: "Transition", startWeek: 13, endWeek: 14, summary: "Unload, restore movement and retain basic strength." }),
    Object.freeze({ id: "velocity_development", name: "Velocity Development", startWeek: 15, endWeek: 26, summary: "Build extension and intent, then convert it to the mound." }),
    Object.freeze({ id: "preseason", name: "Preseason", startWeek: 27, endWeek: 36, summary: "Build mound volume and game-specific work capacity." }),
    Object.freeze({ id: "summer_season", name: "Summer Season", startWeek: 37, endWeek: 52, summary: "Perform, recover and maintain strength around competition." })
  ]);
  var WINTER_WEEKS = [
    ["Baseline quality", "Trap bar deadlift 4 \xD7 5 @ 120 kg", "8 pulldowns; establish a clean baseline", "Log full readiness and game workload"],
    ["Add force", "Trap bar deadlift 4 \xD7 5 @ 122.5 kg", "8 pulldowns; match Week 1 intent", "Repeat load if final set exceeds RPE 8"],
    ["Heavier triples", "Trap bar deadlift 5 \xD7 3 @ 127.5 kg", "8 pulldowns; protect velocity quality", "Keep all lifting reps crisp"],
    ["Force peak", "Trap bar deadlift 5 \xD7 3 @ 130 kg", "6\u20138 pulldowns; stop before fatigue", "Block review: velocity, soreness, game load"],
    ["Strength-speed entry", "Trap bar deadlift 6 \xD7 2 @ 120 kg", "8 pulldowns; faster build-up", "Maximum concentric intent"],
    ["Strength-speed build", "Trap bar deadlift 6 \xD7 2 @ 122.5 kg", "8\u201310 pulldowns if readiness is green", "Hold Wednesday lift to 40 minutes"],
    ["Strength-speed peak", "Trap bar deadlift 6 \xD7 2 @ 125 kg", "8 pulldowns; best-six average", "No grinders; record bar-speed impression"],
    ["Deload and assess", "Trap bar deadlift 4 \xD7 2 @ 115 kg", "6 pulldowns at 90\u201395%", "Reduce gym accessories by one set"],
    ["Power conversion", "Trap bar deadlift 4 \xD7 2 @ 110 kg", "6\u20138 high-quality pulldowns", "Light medicine ball; fast outputs"],
    ["Power build", "Trap bar deadlift 4 \xD7 2 @ 112.5 kg", "8 pulldowns; full recovery", "Maintain bodyweight and sleep"],
    ["Power peak", "Trap bar deadlift 4 \xD7 2 @ 115 kg", "6\u20138 pulldowns; no velocity chase", "Game freshness takes priority"],
    ["Winter review", "Trap bar deadlift 3 \xD7 2 @ 105 kg", "4\u20136 pulldowns at 90%", "Review the full 12-week dashboard"]
  ];
  var TRANSITION_WEEKS = [
    ["Unload and restore", "Trap bar deadlift 3 \xD7 5 @ RPE 6", "No pulldowns; easy catch only", "Throwing volume down 45\u201355%"],
    ["Rebuild movement", "Trap bar deadlift 3 \xD7 4 @ RPE 6\u20137", "Moderate catch; one controlled mound touch", "Finish every session fresh"]
  ];
  var VELOCITY_WEEKS = [
    ["Extension base", "Trap bar deadlift 4 \xD7 4 @ 110 kg", "Long toss foundation; 6 pulldowns", "Establish distance and recovery baseline"],
    ["Extension build", "Trap bar deadlift 4 \xD7 4 @ 112.5 kg", "Add 15\u201330 ft if mechanics hold", "No consecutive high-intent days"],
    ["Intent entry", "Trap bar deadlift 5 \xD7 3 @ 117.5 kg", "8 pulldowns; radar best six", "Track high-effort throw count"],
    ["Deload", "Trap bar deadlift 3 \xD7 3 @ 105 kg", "5\u20136 pulldowns at 90\u201395%", "Throwing volume down 25%"],
    ["Overload strength", "Trap bar deadlift 5 \xD7 3 @ 120 kg", "8 pulldowns; stable direction", "Medicine ball 3 kg"],
    ["Speed-strength", "Trap bar deadlift 6 \xD7 2 @ 115 kg", "8\u201310 pulldowns if green", "Stop at two-throw velocity drop"],
    ["Speed-strength build", "Trap bar deadlift 6 \xD7 2 @ 117.5 kg", "Top-six average target", "Keep mound volume moderate"],
    ["Test and deload", "Trap bar deadlift 3 \xD7 2 @ 105 kg", "Test day: 6\u20138 quality throws", "Compare peak and average, not peak alone"],
    ["Mound conversion", "Trap bar deadlift 4 \xD7 3 @ 112.5 kg", "Pulldown volume down; bullpen up", "Fastball command before secondary volume"],
    ["Mound build", "Trap bar deadlift 4 \xD7 3 @ 115 kg", "20\u201325 pitch competitive bullpen", "One high-output exposure only"],
    ["Live intent", "Trap bar deadlift 4 \xD7 2 @ 115 kg", "Live AB or game-intent bullpen", "Full recovery between hitters"],
    ["Velocity block review", "Trap bar deadlift 3 \xD7 2 @ 105 kg", "Low-volume test; no fatigue chase", "Review 12-week velocity trend"]
  ];
  var PRESEASON_WEEKS = [
    ["Mound foundation", "Trap bar deadlift 4 \xD7 3 @ 115 kg", "25-pitch bullpen", "Build repeatable strike intent"],
    ["Pitch mix", "Trap bar deadlift 4 \xD7 3 @ 117.5 kg", "30-pitch bullpen", "Fastball/changeup command"],
    ["Two-inning shape", "Trap bar deadlift 5 \xD7 2 @ 117.5 kg", "2 \xD7 15-pitch innings", "Five-minute inning break"],
    ["Deload", "Trap bar deadlift 3 \xD7 3 @ 105 kg", "20-pitch touch-and-feel bullpen", "Volume down 30%"],
    ["Three-inning build", "Trap bar deadlift 4 \xD7 2 @ 115 kg", "3 \xD7 15-pitch innings", "Game routines between innings"],
    ["Live hitters", "Trap bar deadlift 4 \xD7 2 @ 117.5 kg", "Live hitters; 45\u201355 pitches", "Track first-pitch strikes"],
    ["Work capacity", "Trap bar deadlift 4 \xD7 2 @ 115 kg", "55\u201365 pitch simulation", "Recovery begins immediately"],
    ["Game rehearsal", "Trap bar deadlift 3 \xD7 2 @ 110 kg", "65\u201375 pitch simulation", "Use complete pregame routine"],
    ["Taper", "Trap bar deadlift 3 \xD7 2 @ 105 kg", "Short pen; 15\u201320 pitches", "Reduce total training volume"],
    ["Preseason review", "Trap bar deadlift 2 \xD7 2 @ 100 kg", "Competition-ready touch", "Confirm summer role and pitch limits"]
  ];
  var SUMMER_FOCUS = [
    "Opening workload baseline",
    "Recover between two game windows",
    "Maintain strength and command",
    "Four-week deload review",
    "Build appearance consistency",
    "Protect high-effort throw spacing",
    "Maintain power microdose",
    "Term 4 deload",
    "Late-Term 4 performance + hold Term 4 workload",
    "Christmas-break entry",
    "Term 1 return + re-establish game rhythm",
    "Command under game fatigue",
    "Maintain bodyweight and speed",
    "Late-season deload",
    "Performance push + hold velocity deeper",
    "Pre-Easter taper"
  ];
  var SUMMER_WEEKS = SUMMER_FOCUS.map((focus, index) => {
    const deload = [3, 7, 13, 15].includes(index);
    return [
      focus,
      deload ? "Wednesday full body 2\u20133 sets @ RPE 6" : "Wednesday full body 3\u20134 sets @ RPE 6\u20137",
      "Training Tue/Thu; games Fri/Sun; no separate velocity day",
      deload ? "Reduce non-game work 25% and review appearance load" : "Friday workload determines Saturday recovery or primer"
    ];
  });
  var PHASE_WEEKS = Object.freeze({
    winter_ball: WINTER_WEEKS,
    transition: TRANSITION_WEEKS,
    velocity_development: VELOCITY_WEEKS,
    preseason: PRESEASON_WEEKS,
    summer_season: SUMMER_WEEKS
  });
  function getPhaseForWeek(week) {
    if (!Number.isInteger(week) || week < 1 || week > 52) {
      throw new RangeError("Programme week must be between 1 and 52");
    }
    const phase = PROGRAMME_PHASES.find((candidate) => week >= candidate.startWeek && week <= candidate.endWeek);
    if (!phase) throw new Error(`No programme phase covers Week ${week}`);
    return phase;
  }
  function createAnnualPlan() {
    return Object.freeze(Array.from({ length: 52 }, (_, index) => {
      const week = index + 1;
      const phase = getPhaseForWeek(week);
      const prescription = PHASE_WEEKS[phase.id][week - phase.startWeek];
      if (!prescription) throw new Error(`Week ${week} is missing its approved prescription`);
      return Object.freeze({
        week,
        phase,
        focus: prescription[0],
        mondayLift: prescription[1],
        throwing: prescription[2],
        recovery: prescription[3]
      });
    }));
  }
  var ANNUAL_PLAN = createAnnualPlan();
  function getAnnualPlan() {
    return ANNUAL_PLAN;
  }
  function getAnnualWeek(week) {
    getPhaseForWeek(week);
    return ANNUAL_PLAN[week - 1];
  }

  // src/domain/calendar.ts
  var ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  function isoDate(value) {
    if (!ISO_DATE_PATTERN.test(value)) throw new Error("Date must use YYYY-MM-DD");
    const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error("Date is not a valid calendar day");
    }
    return value;
  }
  function addDays(value, amount) {
    const date = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return isoDate(date.toISOString().slice(0, 10));
  }
  var FNC_DATES = [
    [12, "2026-07-18"],
    [13, "2026-07-25"],
    [14, "2026-08-01"],
    [15, "2026-08-08"],
    [16, "2026-08-15"],
    [17, "2026-08-22"],
    [18, "2026-08-29"],
    [19, "2026-09-05"]
  ];
  var COOMERA_OPENER_DATE = isoDate("2026-10-02");
  var CALENDAR_EVENTS = Object.freeze([
    ...FNC_DATES.map(([round, date]) => Object.freeze({
      id: `fncba-2026-r${round}`,
      date: isoDate(date),
      type: "game",
      team: "Norths",
      label: `FNCBA Division 1 Round ${round}`,
      source: "official"
    })),
    Object.freeze({
      id: "coomera-cubs-2026-10-02",
      date: COOMERA_OPENER_DATE,
      type: "game",
      team: "Coomera Cubs",
      label: "Coomera Cubs opening game",
      source: "athlete-provided"
    })
  ]);
  function getCalendarEvents() {
    return CALENDAR_EVENTS;
  }
  function calendarEventForDate(date) {
    const validDate = isoDate(date);
    return CALENDAR_EVENTS.find((event) => event.date === validDate) || null;
  }
  function programmeWeekForDate(date) {
    const validDate = isoDate(date);
    const start = isoDate(ANNUAL_START);
    const difference = Math.floor((Date.parse(`${validDate}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 864e5);
    if (difference < 0 || difference > 363) throw new RangeError("Date is outside the 52-week programme");
    const week = Math.floor(difference / 7) + 1;
    const weekStart = addDays(start, (week - 1) * 7);
    return Object.freeze({
      ...getAnnualWeek(week),
      start: weekStart,
      end: addDays(weekStart, 6),
      dayIndex: difference % 7
    });
  }

  // src/domain/task-state.ts
  var TASK_STATUSES = [
    "not-attempted",
    "completed",
    "modified",
    "skipped"
  ];
  function boundedText(value, field, required = false) {
    const text = typeof value === "string" ? value.trim() : "";
    if (required && !text) throw new Error(`${field} is required`);
    if (text.length > 500) throw new Error(`${field} is too long`);
    return text;
  }
  function validTimestamp(value) {
    return Boolean(value) && Number.isFinite(Date.parse(value));
  }
  function createTaskState(taskId) {
    const id = boundedText(taskId, "Task ID", true);
    return Object.freeze({
      taskId: id,
      status: "not-attempted",
      reason: "",
      modification: "",
      notes: "",
      updatedAt: ""
    });
  }
  function transitionTaskState(current, transition) {
    if (!TASK_STATUSES.includes(transition.status)) throw new Error("Task status is invalid");
    if (!validTimestamp(transition.updatedAt)) throw new Error("Task state requires a valid updatedAt timestamp");
    const reason = boundedText(
      transition.reason,
      "Task state reason",
      transition.status === "modified" || transition.status === "skipped"
    );
    const modification = boundedText(
      transition.modification,
      "Task modification",
      transition.status === "modified"
    );
    const notes = boundedText(transition.notes, "Task state notes");
    return Object.freeze({
      taskId: current.taskId,
      status: transition.status,
      reason: transition.status === "not-attempted" || transition.status === "completed" ? "" : reason,
      modification: transition.status === "modified" ? modification : "",
      notes: transition.status === "not-attempted" ? "" : notes,
      updatedAt: transition.updatedAt
    });
  }
  function taskProgress(states) {
    const values = Object.values(states);
    const completed = values.filter((state) => state.status === "completed").length;
    const modified = values.filter((state) => state.status === "modified").length;
    const skipped = values.filter((state) => state.status === "skipped").length;
    const notAttempted = values.filter((state) => state.status === "not-attempted").length;
    return Object.freeze({
      total: values.length,
      resolved: completed + modified + skipped,
      performed: completed + modified,
      completed,
      modified,
      skipped,
      notAttempted
    });
  }

  // src/domain/sessions.ts
  function cloneTask(task, id) {
    return Object.freeze({ ...JSON.parse(JSON.stringify(task)), id });
  }
  function taskSuffix(sourceId, index) {
    const stripped = sourceId.replace(/^w\d+-d\d+(?:-[a-z]+)?-/i, "").trim();
    const normalized = stripped.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
    return normalized || `task-${index + 1}`;
  }
  function datedTaskId(date, sourceId, index = 0) {
    return `${isoDate(date)}::${taskSuffix(sourceId, index)}`;
  }
  function createDatedSession(date, planRevision, plannedSession2) {
    const validDate = isoDate(date);
    if (!Number.isInteger(planRevision) || planRevision < 1) throw new Error("Plan revision must be a positive integer");
    if (!plannedSession2 || !Array.isArray(plannedSession2.tasks) || !plannedSession2.tasks.length) {
      throw new Error("A dated session requires at least one planned task");
    }
    const seen = /* @__PURE__ */ new Set();
    const tasks = plannedSession2.tasks.map((task, index) => {
      let id = datedTaskId(validDate, task.id, index);
      if (seen.has(id)) id = `${id}-${index + 1}`;
      seen.add(id);
      return cloneTask(task, id);
    });
    const taskStates = Object.freeze(Object.fromEntries(tasks.map((task) => [task.id, createTaskState(task.id)])));
    const week = programmeWeekForDate(validDate);
    const event = calendarEventForDate(validDate);
    const plan = Object.freeze({
      ...JSON.parse(JSON.stringify(plannedSession2)),
      tasks: Object.freeze(tasks)
    });
    return Object.freeze({
      id: `session:${validDate}:r${planRevision}`,
      date: validDate,
      programmeWeek: week.week,
      dayIndex: week.dayIndex,
      phaseId: week.phase.id,
      planRevision,
      calendarEventId: event?.id || "",
      plan,
      taskStates
    });
  }

  // src/domain/state-schema.ts
  var ROOT_V2_KEYS = /* @__PURE__ */ new Set([
    "version",
    "onboardingComplete",
    "syncUpdatedAt",
    "sessions",
    "pre",
    "post",
    "healthPrefill",
    "healthHistoryFetchedAt",
    "pulseImports",
    "bullpens",
    "weeklyReviews",
    "trainingHistory",
    "mechanics",
    "nutrition",
    "pbs",
    "profile",
    "page",
    "selectedWeek",
    "selectedDay",
    "lastOpenDate",
    "editingPost"
  ]);
  var ROOT_V1_KEYS = /* @__PURE__ */ new Set([
    ...ROOT_V2_KEYS,
    "completedTasks",
    "skippedTasks",
    "taskCompletionUpdatedAt"
  ]);
  var HISTORY_COLLECTIONS = /* @__PURE__ */ new Set([
    "planSnapshots",
    "checkIns",
    "taskChanges",
    "checkOuts",
    "performanceResults",
    "planChanges"
  ]);
  var TASK_STATUSES2 = /* @__PURE__ */ new Set(["not-attempted", "completed", "modified", "skipped"]);
  var PAGES = /* @__PURE__ */ new Set(["dashboard", "session", "annual", "analytics", "nutrition", "mechanics", "profile", "integrations"]);
  var PLANNED_SESSION_KEYS = /* @__PURE__ */ new Set([
    "title",
    "focus",
    "duration",
    "stress",
    "description",
    "originalDescription",
    "adaptation",
    "tasks"
  ]);
  var ADAPTATION_KEYS = /* @__PURE__ */ new Set(["level", "factor", "gameDay", "reasons"]);
  var ADAPTATION_LEVELS = /* @__PURE__ */ new Set(["reduced", "recovery"]);
  var PLANNED_TASK_KEYS = /* @__PURE__ */ new Set([
    "id",
    "stage",
    "stageTitle",
    "stageDescription",
    "name",
    "prescription",
    "cue",
    "setup",
    "execution",
    "rest",
    "stop",
    "adapted",
    "adaptationNote",
    "originalPrescription"
  ]);
  var PRE_KEYS = /* @__PURE__ */ new Set([
    "sleepHours",
    "bodyweight",
    "sleepQuality",
    "energy",
    "mood",
    "stress",
    "previousSessionResponse",
    "previousSessionDate",
    "warningSigns",
    "ouraReadinessScore",
    "sleepScore",
    "restingHeartRate",
    "hrvMs",
    "ouraActivityScore",
    "ouraSteps",
    "ouraStressHighMinutes",
    "ouraRecoveryHighMinutes",
    "ouraTemperatureDeviation",
    "ouraSpO2",
    "ouraRestMode",
    "shoulder",
    "elbow",
    "forearm",
    "lat",
    "lower",
    "painfulMovement",
    "illness",
    "notes",
    "formulaId",
    "label",
    "score",
    "risk",
    "planLevel",
    "workloadFactor",
    "reasons",
    "signals",
    "safety",
    "runId",
    "hrvSource",
    "restingHeartRateSource",
    "sleepHoursSource",
    "baselines",
    "submittedAt",
    "updatedAt",
    "historyId",
    "manualOverride"
  ]);
  var POST_KEYS = /* @__PURE__ */ new Set([
    "duration",
    "rpe",
    "lowThrows",
    "moderateThrows",
    "highThrows",
    "gamePitches",
    "velocityType",
    "bestVelo",
    "top5Velo",
    "pbLift",
    "liftResultType",
    "bestSetWeight",
    "bestSetReps",
    "bestSetRpe",
    "pulseTotalThrows",
    "pulseWorkload",
    "acRatio",
    "pulseArmSpeed",
    "pulseTorque",
    "pulseBallVelocity",
    "postShoulder",
    "postElbow",
    "postPainfulMovement",
    "notes",
    "totalThrows",
    "estimatedLoad",
    "estimatedLoadFormulaId",
    "estimatedLoadLabel",
    "srpe",
    "estimated1RM",
    "pbUpdates",
    "skippedTaskCount",
    "skippedTasks",
    "modifiedTaskCount",
    "modifiedTasks",
    "safety",
    "completedAt",
    "updatedAt",
    "historyId"
  ]);
  var HEALTH_PREFILL_KEYS = /* @__PURE__ */ new Set(["day", "merged", "sources", "error", "fetchedAt"]);
  var PULSE_IMPORT_KEYS = /* @__PURE__ */ new Set(["source", "importedAt", "totalThrows", "highThrows", "pulseWorkload", "acRatio", "pulseArmSpeed", "pulseTorque", "pulseBallVelocity"]);
  var BULLPEN_KEYS = /* @__PURE__ */ new Set(["entries", "updatedAt"]);
  var WEEKLY_REVIEW_KEYS = /* @__PURE__ */ new Set(["week", "targetWeek", "proposal", "decision", "snapshot", "decidedAt", "updatedAt"]);
  var MECHANICS_KEYS = /* @__PURE__ */ new Set(["assessments", "approvedInterventions"]);
  var NUTRITION_KEYS = /* @__PURE__ */ new Set(["selectedDate", "targets", "meals", "savedMeals", "hydration", "hydrationEvents", "hydrationPresets", "sweatLoss", "reminders"]);
  var PB_KEYS = /* @__PURE__ */ new Set(["lifts", "velocity", "trainingMaxes", "history"]);
  var LIFT_PB_KEYS = /* @__PURE__ */ new Set(["trapBarDeadlift", "benchPress", "backSquat", "pushPress"]);
  var VELOCITY_PB_KEYS = /* @__PURE__ */ new Set(["pulldown", "gameFastball"]);
  var PB_RECORD_KEYS = /* @__PURE__ */ new Set(["value", "kind", "source", "date", "updatedAt", "resultId"]);
  var PB_HISTORY_KEYS = /* @__PURE__ */ new Set([
    "id",
    "category",
    "key",
    "label",
    "previous",
    "value",
    "unit",
    "kind",
    "source",
    "workingSet",
    "date",
    "recordedAt",
    "isPersonalBest"
  ]);
  var MECHANICS_ASSESSMENT_KEYS = /* @__PURE__ */ new Set([
    "id",
    "source",
    "sourceLabel",
    "measurementClass",
    "schemaVersion",
    "date",
    "pitchContext",
    "cameraAngle",
    "analyzable",
    "captureQuality",
    "summary",
    "confidence",
    "confidenceReason",
    "sequenceRating",
    "lowerHalfRating",
    "trunkRating",
    "armTimingRating",
    "releaseRating",
    "decelerationRating",
    "screening",
    "phaseReview",
    "observations",
    "limitations",
    "aiInterventions",
    "model",
    "analyzedAt",
    "videoId",
    "videoIds",
    "pitchType",
    "surface",
    "intent",
    "velocity",
    "recordedAt",
    "updatedAt",
    "efficiency",
    "providerReference",
    "protocolVersion",
    "throwingHandSpeed",
    "hipShoulderSeparation",
    "layback",
    "armSlot",
    "stridePercentHeight",
    "trunkTilt",
    "pelvisTrunkTiming",
    "elbowFlexion",
    "shoulderAbduction",
    "horizontalAbduction",
    "kneeFlexion",
    "kneeExtensionVelocity",
    "reportNotes",
    "notes"
  ]);
  var MECHANICS_INTERVENTION_KEYS = /* @__PURE__ */ new Set([
    "id",
    "assessmentId",
    "issue",
    "rating",
    "label",
    "drill",
    "drillDose",
    "drillCue",
    "gymTarget",
    "gymCue",
    "rationale",
    "active",
    "approvedAt"
  ]);
  var MEAL_KEYS = /* @__PURE__ */ new Set([
    "id",
    "name",
    "serving",
    "loggedAt",
    "calories",
    "protein",
    "carbs",
    "fat",
    "confidence",
    "source",
    "notes",
    "items",
    "assumptions",
    "sourceUrl",
    "sourceTitle",
    "evidence",
    "photoId",
    "confirmedAt",
    "updatedAt",
    "deletedAt"
  ]);
  var HYDRATION_EVENT_KEYS = /* @__PURE__ */ new Set(["id", "previous", "next", "delta", "label", "createdAt", "updatedAt", "undoneAt"]);
  var SWEAT_LOSS_KEYS = /* @__PURE__ */ new Set([
    "preKg",
    "postKg",
    "fluidLitres",
    "urineLitres",
    "durationMinutes",
    "sweatLossLitres",
    "sweatRate",
    "updatedAt"
  ]);
  var PROFILE_KEYS = /* @__PURE__ */ new Set([
    "name",
    "photoDataUrl",
    "height",
    "weight",
    "throwingHand",
    "role",
    "winterRotation",
    "summerGames",
    "summerTraining",
    "gym",
    "winterTeam",
    "summerTeam",
    "appearance",
    "glassIntensity",
    "interfaceDensity",
    "motionPreference",
    "navigationBehavior",
    "programTemplate",
    "trapBar",
    "bench",
    "squat",
    "updatedAt"
  ]);
  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function assertRecord(value, path) {
    if (!isRecord(value)) throw new Error(`${path} must be an object`);
    return value;
  }
  function assertKnownKeys(record2, allowed, path) {
    const unknown = Object.keys(record2).find((key) => !allowed.has(key));
    if (unknown) throw new Error(`${path} contains unknown field ${unknown}`);
  }
  function assertTimestamp(value, path, allowBlank = true) {
    if (value === "" && allowBlank) return "";
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${path} must be a valid timestamp`);
    return value;
  }
  function cloneJson(value, path, depth = 0) {
    if (depth > 12) throw new Error(`${path} exceeds the maximum nesting depth`);
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.length > 4e6) throw new Error(`${path} contains an oversized string`);
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`);
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length > 1e4) throw new Error(`${path} contains too many items`);
      return value.map((item, index) => cloneJson(item, `${path}[${index}]`, depth + 1));
    }
    const record2 = assertRecord(value, path);
    const entries = Object.entries(record2);
    if (entries.length > 1e4) throw new Error(`${path} contains too many fields`);
    return Object.fromEntries(entries.map(([key, item]) => {
      if (key.length > 200) throw new Error(`${path} contains an oversized key`);
      return [key, cloneJson(item, `${path}.${key}`, depth + 1)];
    }));
  }
  function jsonRecord(value, path) {
    return cloneJson(assertRecord(value, path), path);
  }
  function strictJsonRecord(value, path, allowed) {
    const record2 = assertRecord(value, path);
    assertKnownKeys(record2, allowed, path);
    return cloneJson(record2, path);
  }
  function numberField(record2, key, path, minimum, maximum, integer = false) {
    const value = record2[key];
    if (value === void 0 || value === null || value === "") return;
    if (typeof value !== "number" && typeof value !== "string" || typeof value === "string" && !value.trim()) {
      throw new Error(`${path}.${key} must be a number`);
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum || integer && !Number.isInteger(numeric)) {
      throw new Error(`${path}.${key} must be ${integer ? "an integer" : "a number"} between ${minimum} and ${maximum}`);
    }
  }
  function enumField(record2, key, path, allowed) {
    const value = record2[key];
    if (value === void 0 || value === null || value === "") return;
    if (typeof value !== "string" || !allowed.has(value)) throw new Error(`${path}.${key} is invalid`);
  }
  function textField(record2, key, path, maximum = 1e4) {
    const value = record2[key];
    if (value === void 0 || value === null) return;
    if (typeof value !== "string" || value.length > maximum) throw new Error(`${path}.${key} must be text no longer than ${maximum} characters`);
  }
  function textArray(value, path, maximumItems, maximumLength = 500) {
    if (!Array.isArray(value) || value.length > maximumItems || value.some((item) => typeof item !== "string" || item.length > maximumLength)) {
      throw new Error(`${path} must be an array of at most ${maximumItems} text values`);
    }
  }
  function timestampField(record2, key, path) {
    if (record2[key] !== void 0) assertTimestamp(record2[key], `${path}.${key}`);
  }
  function validateRecordArray(value, path, maximumItems, allowed, validate) {
    if (!Array.isArray(value) || value.length > maximumItems) throw new Error(`${path} must be an array with at most ${maximumItems} items`);
    value.forEach((candidate, index) => {
      const itemPath = `${path}[${index}]`;
      const record2 = assertRecord(candidate, itemPath);
      assertKnownKeys(record2, allowed, itemPath);
      validate(record2, itemPath);
    });
  }
  function validatePre(record2, path) {
    numberField(record2, "sleepHours", path, 0, 24);
    numberField(record2, "bodyweight", path, 35, 250);
    for (const key of ["sleepQuality", "energy", "mood", "stress"]) numberField(record2, key, path, 1, 5, true);
    for (const key of ["shoulder", "elbow", "forearm", "lat", "lower"]) numberField(record2, key, path, 0, 10, true);
    for (const key of ["ouraReadinessScore", "sleepScore", "ouraActivityScore", "ouraSpO2", "score"]) numberField(record2, key, path, 0, 100);
    numberField(record2, "restingHeartRate", path, 20, 240);
    numberField(record2, "hrvMs", path, 0, 500);
    numberField(record2, "ouraSteps", path, 0, 25e4, true);
    numberField(record2, "ouraStressHighMinutes", path, 0, 1440);
    numberField(record2, "ouraRecoveryHighMinutes", path, 0, 1440);
    numberField(record2, "ouraTemperatureDeviation", path, -10, 10);
    numberField(record2, "workloadFactor", path, 0, 1);
    for (const key of ["warningSigns", "ouraRestMode", "painfulMovement", "illness"]) enumField(record2, key, path, /* @__PURE__ */ new Set(["yes", "no"]));
    enumField(record2, "risk", path, /* @__PURE__ */ new Set(["green", "yellow", "orange", "red"]));
    enumField(record2, "planLevel", path, /* @__PURE__ */ new Set(["full", "reduced", "recovery", "hold"]));
    for (const key of ["previousSessionResponse", "notes", "formulaId", "label", "runId", "historyId"]) textField(record2, key, path);
    if (record2.previousSessionDate !== void 0 && record2.previousSessionDate !== "") isoDate(String(record2.previousSessionDate));
    for (const key of ["submittedAt", "updatedAt"]) {
      if (record2[key] !== void 0) assertTimestamp(record2[key], `${path}.${key}`);
    }
    if (record2.reasons !== void 0 && (!Array.isArray(record2.reasons) || record2.reasons.some((item) => typeof item !== "string"))) {
      throw new Error(`${path}.reasons must be a text array`);
    }
  }
  function validatePost(record2, path) {
    numberField(record2, "duration", path, 0, 480);
    numberField(record2, "rpe", path, 0, 10);
    for (const key of ["lowThrows", "moderateThrows", "highThrows", "gamePitches", "pulseTotalThrows", "totalThrows", "skippedTaskCount", "modifiedTaskCount"]) {
      numberField(record2, key, path, 0, 1e3, true);
    }
    for (const key of ["bestVelo", "top5Velo", "pulseBallVelocity"]) numberField(record2, key, path, 0, 120);
    for (const key of ["postShoulder", "postElbow"]) numberField(record2, key, path, 0, 10, true);
    for (const key of ["bestSetWeight", "bestSetReps", "bestSetRpe", "pulseWorkload", "acRatio", "pulseArmSpeed", "pulseTorque", "estimatedLoad", "srpe", "estimated1RM"]) {
      numberField(record2, key, path, 0, 1e6);
    }
    enumField(record2, "postPainfulMovement", path, /* @__PURE__ */ new Set(["yes", "no"]));
    for (const key of ["notes", "estimatedLoadFormulaId", "estimatedLoadLabel", "historyId"]) textField(record2, key, path);
    for (const key of ["updatedAt"]) {
      if (record2[key] !== void 0) assertTimestamp(record2[key], `${path}.${key}`);
    }
  }
  function validatePulseImport(record2, path) {
    for (const key of ["totalThrows", "highThrows"]) numberField(record2, key, path, 0, 1e3, true);
    for (const key of ["pulseWorkload", "acRatio", "pulseArmSpeed", "pulseTorque"]) numberField(record2, key, path, 0, 1e6);
    numberField(record2, "pulseBallVelocity", path, 0, 120);
    if (record2.importedAt !== void 0) assertTimestamp(record2.importedAt, `${path}.importedAt`);
  }
  function dateRecord(value, path, allowed, validate) {
    const record2 = assertRecord(value, path);
    return Object.fromEntries(Object.entries(record2).map(([date, item]) => {
      isoDate(date);
      const itemPath = `${path}.${date}`;
      const itemRecord = assertRecord(item, itemPath);
      if (allowed) assertKnownKeys(itemRecord, allowed, itemPath);
      validate?.(itemRecord, itemPath);
      return [date, cloneJson(itemRecord, itemPath)];
    }));
  }
  function validateMechanics(value) {
    const record2 = assertRecord(value, "mechanics");
    assertKnownKeys(record2, MECHANICS_KEYS, "mechanics");
    validateRecordArray(record2.assessments, "mechanics.assessments", 60, MECHANICS_ASSESSMENT_KEYS, (assessment, path) => {
      for (const key of [
        "sequenceRating",
        "lowerHalfRating",
        "trunkRating",
        "armTimingRating",
        "releaseRating",
        "decelerationRating"
      ]) numberField(assessment, key, path, 1, 5, true);
      for (const key of ["velocity", "throwingHandSpeed"]) numberField(assessment, key, path, 0, 150);
      numberField(assessment, "hipShoulderSeparation", path, -30, 120);
      numberField(assessment, "layback", path, 0, 240);
      numberField(assessment, "armSlot", path, 0, 180);
      numberField(assessment, "stridePercentHeight", path, 0, 160);
      numberField(assessment, "trunkTilt", path, -30, 120);
      numberField(assessment, "pelvisTrunkTiming", path, -300, 300);
      for (const key of ["elbowFlexion", "shoulderAbduction", "kneeFlexion"]) numberField(assessment, key, path, 0, 180);
      numberField(assessment, "horizontalAbduction", path, -90, 180);
      numberField(assessment, "kneeExtensionVelocity", path, 0, 3e3);
      numberField(assessment, "intent", path, 0, 100);
      numberField(assessment, "efficiency", path, 0, 100);
      enumField(assessment, "source", path, /* @__PURE__ */ new Set(["aiVideoScreen", "video2d", "coachReview", "calibratedMarkerless", "markerLab", "threeMotionReport"]));
      enumField(assessment, "confidence", path, /* @__PURE__ */ new Set(["low", "medium", "high", "reported"]));
      enumField(assessment, "cameraAngle", path, /* @__PURE__ */ new Set(["open_side", "open-side", "rear", "dual"]));
      if (assessment.date !== void 0 && assessment.date !== "") isoDate(String(assessment.date));
      if (assessment.analyzable !== void 0 && typeof assessment.analyzable !== "boolean") throw new Error(`${path}.analyzable must be boolean`);
      for (const key of ["analyzedAt", "recordedAt", "updatedAt"]) timestampField(assessment, key, path);
      if (assessment.videoIds !== void 0) textArray(assessment.videoIds, `${path}.videoIds`, 2, 100);
      if (assessment.limitations !== void 0) textArray(assessment.limitations, `${path}.limitations`, 8, 220);
      if (assessment.captureQuality !== void 0) {
        const capture = assertRecord(assessment.captureQuality, `${path}.captureQuality`);
        assertKnownKeys(capture, /* @__PURE__ */ new Set(["score", "decision", "fullBody", "blur", "cameraStability", "eventVisibility", "viewConsistency", "blockers"]), `${path}.captureQuality`);
        numberField(capture, "score", `${path}.captureQuality`, 0, 100);
        enumField(capture, "decision", `${path}.captureQuality`, /* @__PURE__ */ new Set(["pass", "limited", "fail"]));
        if (capture.blockers !== void 0) textArray(capture.blockers, `${path}.captureQuality.blockers`, 6, 180);
      }
      if (assessment.screening !== void 0) {
        const screening = assertRecord(assessment.screening, `${path}.screening`);
        assertKnownKeys(screening, /* @__PURE__ */ new Set(["hipShoulderSeparation", "layback", "armTiming", "strideDirection", "trunkDirection"]), `${path}.screening`);
        for (const key of Object.keys(screening)) textField(screening, key, `${path}.screening`, 220);
      }
      const evidenceKeys = /* @__PURE__ */ new Set(["phase", "visible", "finding", "visibleEvidence", "view", "confidence"]);
      for (const key of ["phaseReview", "observations"]) {
        if (assessment[key] === void 0) continue;
        validateRecordArray(assessment[key], `${path}.${key}`, key === "phaseReview" ? 6 : 8, evidenceKeys, (item, itemPath) => {
          if (item.visible !== void 0 && typeof item.visible !== "boolean") throw new Error(`${itemPath}.visible must be boolean`);
          enumField(item, "view", itemPath, /* @__PURE__ */ new Set(["open-side", "rear", "both", "not visible"]));
          enumField(item, "confidence", itemPath, /* @__PURE__ */ new Set(["low", "medium", "high"]));
        });
      }
      if (assessment.aiInterventions !== void 0) {
        validateRecordArray(assessment.aiInterventions, `${path}.aiInterventions`, 1, /* @__PURE__ */ new Set(["issue", "rationale"]), (item, itemPath) => {
          enumField(item, "issue", itemPath, /* @__PURE__ */ new Set(["sequence", "lowerHalf", "trunk", "armTiming", "release", "deceleration"]));
          textField(item, "rationale", itemPath, 280);
        });
      }
    });
    validateRecordArray(record2.approvedInterventions, "mechanics.approvedInterventions", 60, MECHANICS_INTERVENTION_KEYS, (intervention, path) => {
      enumField(intervention, "issue", path, /* @__PURE__ */ new Set(["sequence", "lowerHalf", "trunk", "armTiming", "release", "deceleration"]));
      numberField(intervention, "rating", path, 1, 5, true);
      if (intervention.active !== void 0 && typeof intervention.active !== "boolean") throw new Error(`${path}.active must be boolean`);
      timestampField(intervention, "approvedAt", path);
    });
    return cloneJson(record2, "mechanics");
  }
  function validateNutrition(value) {
    const record2 = assertRecord(value, "nutrition");
    assertKnownKeys(record2, NUTRITION_KEYS, "nutrition");
    if (record2.selectedDate !== void 0) isoDate(String(record2.selectedDate));
    const targets = assertRecord(record2.targets, "nutrition.targets");
    assertKnownKeys(targets, /* @__PURE__ */ new Set(["calories", "protein", "carbs", "fat", "fluid"]), "nutrition.targets");
    numberField(targets, "calories", "nutrition.targets", 0, 2e4);
    for (const key of ["protein", "carbs", "fat"]) numberField(targets, key, "nutrition.targets", 0, 2e3);
    numberField(targets, "fluid", "nutrition.targets", 0, 20);
    const validateMeal = (meal, path) => {
      for (const key of ["calories", "protein", "carbs", "fat"]) numberField(meal, key, path, 0, key === "calories" ? 5e3 : key === "carbs" ? 800 : 500);
      for (const key of ["items", "assumptions"]) if (meal[key] !== void 0) textArray(meal[key], `${path}.${key}`, key === "items" ? 12 : 8, 180);
      enumField(meal, "confidence", path, /* @__PURE__ */ new Set(["low", "medium", "high", "verified", "unrated"]));
      enumField(meal, "source", path, /* @__PURE__ */ new Set(["manual", "measured", "nutrition_label", "ausnut", "barcode", "photo_ai", "official_menu", "text_ai"]));
      for (const key of ["confirmedAt", "updatedAt", "deletedAt"]) timestampField(meal, key, path);
    };
    const meals = assertRecord(record2.meals, "nutrition.meals");
    for (const [date, items] of Object.entries(meals)) {
      isoDate(date);
      validateRecordArray(items, `nutrition.meals.${date}`, 100, MEAL_KEYS, validateMeal);
    }
    validateRecordArray(record2.savedMeals, "nutrition.savedMeals", 20, MEAL_KEYS, validateMeal);
    const hydration = assertRecord(record2.hydration, "nutrition.hydration");
    for (const [date, value2] of Object.entries(hydration)) {
      isoDate(date);
      if (typeof value2 === "number") {
        if (!Number.isFinite(value2) || value2 < 0 || value2 > 20) throw new Error(`nutrition.hydration.${date} must be between 0 and 20 litres`);
        continue;
      }
      const legacy = assertRecord(value2, `nutrition.hydration.${date}`);
      assertKnownKeys(legacy, /* @__PURE__ */ new Set(["value", "updatedAt"]), `nutrition.hydration.${date}`);
      numberField(legacy, "value", `nutrition.hydration.${date}`, 0, 20);
      timestampField(legacy, "updatedAt", `nutrition.hydration.${date}`);
    }
    const hydrationEvents = assertRecord(record2.hydrationEvents, "nutrition.hydrationEvents");
    for (const [date, events] of Object.entries(hydrationEvents)) {
      isoDate(date);
      validateRecordArray(events, `nutrition.hydrationEvents.${date}`, 50, HYDRATION_EVENT_KEYS, (item, path) => {
        for (const key of ["previous", "next"]) numberField(item, key, path, 0, 20);
        numberField(item, "delta", path, -20, 20);
        for (const key of ["createdAt", "updatedAt", "undoneAt"]) timestampField(item, key, path);
      });
    }
    const sweatLoss = assertRecord(record2.sweatLoss, "nutrition.sweatLoss");
    for (const [date, value2] of Object.entries(sweatLoss)) {
      isoDate(date);
      const item = assertRecord(value2, `nutrition.sweatLoss.${date}`);
      assertKnownKeys(item, SWEAT_LOSS_KEYS, `nutrition.sweatLoss.${date}`);
      for (const key of ["preKg", "postKg"]) numberField(item, key, `nutrition.sweatLoss.${date}`, 35, 250);
      numberField(item, "fluidLitres", `nutrition.sweatLoss.${date}`, 0, 10);
      numberField(item, "urineLitres", `nutrition.sweatLoss.${date}`, 0, 5);
      numberField(item, "durationMinutes", `nutrition.sweatLoss.${date}`, 10, 600);
      for (const key of ["sweatLossLitres", "sweatRate"]) numberField(item, key, `nutrition.sweatLoss.${date}`, 0, 20);
      timestampField(item, "updatedAt", `nutrition.sweatLoss.${date}`);
    }
    if (!Array.isArray(record2.hydrationPresets)) throw new Error("nutrition.hydrationPresets must be an array");
    if (record2.hydrationPresets.some((item) => typeof item !== "number" || !Number.isFinite(item) || item <= 0 || item > 5)) {
      throw new Error("nutrition.hydrationPresets must contain values between 0 and 5 litres");
    }
    const reminders = assertRecord(record2.reminders, "nutrition.reminders");
    assertKnownKeys(reminders, /* @__PURE__ */ new Set(["enabled", "intervalMinutes", "quietStart", "quietEnd", "trainingDaysOnly"]), "nutrition.reminders");
    if (reminders.enabled !== void 0 && typeof reminders.enabled !== "boolean") throw new Error("nutrition.reminders.enabled must be boolean");
    if (reminders.trainingDaysOnly !== void 0 && typeof reminders.trainingDaysOnly !== "boolean") throw new Error("nutrition.reminders.trainingDaysOnly must be boolean");
    numberField(reminders, "intervalMinutes", "nutrition.reminders", 15, 1440, true);
    return cloneJson(record2, "nutrition");
  }
  function validatePbRecord(value, path, maximum) {
    const record2 = assertRecord(value, path);
    assertKnownKeys(record2, PB_RECORD_KEYS, path);
    numberField(record2, "value", path, 0, maximum);
    enumField(record2, "kind", path, /* @__PURE__ */ new Set(["unestablished", "tested", "estimated"]));
    if (record2.date !== void 0 && record2.date !== "") isoDate(String(record2.date));
    timestampField(record2, "updatedAt", path);
  }
  function validatePbs(value) {
    const record2 = assertRecord(value, "pbs");
    assertKnownKeys(record2, PB_KEYS, "pbs");
    const lifts = assertRecord(record2.lifts, "pbs.lifts");
    const velocity = assertRecord(record2.velocity, "pbs.velocity");
    assertKnownKeys(lifts, LIFT_PB_KEYS, "pbs.lifts");
    assertKnownKeys(velocity, VELOCITY_PB_KEYS, "pbs.velocity");
    for (const [key, item] of Object.entries(lifts)) validatePbRecord(item, `pbs.lifts.${key}`, 1e3);
    for (const [key, item] of Object.entries(velocity)) validatePbRecord(item, `pbs.velocity.${key}`, 120);
    const trainingMaxes = assertRecord(record2.trainingMaxes, "pbs.trainingMaxes");
    assertKnownKeys(trainingMaxes, /* @__PURE__ */ new Set(["lifts", "velocity"]), "pbs.trainingMaxes");
    const trainingLifts = assertRecord(trainingMaxes.lifts, "pbs.trainingMaxes.lifts");
    const trainingVelocity = assertRecord(trainingMaxes.velocity, "pbs.trainingMaxes.velocity");
    assertKnownKeys(trainingLifts, LIFT_PB_KEYS, "pbs.trainingMaxes.lifts");
    assertKnownKeys(trainingVelocity, VELOCITY_PB_KEYS, "pbs.trainingMaxes.velocity");
    for (const [key, item] of Object.entries(trainingLifts)) validatePbRecord(item, `pbs.trainingMaxes.lifts.${key}`, 1e3);
    for (const [key, item] of Object.entries(trainingVelocity)) validatePbRecord(item, `pbs.trainingMaxes.velocity.${key}`, 120);
    validateRecordArray(record2.history, "pbs.history", 250, PB_HISTORY_KEYS, (item, path) => {
      enumField(item, "category", path, /* @__PURE__ */ new Set(["lift", "velocity"]));
      numberField(item, "previous", path, 0, 1e3);
      numberField(item, "value", path, 0, 1e3);
      if (item.date !== void 0 && item.date !== "") isoDate(String(item.date));
      timestampField(item, "recordedAt", path);
      if (item.isPersonalBest !== void 0 && typeof item.isPersonalBest !== "boolean") throw new Error(`${path}.isPersonalBest must be boolean`);
      if (item.workingSet !== void 0) {
        const workingSet = assertRecord(item.workingSet, `${path}.workingSet`);
        assertKnownKeys(workingSet, /* @__PURE__ */ new Set(["weight", "reps", "rpe"]), `${path}.workingSet`);
        numberField(workingSet, "weight", `${path}.workingSet`, 0, 1e3);
        numberField(workingSet, "reps", `${path}.workingSet`, 0, 100, true);
        numberField(workingSet, "rpe", `${path}.workingSet`, 0, 10);
      }
    });
    return cloneJson(record2, "pbs");
  }
  function validateProfile(value) {
    const record2 = assertRecord(value, "profile");
    assertKnownKeys(record2, PROFILE_KEYS, "profile");
    for (const key of ["name", "photoDataUrl", "role", "winterRotation", "summerGames", "summerTraining", "gym", "winterTeam", "summerTeam", "programTemplate"]) textField(record2, key, "profile", 4e6);
    numberField(record2, "height", "profile", 0, 230);
    numberField(record2, "weight", "profile", 0, 250);
    for (const key of ["trapBar", "bench", "squat"]) numberField(record2, key, "profile", 0, 1e3);
    enumField(record2, "throwingHand", "profile", /* @__PURE__ */ new Set(["Right", "Left"]));
    enumField(record2, "appearance", "profile", /* @__PURE__ */ new Set(["system", "dark", "light"]));
    enumField(record2, "glassIntensity", "profile", /* @__PURE__ */ new Set(["subtle", "balanced", "vivid"]));
    enumField(record2, "interfaceDensity", "profile", /* @__PURE__ */ new Set(["comfortable", "compact"]));
    enumField(record2, "motionPreference", "profile", /* @__PURE__ */ new Set(["system", "full", "reduced"]));
    enumField(record2, "navigationBehavior", "profile", /* @__PURE__ */ new Set(["smart", "steady"]));
    timestampField(record2, "updatedAt", "profile");
    return cloneJson(record2, "profile");
  }
  function validateHistory(value) {
    const history = assertRecord(value, "trainingHistory");
    assertKnownKeys(history, /* @__PURE__ */ new Set(["schemaVersion", "events"]), "trainingHistory");
    if (history.schemaVersion !== 1) throw new Error("trainingHistory schema version is invalid");
    if (!Array.isArray(history.events)) throw new Error("trainingHistory events must be an array");
    if (history.events.length > 5e4) throw new Error("trainingHistory has too many events");
    const events = history.events.map((candidate, index) => {
      const event = assertRecord(candidate, `trainingHistory.events[${index}]`);
      assertKnownKeys(event, /* @__PURE__ */ new Set(["id", "collection", "date", "type", "occurredAt", "revision", "supersedesId", "payload", "uploadedAt"]), `trainingHistory.events[${index}]`);
      if (typeof event.id !== "string" || !/^[a-z][a-z0-9_-]{11,79}$/i.test(event.id)) throw new Error(`trainingHistory event ${index} has an invalid history ID`);
      if (typeof event.collection !== "string" || !HISTORY_COLLECTIONS.has(event.collection)) throw new Error(`trainingHistory event ${index} has an invalid history collection`);
      if (typeof event.date !== "string") throw new Error(`trainingHistory event ${index} has an invalid history date`);
      isoDate(event.date);
      if (typeof event.type !== "string" || event.type.length < 2 || event.type.length > 80) throw new Error(`trainingHistory event ${index} has an invalid history type`);
      assertTimestamp(event.occurredAt, `trainingHistory event ${index} occurredAt`, false);
      if (!Number.isInteger(event.revision) || Number(event.revision) < 1) throw new Error(`trainingHistory event ${index} has an invalid history revision`);
      if (typeof event.supersedesId !== "string" || typeof event.uploadedAt !== "string") throw new Error(`trainingHistory event ${index} has invalid history linkage`);
      if (event.uploadedAt) assertTimestamp(event.uploadedAt, `trainingHistory event ${index} uploadedAt`, false);
      return {
        id: event.id,
        collection: event.collection,
        date: event.date,
        type: event.type,
        occurredAt: event.occurredAt,
        revision: event.revision,
        supersedesId: event.supersedesId,
        payload: jsonRecord(event.payload, `trainingHistory event ${index} payload`),
        uploadedAt: event.uploadedAt
      };
    });
    return { schemaVersion: 1, events };
  }
  function sessionAdaptation(value, path) {
    const adaptation = assertRecord(value, path);
    assertKnownKeys(adaptation, ADAPTATION_KEYS, path);
    if (typeof adaptation.level !== "string" || !ADAPTATION_LEVELS.has(adaptation.level)) {
      throw new Error(`${path}.level must be reduced or recovery`);
    }
    const factor = Number(adaptation.factor);
    if (!Number.isFinite(factor) || factor <= 0 || factor > 1) throw new Error(`${path}.factor must be between 0 and 1`);
    if (typeof adaptation.gameDay !== "boolean") throw new Error(`${path}.gameDay must be boolean`);
    if (!Array.isArray(adaptation.reasons) || adaptation.reasons.some((reason) => typeof reason !== "string")) {
      throw new Error(`${path}.reasons must be a list of text reasons`);
    }
    return {
      level: adaptation.level,
      factor,
      gameDay: adaptation.gameDay,
      reasons: [...adaptation.reasons]
    };
  }
  function plannedSession(value, path) {
    const session = assertRecord(value, path);
    assertKnownKeys(session, PLANNED_SESSION_KEYS, path);
    for (const field of ["title", "focus", "duration", "stress", "description"]) {
      if (typeof session[field] !== "string" || !session[field].trim()) throw new Error(`${path}.${field} is required`);
    }
    if (!Array.isArray(session.tasks) || !session.tasks.length) throw new Error(`${path}.tasks must contain planned tasks`);
    const tasks = session.tasks.map((candidate, index) => {
      const task = assertRecord(candidate, `${path}.tasks[${index}]`);
      assertKnownKeys(task, PLANNED_TASK_KEYS, `${path}.tasks[${index}]`);
      for (const field of ["id", "stageTitle", "stageDescription", "name", "prescription", "cue"]) {
        if (typeof task[field] !== "string" || !task[field].trim()) throw new Error(`${path}.tasks[${index}].${field} is required`);
      }
      for (const field of ["setup", "execution", "rest", "stop", "adaptationNote", "originalPrescription"]) {
        if (task[field] !== void 0 && typeof task[field] !== "string") throw new Error(`${path}.tasks[${index}].${field} must be text`);
      }
      if (task.adapted !== void 0 && typeof task.adapted !== "boolean") throw new Error(`${path}.tasks[${index}].adapted must be boolean`);
      if (!Number.isInteger(task.stage) || Number(task.stage) < 1) throw new Error(`${path}.tasks[${index}].stage is invalid`);
      return cloneJson(task, `${path}.tasks[${index}]`);
    });
    if (new Set(tasks.map((task) => task.id)).size !== tasks.length) throw new Error(`${path}.tasks contains duplicate task IDs`);
    if (session.originalDescription !== void 0 && typeof session.originalDescription !== "string") {
      throw new Error(`${path}.originalDescription must be text`);
    }
    return {
      title: session.title,
      focus: session.focus,
      duration: session.duration,
      stress: session.stress,
      description: session.description,
      ...session.originalDescription === void 0 ? {} : { originalDescription: session.originalDescription },
      ...session.adaptation === void 0 ? {} : { adaptation: sessionAdaptation(session.adaptation, `${path}.adaptation`) },
      tasks
    };
  }
  function taskState(value, path, expectedTaskId) {
    const state = assertRecord(value, path);
    assertKnownKeys(state, /* @__PURE__ */ new Set(["taskId", "status", "reason", "modification", "notes", "updatedAt"]), path);
    if (state.taskId !== expectedTaskId) throw new Error(`${path} task state ID does not match its key`);
    if (typeof state.status !== "string" || !TASK_STATUSES2.has(state.status)) throw new Error(`${path} has an invalid task state`);
    for (const field of ["reason", "modification", "notes", "updatedAt"]) {
      if (typeof state[field] !== "string") throw new Error(`${path}.${field} must be text`);
    }
    for (const field of ["reason", "modification", "notes"]) {
      if (state[field].length > 500) throw new Error(`${path}.${field} is too long`);
    }
    if (state.updatedAt) assertTimestamp(state.updatedAt, `${path}.updatedAt`, false);
    if ((state.status === "modified" || state.status === "skipped") && !state.reason) throw new Error(`${path} task state requires a reason`);
    if (state.status === "modified" && !state.modification) throw new Error(`${path} modified task state requires a modification`);
    return state;
  }
  function datedSession(value, date) {
    const session = assertRecord(value, `sessions.${date}`);
    assertKnownKeys(session, /* @__PURE__ */ new Set(["id", "date", "programmeWeek", "dayIndex", "phaseId", "planRevision", "calendarEventId", "plan", "taskStates"]), `sessions.${date}`);
    if (session.date !== date || typeof session.id !== "string" || session.id !== `session:${date}:r${session.planRevision}`) throw new Error(`sessions.${date} has an invalid dated session identity`);
    if (!Number.isInteger(session.programmeWeek) || Number(session.programmeWeek) < 1 || Number(session.programmeWeek) > 52) throw new Error(`sessions.${date} has an invalid programme week`);
    if (!Number.isInteger(session.dayIndex) || Number(session.dayIndex) < 0 || Number(session.dayIndex) > 6) throw new Error(`sessions.${date} has an invalid day index`);
    if (!Number.isInteger(session.planRevision) || Number(session.planRevision) < 1) throw new Error(`sessions.${date} has an invalid plan revision`);
    if (typeof session.phaseId !== "string" || typeof session.calendarEventId !== "string") throw new Error(`sessions.${date} has invalid phase or calendar data`);
    const programme = programmeWeekForDate(date);
    const event = calendarEventForDate(date);
    if (session.programmeWeek !== programme.week) throw new Error(`sessions.${date} programme week does not match its date`);
    if (session.dayIndex !== programme.dayIndex) throw new Error(`sessions.${date} day index does not match its date`);
    if (session.phaseId !== programme.phase.id) throw new Error(`sessions.${date} phase does not match its programme week`);
    if (session.calendarEventId !== (event?.id || "")) throw new Error(`sessions.${date} calendar event does not match its date`);
    const plan = plannedSession(session.plan, `sessions.${date}.plan`);
    const states = assertRecord(session.taskStates, `sessions.${date}.taskStates`);
    const taskStates = Object.fromEntries(Object.entries(states).map(([taskId, state]) => [taskId, taskState(state, `sessions.${date}.taskStates.${taskId}`, taskId)]));
    const plannedTaskIds = new Set(plan.tasks.map((task) => task.id));
    if (Object.keys(taskStates).some((taskId) => !plannedTaskIds.has(taskId)) || plan.tasks.some((task) => !taskStates[task.id])) {
      throw new Error(`sessions.${date} task states do not match the dated plan`);
    }
    return {
      id: session.id,
      date: session.date,
      programmeWeek: session.programmeWeek,
      dayIndex: session.dayIndex,
      phaseId: session.phaseId,
      planRevision: session.planRevision,
      calendarEventId: session.calendarEventId,
      plan,
      taskStates
    };
  }
  function parseAppStateV2(value) {
    const state = assertRecord(value, "Pitching OS state");
    assertKnownKeys(state, ROOT_V2_KEYS, "Pitching OS state");
    if (state.version !== 2) throw new Error("Pitching OS state version is unsupported");
    if (typeof state.onboardingComplete !== "boolean") throw new Error("onboardingComplete must be boolean");
    const syncUpdatedAt = assertTimestamp(state.syncUpdatedAt, "syncUpdatedAt", false);
    const sessionRecord = assertRecord(state.sessions, "sessions");
    const sessions = Object.fromEntries(Object.entries(sessionRecord).map(([date, session]) => {
      isoDate(date);
      return [date, datedSession(session, date)];
    }));
    const healthHistoryFetchedAt = assertTimestamp(state.healthHistoryFetchedAt, "healthHistoryFetchedAt");
    const weeklyReviewsRecord = assertRecord(state.weeklyReviews, "weeklyReviews");
    const weeklyReviews = Object.fromEntries(Object.entries(weeklyReviewsRecord).map(([week, review]) => {
      const numeric = Number(week);
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > 52) throw new Error("weeklyReviews contains an invalid week");
      return [week, strictJsonRecord(review, `weeklyReviews.${week}`, WEEKLY_REVIEW_KEYS)];
    }));
    if (state.page !== void 0 && (typeof state.page !== "string" || !PAGES.has(state.page))) throw new Error("page is invalid");
    if (state.selectedWeek !== void 0 && (!Number.isInteger(state.selectedWeek) || Number(state.selectedWeek) < 1 || Number(state.selectedWeek) > 52)) throw new Error("selectedWeek is invalid");
    if (state.selectedDay !== void 0 && (!Number.isInteger(state.selectedDay) || Number(state.selectedDay) < 0 || Number(state.selectedDay) > 6)) throw new Error("selectedDay is invalid");
    if (state.lastOpenDate !== void 0) isoDate(String(state.lastOpenDate));
    if (state.editingPost !== void 0 && state.editingPost !== "") isoDate(String(state.editingPost));
    return {
      version: 2,
      onboardingComplete: state.onboardingComplete,
      syncUpdatedAt,
      sessions,
      pre: dateRecord(state.pre, "pre", PRE_KEYS, validatePre),
      post: dateRecord(state.post, "post", POST_KEYS, validatePost),
      healthPrefill: dateRecord(state.healthPrefill, "healthPrefill", HEALTH_PREFILL_KEYS),
      healthHistoryFetchedAt,
      pulseImports: dateRecord(state.pulseImports, "pulseImports", PULSE_IMPORT_KEYS, validatePulseImport),
      bullpens: dateRecord(state.bullpens, "bullpens", BULLPEN_KEYS),
      weeklyReviews,
      trainingHistory: validateHistory(state.trainingHistory),
      mechanics: validateMechanics(state.mechanics),
      nutrition: validateNutrition(state.nutrition),
      pbs: validatePbs(state.pbs),
      profile: validateProfile(state.profile),
      ...state.page !== void 0 ? { page: state.page } : {},
      ...state.selectedWeek !== void 0 ? { selectedWeek: Number(state.selectedWeek) } : {},
      ...state.selectedDay !== void 0 ? { selectedDay: Number(state.selectedDay) } : {},
      ...state.lastOpenDate !== void 0 ? { lastOpenDate: state.lastOpenDate } : {},
      ...state.editingPost !== void 0 ? { editingPost: state.editingPost } : {}
    };
  }
  function parseLegacyV1Root(value) {
    const state = assertRecord(value, "Legacy Pitching OS state");
    assertKnownKeys(state, ROOT_V1_KEYS, "Legacy Pitching OS state");
    if (state.version !== 1) throw new Error("Legacy Pitching OS state version is unsupported");
    if (typeof state.onboardingComplete !== "boolean") throw new Error("Legacy onboardingComplete must be boolean");
    for (const field of ["pre", "post", "healthPrefill", "pulseImports", "bullpens"]) dateRecord(state[field], `Legacy ${field}`);
    if (!isRecord(state.completedTasks)) throw new Error("Legacy completedTasks must be an object");
    for (const [date, ids] of Object.entries(state.completedTasks)) {
      isoDate(date);
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new Error(`Legacy completedTasks.${date} must be a string array`);
    }
    if (!isRecord(state.skippedTasks)) throw new Error("Legacy skippedTasks must be an object");
    for (const [date, skips] of Object.entries(state.skippedTasks)) {
      isoDate(date);
      const skipRecord = assertRecord(skips, `Legacy skippedTasks.${date}`);
      for (const [taskId, skip] of Object.entries(skipRecord)) {
        if (!taskId || !isRecord(skip) || typeof skip.reason !== "string" || !skip.reason.trim()) throw new Error(`Legacy skippedTasks.${date}.${taskId} is invalid`);
        cloneJson(skip, `Legacy skippedTasks.${date}.${taskId}`);
      }
    }
    if (!isRecord(state.taskCompletionUpdatedAt)) throw new Error("Legacy taskCompletionUpdatedAt must be an object");
    for (const [date, timestamp] of Object.entries(state.taskCompletionUpdatedAt)) {
      isoDate(date);
      assertTimestamp(timestamp, `Legacy taskCompletionUpdatedAt.${date}`, false);
    }
    validateHistory(state.trainingHistory);
    cloneJson(state, "Legacy Pitching OS state");
    return state;
  }

  // src/domain/migrations.ts
  var LEGACY_STORAGE_KEY = "dylan-pitching-os-v1";
  var STORAGE_KEY_V2 = "dylan-pitching-os-v2";
  var LEGACY_BACKUP_KEY = "dylan-pitching-os-v1-preserved";
  var INVALID_V2_BACKUP_KEY = "dylan-pitching-os-v2-invalid-preserved";
  function validTimestamp2(value) {
    return typeof value === "string" && value !== "" && Number.isFinite(Date.parse(value));
  }
  function repairDatedTimestamps(value, fields) {
    let migrated = false;
    for (const [date, entry] of Object.entries(value)) {
      if (!isRecord(entry)) continue;
      const fallback = fields.map((field) => entry[field]).find(validTimestamp2) || `${date}T00:00:00.000Z`;
      for (const field of fields) {
        if (entry[field] === void 0 || entry[field] === "" || validTimestamp2(entry[field])) continue;
        entry[field] = fallback;
        migrated = true;
      }
    }
    return migrated;
  }
  function repairLegacyPreFields(value) {
    let migrated = false;
    for (const entry of Object.values(value)) {
      if (!isRecord(entry) || !("sleepSource" in entry)) continue;
      if (!("sleepHoursSource" in entry)) entry.sleepHoursSource = entry.sleepSource;
      delete entry.sleepSource;
      migrated = true;
    }
    return migrated;
  }
  function repairLegacyProfileNumbers(value) {
    let migrated = false;
    for (const field of ["height", "weight", "trapBar", "bench", "squat"]) {
      const raw = value[field];
      if (typeof raw !== "string" || raw === "" || Number.isFinite(Number(raw))) continue;
      const match = raw.match(/[+-]?\d+(?:\.\d+)?/);
      if (!match) continue;
      value[field] = Number(match[0]);
      migrated = true;
    }
    return migrated;
  }
  function migrateV2State(value) {
    if (!isRecord(value) || value.version !== 2) throw new Error("Pitching OS state version is unsupported");
    const repaired = JSON.parse(JSON.stringify(value));
    const migrated = [
      repairLegacyPreFields(record(repaired.pre)),
      repairDatedTimestamps(record(repaired.pre), ["submittedAt", "updatedAt"]),
      repairDatedTimestamps(record(repaired.post), ["completedAt", "updatedAt"]),
      repairLegacyProfileNumbers(record(repaired.profile))
    ].some(Boolean);
    return Object.freeze({ state: parseAppStateV2(repaired), migrated, sourceVersion: 2 });
  }
  function record(value) {
    return isRecord(value) ? value : {};
  }
  function latestPlanForDate(historyValue, date) {
    const events = Array.isArray(record(historyValue).events) ? record(historyValue).events : [];
    const plans = events.filter((candidate) => isRecord(candidate) && candidate.collection === "planSnapshots" && candidate.date === date).sort((left, right) => Date.parse(String(record(left).occurredAt || "")) - Date.parse(String(record(right).occurredAt || "")));
    const payload = record(record(plans.at(-1)).payload);
    return isRecord(payload.session) ? payload.session : null;
  }
  function placeholderTask(id, name = "Legacy task record") {
    return {
      id,
      stage: 1,
      stageTitle: "Imported history",
      stageDescription: "Preserved from the previous local data format.",
      name,
      prescription: "See the original preserved backup and immutable history.",
      cue: "This record is retained for history and is not a new training prescription."
    };
  }
  function planWithAllLegacyTasks(plan, taskIds, skipped) {
    const existingTasks = plan?.tasks ? [...plan.tasks] : [];
    const existingIds = new Set(existingTasks.map((task) => task.id));
    for (const id of taskIds) {
      if (!existingIds.has(id)) existingTasks.push(placeholderTask(id, String(record(skipped[id]).taskName || "Legacy task record")));
    }
    if (!existingTasks.length) existingTasks.push(placeholderTask("legacy-session-record", "Legacy session record"));
    return {
      title: plan?.title || "Imported legacy session",
      focus: plan?.focus || "Historical record",
      duration: plan?.duration || "Not recorded",
      stress: plan?.stress || "Not recorded",
      description: plan?.description || "This dated session was created while safely migrating existing Pitching OS data.",
      tasks: existingTasks
    };
  }
  function migratedSession(date, legacy) {
    const completedMap = record(legacy.completedTasks);
    const skippedMap = record(legacy.skippedTasks);
    const completed = Array.isArray(completedMap[date]) ? completedMap[date] : [];
    const skipped = record(skippedMap[date]);
    const legacyTaskIds = [.../* @__PURE__ */ new Set([...completed, ...Object.keys(skipped)])];
    const sourcePlan = planWithAllLegacyTasks(latestPlanForDate(legacy.trainingHistory, date), legacyTaskIds, skipped);
    const entity = createDatedSession(date, 1, sourcePlan);
    const sourceToDated = new Map(sourcePlan.tasks.map((task, index) => [task.id, entity.plan.tasks[index].id]));
    const updatedMap = record(legacy.taskCompletionUpdatedAt);
    const pre = record(record(legacy.pre)[date]);
    const post = record(record(legacy.post)[date]);
    const fallbackTimestamp = [updatedMap[date], post.updatedAt, pre.updatedAt, legacy.syncUpdatedAt].find((value) => typeof value === "string" && Number.isFinite(Date.parse(value))) || "1970-01-01T00:00:00.000Z";
    const taskStates = { ...entity.taskStates };
    for (const sourceId of completed) {
      const taskId = sourceToDated.get(sourceId);
      if (!taskId) continue;
      taskStates[taskId] = transitionTaskState(taskStates[taskId], { status: "completed", updatedAt: fallbackTimestamp });
    }
    for (const [sourceId, skipValue] of Object.entries(skipped)) {
      const taskId = sourceToDated.get(sourceId);
      if (!taskId) continue;
      const skip = record(skipValue);
      const updatedAt = typeof skip.updatedAt === "string" && Number.isFinite(Date.parse(skip.updatedAt)) ? skip.updatedAt : fallbackTimestamp;
      taskStates[taskId] = transitionTaskState(taskStates[taskId], {
        status: "skipped",
        reason: String(skip.reason || "Legacy skipped task"),
        notes: typeof skip.notes === "string" ? skip.notes : "",
        updatedAt
      });
    }
    return { ...entity, taskStates };
  }
  function defaultRecord(value) {
    return isRecord(value) ? value : {};
  }
  function migrateV1State(value) {
    if (isRecord(value) && value.version === 2) {
      return migrateV2State(value);
    }
    const legacy = parseLegacyV1Root(value);
    const historyDates = (Array.isArray(record(legacy.trainingHistory).events) ? record(legacy.trainingHistory).events : []).filter((candidate) => isRecord(candidate) && candidate.collection === "planSnapshots" && typeof candidate.date === "string").map((candidate) => String(record(candidate).date));
    const dates = [.../* @__PURE__ */ new Set([
      ...Object.keys(record(legacy.pre)),
      ...Object.keys(record(legacy.post)),
      ...Object.keys(record(legacy.completedTasks)),
      ...Object.keys(record(legacy.skippedTasks)),
      ...historyDates
    ])].sort();
    const sessions = Object.fromEntries(dates.map((date) => [date, migratedSession(date, legacy)]));
    const state = migrateV2State({
      version: 2,
      onboardingComplete: legacy.onboardingComplete,
      syncUpdatedAt: legacy.syncUpdatedAt,
      sessions,
      pre: defaultRecord(legacy.pre),
      post: defaultRecord(legacy.post),
      healthPrefill: defaultRecord(legacy.healthPrefill),
      healthHistoryFetchedAt: typeof legacy.healthHistoryFetchedAt === "string" ? legacy.healthHistoryFetchedAt : "",
      pulseImports: defaultRecord(legacy.pulseImports),
      bullpens: defaultRecord(legacy.bullpens),
      weeklyReviews: defaultRecord(legacy.weeklyReviews),
      trainingHistory: legacy.trainingHistory,
      mechanics: legacy.mechanics,
      nutrition: legacy.nutrition,
      pbs: legacy.pbs,
      profile: legacy.profile,
      ...legacy.page !== void 0 ? { page: legacy.page } : {},
      ...legacy.selectedWeek !== void 0 ? { selectedWeek: legacy.selectedWeek } : {},
      ...legacy.selectedDay !== void 0 ? { selectedDay: legacy.selectedDay } : {},
      ...legacy.lastOpenDate !== void 0 ? { lastOpenDate: legacy.lastOpenDate } : {},
      ...legacy.editingPost !== void 0 ? { editingPost: legacy.editingPost } : {}
    }).state;
    return Object.freeze({ state, migrated: true, sourceVersion: 1 });
  }
  function parseBackupJson(json) {
    if (typeof json !== "string" || json.length > 5e6) throw new Error("Backup JSON is missing or too large");
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error("Backup is not valid JSON");
    }
    if (!isRecord(parsed)) throw new Error("Backup root must be an object");
    let stateValue = parsed;
    if ("data" in parsed) {
      const allowed = /* @__PURE__ */ new Set(["exportedAt", "data"]);
      const unknown = Object.keys(parsed).find((key) => !allowed.has(key));
      if (unknown) throw new Error(`Backup envelope contains unknown field ${unknown}`);
      if (parsed.exportedAt !== void 0 && (typeof parsed.exportedAt !== "string" || !Number.isFinite(Date.parse(parsed.exportedAt)))) {
        throw new Error("Backup exportedAt timestamp is invalid");
      }
      stateValue = parsed.data;
    }
    if (isRecord(stateValue) && stateValue.version === 2) return parseAppStateV2(stateValue);
    return migrateV1State(stateValue).state;
  }
  function migrateLocalStorage(storage, createDefaultV2) {
    const current = storage.getItem(STORAGE_KEY_V2);
    if (current) {
      try {
        return Object.freeze({ state: parseBackupJson(current), migrated: false, sourceVersion: 2 });
      } catch {
        storage.setItem(INVALID_V2_BACKUP_KEY, current);
        try {
          const repaired = migrateV2State(JSON.parse(current));
          storage.setItem(STORAGE_KEY_V2, JSON.stringify(repaired.state));
          return repaired;
        } catch {
        }
      }
    }
    const legacy = storage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) {
      const state = parseAppStateV2(createDefaultV2());
      storage.setItem(STORAGE_KEY_V2, JSON.stringify(state));
      return Object.freeze({ state, migrated: false, sourceVersion: 2 });
    }
    const result = migrateV1State(JSON.parse(legacy));
    const serialized = JSON.stringify(result.state);
    parseAppStateV2(JSON.parse(serialized));
    storage.setItem(LEGACY_BACKUP_KEY, legacy);
    storage.setItem(STORAGE_KEY_V2, serialized);
    return result;
  }

  // src/domain/safety.ts
  function isYes(value) {
    return value === true || value === "yes";
  }
  function pain(value, label) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) {
      throw new Error(`${label} pain must be between 0 and 10`);
    }
    return numeric;
  }
  function evaluateSafety(inputs, previousPain) {
    const shoulder = pain(inputs.shoulder, "Shoulder");
    const elbow = pain(inputs.elbow, "Elbow");
    const reasons = [];
    if (isYes(inputs.painfulMovement)) reasons.push("Painful movement or pain-altered mechanics was reported");
    if (isYes(inputs.warningSigns)) reasons.push("A new sharp or worsening warning sign was reported");
    if (isYes(inputs.illness)) reasons.push("Illness symptoms were reported");
    if (shoulder >= 5) reasons.push(`Shoulder pain is ${shoulder}/10`);
    if (elbow >= 5) reasons.push(`Elbow pain is ${elbow}/10`);
    const previousShoulder = Number(previousPain?.shoulder);
    const previousElbow = Number(previousPain?.elbow);
    if (Number.isFinite(previousShoulder) && shoulder - previousShoulder >= 2) {
      reasons.push(`Shoulder pain increased by ${shoulder - previousShoulder} points from the most recent comparable entry`);
    }
    if (Number.isFinite(previousElbow) && elbow - previousElbow >= 2) {
      reasons.push(`Elbow pain increased by ${elbow - previousElbow} points from the most recent comparable entry`);
    }
    return Object.freeze({
      override: reasons.length > 0,
      action: reasons.length ? "hold" : "continue",
      reasons: Object.freeze(reasons),
      ruleId: "safety-guardrails-v1"
    });
  }

  // src/domain/readiness.ts
  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }
  function numberInRange(value, minimum, maximum, label) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) {
      throw new Error(`${label} must be between ${minimum} and ${maximum}`);
    }
    return numeric;
  }
  function optionalNumber(value) {
    if (value === "" || value === null || value === void 0) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  function isYes2(value) {
    return value === true || value === "yes";
  }
  function createSignals(inputs, context) {
    const signals = [...context.signals || []];
    const hrv = optionalNumber(context.hrv);
    const restingHeartRate = optionalNumber(context.restingHeartRate);
    const hrvBaseline = context.hrvBaseline;
    const rhrBaseline = context.restingHeartRateBaseline;
    if (hrvBaseline && hrvBaseline.count >= 5 && hrv !== null && hrv > 0 && hrvBaseline.value !== null && hrv < hrvBaseline.value * 0.8) {
      const change = Math.round((1 - hrv / hrvBaseline.value) * 100);
      signals.push({ type: "hrv", severity: "moderate", text: `${context.hrvSource || "Connected source"} HRV is ${change}% below its recent same-source median` });
    }
    if (rhrBaseline && rhrBaseline.count >= 5 && restingHeartRate !== null && restingHeartRate > 0 && rhrBaseline.value !== null) {
      const threshold = Math.max(7, rhrBaseline.value * 0.1);
      if (restingHeartRate > rhrBaseline.value + threshold) {
        signals.push({ type: "rhr", severity: "moderate", text: `${context.restingHeartRateSource || "Connected source"} resting heart rate is elevated versus its recent same-source median` });
      }
    }
    const stressMinutes = optionalNumber(inputs.ouraStressHighMinutes);
    if (stressMinutes !== null && stressMinutes >= 180) {
      signals.push({ type: "oura_stress", severity: stressMinutes >= 300 ? "high" : "moderate", text: `Oura recorded ${Math.round(stressMinutes)} high-stress minutes` });
    }
    const temperature = optionalNumber(inputs.ouraTemperatureDeviation);
    if (temperature !== null && Math.abs(temperature) >= 0.8) {
      signals.push({ type: "temperature", severity: Math.abs(temperature) >= 1.2 ? "high" : "moderate", text: `Oura temperature deviation was ${temperature > 0 ? "+" : ""}${temperature.toFixed(1)}\xB0C` });
    }
    if (isYes2(inputs.ouraRestMode)) signals.push({ type: "rest_mode", severity: "high", text: "Oura Rest Mode is active" });
    const baselines = context.subjectiveBaselines || {};
    const baselineSignal = (field, condition, text) => {
      const baseline = baselines[field];
      if (baseline?.count && baseline.count >= 5 && baseline.value !== null && condition(baseline.value)) {
        signals.push({ type: `${field}_baseline`, severity: "moderate", text });
      }
    };
    baselineSignal("sleepHours", (value) => Number(inputs.sleepHours) <= value - 1.5, "Sleep is at least 1.5 hours below the recent median");
    baselineSignal("energy", (value) => Number(inputs.energy) <= value - 2, "Energy is at least two points below the recent median");
    baselineSignal("mood", (value) => Number(inputs.mood) <= value - 2, "Mood / motivation is at least two points below the recent median");
    baselineSignal("stress", (value) => Number(inputs.stress) >= value + 2, "Life stress is at least two points above the recent median");
    if (inputs.previousSessionResponse === "worse") signals.push({ type: "previous_response", severity: "moderate", text: "You reported feeling worse after the previous logged session" });
    if (inputs.previousSessionResponse === "much_worse") signals.push({ type: "previous_response", severity: "high", text: "You reported feeling much worse after the previous logged session" });
    return signals;
  }
  function evaluateReadiness(inputs, context = {}) {
    const sleepHours = numberInRange(inputs.sleepHours, 0, 14, "Sleep duration");
    const sleepQuality = numberInRange(inputs.sleepQuality, 1, 5, "Sleep quality");
    const energy = numberInRange(inputs.energy, 1, 5, "Energy");
    const mood = numberInRange(inputs.mood, 1, 5, "Mood");
    const stress = numberInRange(inputs.stress, 1, 5, "Stress");
    const shoulder = numberInRange(inputs.shoulder, 0, 10, "Shoulder pain");
    const elbow = numberInRange(inputs.elbow, 0, 10, "Elbow pain");
    const forearm = numberInRange(inputs.forearm, 0, 10, "Forearm pain");
    const lat = numberInRange(inputs.lat, 0, 10, "Lat pain");
    const lower = numberInRange(inputs.lower, 0, 10, "Lower-body soreness");
    const safety = evaluateSafety({ ...inputs, shoulder, elbow }, context.previousPain);
    if (safety.override) {
      return Object.freeze({
        formulaId: "readiness-provisional-v1",
        label: "Provisional readiness heuristic",
        score: null,
        risk: "red",
        planLevel: "hold",
        workloadFactor: 0,
        reasons: safety.reasons,
        signals: Object.freeze([]),
        safety
      });
    }
    const sleepScore = clamp(sleepHours / 8.5 * 100, 0, 100);
    const painValues = [shoulder, elbow, forearm, lat, lower];
    const painScore = 100 - painValues.reduce((sum, value) => sum + value, 0) / painValues.length * 10;
    const subjectiveScore = sleepScore * 0.2 + sleepQuality / 5 * 100 * 0.1 + energy / 5 * 100 * 0.15 + mood / 5 * 100 * 0.1 + (6 - stress) / 5 * 100 * 0.15 + painScore * 0.3;
    const ouraReadiness = optionalNumber(inputs.ouraReadinessScore);
    let score = ouraReadiness !== null && ouraReadiness > 0 ? subjectiveScore * 0.75 + clamp(ouraReadiness, 0, 100) * 0.25 : subjectiveScore;
    const signals = createSignals(inputs, context);
    score = Math.round(clamp(score - Math.min(12, signals.length * 6), 0, 100));
    const stressMinutes = optionalNumber(inputs.ouraStressHighMinutes);
    const recovery = score < 60 || ouraReadiness !== null && ouraReadiness > 0 && ouraReadiness < 60 || stressMinutes !== null && stressMinutes >= 300 || isYes2(inputs.ouraRestMode) || stress >= 5 || energy <= 1 || sleepHours < 5.5 || painValues.some((value) => value >= 4) || inputs.previousSessionResponse === "much_worse" || signals.length >= 2;
    const reduced = !recovery && (score < 75 || ouraReadiness !== null && ouraReadiness > 0 && ouraReadiness < 70 || stressMinutes !== null && stressMinutes >= 180 || stress >= 4 || energy <= 2 || sleepHours < 6.5 || painValues.some((value) => value >= 3) || inputs.previousSessionResponse === "worse" || signals.length === 1);
    const planLevel = recovery ? "recovery" : reduced ? "reduced" : "full";
    const reasons = signals.map((signal) => signal.text);
    if (painValues.some((value) => value >= 3)) reasons.push("One or more soreness areas reached the workload-adjustment threshold");
    if (sleepHours < 6.5) reasons.push(`Sleep was ${sleepHours} hours`);
    if (stress >= 4) reasons.push(`Life stress was ${stress}/5`);
    if (energy <= 2) reasons.push(`Energy was ${energy}/5`);
    if (ouraReadiness !== null && ouraReadiness > 0 && ouraReadiness < 70) reasons.push(`Oura readiness was ${ouraReadiness}/100`);
    if (!reasons.length) reasons.push("Inputs are within the full-session guardrails");
    return Object.freeze({
      formulaId: "readiness-provisional-v1",
      label: "Provisional readiness heuristic",
      score,
      risk: planLevel === "recovery" ? "orange" : planLevel === "reduced" ? "yellow" : "green",
      planLevel,
      workloadFactor: planLevel === "recovery" ? 0.5 : planLevel === "reduced" ? 0.75 : 1,
      reasons: Object.freeze(reasons),
      signals: Object.freeze(signals),
      safety
    });
  }
  function canOverrideReadiness(result) {
    return !result.safety.override && (result.planLevel === "reduced" || result.planLevel === "recovery");
  }

  // src/domain/recovery.ts
  var coldPolicy = Object.freeze({
    policyId: "no-cold-v1",
    allowsCold: false,
    reason: "No ice, cold-water immersion, or contrast therapy.",
    forfeited: "Post-pitching icing raised 48-hour external-rotation torque in one study (n = 16). No replacement has been tested against that measure in pitchers."
  });
  function nonNegativeInteger(value, label) {
    if (value === void 0 || value === null || value === "") return 0;
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric) || numeric < 0 || numeric > 1e3) {
      throw new Error(`${label} must be a non-negative integer no greater than 1000`);
    }
    return numeric;
  }
  function percent(value, label) {
    if (value === void 0 || value === null || value === "") return 0;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
      throw new Error(`${label} must be between 0 and 100`);
    }
    return numeric;
  }
  function modality(id, name, prescription, window, evidence, optional = false) {
    return Object.freeze({ id, name, prescription, window, evidence, optional });
  }
  function day(dayOffset, title, focus, modalities, notes) {
    return Object.freeze({
      dayOffset,
      title,
      focus,
      modalities: Object.freeze([...modalities]),
      notes: Object.freeze([...notes])
    });
  }
  function classifyThrowingLoadTier(inputs) {
    const gamePitches = nonNegativeInteger(inputs.gamePitches, "Game pitches");
    const totalThrows = nonNegativeInteger(inputs.totalThrows, "Total throws");
    const intentPercent = percent(inputs.intentPercent, "Intent");
    if (gamePitches >= 60) return "heavy";
    if (gamePitches >= 30) return "moderate";
    if (gamePitches > 0) return intentPercent >= 95 ? "moderate" : "light";
    if (totalThrows >= 30 && intentPercent >= 80) return "moderate";
    return "light";
  }
  function protocolLengthForTier(tier) {
    if (tier === "heavy") return 5;
    if (tier === "moderate") return 4;
    return 2;
  }
  var COMPRESSION = modality(
    "compression",
    "Compression sleeve \u2014 throwing arm",
    "On within 30 minutes, worn 2\u20138 hours",
    "T+0h to T+8h",
    "Compression's largest effect is strength recovery at 2\u20138 h (Brown 2017, 23 studies). Ordinary sleeve pressure is sufficient."
  );
  var PERCUSSIVE = modality(
    "percussive",
    "Percussive massage \u2014 throwing shoulder",
    "10 minutes, moderate pressure",
    "T+0h to T+1h",
    "Improved joint position sense immediately (Huang 2026); massage ranked best for soreness and fatigue (Dupuy 2018)."
  );
  var MOBILITY_COOLDOWN = modality(
    "mobility-cooldown",
    "Mobility cool-down circuit",
    "Shoulder CARs \xD710 \xB7 band pull-apart \xD710 each way \xB7 band no-money \xD710 \xB7 hip flow 2\u20133 each way",
    "T+5min to T+15min",
    "Driveline moved high-volume band work out of this slot in 2020; throwing is already the fatiguing stimulus."
  );
  var FUEL = modality(
    "fuel",
    "Protein and carbohydrate",
    "0.3\u20130.4 g/kg protein (\u224830 g) plus carbohydrate, inside 60 minutes",
    "T+0h to T+1h",
    "30 g raised myofibrillar synthesis over 24 h where 15 g did not (Mallinson 2023)."
  );
  var SLEEP = modality(
    "sleep",
    "Sleep target",
    "9 hours in bed tonight",
    "Same night",
    "Sleep extension improved sprint and accuracy measures (Mah 2011)."
  );
  var HEAT = modality(
    "heat",
    "Hot-water immersion or sauna",
    "10\u201320 minutes, at least 2 hours after throwing",
    "Evening of day 0",
    "Rated best for restoring muscle function (Rousse 2025), though acute effects split 4 positive / 4 null / 1 adverse (Ahokas 2025).",
    true
  );
  var SCAPULAR_STRENGTH = modality(
    "scapular-strength",
    "Scapular strengthening",
    "6\u20138 movements, moderate-to-heavy load, low volume",
    "Day 1",
    "Day-1 scapular strengthening gave the best day-4 internal-rotation range of three protocols tested (Jensen 2025, n = 13)."
  );
  var AEROBIC_FLUSH = modality(
    "aerobic-flush",
    "Low-intensity aerobic flush",
    "15\u201320 minutes, conversational pace",
    "Day 1",
    "Active recovery reduces soreness and strength loss versus passive rest (Fares 2021)."
  );
  var POSTERIOR_STRETCH = modality(
    "posterior-stretch",
    "Sleeper and/or cross-body stretch",
    "3 \xD7 30 s each",
    "Day 2, never within 2 hours before throwing",
    "+7\xB0 internal rotation across 6 RCTs (Iida 2025). Acutely reduces external-rotator strength (Lo 2021), so not before throwing."
  );
  var SOFT_TISSUE = modality(
    "soft-tissue",
    "Massage or foam rolling",
    "8\u201310 minutes, throwing side and upper back",
    "Day 1\u20132",
    "Foam-rolling evidence is split \u2014 an effect at 24\u201348 h (Zhou 2024), none versus no intervention (Medeiros 2023).",
    true
  );
  var BAND_ARM_CARE = modality(
    "band-arm-care",
    "Full band arm-care routine",
    "11-exercise cuff and scapular circuit",
    "Day 3 onward",
    "Belongs on the re-load day, not immediately post-outing where it adds fatigue to a fatigued arm."
  );
  var PRIMER = modality(
    "primer",
    "Short priming session",
    "Low volume, moderate intent, full mobility, no new stimulus",
    "Day 4",
    "Rotation peak force is still climbing through day 4 (Pexa 2025)."
  );
  function throwingDay0() {
    return day(
      0,
      "Day 0 \u2014 immediate",
      "Down-regulate, protect strength, feed and sleep",
      [MOBILITY_COOLDOWN, COMPRESSION, PERCUSSIVE, FUEL, SLEEP, HEAT],
      ["No heavy band or rebounder volume in this window \u2014 throwing was the endurance stimulus.", coldPolicy.reason]
    );
  }
  function throwingDay1() {
    return day(
      1,
      "Day 1 \u2014 scapular strength",
      "Load the cuff and scapula while the arm is still recovering",
      [SCAPULAR_STRENGTH, AEROBIC_FLUSH, SOFT_TISSUE],
      ["Expect internal-rotation range to feel worse tomorrow. That dip is the documented cost of doing this correctly, and range is better by day 4 (Jensen 2025)."]
    );
  }
  function throwingDay2() {
    return day(
      2,
      "Day 2 \u2014 range and soft tissue",
      "Restore posterior-shoulder range",
      [POSTERIOR_STRETCH, SOFT_TISSUE, COMPRESSION],
      ["A reduced internal-rotation feel today is expected after day-1 scapular work \u2014 not a setback.", "No sleeper stretch within 2 hours before throwing (Lo 2021)."]
    );
  }
  function throwingDay3() {
    return day(
      3,
      "Day 3 \u2014 range returns, first re-load",
      "Light catch or touch-and-feel bullpen",
      [BAND_ARM_CARE, MOBILITY_COOLDOWN],
      ["Internal-rotation range peaks around day 3 (Pexa 2025), which is why the bullpen sits near 72 hours post-outing."]
    );
  }
  function throwingDay4() {
    return day(
      4,
      "Day 4 \u2014 prime",
      "Low volume, moderate intent",
      [PRIMER, MOBILITY_COOLDOWN],
      ["Rotation peak force is highest at day 5, so the arm is still climbing today."]
    );
  }
  function buildThrowingRecoveryPlan(tier) {
    if (tier !== "light" && tier !== "moderate" && tier !== "heavy") {
      throw new Error("Throwing load tier must be light, moderate or heavy");
    }
    const all = [throwingDay0(), throwingDay1(), throwingDay2(), throwingDay3(), throwingDay4()];
    return Object.freeze({
      protocolId: "throwing-recovery-no-cold-v2",
      label: "Five-day post-throwing recovery protocol",
      tier,
      days: Object.freeze(all.slice(0, protocolLengthForTier(tier)))
    });
  }
  var GYM_PROTEIN = modality(
    "protein",
    "Protein distribution",
    "30 g inside 60 minutes, then 30 g every ~3 hours \u2014 four feeds across the day",
    "T+0h to T+12h",
    "20 g every 3 h beat both 10 g/1.5 h and 40 g/6 h for myofibrillar synthesis by 31\u201348% (Areta 2013)."
  );
  var GYM_COMPRESSION = modality(
    "compression",
    "Compression garment \u2014 trained limbs",
    "Worn 2\u20138 hours post-session",
    "T+0h to T+8h",
    "Compression's effect was largest after resistance exercise, ES 1.33 at >24 h (Brown 2017)."
  );
  var GYM_HEAT = modality(
    "heat",
    "Heat exposure",
    "Sauna or hot-water immersion, no timing restriction relative to the lift",
    "Any time post-session",
    "Unlike cold, heat may enhance the muscle-mass benefit of strength training (McGorm 2018).",
    true
  );
  var GYM_DOWNREGULATION = modality(
    "downregulation",
    "Down-regulation breathing",
    "5 minutes, extended exhale",
    "T+0h to T+15min",
    "Low-cost parasympathetic shift with no adaptation trade-off."
  );
  var GYM_NEXT_DAY = modality(
    "next-day-flush",
    "Low-intensity aerobic flush or mobility flow",
    "20\u201330 minutes",
    "Day 1",
    "Active recovery reduces soreness and strength loss versus passive rest (Fares 2021)."
  );
  function buildGymRecoveryPlan(sessionType) {
    if (sessionType !== "hypertrophy" && sessionType !== "max_strength" && sessionType !== "conditioning") {
      throw new Error("Gym session type must be hypertrophy, max_strength or conditioning");
    }
    const sameDay = [GYM_PROTEIN, GYM_DOWNREGULATION, GYM_HEAT];
    if (sessionType !== "conditioning") sameDay.splice(1, 0, GYM_COMPRESSION);
    const notes = [coldPolicy.reason];
    if (sessionType === "hypertrophy") {
      notes.push("Cold after resistance training blunts type II hypertrophy and mTOR signalling (Roberts 2015; Fyfe 2019). Excluding it costs this track nothing.");
    }
    notes.push("Protein targets are per day, not per session. If you also threw today, do not double-count the four feeds.");
    return Object.freeze({
      protocolId: "gym-recovery-no-cold-v2",
      label: "Post-resistance-training recovery protocol",
      sessionType,
      days: Object.freeze([
        day(0, "Day 0 \u2014 immediate", "Feed, compress, down-regulate", sameDay, notes),
        day(1, "Day 1 \u2014 flush", "Move without adding stimulus", [GYM_NEXT_DAY, SOFT_TISSUE, GYM_COMPRESSION], [
          "Foam rolling and massage bite hardest at 24\u201348 h, not immediately (Zhou 2024)."
        ])
      ])
    });
  }
  function postScapularRangeAnnotation(dayOffset) {
    if (!Number.isInteger(dayOffset) || dayOffset < 0) {
      throw new Error("Day offset must be a non-negative integer");
    }
    if (dayOffset === 2) {
      return "Expected \u2014 you did scapular strengthening on day 1. Range is lower today and better by day 4 (Jensen 2025).";
    }
    return null;
  }
  function isPosteriorStretchBlocked(hoursUntilThrowing) {
    if (hoursUntilThrowing === null || hoursUntilThrowing === void 0) return false;
    const numeric = Number(hoursUntilThrowing);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error("Hours until throwing must be a non-negative number");
    }
    return numeric < 2;
  }

  // src/domain/throwing-load.ts
  var COEFFICIENTS = Object.freeze({
    lowIntentThrows: 1,
    moderateThrows: 2,
    highIntentThrows: 4,
    gamePitches: 5
  });
  function throwCount(value, label) {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric) || numeric < 0 || numeric > 1e3) {
      throw new Error(`${label} must be a non-negative integer no greater than 1000`);
    }
    return numeric;
  }
  function calculateProvisionalThrowingLoad(inputs) {
    const validated = Object.freeze({
      lowIntentThrows: throwCount(inputs.lowIntentThrows, "Low-intent throws"),
      moderateThrows: throwCount(inputs.moderateThrows, "Moderate throws"),
      highIntentThrows: throwCount(inputs.highIntentThrows, "High-intent throws"),
      gamePitches: throwCount(inputs.gamePitches, "Game pitches")
    });
    return Object.freeze({
      formulaId: "throwing-load-provisional-v1",
      label: "Provisional manual throwing-load index",
      index: validated.lowIntentThrows * COEFFICIENTS.lowIntentThrows + validated.moderateThrows * COEFFICIENTS.moderateThrows + validated.highIntentThrows * COEFFICIENTS.highIntentThrows + validated.gamePitches * COEFFICIENTS.gamePitches,
      coefficients: COEFFICIENTS,
      inputs: validated
    });
  }

  // src/domain/index.ts
  var schemaVersion = 2;
  return __toCommonJS(index_exports);
})();
