import { describe, expect, it } from "vitest";
import { buildRecap } from "./sessionRecap";
import { SessionTask } from "./programmeSessions";

function task(id: string, stageTitle: string, name: string, prescription = "3 × 5"): SessionTask {
  return {
    id,
    stage: 1,
    stageTitle,
    stageDescription: "",
    name,
    prescription,
    cue: "",
  } as SessionTask;
}

const TASKS = [
  task("t1", "Prepare", "Ankle stiffness pogos"),
  task("t2", "Throwing", "Bullpen", "25 total throws"),
  task("t3", "Strength", "Back squat", "3 × 5 @ 130 kg"),
  task("t4", "Arm care", "Forearm prep"),
];

const base = { date: "2026-08-11" as const, session: { title: "Tuesday · Bullpen", focus: "Command" } };

describe("buildRecap — what a shareable card may claim", () => {
  it("names the session and the day's approved effort", () => {
    const recap = buildRecap({ ...base, submission: { planLevel: "reduced" } });
    // The weekday prefix is the app's own labelling, not part of the name.
    expect(recap.title).toBe("Bullpen");
    expect(recap.focus).toBe("Command");
    expect(recap.effort).toBe("75% effort");
  });

  it("counts completed work against the whole task list", () => {
    const recap = buildRecap({ ...base, tasks: TASKS, completed: ["t1", "t2"] });
    const session = recap.stats.find((stat) => stat.label === "Session")!;
    expect(session.value).toBe("2");
    expect(session.detail).toBe("of 4 done");
  });

  it("shows skipped work rather than quietly rounding it up", () => {
    // A card reporting 4 of 4 on a day where two were skipped is the kind of
    // flattery that makes a training diary useless a season later.
    const recap = buildRecap({ ...base, tasks: TASKS, completed: ["t1"], skipped: { t3: {}, t4: {} } });
    expect(recap.stats.find((stat) => stat.label === "Skipped")!.value).toBe("2");
  });

  it("does not print a skipped row when nothing was skipped", () => {
    const recap = buildRecap({ ...base, tasks: TASKS, completed: ["t1"] });
    expect(recap.stats.some((stat) => stat.label === "Skipped")).toBe(false);
  });

  it("counts a task that was completed after being skipped as completed", () => {
    const recap = buildRecap({ ...base, tasks: TASKS, completed: ["t3"], skipped: { t3: {} } });
    expect(recap.stats.find((stat) => stat.label === "Session")!.value).toBe("1");
    expect(recap.stats.some((stat) => stat.label === "Skipped")).toBe(false);
  });

  it("omits throws entirely when the throwing log was never opened", () => {
    // The critical rule: a card is a public claim. Printing "0 throws" for an
    // unlogged day is a false statement about training, not a summary.
    const recap = buildRecap({ ...base, tasks: TASKS, completed: ["t2"] });
    expect(recap.stats.some((stat) => stat.label === "Throws")).toBe(false);
  });

  it("omits a zero rather than reporting it, for every logged number", () => {
    const recap = buildRecap({
      ...base,
      throwing: { throws: 0 },
      report: { perceivedExertion: 0, armFeel: 0, gamePitches: 0 },
      submission: { score: 0 },
    });
    for (const label of ["Throws", "RPE", "Arm feel", "Game pitches", "Readiness"]) {
      expect(recap.stats.some((stat) => stat.label === label)).toBe(false);
    }
  });

  it("carries the logged throwing, check-out and readiness numbers", () => {
    const recap = buildRecap({
      ...base,
      throwing: { throws: 42, intent: "bullpen" },
      report: { perceivedExertion: 7, armFeel: 8, gamePitches: 62 },
      submission: { score: 81 },
    });
    const value = (label: string) => recap.stats.find((stat) => stat.label === label)?.value;
    expect(value("Throws")).toBe("42");
    expect(value("Game pitches")).toBe("62");
    expect(value("RPE")).toBe("7");
    expect(value("Arm feel")).toBe("8");
    expect(value("Readiness")).toBe("81");
  });

  it("highlights the throwing and the lifting, not the warm-up", () => {
    const recap = buildRecap({ ...base, tasks: TASKS, completed: ["t1", "t2", "t3", "t4"] });
    expect(recap.highlights).toEqual([
      "Bullpen · 25 total throws",
      "Back squat · 3 × 5 @ 130 kg",
    ]);
  });

  it("never advertises work that was skipped or left undone", () => {
    // The single worst failure this card could have: claiming a lift that did
    // not happen.
    const recap = buildRecap({ ...base, tasks: TASKS, completed: ["t2"], skipped: { t3: {} } });
    expect(recap.highlights).toEqual(["Bullpen · 25 total throws"]);
    expect(recap.highlights.join(" ")).not.toContain("Back squat");
  });

  it("caps the highlights so the card stays a card", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      task(`s${index}`, "Strength", `Lift ${index}`)
    );
    const recap = buildRecap({
      ...base,
      tasks: many,
      completed: many.map((item) => item.id),
    });
    expect(recap.highlights).toHaveLength(4);
  });

  it("reports having nothing to show rather than rendering an empty card", () => {
    expect(buildRecap({ date: "2026-08-11" }).hasContent).toBe(false);
  });

  it("does not make a card out of a day the plan was opened and closed", () => {
    // "0 of 14 done" is not a session recap.
    const recap = buildRecap({ ...base, tasks: TASKS, completed: [] });
    expect(recap.stats.some((stat) => stat.label === "Session")).toBe(false);
    expect(recap.hasContent).toBe(false);
  });

  it("has content once anything at all is logged", () => {
    expect(buildRecap({ ...base, report: { perceivedExertion: 6 } }).hasContent).toBe(true);
  });

  it("falls back to a neutral title rather than an empty one", () => {
    expect(buildRecap({ date: "2026-08-11" }).title).toBe("Training session");
  });

  it("says nothing about effort when no check-in set one", () => {
    expect(buildRecap({ ...base }).effort).toBe("");
  });

  it("names a health hold plainly", () => {
    expect(buildRecap({ ...base, submission: { planLevel: "hold" } }).effort).toBe("Health hold");
  });

  it("survives missing and malformed input", () => {
    expect(() =>
      buildRecap({
        date: "2026-08-11",
        session: null,
        tasks: undefined,
        completed: undefined,
        skipped: undefined,
        report: null,
        submission: null,
        throwing: null,
      })
    ).not.toThrow();
  });
});
