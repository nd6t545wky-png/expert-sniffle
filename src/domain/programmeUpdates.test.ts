import { describe, expect, it } from "vitest";
import { applyBaselineProgramming, strengthWindowKg, PLYO_EVIDENCE_NOTE } from "./programmeUpdates";
import { seedBaselinePbs, BASELINE_ANCHORS } from "./baseline";
import { Session, SessionTask, buildSession, setProgrammeContext, weekPlan } from "./programmeSessions";
import { PROGRAMME_WEEK_COUNT } from "./calendar";

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
    expect(names.findIndex((n) => /^Romanian deadlift/.test(n))).toBeGreaterThan(
      names.indexOf("Trap bar deadlift")
    );
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
    expect(monday.some((n: string) => /^Romanian deadlift/.test(n))).toBe(false);
  });

  it("puts bar-speed work on Wednesday, the power day", () => {
    const wednesday = names(2);
    expect(wednesday.some((n) => /Speed squat/.test(n))).toBe(true);
    expect(wednesday).not.toContain("Back squat");
    expect(wednesday.some((n) => /Depth jump/.test(n))).toBe(false);
  });

  it("microdoses the hinge on Thursday, which carried no loading at all", () => {
    const thursday = names(3);
    expect(thursday.some((n: string) => /^Romanian deadlift/.test(n))).toBe(true);
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
    expect(thursday.some((t) => /^Romanian deadlift/.test(t.name))).toBe(true);
    // Friday is 24 hours out, which is where delayed soreness peaks.
    expect(friday.some((t) => /^Romanian deadlift/.test(t.name))).toBe(false);
  });

  it("is loaded for a recovery day — RPE 7, not the top of the range", () => {
    const rdl = applyBaselineProgramming(session([task()]), null, 3).tasks.find(
      (t) => /^Romanian deadlift/.test(t.name)
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

/**
 * Hip and trunk preparation.
 *
 * The warm-up prepared the shoulder, the forearm and the ankle and left the
 * segment between them out: nothing asked the hip to produce rotation rather
 * than be moved through it, nothing worked hip extension range, and nothing
 * trained the pelvic control a pitcher stands on for the whole delivery.
 */
describe("hip and trunk warm-up", () => {
  const prep = (name: string, id = name): SessionTask => ({
    id: `w5-d0-${id}`, stage: 1, stageTitle: "Prepare",
    stageDescription: "Raise temperature before mobility or throwing.",
    name, prescription: "p", cue: "c",
  });

  const flow = () => [prep("Raise tissue temperature", "heat"), prep("Dynamic mobility flow", "mob")];

  const warmUp = (day: number | null = 0) =>
    applyBaselineProgramming(session(flow()), null, day).tasks.filter((t) => t.stageTitle === "Prepare");

  it("adds hip and trunk work to every day that has a warm-up", () => {
    for (const day of [0, 1, 2, 3, 4, 5]) {
      const names = warmUp(day).map((t) => t.name);
      expect(names, `day ${day}`).toContain("Hip prep — rotation and glutes");
      expect(names, `day ${day}`).toContain("Trunk and spine prep");
    }
  });

  it("adds nothing on a day with no warm-up at all", () => {
    const sunday = applyBaselineProgramming(
      session([{ ...prep("Complete training rest"), stage: 1, stageTitle: "Rest" }]),
      null,
      6
    ).tasks.map((t) => t.name);
    expect(sunday).not.toContain("Hip prep — rotation and glutes");
    expect(sunday).not.toContain("Trunk and spine prep");
  });

  it("leaves the existing flow exactly as it was", () => {
    // "I like what I have now" — the mobility flow is added to, never edited.
    const names = warmUp().map((t) => t.name);
    expect(names).toContain("Dynamic mobility flow");
    expect(names).toContain("Raise tissue temperature");
    const mobility = warmUp().find((t) => t.name === "Dynamic mobility flow");
    expect(mobility?.prescription).toBe("p");
  });

  it("sits with the general mobility, not between the shoulder and the throw", () => {
    // The stage after this one is always throwing or sprinting, so whatever is
    // last carries into the first throw. Appended to the end of the stage, the
    // two new blocks put six minutes of hip and trunk work between the cuff
    // being primed and the first ball leaving the hand.
    const full = applyBaselineProgramming(
      session([
        prep("Raise tissue temperature", "heat"),
        prep("Dynamic mobility flow", "mob"),
        prep("Scapular and cuff activation", "scap"),
      ]),
      null,
      0
    ).tasks.filter((t) => t.stageTitle === "Prepare").map((t) => t.name);

    expect(full).toEqual([
      "Raise tissue temperature",
      "Dynamic mobility flow",
      "Hip prep — rotation and glutes",
      "Trunk and spine prep",
      "Scapular and cuff activation",
      "Ankle stiffness pogos",
      "Wrist and forearm prep",
    ]);
  });

  it("keeps the shoulder and forearm work closest to the first throw", () => {
    const names = applyBaselineProgramming(
      session([
        prep("Raise tissue temperature", "heat"),
        prep("Dynamic mobility flow", "mob"),
        prep("Scapular and cuff activation", "scap"),
      ]),
      null,
      0
    ).tasks.filter((t) => t.stageTitle === "Prepare").map((t) => t.name);

    for (const regional of ["Hip prep — rotation and glutes", "Trunk and spine prep"]) {
      expect(names.indexOf(regional), regional).toBeLessThan(
        names.indexOf("Scapular and cuff activation")
      );
    }
    expect(names[names.length - 1]).toBe("Wrist and forearm prep");
  });

  it("does not reorder anything that was already there", () => {
    // The additions slot in; the programme's own warm-up keeps its sequence.
    const existing = ["Raise tissue temperature", "Dynamic mobility flow", "Scapular and cuff activation"];
    const names = applyBaselineProgramming(
      session(existing.map((name, i) => prep(name, `p${i}`))),
      null,
      0
    ).tasks.filter((t) => t.stageTitle === "Prepare").map((t) => t.name);

    expect(names.filter((name) => existing.includes(name))).toEqual(existing);
  });

  it("still places them sanely when there is no mobility flow to sit beside", () => {
    const names = applyBaselineProgramming(
      session([prep("Raise tissue temperature", "heat")]),
      null,
      0
    ).tasks.filter((t) => t.stageTitle === "Prepare").map((t) => t.name);

    expect(names[0]).toBe("Raise tissue temperature");
    expect(names).toContain("Hip prep — rotation and glutes");
    expect(names).toContain("Trunk and spine prep");
    expect(names[names.length - 1]).toBe("Wrist and forearm prep");
  });

  it("names every movement and doses every one of them", () => {
    // The standing rule: named movements with sets and reps, never "some
    // mobility work".
    for (const name of ["Hip prep — rotation and glutes", "Trunk and spine prep"]) {
      const task = warmUp().find((t) => t.name === name)!;
      expect(task.prescription, name).toMatch(/\d/);
      // Every movement in the list carries its own number.
      for (const movement of task.prescription.split("·")) {
        expect(movement, `${name}: ${movement}`).toMatch(/\d/);
      }
      expect(String(task.cue).length, name).toBeGreaterThan(20);
      expect(String(task.execution).length, name).toBeGreaterThan(50);
      expect(task.stop, name).toBeTruthy();
    }
  });

  it("covers the four things the flow was missing", () => {
    const hip = warmUp().find((t) => t.name === "Hip prep — rotation and glutes")!;
    // Hip extension range, active internal rotation, lateral hip, glute max.
    expect(hip.prescription).toMatch(/hip flexor/i);
    expect(hip.prescription).toMatch(/internal rotation/i);
    expect(hip.prescription).toMatch(/lateral band walk/i);
    expect(hip.prescription).toMatch(/glute bridge/i);
  });

  it("trains pelvic control with the test the evidence is built on", () => {
    const trunk = warmUp().find((t) => t.name === "Trunk and spine prep")!;
    expect(trunk.prescription).toMatch(/single-leg pelvic-control hold/i);
    expect(trunk.evidence).toMatch(/Chaudhari 2014/);
    expect(trunk.evidence).toMatch(/347/);
  });

  it("cites the hip work honestly, limitations included", () => {
    const hip = warmUp().find((t) => t.name === "Hip prep — rotation and glutes")!;
    expect(hip.evidence).toMatch(/Robb 2010/);
    // A correlation in nineteen subjects is not a training study and the note
    // has to say so rather than implying a velocity guarantee.
    expect(hip.evidence).toMatch(/correlational/i);
  });

  it("does not repeat what the soreness protocol prescribes for a sore back", () => {
    // Bird dog and the side plank belong to the lower-back prescription. In
    // both places, a sore back would be given the same exercise twice.
    const trunk = warmUp().find((t) => t.name === "Trunk and spine prep")!;
    expect(trunk.prescription).not.toMatch(/bird dog/i);
    expect(trunk.prescription).not.toMatch(/side plank/i);
  });

  it("does not load the adductors at end range, where a warm-up pulls a groin", () => {
    const hip = warmUp().find((t) => t.name === "Hip prep — rotation and glutes")!;
    expect(hip.prescription).not.toMatch(/cossack/i);
  });

  it("is idempotent", () => {
    const once = applyBaselineProgramming(session(flow()), null, 0);
    const twice = applyBaselineProgramming(once, null, 0);
    for (const name of ["Hip prep — rotation and glutes", "Trunk and spine prep"]) {
      expect(twice.tasks.filter((t) => t.name === name), name).toHaveLength(1);
    }
  });
});

/**
 * The warm-up order on every day the programme can actually produce.
 *
 * The tests above build synthetic sessions. This one builds the real ones,
 * because the ordering is only correct relative to what the programme puts in
 * the Prepare stage, and an overlay that reorders correctly against a mock and
 * wrongly against the real thing is the failure that ships.
 */
describe("the real warm-up, every day of the year", () => {
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

  const WARM_UPS: { label: string; names: string[]; next: string | null }[] = (() => {
    const out: { label: string; names: string[]; next: string | null }[] = [];
    for (let week = 1; week <= PROGRAMME_WEEK_COUNT; week += 1) {
      const plan = weekPlan(week, PBS);
      for (let day = 0; day < 7; day += 1) {
        for (const level of [null, "reduced", "recovery"] as const) {
          const tasks = applyBaselineProgramming(buildSession(plan, day), level, day).tasks;
          const names = tasks.filter((task) => task.stageTitle === "Prepare").map((task) => task.name);
          if (!names.length) continue;
          const end = tasks.map((task) => task.stageTitle).lastIndexOf("Prepare");
          out.push({
            label: `week ${week} day ${day} ${level ?? "full"}`,
            names,
            next: tasks[end + 1]?.stageTitle ?? null,
          });
        }
      }
    }
    return out;
  })();

  it("covers every week of the year", () => {
    // 52 weeks × 3 readiness levels, on every day that has a warm-up at all.
    // Sunday is a complete rest day with no Prepare stage, so the count sits
    // below the 1,092 a seven-day year would give.
    expect(WARM_UPS.length).toBeGreaterThan(900);
    expect(new Set(WARM_UPS.map(({ label }) => label.split(" day ")[0])).size).toBe(
      PROGRAMME_WEEK_COUNT
    );
  });

  it("always runs raise, then general mobility, then the regional work", () => {
    for (const { label, names } of WARM_UPS) {
      expect(names[0], label).toBe("Raise tissue temperature");
      const flow = names.indexOf("Dynamic mobility flow");
      expect(flow, label).toBeGreaterThan(0);
      expect(names.indexOf("Hip prep — rotation and glutes"), label).toBe(flow + 1);
      expect(names.indexOf("Trunk and spine prep"), label).toBe(flow + 2);
    }
  });

  it("always finishes with whatever prepares the stage that follows it", () => {
    for (const { label, names, next } of WARM_UPS) {
      // Whatever follows the warm-up is throwing or running, never more prep.
      expect(["Plyo Ball Preparation", "Speed", "High-Intent Prep", "Game Warm-up", "Throw", "Compete", null], label)
        .toContain(next);
      // On the speed day the sprinting comes first, so the drills go last.
      // Every other day it is the arm, because the next thing is a throw.
      expect(names[names.length - 1], label).toBe(
        next === "Speed" ? "Sprint drills — before the build-ups" : "Wrist and forearm prep"
      );
    }
  });

  it("never leaves the cuff activation stranded in the middle", () => {
    // It is the most throwing-specific piece in the warm-up. Nothing regional
    // may sit between it and the first throw.
    for (const { label, names } of WARM_UPS) {
      const cuff = names.indexOf("Scapular and cuff activation");
      if (cuff === -1) continue;
      for (const regional of ["Hip prep — rotation and glutes", "Trunk and spine prep"]) {
        expect(names.indexOf(regional), `${label}: ${regional} after the cuff work`).toBeLessThan(cuff);
      }
    }
  });

  it("gives every day the same warm-up, plus sprint drills on the speed day", () => {
    // One shape, so the athlete learns the sequence rather than reading it —
    // and exactly one deviation from it, which is additive rather than a
    // reshuffle: the speed day is the common warm-up with a ninth item on the
    // end, not a different order.
    const shapes = new Set(WARM_UPS.map(({ names }) => names.join(" → ")));
    expect(shapes.size).toBe(2);

    const [common, speed] = [...shapes].sort((a, b) => a.length - b.length);
    expect(speed.startsWith(common)).toBe(true);
    expect(speed.slice(common.length)).toBe(" → Sprint drills — before the build-ups");
  });

  it("never repeats a warm-up task on a day", () => {
    for (const { label, names } of WARM_UPS) {
      expect(new Set(names).size, label).toBe(names.length);
    }
  });
});

/**
 * Sprint drills, on the day that sprints without any.
 *
 * The programme has three kinds of sprint day and only one of them lacks
 * preparation. Getting this wrong in the generous direction is what produces
 * the double-ups: Wednesday already runs A-march, ankling and progressive
 * starts, and the game days already run a build-up ramp on a day the athlete
 * may pitch.
 */
describe("sprint drills", () => {
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

  const DRILLS = "Sprint drills — before the build-ups";

  /** Every day of the year, with the tasks it ends up holding. */
  const DAYS = (() => {
    const out: { label: string; names: string[]; stages: string[] }[] = [];
    for (let week = 1; week <= PROGRAMME_WEEK_COUNT; week += 1) {
      const plan = weekPlan(week, PBS);
      for (let day = 0; day < 7; day += 1) {
        const tasks = applyBaselineProgramming(buildSession(plan, day), null, day).tasks;
        out.push({
          label: `week ${week} day ${day}`,
          names: tasks.map((task) => task.name),
          stages: tasks.map((task) => String(task.stageTitle)),
        });
      }
    }
    return out;
  })();

  it("lands on every day with speed work", () => {
    const speedDays = DAYS.filter(({ stages }) => stages.includes("Speed"));
    expect(speedDays.length).toBeGreaterThan(0);
    for (const { label, names } of speedDays) {
      expect(names, label).toContain(DRILLS);
    }
  });

  it("lands on no day without speed work", () => {
    for (const { label, names, stages } of DAYS) {
      if (stages.includes("Speed")) continue;
      expect(names, label).not.toContain(DRILLS);
    }
  });

  it("stays off the day that already runs sprint mechanics", () => {
    // Wednesday: A-march, ankling, progressive starts. Adding drills there
    // would be the double-up, not the fix.
    const withMechanics = DAYS.filter(({ names }) => names.includes("Sprint mechanics"));
    expect(withMechanics.length).toBeGreaterThan(0);
    for (const { label, names } of withMechanics) {
      expect(names, label).not.toContain(DRILLS);
    }
  });

  it("stays off game days, where the ramp exists and the legs are needed", () => {
    const gameDays = DAYS.filter(({ names }) => names.includes("Sprint build-ups"));
    expect(gameDays.length).toBeGreaterThan(0);
    for (const { label, names } of gameDays) {
      expect(names, label).not.toContain(DRILLS);
    }
  });

  it("does not add a second build-up ramp", () => {
    // The speed task already prescribes 2 × 10 m. Repeating it would put
    // another hundred metres in front of a session followed by 45–55 throws.
    const day = DAYS.find(({ names }) => names.includes(DRILLS))!;
    const drills = applyBaselineProgramming(
      buildSession(weekPlan(6, PBS), 1),
      null,
      1
    ).tasks.find((task) => task.name === DRILLS)!;
    expect(day.names).toContain("Acceleration quality");
    expect(drills.prescription).not.toMatch(/build-up/i);
    expect(drills.prescription).not.toMatch(/\d+\s*m\s*@|%/);
    // And it says so, so the athlete does not think the ramp was replaced.
    expect(drills.cue).toMatch(/does not replace/i);
  });

  it("sits immediately before the sprinting", () => {
    const tasks = applyBaselineProgramming(buildSession(weekPlan(6, PBS), 1), null, 1).tasks;
    const drills = tasks.findIndex((task) => task.name === DRILLS);
    const speed = tasks.findIndex((task) => task.stageTitle === "Speed");
    expect(drills).toBeGreaterThan(-1);
    expect(speed).toBe(drills + 1);
  });

  it("names and doses every movement, and carries a stop rule", () => {
    const drills = applyBaselineProgramming(
      buildSession(weekPlan(6, PBS), 1),
      null,
      1
    ).tasks.find((task) => task.name === DRILLS)!;
    for (const movement of drills.prescription.split("·")) {
      expect(movement, movement).toMatch(/\d/);
    }
    expect(drills.prescription).toMatch(/leg swings/i);
    expect(drills.prescription).toMatch(/A-skip/i);
    expect(drills.prescription).toMatch(/ankle dribble/i);
    expect(drills.stop).toMatch(/hamstring/i);
  });

  it("points the hamstring evidence at the Nordic, not at itself", () => {
    // The drills rehearse a pattern. The thing with a real effect size behind
    // it is the Nordic already in Monday's session, and the note says so —
    // including that the finding has been challenged.
    const drills = applyBaselineProgramming(
      buildSession(weekPlan(6, PBS), 1),
      null,
      1
    ).tasks.find((task) => task.name === DRILLS)!;
    expect(drills.evidence).toMatch(/van Dyk 2019/);
    expect(drills.evidence).toMatch(/Nordic/);
    expect(drills.evidence).toMatch(/not for these drills/i);
    expect(drills.evidence).toMatch(/challenged/i);

    const monday = DAYS.find(({ names }) => names.includes("Nordic hamstring curl"));
    expect(monday, "the Nordic the note points at must exist").toBeTruthy();
  });

  it("is idempotent", () => {
    const once = applyBaselineProgramming(buildSession(weekPlan(6, PBS), 1), null, 1);
    const twice = applyBaselineProgramming(once, null, 1);
    expect(twice.tasks.filter((task) => task.name === DRILLS)).toHaveLength(1);
  });
});

/**
 * Nothing reaches the athlete as a placeholder.
 *
 * Thursday shipped a task called "Microdose block" prescribed "One movement,
 * done well" — scaffolding that existed only to carry a stage title, rendered
 * with a checkbox and a Skip button, naming no movement, no sets and no reps.
 * The athlete asked what it was, which is the correct response to it and the
 * reason it should not have existed.
 */
describe("every task names something to do", () => {
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

  const EVERY_TASK = (() => {
    const out: { label: string; task: SessionTask }[] = [];
    for (let week = 1; week <= PROGRAMME_WEEK_COUNT; week += 1) {
      const plan = weekPlan(week, PBS);
      for (let day = 0; day < 7; day += 1) {
        for (const level of [null, "reduced", "recovery"] as const) {
          for (const task of applyBaselineProgramming(buildSession(plan, day), level, day).tasks) {
            out.push({ label: `week ${week} day ${day} ${level ?? "full"}`, task });
          }
        }
      }
    }
    return out;
  })();

  /**
   * The prescriptions that legitimately carry no number.
   *
   * All nine come from the written programme and all nine are honest: the dose
   * is set by the coach on the day, or the instruction is genuinely
   * qualitative. Held as an explicit list rather than a pattern so that any
   * *new* number-free prescription fails this test and has to be justified —
   * which is exactly what "One movement, done well" would not have survived.
   */
  const DOSE_SET_ELSEWHERE = new Set([
    "Team pitch/inning limits apply",
    "Team role and pitch limits apply",
    "No baseball throwing · no gym session",
    "Review velocity, pitches, soreness, sleep and completion",
    "One controlled Wednesday intent exposure; team training rhythm Tue/Thu",
    "Complete assigned baseball work; record session duration and RPE",
    "Keep conditioning and extra throwing low volume",
    "Easy catch plus one controlled mound touch",
    "Short competitive bullpen; no fatigue chase",
  ]);

  it("carries a dose on every task the overlay produces", () => {
    for (const { label, task } of EVERY_TASK) {
      const dosed = /\d/.test(task.prescription) || DOSE_SET_ELSEWHERE.has(task.prescription);
      expect(dosed, `${label}: "${task.name}" — "${task.prescription}"`).toBe(true);
    }
  });

  it("keeps that list honest — every entry still appears in the programme", () => {
    const live = new Set(EVERY_TASK.map(({ task }) => task.prescription));
    for (const prescription of DOSE_SET_ELSEWHERE) {
      expect(live.has(prescription), `stale allowance: "${prescription}"`).toBe(true);
    }
  });

  it("never ships the microdose placeholder again", () => {
    for (const { label, task } of EVERY_TASK) {
      expect(task.name, label).not.toBe("Microdose block");
      expect(task.prescription, label).not.toBe("One movement, done well");
    }
  });

  it("still gives Thursday its hinge, and says what it is", () => {
    // Removing the placeholder must not remove the work it was standing in
    // front of.
    const thursday = applyBaselineProgramming(buildSession(weekPlan(6, PBS), 3), null, 3).tasks;
    const hinge = thursday.find((task) => /^Romanian deadlift/.test(task.name))!;
    expect(hinge).toBeTruthy();
    expect(hinge.prescription).toBe("3 × 6 @ RPE 7 · hinge to mid-shin");
    expect(hinge.name).toMatch(/microdose/i);
    // And it explains itself, because the stage header above it says
    // "Condition" — the conditioning task sorts first in the same stage.
    expect(hinge.cue).toMatch(/^Microdose/i);
    expect(hinge.stageTitle).toBe("Whole-Body Force");
  });

  it("keeps Thursday's gym stage to the two microdose lifts", () => {
    const thursday = applyBaselineProgramming(buildSession(weekPlan(6, PBS), 3), null, 3).tasks;
    const gym = thursday.filter((task) => task.stageTitle === "Whole-Body Force");
    expect(gym.map((task) => task.name)).toEqual([
      "Romanian deadlift — microdose",
      "Seated calf raise — microdose",
    ]);
  });

  it("does not count the lifts in a cue, because either can be removed", () => {
    // A sore back takes the hinge; a sore ankle takes the calf raise. A cue
    // saying "first of two" is wrong the moment one of them goes.
    const thursday = applyBaselineProgramming(buildSession(weekPlan(6, PBS), 3), null, 3).tasks;
    for (const task of thursday.filter((t) => /microdose/i.test(t.name))) {
      expect(String(task.cue), task.name).not.toMatch(/first|second|both|two lifts|other half/i);
    }
  });

  it("has not disturbed the other days' gym work", () => {
    const monday = applyBaselineProgramming(buildSession(weekPlan(6, PBS), 0), null, 0).tasks.map((t) => t.name);
    expect(monday.some((n) => /Depth jump/.test(n))).toBe(true);
    expect(monday.some((n) => /Back squat/.test(n))).toBe(true);
    const wednesday = applyBaselineProgramming(buildSession(weekPlan(6, PBS), 2), null, 2).tasks.map((t) => t.name);
    expect(wednesday.some((n) => /Speed squat/.test(n))).toBe(true);
  });
});

/**
 * The soleus dose.
 *
 * The baseline report names the soleus as this athlete's limiter, and across
 * all fifty-two weeks there was no calf or soleus strength work of any kind —
 * only the daily pogos, which the source itself calls priming rather than a
 * session. The weakest tissue on the report was being rehearsed and never
 * loaded.
 */
describe("soleus microdose", () => {
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

  const thursday = () => applyBaselineProgramming(buildSession(weekPlan(6, PBS), 3), null, 3).tasks;
  const calf = () => thursday().find((task) => /Seated calf raise/.test(task.name))!;

  it("lands on Thursday, with the hinge, in the gym stage", () => {
    const task = calf();
    expect(task).toBeTruthy();
    expect(task.stage).toBe(4);
    expect(task.stageTitle).toBe("Whole-Body Force");
  });

  it("lands on no other day", () => {
    for (const day of [0, 1, 2, 4, 5, 6]) {
      const names = applyBaselineProgramming(buildSession(weekPlan(6, PBS), day), null, day).tasks.map(
        (task) => task.name
      );
      expect(names.some((name) => /calf raise/i.test(name)), `day ${day}`).toBe(false);
    }
  });

  it("is dosed for a slow-twitch postural muscle, with the stretch loaded", () => {
    const task = calf();
    expect(task.prescription).toBe("3 × 12 @ RPE 7–8 · 3 s lowering · 1 s pause at the bottom");
    expect(task.execution).toMatch(/bottom is where the work is/i);
    expect(task.stop).toMatch(/achilles/i);
  });

  it("is seated, and says why — that is the whole point of it", () => {
    // Standing trains the gastrocnemius, which the report did not flag.
    const task = calf();
    expect(task.name).toMatch(/seated/i);
    expect(task.setup).toMatch(/knee bent to about 90/i);
    expect(String(task.cue)).toMatch(/knee bent is the whole point/i);
    expect(task.evidence).toMatch(/gastrocnemius crosses the knee/i);
  });

  it("attributes the dose honestly — the report, not a trial", () => {
    const task = calf();
    expect(task.evidence).toMatch(/Z −1\.51/);
    expect(task.evidence).toMatch(/0\.348 s/);
    expect(task.evidence).toMatch(/not a dose taken from a particular study/i);
  });

  it("fills a gap that really was empty", () => {
    // Guard against the premise silently becoming false: if calf work is ever
    // added elsewhere in the programme, this microdose needs revisiting.
    for (let week = 1; week <= PROGRAMME_WEEK_COUNT; week += 1) {
      const plan = weekPlan(week, PBS);
      for (let day = 0; day < 7; day += 1) {
        for (const task of applyBaselineProgramming(buildSession(plan, day), null, day).tasks) {
          if (/Seated calf raise/.test(task.name)) continue;
          expect(
            /calf|soleus|heel raise|plantarflex/i.test(`${task.name} ${task.prescription}`),
            `week ${week} day ${day}: "${task.name}" also trains the calf`
          ).toBe(false);
        }
      }
    }
  });

  it("does not compete with the hinge it sits beside", () => {
    // One is a posterior-chain lift, the other is local ankle work. Neither
    // fatigues the other, which is what lets both sit on a recovery day.
    const gym = thursday().filter((task) => task.stageTitle === "Whole-Body Force");
    expect(gym).toHaveLength(2);
    expect(gym.every((task) => /microdose/i.test(task.name))).toBe(true);
  });

  it("is idempotent", () => {
    const once = applyBaselineProgramming(buildSession(weekPlan(6, PBS), 3), null, 3);
    const twice = applyBaselineProgramming(once, null, 3);
    expect(twice.tasks.filter((task) => /Seated calf raise/.test(task.name))).toHaveLength(1);
  });
});
