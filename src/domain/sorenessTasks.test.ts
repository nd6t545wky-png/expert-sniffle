/**
 * The overlay, tested against real programme days.
 *
 * Sessions here are built by `buildSession` rather than hand-written, because
 * the whole feature turns on matching the programme's actual task names. A
 * test using invented tasks would pass while the deployed app quietly left the
 * movement that hurt in the plan — which is the exact failure this feature
 * exists to prevent, and the one that would be least visible.
 */

import { describe, expect, it } from "vitest";
import {
  Session,
  buildSession,
  dateForWeekDay,
  setProgrammeContext,
  weekPlan,
} from "./programmeSessions";
import { PROGRAMME_WEEK_COUNT } from "./calendar";
import { ActiveReport, BodyRegion, SorenessReport, activeReports } from "./soreness";
import { applySorenessProtocol } from "./sorenessTasks";

const PBS = {
  trainingMaxes: {
    lifts: {
      squat: { value: 140, kind: "kg" },
      bench: { value: 100, kind: "kg" },
      deadlift: { value: 180, kind: "kg" },
      press: { value: 60, kind: "kg" },
    },
  },
};

setProgrammeContext({ pbs: PBS });

/** Every (week, day) the programme can produce, built once. */
const ALL_DAYS: { week: number; day: number; date: string; session: Session }[] = (() => {
  const out: { week: number; day: number; date: string; session: Session }[] = [];
  for (let week = 1; week <= PROGRAMME_WEEK_COUNT; week += 1) {
    const plan = weekPlan(week, PBS);
    for (let day = 0; day < 7; day += 1) {
      out.push({ week, day, date: dateForWeekDay(plan, day), session: buildSession(plan, day) });
    }
  }
  return out;
})();

/** The first day whose plan contains a task matching this pattern. */
function dayWith(pattern: RegExp) {
  const found = ALL_DAYS.find((entry) => entry.session.tasks.some((task) => pattern.test(task.name)));
  if (!found) throw new Error(`No programme day has a task matching ${pattern}`);
  return found;
}

function reportOn(date: string, overrides: Partial<SorenessReport> = {}): SorenessReport {
  return {
    id: "r1",
    date,
    region: "elbow_medial",
    severity: 7,
    quality: "ache",
    timing: "during",
    trend: "same",
    createdAt: `${date}T08:00:00.000Z`,
    ...overrides,
  };
}

function apply(session: Session, date: string, reports: SorenessReport[]) {
  return applySorenessProtocol(session, activeReports(reports, date));
}

const names = (session: Session) => session.tasks.map((task) => task.name);

/**
 * Stages that are throwing and nothing else.
 *
 * Deliberately excludes `Game Warm-up` and `High-Intent Prep`: both sound like
 * throwing and hold only sprint work. Gating on them took a pitcher's running
 * away because his elbow hurt.
 */
const THROWING_STAGE = /^(Throw|Plyo Ball Preparation|Team Throwing|Compete)$/i;

const throwingTasks = (session: Session) =>
  session.tasks.filter((task) => THROWING_STAGE.test(String(task.stageTitle)));

describe("nothing reported", () => {
  it("leaves every day in the programme exactly as it was", () => {
    for (const { week, day, session } of ALL_DAYS) {
      const overlay = applySorenessProtocol(session, []);
      expect(overlay.session, `week ${week} day ${day}`).toBe(session);
      expect(overlay.changes).toEqual([]);
      expect(overlay.note).toBeNull();
    }
  });

  it("ignores a stale report rather than acting on it", () => {
    // Nine days old with no update. Training around an elbow that stopped
    // hurting last week is its own kind of wrong.
    const { session, date } = dayWith(/Trap bar deadlift/);
    const stale: ActiveReport[] = activeReports([reportOn("2026-01-01", { severity: 9 })], date);
    expect(stale[0].stale).toBe(true);
    const overlay = applySorenessProtocol(session, stale);
    expect(overlay.changes).toEqual([]);
    expect(overlay.session).toBe(session);
  });

  it("changes nothing at the monitor tier, but says so", () => {
    const { session, date } = dayWith(/Trap bar deadlift/);
    const overlay = apply(session, date, [
      reportOn(date, { severity: 2, timing: "warms_up" }),
    ]);
    expect(names(overlay.session)).toEqual(names(session));
    expect(overlay.note).toMatch(/plan is unchanged/i);
  });
});

describe("taking work out", () => {
  it("removes what loads the sore tissue", () => {
    const { session, date } = dayWith(/Chin-up/);
    const overlay = apply(session, date, [reportOn(date, { region: "elbow_medial", severity: 7 })]);
    expect(names(overlay.session)).not.toContain("Chin-up");
    expect(overlay.changes.some((change) => /Chin-up is out/.test(change.text))).toBe(true);
  });

  it("leaves work that does not load it", () => {
    // The point of the whole feature: a sore elbow is not a reason to skip
    // the lower body.
    const { session, date } = dayWith(/Rear-foot-elevated split squat/);
    const overlay = apply(session, date, [reportOn(date, { region: "elbow_medial", severity: 8 })]);
    expect(names(overlay.session).some((name) => /split squat/i.test(name))).toBe(true);
  });

  it("says what it removed and why, never silently", () => {
    const { session, date } = dayWith(/Bench press/);
    const overlay = apply(session, date, [reportOn(date, { region: "shoulder_front", severity: 7 })]);
    for (const change of overlay.changes) {
      expect(change.text.trim().length).toBeGreaterThan(0);
      expect(change.region).toBeTruthy();
    }
    expect(overlay.note).toMatch(/changed around what you reported/i);
  });
});

describe("swapping rather than removing", () => {
  it("keeps the deadlift with straps for a sore elbow", () => {
    // Straps take the forearm out of the lift. Removing it would cost the
    // day's main strength stimulus for no reason.
    const { session, date } = dayWith(/^Trap bar deadlift$/);
    const overlay = apply(session, date, [reportOn(date, { region: "elbow_medial", severity: 7 })]);
    const swapped = overlay.session.tasks.find((task) => /Trap bar deadlift/i.test(task.name));
    expect(swapped).toBeTruthy();
    expect(swapped?.name).toMatch(/straps/i);
    expect(swapped?.prescription).toMatch(/straps/i);
  });

  it("keeps the task's id, so completion already recorded survives", () => {
    const { session, date } = dayWith(/^Trap bar deadlift$/);
    const original = session.tasks.find((task) => /^Trap bar deadlift$/.test(task.name))!;
    const overlay = apply(session, date, [reportOn(date, { region: "elbow_medial", severity: 7 })]);
    const swapped = overlay.session.tasks.find((task) => /Trap bar deadlift/i.test(task.name));
    expect(swapped?.id).toBe(original.id);
  });

  it("presses from the floor for a sore front of shoulder", () => {
    const { session, date } = dayWith(/Bench press/);
    const overlay = apply(session, date, [reportOn(date, { region: "shoulder_front", severity: 7 })]);
    const pressing = names(overlay.session).filter((name) => /press/i.test(name));
    expect(pressing.some((name) => /floor press/i.test(name))).toBe(true);
    expect(pressing.some((name) => /^Bench press$/i.test(name))).toBe(false);
  });

  it("removes rather than swaps when a second region objects to the swap too", () => {
    // A sore elbow wants the deadlift with straps; a sore back wants it gone.
    // The stricter answer has to win whichever order they are processed in.
    const { session, date } = dayWith(/^Trap bar deadlift$/);
    const both = apply(session, date, [
      reportOn(date, { id: "a", region: "elbow_medial", severity: 7 }),
      reportOn(date, { id: "b", region: "low_back", severity: 7 }),
    ]);
    expect(names(both.session).some((name) => /trap bar deadlift/i.test(name))).toBe(false);
  });
});

describe("throwing", () => {
  const throwingDay = () => dayWith(/Pregame bullpen|High-intent pulldowns|Controlled mound build/);

  it("comes out completely when an arm is on hold", () => {
    const { session, date } = throwingDay();
    const overlay = apply(session, date, [reportOn(date, { region: "elbow_medial", severity: 8 })]);
    expect(throwingTasks(overlay.session)).toEqual([]);
    expect(overlay.changes.some((change) => /No throwing today/.test(change.text))).toBe(true);
  });

  it("keeps catch play but caps the effort when modifying", () => {
    const { session, date } = dayWith(/Catch-play build-up|Easy catch|Recovery catch|Primer catch/);
    const overlay = apply(session, date, [
      reportOn(date, { region: "elbow_medial", severity: 4, timing: "during" }),
    ]);
    const catchPlay = overlay.session.tasks.filter((task) => /catch/i.test(task.name));
    expect(catchPlay.length).toBeGreaterThan(0);
    for (const task of catchPlay) {
      expect(task.prescription).toMatch(/Cap effort at 60%/);
      expect(task.stop).toMatch(/worse the next morning/i);
    }
  });

  it("removes high-intent throwing even when catch play stays", () => {
    const { session, date } = dayWith(/High-intent pulldowns/);
    const overlay = apply(session, date, [
      reportOn(date, { region: "elbow_medial", severity: 4, timing: "during" }),
    ]);
    expect(names(overlay.session)).not.toContain("High-intent pulldowns");
  });

  it("does not take the running away because the elbow hurts", () => {
    // Found in a browser, not in a test: "Game Warm-up" and "High-Intent Prep"
    // sound like throwing stages and contain only sprint work, so gating on the
    // stage title removed a pitcher's sprint mechanics for a sore elbow.
    for (const pattern of [/Sprint mechanics/, /Sprint build-ups/]) {
      const { session, date } = dayWith(pattern);
      const overlay = apply(session, date, [reportOn(date, { region: "elbow_medial", severity: 9 })]);
      expect(names(overlay.session).some((name) => pattern.test(name)), String(pattern)).toBe(true);
    }
  });

  it("does take the running away when the leg is the problem", () => {
    const { session, date } = dayWith(/Sprint mechanics/);
    const overlay = apply(session, date, [reportOn(date, { region: "knee", severity: 8 })]);
    expect(names(overlay.session).some((name) => /Sprint mechanics/.test(name))).toBe(false);
  });

  it("sends the athlete to team practice but takes the throwing out of it", () => {
    // Removing team training would say "skip practice", which is not the app's
    // call and not what the arm needs.
    const { session, date } = dayWith(/Complete team training/);
    const overlay = apply(session, date, [reportOn(date, { region: "elbow_medial", severity: 8 })]);
    const practice = overlay.session.tasks.find((task) => /Complete team training/.test(task.name));
    expect(practice).toBeTruthy();
    expect(practice?.prescription).toMatch(/no part in any throwing/i);
    expect(practice?.prescription).toMatch(/tell your coach/i);
  });

  it("is untouched by a sore knee", () => {
    const { session, date } = throwingDay();
    const before = names(session).filter((name) => /catch|bullpen|pulldown|mound/i.test(name));
    const overlay = apply(session, date, [reportOn(date, { region: "knee", severity: 8 })]);
    const after = names(overlay.session).filter((name) => /catch|bullpen|pulldown|mound/i.test(name));
    expect(after).toEqual(before);
  });

  it("names the risk rather than just removing the work", () => {
    const { session, date } = throwingDay();
    const overlay = apply(session, date, [reportOn(date, { region: "shoulder_back", severity: 8 })]);
    expect(overlay.changes.some((change) => /risk factor/i.test(change.text))).toBe(true);
  });
});

describe("putting work in", () => {
  it("adds the region's prescribed exercises, with a dose", () => {
    const { session, date } = dayWith(/Trap bar deadlift/);
    const overlay = apply(session, date, [reportOn(date, { region: "elbow_medial", severity: 4, timing: "during" })]);
    const added = overlay.session.tasks.filter((task) => task.id.startsWith("soreness-"));
    expect(added.length).toBeGreaterThan(0);
    for (const task of added) {
      expect(task.name).toMatch(/Inside of elbow/);
      expect(task.prescription).toMatch(/\d/);
      expect(task.cue.trim().length).toBeGreaterThan(0);
    }
  });

  it("carries the citation through to the athlete", () => {
    const { session, date } = dayWith(/Trap bar deadlift/);
    const overlay = apply(session, date, [reportOn(date, { region: "knee", severity: 4, timing: "during" })]);
    const spanish = overlay.session.tasks.find((task) => /Spanish squat/i.test(task.name));
    expect(spanish?.evidence).toMatch(/Rio 2015/);
  });

  it("puts arm work in Arm Care and everything else in Recover", () => {
    const { session, date } = dayWith(/Trap bar deadlift/);
    const arm = apply(session, date, [reportOn(date, { region: "shoulder_back", severity: 4, timing: "during" })]);
    for (const task of arm.session.tasks.filter((item) => item.id.startsWith("soreness-"))) {
      expect(task.stageTitle).toBe("Arm Care");
    }
    const leg = apply(session, date, [reportOn(date, { region: "knee", severity: 4, timing: "during" })]);
    for (const task of leg.session.tasks.filter((item) => item.id.startsWith("soreness-"))) {
      expect(task.stageTitle).toBe("Recover");
    }
  });

  it("prescribes the hold set, not the modify set, once resting the area", () => {
    const { session, date } = dayWith(/Trap bar deadlift/);
    const overlay = apply(session, date, [reportOn(date, { region: "low_back", severity: 8 })]);
    const added = names(overlay.session).filter((name) => /Lower back/.test(name));
    expect(added.some((name) => /Short walks/i.test(name))).toBe(true);
    expect(added.some((name) => /Side plank/i.test(name))).toBe(false);
  });

  it("asks for a shared exercise once when two regions both want it", () => {
    // Front and back of the same shoulder both prescribe external rotation
    // isometrics. The athlete should be asked for them once.
    const { session, date } = dayWith(/Trap bar deadlift/);
    const overlay = apply(session, date, [
      reportOn(date, { id: "a", region: "shoulder_front", severity: 8 }),
      reportOn(date, { id: "b", region: "shoulder_back", severity: 8 }),
    ]);
    const ids = overlay.session.tasks.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is idempotent — applying twice changes nothing the second time", () => {
    const { session, date } = dayWith(/Trap bar deadlift/);
    const reports = [reportOn(date, { region: "elbow_medial", severity: 7 })];
    const once = apply(session, date, reports);
    const twice = apply(once.session, date, reports);
    expect(names(twice.session)).toEqual(names(once.session));
  });
});

describe("referral", () => {
  it("is surfaced separately from the training changes", () => {
    const { session, date } = dayWith(/Trap bar deadlift/);
    const overlay = apply(session, date, [
      reportOn(date, { region: "shoulder_front", severity: 3, quality: "burning" }),
    ]);
    expect(overlay.referral).toMatch(/nerve description/i);
  });

  it("still rests the area rather than only advising", () => {
    // A referral that left the plan intact would be an app that says "see
    // someone" and then hands over a bullpen.
    const { session, date } = dayWith(/Pregame bullpen|High-intent pulldowns|Controlled mound build/);
    const overlay = apply(session, date, [
      reportOn(date, { region: "elbow_medial", severity: 2, quality: "giving_way" }),
    ]);
    expect(throwingTasks(overlay.session)).toEqual([]);
  });

  it("is null when nothing needs referring", () => {
    const { session, date } = dayWith(/Trap bar deadlift/);
    expect(apply(session, date, [reportOn(date, { severity: 4, timing: "during" })]).referral).toBeNull();
  });
});

describe("across the whole programme", () => {
  const regions: BodyRegion[] = [
    "shoulder_front",
    "shoulder_back",
    "shoulder_top",
    "elbow_medial",
    "elbow_lateral",
    "elbow_posterior",
    "forearm",
    "wrist_hand",
    "lat_teres",
    "low_back",
    "hip_groin",
    "knee",
    "ankle_foot",
    "other",
  ];

  it("never leaves a day with no tasks at all", () => {
    // Even resting everything sore has to leave the athlete with something to
    // do, or the day reads as an error rather than as a plan.
    for (const region of regions) {
      for (const { week, day, date, session } of ALL_DAYS) {
        const overlay = apply(session, date, [reportOn(date, { region, severity: 9 })]);
        expect(
          overlay.session.tasks.length,
          `week ${week} day ${day} with ${region} at 9/10`
        ).toBeGreaterThan(0);
      }
    }
  });

  it("never produces a duplicate task id, on any day, for any region", () => {
    for (const region of regions) {
      for (const { week, day, date, session } of ALL_DAYS) {
        const overlay = apply(session, date, [reportOn(date, { region, severity: 7 })]);
        const ids = overlay.session.tasks.map((task) => task.id);
        expect(new Set(ids).size, `week ${week} day ${day} ${region}`).toBe(ids.length);
      }
    }
  });

  it("never leaves an unresolved value in anything the athlete reads", () => {
    for (const region of regions) {
      for (const { date, session } of ALL_DAYS.slice(0, 60)) {
        const overlay = apply(session, date, [reportOn(date, { region, severity: 5, timing: "during" })]);
        for (const task of overlay.session.tasks) {
          for (const field of ["name", "prescription", "cue", "stop", "evidence"] as const) {
            const value = task[field];
            if (typeof value !== "string") continue;
            expect(value, `${region} ${task.id} ${field}`).not.toMatch(/NaN|undefined|\[object Object\]/);
          }
        }
        for (const change of overlay.changes) {
          expect(change.text).not.toMatch(/NaN|undefined|\[object Object\]/);
        }
      }
    }
  });

  it("removes all throwing on every day, for every arm region, at hold", () => {
    const armRegions: BodyRegion[] = [
      "shoulder_front",
      "shoulder_back",
      "shoulder_top",
      "elbow_medial",
      "elbow_lateral",
      "elbow_posterior",
      "forearm",
      "wrist_hand",
      "lat_teres",
    ];
    for (const region of armRegions) {
      for (const { week, day, date, session } of ALL_DAYS) {
        const overlay = apply(session, date, [reportOn(date, { region, severity: 8 })]);
        expect(
          throwingTasks(overlay.session).map((task) => task.name),
          `week ${week} day ${day} ${region}`
        ).toEqual([]);
      }
    }
  });
});
