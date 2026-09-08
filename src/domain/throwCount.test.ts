/**
 * The day's throw count, read off the session.
 *
 * Checked against the programme's real prescriptions rather than invented
 * ones. The whole feature is a reader of strings someone else wrote, and a
 * test using strings this file made up would pass while the deployed app read
 * nothing at all — the same failure the soreness overlay's tests are built to
 * avoid, for the same reason.
 */

import { describe, expect, it } from "vitest";
import {
  adoptTally,
  intentForPercent,
  intentPrescribed,
  isThrowingTask,
  tallyThrows,
  throwsPrescribed,
} from "./throwCount";
import { SessionTask, buildSession, setProgrammeContext, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";
import { Game } from "./gameLog";
import { PROGRAMME_WEEK_COUNT } from "./calendar";

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

const task = (stageTitle: string, name: string, prescription: string) =>
  ({ id: "t", stageTitle, name, prescription }) as unknown as SessionTask;

/** Every task the programme can produce, built once. */
const ALL_TASKS: SessionTask[] = (() => {
  const out: SessionTask[] = [];
  for (let week = 1; week <= PROGRAMME_WEEK_COUNT; week += 1) {
    const plan = weekPlan(week, PBS);
    for (let day = 0; day < 7; day += 1) {
      out.push(...applyBaselineProgramming(buildSession(plan, day), null, day).tasks);
    }
  }
  return out;
})();

describe("what counts as throwing", () => {
  it("takes the three stages that put a baseball in the air", () => {
    expect(isThrowingTask(task("Throw", "Recovery catch", ""))).toBe(true);
    expect(isThrowingTask(task("Team Throwing", "Team practice throwing", ""))).toBe(true);
    expect(isThrowingTask(task("Plyo Ball Preparation", "Plyo Ball Rocker Throw — 225 g", ""))).toBe(true);
  });

  it("leaves med-ball work out of an arm-workload figure", () => {
    // A scoop toss is thrown, and it is a trunk exercise in a gym stage. It
    // costs the elbow nothing and counting it would put a lower-body power
    // drill into the number the acute:chronic ratio is built on.
    expect(isThrowingTask(task("Whole-Body Power", "Rotational med-ball shot put", "2 × 3/side · 2–3 kg"))).toBe(false);
    expect(isThrowingTask(task("Whole-Body Primer", "Med-ball scoop toss", "2 × 2/side · 2 kg"))).toBe(false);
    expect(isThrowingTask(task("Compete", "Game appearance", "Team pitch/inning limits apply"))).toBe(false);
  });
});

describe("reading a volume off the prescription", () => {
  it("opens a range at the bottom, because raising it is the easy edit", () => {
    expect(throwsPrescribed(task("Throw", "Recovery catch", "45–60 total throws · 60–75 ft · 50–60% effort"))).toBe(45);
    expect(throwsPrescribed(task("Throw", "Catch-play build-up", "Close catch → 60 → 90 → 120 → 150 ft · 35–50 throws"))).toBe(35);
  });

  it("multiplies a plyo ladder out", () => {
    expect(throwsPrescribed(task("Plyo Ball Preparation", "Plyo Ball Roll-In Throw — 450 g", "2 × 5 · 70% · hybrid B intent"))).toBe(10);
  });

  it("reads the words the programme puts in front of the noun", () => {
    expect(throwsPrescribed(task("Throw", "Velocity day", "10 measured throws · 90–100%"))).toBe(10);
    expect(throwsPrescribed(task("Throw", "High-intent pulldowns", "6–8 high-quality pulldowns"))).toBe(6);
    expect(throwsPrescribed(task("Throw", "Controlled mound build", "25–40 pitch bullpen · 70–85%"))).toBe(25);
  });

  it("says nothing rather than guessing when there is no dose", () => {
    // Four of these exist: a Wednesday pulldown slot carrying a week-level
    // note where a dose would go.
    expect(throwsPrescribed(task("Throw", "High-intent pulldowns", "Short competitive bullpen; no fatigue chase"))).toBeNull();
    expect(throwsPrescribed(task("Throw", "High-intent pulldowns", "Throwing volume down 45–55%; no game assumptions"))).toBeNull();
  });

  it("does not reach across a separator for a noun in the next clause", () => {
    // "150 ft · 35–50 throws" must not let the 150 claim the word "throws".
    expect(throwsPrescribed(task("Throw", "Pregame catch", "Close catch → 60 → 90 → 120 ft · 25–40 throws"))).toBe(25);
  });

  it("reads a dose off all but four of the programme's throwing tasks", () => {
    const throwing = ALL_TASKS.filter(isThrowingTask);
    expect(throwing.length).toBeGreaterThan(100);
    const unread = new Set(
      throwing.filter((entry) => throwsPrescribed(entry) === null).map((entry) => String(entry.prescription))
    );
    expect([...unread].sort()).toEqual([
      "Easy catch plus one controlled mound touch",
      "One controlled Wednesday intent exposure; team training rhythm Tue/Thu",
      "Short competitive bullpen; no fatigue chase",
      "Throwing volume down 45–55%; no game assumptions",
    ]);
  });
});

describe("reading the intent", () => {
  it("puts a percentage on the nearest word, not the next one up", () => {
    // The failure this replaced: `INTENT_PERCENT` read as lower bounds files
    // a 90% throw as moderate and a 70% one as low, because both sit just
    // under the next figure.
    expect(intentForPercent(90)).toBe("high");
    expect(intentForPercent(70)).toBe("moderate");
    expect(intentForPercent(60)).toBe("low");
    expect(intentForPercent(40)).toBe("recovery");
  });

  it("resolves a tie downward", () => {
    // 50 is ten points from both recovery and low. Calling it low on a
    // rounding rule would inflate an arm-workload figure by fiat.
    expect(intentForPercent(50)).toBe("recovery");
  });

  it("uses the athlete's own reading of the words where they set one", () => {
    expect(intentForPercent(85, { recovery: 40, low: 60, moderate: 85, high: 100 })).toBe("moderate");
  });

  it("takes the top of an effort range, because the hardest throws set the cost", () => {
    expect(intentPrescribed(task("Throw", "Flat-ground command", "45–55 total throws · 65–75% effort"))).toBe("moderate");
    expect(intentPrescribed(task("Plyo Ball Preparation", "Windup — 150 g", "2 × 3 · 90% · hybrid A intent"))).toBe("high");
  });

  it("falls back to the name when no percentage is written", () => {
    expect(intentPrescribed(task("Throw", "High-intent pulldowns", "8 pulldowns; establish a clean baseline"))).toBe("high");
    expect(intentPrescribed(task("Throw", "Pregame bullpen", "Approximately 20–30 pitches: fastball build"))).toBe("moderate");
  });
});

describe("the day's tally", () => {
  const saturday = () => {
    const tasks = applyBaselineProgramming(buildSession(weekPlan(3, PBS), 5), null, 5).tasks;
    return tasks;
  };

  it("counts only what has been ticked", () => {
    const tasks = saturday();
    expect(tallyThrows(tasks, [])).toBeNull();
    const all = tallyThrows(tasks, tasks.map((entry) => String(entry.id)));
    expect(all!.throws).toBeGreaterThan(40);
    expect(all!.sources.length).toBeGreaterThan(2);
  });

  it("takes the hardest intent of the day, never an average", () => {
    // A day of easy catch play with eight pulldowns in it is a high-intent
    // day. Averaging would file it as a light one, which is the reading the
    // acute:chronic ratio must not be given.
    const tasks = [
      task("Throw", "Recovery catch", "45–60 total throws · 50–60% effort"),
      { ...task("Throw", "High-intent pulldowns", "8 pulldowns"), id: "pull" } as SessionTask,
    ];
    const tally = tallyThrows(tasks, ["t", "pull"]);
    expect(tally!.throws).toBe(53);
    expect(tally!.intent).toBe("high");
  });

  it("counts a logged game whether or not the task was ticked", () => {
    // "Team pitch/inning limits apply" is the honest prescription for an
    // appearance nobody has yet made, and no use as a number. The pitch count
    // is measured, and it arrives with the game.
    const game = { id: "g1", date: "2026-09-11", opponent: "Redbirds", pitches: 62 } as Game;
    const tally = tallyThrows([], [], [game]);
    expect(tally!.throws).toBe(62);
    expect(tally!.intent).toBe("high");
    expect(tally!.sources[0].name).toBe("Game vs Redbirds");
  });

  it("names completed throwing that states no dose, rather than reading low", () => {
    const tasks = [task("Throw", "High-intent pulldowns", "Short competitive bullpen; no fatigue chase")];
    const tally = tallyThrows(tasks, ["t"]);
    expect(tally!.throws).toBe(0);
    expect(tally!.unread).toEqual(["High-intent pulldowns"]);
  });
});

describe("what the tally is allowed to overwrite", () => {
  const tally = { throws: 58, intent: "moderate" as const, sources: [], unread: [] };

  it("writes when nothing is stored", () => {
    expect(adoptTally(null, tally, "2026-09-11")).toEqual({
      action: "write",
      entry: { date: "2026-09-11", throws: 58, intent: "moderate", source: "auto" },
    });
  });

  it("replaces its own earlier figure when the session changes", () => {
    const stored = { date: "2026-09-11", throws: 20, intent: "low" as const, source: "auto" as const };
    expect(adoptTally(stored, tally, "2026-09-11").action).toBe("write");
  });

  it("never touches a number the athlete typed", () => {
    const typed = { date: "2026-09-11", throws: 92, intent: "high" as const, source: "manual" as const };
    expect(adoptTally(typed, tally, "2026-09-11")).toEqual({ action: "keep" });
  });

  it("treats an entry from before this existed as the athlete's", () => {
    // Everything stored before the field was added was typed on the Workload
    // tab. An absent value has to mean "theirs" — the alternative is an
    // upgrade that silently rewrites months of hand-entered workload.
    const old = { date: "2026-09-11", throws: 92, intent: "high" as const };
    expect(adoptTally(old, tally, "2026-09-11")).toEqual({ action: "keep" });
  });

  it("clears its own entry when the last throwing task is unticked", () => {
    const stored = { date: "2026-09-11", throws: 58, intent: "moderate" as const, source: "auto" as const };
    expect(adoptTally(stored, null, "2026-09-11")).toEqual({ action: "clear" });
  });

  it("leaves the athlete's entry alone even with nothing ticked", () => {
    const typed = { date: "2026-09-11", throws: 92, intent: "high" as const, source: "manual" as const };
    expect(adoptTally(typed, null, "2026-09-11")).toEqual({ action: "keep" });
  });

  it("writes nothing when nothing is stored and nothing was thrown", () => {
    expect(adoptTally(null, null, "2026-09-11")).toEqual({ action: "keep" });
  });

  it("does not rewrite an identical figure", () => {
    const same = { date: "2026-09-11", throws: 58, intent: "moderate" as const, source: "auto" as const };
    expect(adoptTally(same, tally, "2026-09-11")).toEqual({ action: "keep" });
  });
});
