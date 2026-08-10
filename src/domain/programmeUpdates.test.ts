import { describe, expect, it } from "vitest";
import { applyBaselineProgramming, strengthWindowKg, PLYO_EVIDENCE_NOTE } from "./programmeUpdates";
import { seedBaselinePbs, BASELINE_ANCHORS } from "./baseline";
import { Session, SessionTask } from "./programmeSessions";

function task(overrides: Partial<SessionTask> = {}): SessionTask {
  return {
    id: "w5-d0-x",
    stage: 4,
    stageTitle: "Whole-Body Force",
    stageDescription: "Power first, then primary strength.",
    name: "Something",
    prescription: "3 × 5",
    cue: "Cue.",
    ...overrides,
  };
}

function session(tasks: SessionTask[]): Session {
  return { title: "t", focus: "f", duration: "d", stress: "s", description: "d", tasks };
}

describe("baseline programming overlay", () => {
  it("computes the report's strength window from the tested max", () => {
    // 77–87% of 145 kg, rounded to the nearest 2.5 kg.
    expect(strengthWindowKg()).toEqual({ low: 112.5, high: 125 });
    expect(strengthWindowKg(100)).toEqual({ low: 77.5, high: 87.5 });
  });

  it("adds the depth jump, speed squat and RDL the report prescribed", () => {
    const result = applyBaselineProgramming(session([task()]));
    const names = result.tasks.map((t) => t.name);
    expect(names.some((n) => /Depth jump/.test(n))).toBe(true);
    expect(names.some((n) => /Speed squat/.test(n))).toBe(true);
    expect(names.some((n) => /Romanian deadlift/.test(n))).toBe(true);
  });

  it("uses the measured box height and power load, not round numbers", () => {
    const result = applyBaselineProgramming(session([task()]));
    const depth = result.tasks.find((t) => /Depth jump/.test(t.name));
    const speed = result.tasks.find((t) => /Speed squat/.test(t.name));
    expect(depth?.name).toContain(`${BASELINE_ANCHORS.depthJumpBoxCm[0]}–${BASELINE_ANCHORS.depthJumpBoxCm[1]} cm`);
    expect(speed?.prescription).toContain(`${BASELINE_ANCHORS.optimalPowerLoadKg} kg`);
  });

  it("keeps the additions inside the gym stage so they stay grouped", () => {
    const result = applyBaselineProgramming(
      session([task({ id: "w5-d0-a" }), task({ id: "w5-d0-b", stage: 5, stageTitle: "Condition" })])
    );
    for (const added of result.tasks.filter((t) => /Depth jump|Speed squat|Romanian/.test(t.name))) {
      expect(added.stage).toBe(4);
      expect(added.stageTitle).toBe("Whole-Body Force");
    }
  });

  it("does nothing to a session with no gym stage", () => {
    const throwing = session([task({ stage: 3, stageTitle: "Throw", name: "Recovery catch" })]);
    const result = applyBaselineProgramming(throwing);
    expect(result.tasks).toHaveLength(1);
  });

  it("is idempotent — re-applying does not duplicate the additions", () => {
    const once = applyBaselineProgramming(session([task()]));
    const twice = applyBaselineProgramming(once);
    expect(twice.tasks).toHaveLength(once.tasks.length);
  });

  it("swaps the primer's broad jump for the depth jump but keeps the med-ball throw", () => {
    const primer = task({
      id: "w5-d0-gym-warm",
      name: "Low-volume power primer",
      prescription: "Med-ball rotational scoop toss 2 × 3/side · broad jump 2 × 2",
    });
    const result = applyBaselineProgramming(session([primer]));
    const updated = result.tasks.find((t) => t.name === "Low-volume power primer");
    expect(updated?.prescription).toContain("Med-ball rotational scoop toss");
    expect(updated?.prescription).not.toMatch(/broad jump/i);
    expect(result.tasks.some((t) => /Depth jump/.test(t.name))).toBe(true);
  });

  it("adds bar-speed intent to primary lifts, and only to those", () => {
    const result = applyBaselineProgramming(
      session([
        task({ id: "w5-d0-dl", name: "Trap bar deadlift" }),
        task({ id: "w5-d0-row", name: "Chest-supported dumbbell row" }),
      ])
    );
    const lift = result.tasks.find((t) => t.name === "Trap bar deadlift");
    const row = result.tasks.find((t) => t.name === "Chest-supported dumbbell row");
    expect(lift?.cue).toMatch(/maximal intent/);
    expect(row?.cue).not.toMatch(/maximal intent/);
  });

  it("does not tell the speed squat to move faster — that is already the point", () => {
    const result = applyBaselineProgramming(session([task()]));
    const speed = result.tasks.find((t) => /Speed squat/.test(t.name));
    expect(speed?.cue).not.toMatch(/354 ms/);
  });

  it("attaches the weighted-ball evidence note to plyo tasks only", () => {
    const result = applyBaselineProgramming(
      session([
        task({ id: "w5-d0-p1", stage: 2, stageTitle: "Plyo Ball Preparation", name: "Plyo Ball Rocker Throw — 225 g", stop: "Stop for pain." }),
        task({ id: "w5-d0-c", stage: 3, stageTitle: "Throw", name: "Recovery catch", stop: "Stop for pain." }),
      ])
    );
    const plyo = result.tasks.find((t) => t.stageTitle === "Plyo Ball Preparation");
    const cat = result.tasks.find((t) => t.name === "Recovery catch");
    expect(plyo?.stop).toContain(PLYO_EVIDENCE_NOTE);
    expect(plyo?.stop).toMatch(/^Stop for pain\./);
    expect(cat?.stop).toBe("Stop for pain.");
  });

  it("says plainly that the 2 kg ball is beyond the studied range", () => {
    const result = applyBaselineProgramming(
      session([task({ stage: 2, stageTitle: "Plyo Ball Preparation", name: "Plyo Ball Reverse Throw — 2,000 g" })])
    );
    expect(result.tasks[0].stop).toMatch(/heavier than any implement used in the published trials/);
  });

  it("warns specifically on the light balls, where the risk concentrates", () => {
    const light = applyBaselineProgramming(
      session([task({ stage: 2, stageTitle: "Plyo Ball Preparation", name: "Plyo Ball Walking Windup — 100 g" })])
    );
    expect(light.tasks[0].stop).toMatch(/highest arm speeds/);

    // A 1,000 g ball must not be mistaken for a light one by the matcher.
    const heavyish = applyBaselineProgramming(
      session([task({ stage: 2, stageTitle: "Plyo Ball Preparation", name: "Plyo Ball Reverse Throw — 1,000 g" })])
    );
    expect(heavyish.tasks[0].stop).not.toMatch(/highest arm speeds/);
  });
});

describe("seeding the tested max", () => {
  it("puts the measured back squat where the programme reads training maxes", () => {
    const seeded = seedBaselinePbs({}) as { pbs: { trainingMaxes: { lifts: Record<string, { value: number; kind: string }> } } };
    expect(seeded.pbs.trainingMaxes.lifts.backSquat.value).toBe(145);
    expect(seeded.pbs.trainingMaxes.lifts.backSquat.kind).toBe("tested");
  });

  it("never overwrites a max the athlete has already updated", () => {
    const existing = { pbs: { trainingMaxes: { lifts: { backSquat: { value: 160, kind: "tested" } } } } };
    expect(seedBaselinePbs(existing)).toBe(existing);
  });

  it("leaves other lifts and the rest of the state alone", () => {
    const state = { pbs: { trainingMaxes: { lifts: { benchPress: { value: 90 } } } }, pre: { a: 1 } };
    const seeded = seedBaselinePbs(state) as typeof state;
    expect(seeded.pbs.trainingMaxes.lifts.benchPress).toEqual({ value: 90 });
    expect(seeded.pre).toEqual({ a: 1 });
  });
});

describe("where the additions land", () => {
  const gym = (id: string, name: string): SessionTask => ({
    id, stage: 4, stageTitle: "Whole-Body Force", stageDescription: "d", name,
    prescription: "p", cue: "c",
  });

  const order = (s: Session) => s.tasks.map((t) => t.name);

  it("puts reactive and velocity work before the heavy lifting", () => {
    const result = applyBaselineProgramming(
      session([
        gym("w5-d0-warm", "Low-volume power primer"),
        gym("w5-d0-dl", "Trap bar deadlift"),
        gym("w5-d0-bench", "Bench press"),
      ])
    );
    const names = order(result);
    const depth = names.findIndex((n) => /Depth jump/.test(n));
    const speed = names.findIndex((n) => /Speed squat/.test(n));
    const deadlift = names.indexOf("Trap bar deadlift");
    // Fatigued depth jumps train a slow contact — the exact fault being fixed.
    expect(depth).toBeLessThan(deadlift);
    expect(speed).toBeLessThan(deadlift);
    // But still after the primer, which exists to prepare for them.
    expect(depth).toBeGreaterThan(names.indexOf("Low-volume power primer"));
  });

  it("leaves the hinge with the accessory work at the end", () => {
    const result = applyBaselineProgramming(
      session([gym("w5-d0-warm", "Low-volume power primer"), gym("w5-d0-dl", "Trap bar deadlift")])
    );
    const names = order(result);
    expect(names.indexOf("Romanian deadlift")).toBeGreaterThan(names.indexOf("Trap bar deadlift"));
  });

  it("leads the gym block when there is no primer to follow", () => {
    const result = applyBaselineProgramming(
      session([
        { id: "w5-d0-c", stage: 3, stageTitle: "Throw", stageDescription: "d", name: "Catch", prescription: "p", cue: "c" },
        gym("w5-d0-dl", "Trap bar deadlift"),
      ])
    );
    const names = order(result);
    expect(names.findIndex((n) => /Depth jump/.test(n))).toBeLessThan(names.indexOf("Trap bar deadlift"));
    expect(names.indexOf("Catch")).toBe(0);
  });
});
