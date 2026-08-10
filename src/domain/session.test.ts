import { describe, expect, it } from "vitest";
import {
  DAY_NAMES,
  HIGH_INTENT_DAYS,
  ManualOverride,
  PlanState,
  ReadinessSubmission,
  acuteChronicRatio,
  adjustedSessionLoad,
  checkHighIntentAllowed,
  completeTask,
  dayNameForDate,
  isHighIntentDay,
  isPlanUnlocked,
  overridePlanLevel,
  planStateForDate,
  sessionProgress,
  skipTask,
  submitReadiness,
  submitSessionReport,
  throwLoad,
  totalThrowLoad,
  undoSkipTask,
} from "./session";
import { ReadinessResult } from "./readiness";

const NOW = new Date("2026-08-05T09:00:00.000Z"); // a Wednesday

function result(overrides: Partial<ReadinessResult> = {}): ReadinessResult {
  return {
    score: 90,
    risk: "green",
    planLevel: "full",
    workloadFactor: 1,
    reasons: [],
    signals: [],
    ...overrides,
  };
}

function submission(overrides: Partial<ReadinessSubmission> = {}): ReadinessSubmission {
  return {
    date: "2026-08-05",
    score: 90,
    risk: "green",
    planLevel: "full",
    workloadFactor: 1,
    submittedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe("dates and day names", () => {
  it("maps ISO dates to Monday-first day names", () => {
    expect(dayNameForDate("2026-08-05")).toBe("Wednesday");
    expect(dayNameForDate("2026-08-08")).toBe("Saturday");
    expect(dayNameForDate("2026-08-09")).toBe("Sunday");
    expect(dayNameForDate("2026-08-10")).toBe("Monday");
  });

  it("rejects invalid dates instead of guessing", () => {
    expect(dayNameForDate("not-a-date")).toBeNull();
    expect(dayNameForDate("2026-13-01")).toBeNull();
    expect(dayNameForDate("2026-02-30")).toBeNull();
  });

  it("covers all seven days", () => {
    expect(DAY_NAMES).toHaveLength(7);
    const week = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"];
    expect(week.map(dayNameForDate)).toEqual([...DAY_NAMES]);
  });
});

describe("high-intent days", () => {
  it("permits only Wednesday and Saturday", () => {
    expect(HIGH_INTENT_DAYS).toEqual(["Wednesday", "Saturday"]);
    expect(isHighIntentDay("Wednesday")).toBe(true);
    expect(isHighIntentDay("Saturday")).toBe(true);
    for (const day of ["Monday", "Tuesday", "Thursday", "Friday", "Sunday"] as const) {
      expect(isHighIntentDay(day), day).toBe(false);
    }
  });

  it("never allows two permitted days back to back", () => {
    const permitted = DAY_NAMES.map((day) => isHighIntentDay(day));
    for (let index = 1; index < permitted.length; index += 1) {
      expect(permitted[index] && permitted[index - 1]).toBe(false);
    }
  });
});

describe("readiness submission", () => {
  it("records a first submission", () => {
    const outcome = submitReadiness({}, "2026-08-05", result(), NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.submission.planLevel).toBe("full");
      expect(outcome.submission.submittedAt).toBe(NOW.toISOString());
    }
  });

  it("refuses a duplicate submission for the same date", () => {
    const outcome = submitReadiness({ "2026-08-05": submission() }, "2026-08-05", result(), NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("duplicate");
  });

  it("allows a duplicate only when explicitly forced", () => {
    const outcome = submitReadiness({ "2026-08-05": submission() }, "2026-08-05", result(), NOW, { force: true });
    expect(outcome.ok).toBe(true);
  });

  it("rejects an invalid date", () => {
    const outcome = submitReadiness({}, "05-08-2026", result(), NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("invalid-date");
  });

  it("keys strictly by date, so another day is unaffected", () => {
    const outcome = submitReadiness({ "2026-08-05": submission() }, "2026-08-06", result(), NOW);
    expect(outcome.ok).toBe(true);
  });
});

describe("plan unlocking", () => {
  it("stays locked until readiness is submitted", () => {
    const state = planStateForDate({}, "2026-08-05");
    expect(state.status).toBe("locked");
    expect(isPlanUnlocked({}, "2026-08-05")).toBe(false);
  });

  it("unlocks at the submitted plan level", () => {
    const state = planStateForDate({ "2026-08-05": submission({ planLevel: "reduced", workloadFactor: 0.75 }) }, "2026-08-05");
    expect(state).toEqual({ status: "unlocked", planLevel: "reduced", workloadFactor: 0.75 });
  });

  it("holds on a red reading rather than unlocking", () => {
    const held = planStateForDate({ "2026-08-05": submission({ planLevel: "hold", risk: "red", workloadFactor: 0 }) }, "2026-08-05");
    expect(held.status).toBe("held");
    expect(isPlanUnlocked({ "2026-08-05": submission({ planLevel: "hold", risk: "red" }) }, "2026-08-05")).toBe(false);
  });

  it("honours an accepted override when unlocking", () => {
    const override: ManualOverride = { from: "reduced", to: "full", reason: "felt good in warmup", at: NOW.toISOString() };
    const state = planStateForDate({ "2026-08-05": submission({ planLevel: "reduced", manualOverride: override }) }, "2026-08-05");
    expect(state).toEqual({ status: "unlocked", planLevel: "full", workloadFactor: 1 });
  });

  it("only unlocks the date that was submitted", () => {
    const submissions = { "2026-08-05": submission() };
    expect(isPlanUnlocked(submissions, "2026-08-05")).toBe(true);
    expect(isPlanUnlocked(submissions, "2026-08-06")).toBe(false);
  });
});

describe("manual override", () => {
  it("refuses to override a health hold", () => {
    const outcome = overridePlanLevel(submission({ planLevel: "hold", risk: "red" }), "full", "feel fine", NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("hold");
  });

  it("refuses to override a red risk even if the level is not hold", () => {
    const outcome = overridePlanLevel(submission({ planLevel: "recovery", risk: "red" }), "full", "feel fine", NOW);
    expect(outcome.ok).toBe(false);
  });

  it("requires a reason", () => {
    const outcome = overridePlanLevel(submission({ planLevel: "reduced" }), "full", "   ", NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("no-reason");
  });

  it("records the reason and the level it came from", () => {
    const outcome = overridePlanLevel(submission({ planLevel: "reduced" }), "full", " warmed up well ", NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.override).toEqual({ from: "reduced", to: "full", reason: "warmed up well", at: NOW.toISOString() });
    }
  });

  it("cannot override before submitting", () => {
    const outcome = overridePlanLevel(undefined, "full", "reason", NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("not-submitted");
  });
});

describe("high-intent throwing rules", () => {
  const fullPlan: PlanState = { status: "unlocked", planLevel: "full", workloadFactor: 1 };

  it("allows high intent on Wednesday and Saturday at a full plan", () => {
    expect(checkHighIntentAllowed("2026-08-05", "high", fullPlan).allowed).toBe(true); // Wed
    expect(checkHighIntentAllowed("2026-08-08", "high", fullPlan).allowed).toBe(true); // Sat
  });

  it.each(["2026-08-03", "2026-08-04", "2026-08-06", "2026-08-07", "2026-08-09"])(
    "blocks high intent on %s",
    (date) => {
      const check = checkHighIntentAllowed(date, "high", fullPlan);
      expect(check.allowed).toBe(false);
      if (!check.allowed) expect(check.reason).toBe("day-not-permitted");
    }
  );

  it("never restricts sub-high intent, on any day", () => {
    for (const date of ["2026-08-03", "2026-08-05", "2026-08-09"]) {
      for (const intent of ["recovery", "low", "moderate"] as const) {
        expect(checkHighIntentAllowed(date, intent, fullPlan).allowed).toBe(true);
      }
    }
  });

  it("blocks high intent on a permitted day when the plan is reduced", () => {
    const check = checkHighIntentAllowed("2026-08-05", "high", {
      status: "unlocked",
      planLevel: "reduced",
      workloadFactor: 0.75,
    });
    expect(check.allowed).toBe(false);
    if (!check.allowed) expect(check.reason).toBe("plan-restricts-intent");
  });

  it("blocks high intent under a health hold", () => {
    const check = checkHighIntentAllowed("2026-08-05", "high", { status: "held", workloadFactor: 0, message: "" });
    expect(check.allowed).toBe(false);
    if (!check.allowed) expect(check.reason).toBe("plan-held");
  });

  it("blocks high intent before readiness is submitted", () => {
    const check = checkHighIntentAllowed("2026-08-05", "high", { status: "locked", message: "" });
    expect(check.allowed).toBe(false);
  });
});

describe("throwing load", () => {
  it("weights throws by intent", () => {
    expect(throwLoad({ intent: "high", throws: 40 })).toBe(40);
    expect(throwLoad({ intent: "moderate", throws: 40 })).toBe(30);
    expect(throwLoad({ intent: "low", throws: 40 })).toBe(20);
    expect(throwLoad({ intent: "recovery", throws: 40 })).toBe(10);
  });

  it("treats missing or nonsensical counts as zero", () => {
    expect(throwLoad({ intent: "high", throws: 0 })).toBe(0);
    expect(throwLoad({ intent: "high", throws: -5 })).toBe(0);
    expect(throwLoad({ intent: "high", throws: NaN })).toBe(0);
  });

  it("totals across sessions", () => {
    expect(
      totalThrowLoad([
        { intent: "high", throws: 30 },
        { intent: "low", throws: 20 },
        { intent: "recovery", throws: 12 },
      ])
    ).toBe(43);
  });

  it("totals to zero for an empty week", () => {
    expect(totalThrowLoad([])).toBe(0);
  });
});

describe("session load adjustment", () => {
  it("scales by the readiness workload factor", () => {
    expect(adjustedSessionLoad(40, 1)).toBe(40);
    expect(adjustedSessionLoad(40, 0.75)).toBe(30);
    expect(adjustedSessionLoad(40, 0.5)).toBe(20);
    expect(adjustedSessionLoad(40, 0)).toBe(0);
  });

  it("rounds to whole units", () => {
    expect(adjustedSessionLoad(35, 0.75)).toBe(26);
  });

  it("handles a zero or invalid base", () => {
    expect(adjustedSessionLoad(0, 1)).toBe(0);
    expect(adjustedSessionLoad(NaN, 1)).toBe(0);
  });
});

describe("acute:chronic ratio", () => {
  it("compares the last 7 days against the average preceding week", () => {
    // 28-day load of 400 → 100/week. A 150 acute week is 1.5.
    expect(acuteChronicRatio(150, 400)).toBe(1.5);
    expect(acuteChronicRatio(100, 400)).toBe(1);
  });

  it("returns null rather than a misleading number without history", () => {
    expect(acuteChronicRatio(150, 0)).toBeNull();
    expect(acuteChronicRatio(150, NaN)).toBeNull();
  });
});

describe("task completion", () => {
  const unlocked: PlanState = { status: "unlocked", planLevel: "full", workloadFactor: 1 };

  it("is gated behind the readiness check", () => {
    const outcome = completeTask({}, { status: "locked", message: "" }, "2026-08-05", "warmup");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("locked");
  });

  it("appends a task once unlocked", () => {
    const outcome = completeTask({}, unlocked, "2026-08-05", "warmup");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.completed).toEqual(["warmup"]);
  });

  it("refuses to log the same task twice", () => {
    const outcome = completeTask({ "2026-08-05": ["warmup"] }, unlocked, "2026-08-05", "warmup");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("already-complete");
  });

  it("keeps earlier tasks when adding another", () => {
    const outcome = completeTask({ "2026-08-05": ["warmup"] }, unlocked, "2026-08-05", "bullpen");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.completed).toEqual(["warmup", "bullpen"]);
  });

  it("is allowed under a hold — recovery work still gets logged", () => {
    const outcome = completeTask({}, { status: "held", workloadFactor: 0, message: "" }, "2026-08-05", "mobility");
    expect(outcome.ok).toBe(true);
  });
});

describe("post-session report", () => {
  const unlocked: PlanState = { status: "unlocked", planLevel: "full", workloadFactor: 1 };
  const input = { date: "2026-08-05", perceivedExertion: 6, armFeel: 8, gamePitches: 42 };

  it("records a report once", () => {
    const outcome = submitSessionReport({}, unlocked, input, NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.report.submittedAt).toBe(NOW.toISOString());
  });

  it("refuses a duplicate for the same date", () => {
    const outcome = submitSessionReport({ "2026-08-05": {} }, unlocked, input, NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("duplicate");
  });

  it("cannot be filed before the readiness check", () => {
    const outcome = submitSessionReport({}, { status: "locked", message: "" }, input, NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("not-unlocked");
  });

  it("rejects an invalid date", () => {
    const outcome = submitSessionReport({}, unlocked, { ...input, date: "5th August" }, NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("invalid-date");
  });
});

describe("skipping a task", () => {
  const unlocked: PlanState = { status: "unlocked", planLevel: "full", workloadFactor: 1 };
  const locked: PlanState = { status: "locked", message: "Locked." };
  const task = { id: "warmup", stageTitle: "Preparation" };
  const at = new Date("2026-08-05T09:00:00.000Z");

  it("records the reason, the note and when it happened", () => {
    const outcome = skipTask({}, {}, unlocked, "2026-08-05", task, { reason: "Time constraint", notes: "short" }, at);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.skipped.warmup).toEqual({
      reason: "Time constraint",
      notes: "short",
      skippedAt: "2026-08-05T09:00:00.000Z",
    });
  });

  it("refuses a skip with no reason, including a whitespace-only one", () => {
    for (const reason of ["", "   "]) {
      const outcome = skipTask({}, {}, unlocked, "2026-08-05", task, { reason }, at);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.reason).toBe("no-reason");
    }
  });

  it("refuses to skip a health-hold action", () => {
    const outcome = skipTask(
      {}, {}, unlocked, "2026-08-05",
      { id: "review", stageTitle: "Health Hold" },
      { reason: "Time constraint" }, at
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("health-hold");
    expect(outcome.message).toContain("cannot be skipped");
  });

  it("refuses to skip before readiness has been submitted", () => {
    const outcome = skipTask({}, {}, locked, "2026-08-05", task, { reason: "Time constraint" }, at);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("locked");
  });

  it("refuses to skip work already logged as completed", () => {
    const outcome = skipTask({}, { "2026-08-05": ["warmup"] }, unlocked, "2026-08-05", task, { reason: "Time constraint" }, at);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("already-complete");
  });

  it("leaves other days and other tasks untouched", () => {
    const existing = {
      "2026-08-04": { other: { reason: "Rest", skippedAt: at.toISOString() } },
      "2026-08-05": { mobility: { reason: "Rest", skippedAt: at.toISOString() } },
    };
    const outcome = skipTask(existing, {}, unlocked, "2026-08-05", task, { reason: "Time constraint" }, at);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(Object.keys(outcome.skipped).sort()).toEqual(["mobility", "warmup"]);
    expect(existing["2026-08-04"].other).toBeDefined();
  });

  it("undoes a skip without touching the rest of the day", () => {
    const next = undoSkipTask(
      { "2026-08-05": { warmup: { reason: "Rest", skippedAt: at.toISOString() }, mobility: { reason: "Rest", skippedAt: at.toISOString() } } },
      "2026-08-05",
      "warmup"
    );
    expect(Object.keys(next)).toEqual(["mobility"]);
  });
});

describe("session progress", () => {
  const tasks = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const skip = { reason: "Rest", skippedAt: "2026-08-05T09:00:00.000Z" };

  it("counts skipped work as resolved but never as completed", () => {
    const progress = sessionProgress(tasks, ["a"], { b: skip });
    expect(progress).toEqual({ total: 4, completed: 1, skipped: 1, resolved: 2, percent: 50 });
  });

  it("does not double-count a task that is both completed and skipped", () => {
    const progress = sessionProgress(tasks, ["a"], { a: skip });
    expect(progress.resolved).toBe(1);
    expect(progress.skipped).toBe(0);
  });

  it("reports 0% rather than dividing by zero for an empty session", () => {
    expect(sessionProgress([], [], {}).percent).toBe(0);
  });
});
