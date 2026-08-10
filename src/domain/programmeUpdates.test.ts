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

describe("the 2 kg plyo ball is out", () => {
  const plyo = (name: string): SessionTask => ({
    id: `w5-d0-${name}`, stage: 2, stageTitle: "Plyo Ball Preparation",
    stageDescription: "d", name, prescription: "1 × 5 · 50% perceived effort", cue: "c",
  });

  it("is removed wherever it appears", () => {
    const result = applyBaselineProgramming(
      session([plyo("Plyo Ball Reverse Throw — 2,000 g"), plyo("Plyo Ball Reverse Throw — 1,000 g")])
    );
    expect(result.tasks.map((t) => t.name)).toEqual(["Plyo Ball Reverse Throw — 1,000 g"]);
  });

  it("leaves the 1,000 g throw doing the same job", () => {
    const result = applyBaselineProgramming(session([plyo("Plyo Ball Reverse Throw — 1,000 g")]));
    expect(result.tasks.some((t) => /1,000 g/.test(t.name))).toBe(true);
  });

  it("does not remove anything else that happens to mention a number", () => {
    const result = applyBaselineProgramming(
      session([plyo("Plyo Ball Roll-In Throw — 450 g"), plyo("Plyo Ball Rocker Throw — 225 g")])
    );
    expect(result.tasks).toHaveLength(2);
  });

  it("does not touch a gym movement that mentions 2,000", () => {
    const result = applyBaselineProgramming(
      session([{ id: "w5-d0-x", stage: 4, stageTitle: "Whole-Body Force", stageDescription: "d",
                 name: "Sled push — 2,000 g plate", prescription: "3 × 20 m", cue: "c" }])
    );
    expect(result.tasks.some((t) => /Sled push/.test(t.name))).toBe(true);
  });
});

describe("the report's strength window is actually used", () => {
  it("adds a back squat in the prescribed 77–87% band, from the tested max", () => {
    const result = applyBaselineProgramming(
      session([task({ id: "w5-d0-warm", name: "Low-volume power primer" })])
    );
    const squat = result.tasks.find((t) => t.name === "Back squat");
    // 77–87% of the tested 145 kg, rounded to 2.5 kg.
    expect(squat?.prescription).toBe("4 × 5 @ 112.5–125 kg · 77–87% of tested max");
  });

  it("loads it heavier than the speed squat, which is deliberately light", () => {
    const result = applyBaselineProgramming(session([task()]));
    const speed = result.tasks.find((t) => /Speed squat/.test(t.name));
    const heavy = result.tasks.find((t) => t.name === "Back squat");
    expect(speed?.prescription).toContain("94 kg");
    expect(heavy?.prescription).toContain("112.5–125 kg");
  });

  it("puts the heavy squat after the fast work, never before it", () => {
    const result = applyBaselineProgramming(
      session([
        task({ id: "w5-d0-warm", name: "Low-volume power primer" }),
        task({ id: "w5-d0-dl", name: "Trap bar deadlift" }),
      ])
    );
    const names = result.tasks.map((t) => t.name);
    expect(names.indexOf("Depth jump — 15–20 cm box")).toBeLessThan(names.indexOf("Back squat"));
    expect(names.findIndex((n) => /Speed squat/.test(n))).toBeLessThan(names.indexOf("Back squat"));
    expect(names.indexOf("Back squat")).toBeLessThan(names.indexOf("Trap bar deadlift"));
  });

  it("is idempotent", () => {
    const once = applyBaselineProgramming(session([task()]));
    expect(applyBaselineProgramming(once).tasks.filter((t) => t.name === "Back squat")).toHaveLength(1);
  });
});

describe("the week's gym work is spread, not stacked on Monday", () => {
  const gymSession = () =>
    session([
      task({ id: "w5-d0-warm", name: "Low-volume power primer" }),
      task({ id: "w5-d0-dl", name: "Trap bar deadlift" }),
    ]);

  const names = (day: number) => applyBaselineProgramming(gymSession(), null, day).tasks.map((t) => t.name);

  it("puts reactive and heavy strength on Monday", () => {
    const monday = names(0);
    expect(monday.some((n) => /Depth jump/.test(n))).toBe(true);
    expect(monday).toContain("Back squat");
    // Bar speed belongs on the power day, not behind Monday's heavy squat.
    expect(monday.some((n) => /Speed squat/.test(n))).toBe(false);
    expect(monday).not.toContain("Romanian deadlift");
  });

  it("puts bar-speed work on Wednesday, the power day", () => {
    const wednesday = names(2);
    expect(wednesday.some((n) => /Speed squat/.test(n))).toBe(true);
    expect(wednesday).not.toContain("Back squat");
    expect(wednesday.some((n) => /Depth jump/.test(n))).toBe(false);
  });

  it("microdoses the hinge on Thursday, which carried no loading at all", () => {
    const thursday = names(3);
    expect(thursday).toContain("Romanian deadlift");
    expect(thursday).not.toContain("Back squat");
  });

  it("adds nothing on the game day or the rest day", () => {
    for (const day of [5, 6]) {
      const added = names(day).filter((n) => /Depth jump|Speed squat|Back squat|Romanian/.test(n));
      expect(added).toEqual([]);
    }
  });
});

describe("supersets are marked, and only where they belong", () => {
  const supersetOf = (day: number, tasks: SessionTask[]) =>
    Object.fromEntries(
      applyBaselineProgramming(session(tasks), null, day).tasks.map((t) => [t.name, t.superset])
    );

  it("pairs the antagonist push and pull on Monday", () => {
    const marked = supersetOf(0, [
      task({ id: "a", name: "Bench press" }),
      task({ id: "b", name: "Chest-supported dumbbell row" }),
    ]);
    expect(marked["Bench press"]).toBe("A1");
    expect(marked["Chest-supported dumbbell row"]).toBe("A2");
  });

  it("pairs the hamstring and anti-rotation work too", () => {
    const marked = supersetOf(0, [
      task({ id: "a", name: "Nordic hamstring curl" }),
      task({ id: "b", name: "Pallof press + farmer carry" }),
    ]);
    expect(marked["Nordic hamstring curl"]).toBe("B1");
    expect(marked["Pallof press + farmer carry"]).toBe("B2");
  });

  it("never pairs anything that has to be fresh", () => {
    // Density would convert these from strength and power work into
    // conditioning, which is the opposite of what they are for.
    const marked = supersetOf(0, [
      task({ id: "a", name: "Trap bar deadlift" }),
      task({ id: "b", name: "Bench press" }),
    ]);
    expect(marked["Trap bar deadlift"]).toBeUndefined();
    const monday = applyBaselineProgramming(session([task({ id: "w5-d0-warm", name: "Low-volume power primer" })]), null, 0);
    for (const t of monday.tasks.filter((x) => /Back squat|Depth jump/.test(x.name))) {
      expect(t.superset).toBeUndefined();
    }
  });

  it("tells the first movement not to rest and the second where to go back to", () => {
    const paired = applyBaselineProgramming(
      session([
        task({ id: "a", name: "Bench press", rest: "2 minutes." }),
        task({ id: "b", name: "Chest-supported dumbbell row", rest: "90 seconds." }),
      ]),
      null,
      0
    ).tasks;
    // Find by name — the day's own additions sit in this list too.
    expect(paired.find((t) => t.name === "Bench press")?.rest).toMatch(/No rest/);
    expect(paired.find((t) => t.name === "Chest-supported dumbbell row")?.rest).toMatch(/return to A1/);
  });

  it("does not mark Monday's pairs on Wednesday", () => {
    const marked = supersetOf(2, [task({ id: "a", name: "Bench press" })]);
    expect(marked["Bench press"]).toBeUndefined();
  });

  it("pairs Wednesday's push press with the chin-up", () => {
    const marked = supersetOf(2, [
      task({ id: "a", name: "Push press" }),
      task({ id: "b", name: "Chin-up" }),
    ]);
    expect(marked["Push press"]).toBe("A1");
    expect(marked["Chin-up"]).toBe("A2");
  });
});

describe("one primary bilateral lift on Monday, not two", () => {
  it("drops the trap bar from Monday once the back squat is in", () => {
    const monday = applyBaselineProgramming(
      session([
        task({ id: "w5-d0-warm", name: "Low-volume power primer" }),
        task({ id: "w5-d0-dl", name: "Trap bar deadlift" }),
      ]),
      null,
      0
    ).tasks.map((t) => t.name);
    expect(monday).not.toContain("Trap bar deadlift");
    expect(monday).toContain("Back squat");
  });

  it("keeps the trap bar jump on Wednesday, where speed-strength survives", () => {
    const wednesday = applyBaselineProgramming(
      session([task({ id: "w5-d2-j", name: "Broad jump + trap bar jump" })]),
      null,
      2
    ).tasks.map((t) => t.name);
    expect(wednesday).toContain("Broad jump + trap bar jump");
  });

  it("does not remove a trap bar on any other day", () => {
    const thursday = applyBaselineProgramming(
      session([task({ id: "w5-d3-dl", name: "Trap bar deadlift" })]),
      null,
      3
    ).tasks.map((t) => t.name);
    expect(thursday).toContain("Trap bar deadlift");
  });
});

describe("the hinge is placed for competition, not for the label on the day", () => {
  it("sits 48 hours from Saturday, not 24", () => {
    const thursday = applyBaselineProgramming(session([task()]), null, 3).tasks;
    const friday = applyBaselineProgramming(session([task()]), null, 4).tasks;
    expect(thursday.some((t) => t.name === "Romanian deadlift")).toBe(true);
    // Friday is 24 hours out, which is where delayed soreness peaks.
    expect(friday.some((t) => t.name === "Romanian deadlift")).toBe(false);
  });

  it("is loaded for a recovery day — RPE 7, not the top of the range", () => {
    const rdl = applyBaselineProgramming(session([task()]), null, 3).tasks.find(
      (t) => t.name === "Romanian deadlift"
    );
    expect(rdl?.prescription).toContain("RPE 7 ");
    expect(rdl?.prescription).not.toContain("RPE 7–8");
  });
});

describe("warm-up microdoses", () => {
  const prep = (name: string, id = name): SessionTask => ({
    id: `w5-d0-${id}`, stage: 1, stageTitle: "Prepare",
    stageDescription: "Raise temperature before mobility or throwing.",
    name, prescription: "p", cue: "c",
  });

  const warmUp = (tasks: SessionTask[], day: number | null = 0) =>
    applyBaselineProgramming(session(tasks), null, day)
      .tasks.filter((t) => t.stageTitle === "Prepare")
      .map((t) => t.name);

  it("adds ankle stiffness and forearm prep to the warm-up", () => {
    const names = warmUp([prep("Raise tissue temperature", "heat"), prep("Dynamic mobility flow", "mob")]);
    expect(names).toContain("Ankle stiffness pogos");
    expect(names).toContain("Wrist and forearm prep");
  });

  it("puts them after the existing warm-up, not before it", () => {
    const names = warmUp([
      prep("Raise tissue temperature", "heat"),
      prep("Dynamic mobility flow", "mob"),
      prep("Scapular and cuff activation", "scap"),
    ]);
    expect(names.indexOf("Ankle stiffness pogos")).toBeGreaterThan(names.indexOf("Dynamic mobility flow"));
    expect(names.indexOf("Ankle stiffness pogos")).toBeGreaterThan(names.indexOf("Raise tissue temperature"));
  });

  it("keeps the forearm work last, closest to the first throw", () => {
    const names = warmUp([prep("Raise tissue temperature", "heat"), prep("Dynamic mobility flow", "mob")]);
    expect(names[names.length - 1]).toBe("Wrist and forearm prep");
  });

  it("runs on every day that has a warm-up, including game day", () => {
    for (const day of [0, 1, 2, 3, 4, 5]) {
      expect(warmUp([prep("Raise tissue temperature", "heat")], day)).toContain("Ankle stiffness pogos");
    }
  });

  it("adds nothing to a day with no warm-up stage", () => {
    // Sunday is rest — no Prepare stage, so nothing to prime.
    const sunday = applyBaselineProgramming(
      session([{ id: "w5-d6-r", stage: 1, stageTitle: "Rest", stageDescription: "d",
                 name: "Complete training rest", prescription: "p", cue: "c" }]),
      null,
      6
    ).tasks.map((t) => t.name);
    expect(sunday).not.toContain("Ankle stiffness pogos");
    expect(sunday).not.toContain("Wrist and forearm prep");
  });

  it("keeps the pogo dose low — this primes stiffness, it is not a jump session", () => {
    const pogo = applyBaselineProgramming(session([prep("Raise tissue temperature", "heat")]), null, 0)
      .tasks.find((t) => t.name === "Ankle stiffness pogos");
    expect(pogo?.prescription).toContain("low amplitude");
    expect(pogo?.cue).toMatch(/Speed off the ground beats height/);
  });

  it("is idempotent", () => {
    const once = applyBaselineProgramming(session([prep("Raise tissue temperature", "heat")]), null, 0);
    const twice = applyBaselineProgramming(once, null, 0);
    expect(twice.tasks.filter((t) => t.name === "Ankle stiffness pogos")).toHaveLength(1);
  });
});
