/**
 * Monday's primary lift, and the thing that went wrong with it.
 *
 * The defect was not a wrong number — every individual prescription was
 * defensible. It was that the number never *changed*: eight consecutive weeks
 * of a block labelled baseline → force peak → strength-speed peak → deload all
 * prescribed an identical squat. So the test that matters most here is not
 * "week 7 is 3 × 4"; it is "no two adjacent weeks of the winter block are the
 * same session", which is the property that was silently false.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SQUAT_MIN_REPS,
  WEEK_SPECS,
  isEasyWeek,
  squatDose,
} from "./strengthProgression";
import { buildSession, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";

const WEEKS = Array.from({ length: 52 }, (_, index) => index + 1);
const WINTER = [1, 2, 3, 4, 5, 6, 7, 8];

function squatOn(week: number) {
  return applyBaselineProgramming(buildSession(weekPlan(week), 0), null, 0).tasks.find(
    (task) => task.name === "Back squat"
  );
}

describe("the imported block table", () => {
  it("is the programme's own, and has the shape the types claim", () => {
    // This table is now imported from `programmeContent.ts` rather than
    // copied, so drift is no longer possible. What is still worth checking is
    // the shape: that file is `@ts-nocheck`, its entries type as `number[]`,
    // and reaching them needs a cast. Reading the source as text is how that
    // cast gets held to account — 52 weeks, three numbers each.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "programmeContent.ts"), "utf8");
    const block = source.match(/const TRAP_BAR_WEEK_SPECS = \{([\s\S]*?)\};/);
    expect(block, "TRAP_BAR_WEEK_SPECS no longer exists under that name").toBeTruthy();

    const original: Record<number, number[]> = {};
    for (const entry of block![1].matchAll(/(\d+):\s*\[(\d+),\s*(\d+),\s*(\d+)\]/g)) {
      original[Number(entry[1])] = [Number(entry[2]), Number(entry[3]), Number(entry[4])];
    }

    expect(Object.keys(original)).toHaveLength(52);
    for (const week of WEEKS) {
      expect([...WEEK_SPECS[week]], `week ${week}`).toEqual(original[week]);
    }
  });
});

describe("translating a week into a squat", () => {
  it("covers every week of the year", () => {
    for (const week of WEEKS) expect(squatDose(week)).toBeTruthy();
  });

  it("never prescribes fewer reps than the report asked for", () => {
    for (const week of WEEKS) {
      expect(squatDose(week)!.reps, `week ${week}`).toBeGreaterThanOrEqual(SQUAT_MIN_REPS);
    }
  });

  it("keeps the block's own volume when it raises the reps", () => {
    // Clamping reps without cutting sets is what would turn the deload into
    // the hardest week of the block, so this is the load-bearing invariant.
    //
    // Not exact equality: four does not divide fifteen, so a 5 × 3 week lands
    // on 4 × 4 and gains one rep. The bound is half a set — any more and the
    // rounding, not the block plan, is deciding the week's volume.
    for (const week of WEEKS) {
      const dose = squatDose(week)!;
      if (!dose.rebalanced) continue;
      const [sets, reps] = WEEK_SPECS[week];
      // The two-set floor is the one place volume is allowed to rise further:
      // a 2 × 2 maintenance week has four reps in it and a single set of four
      // is not a lift. Those weeks are pinned exactly instead.
      if (dose.sets === 2 && sets * reps < 2 * dose.reps) {
        expect(dose.sets * dose.reps, `week ${week}`).toBe(2 * dose.reps);
        continue;
      }
      const drift = dose.sets * dose.reps - sets * reps;
      expect(Math.abs(drift), `week ${week} drifted ${drift} reps`).toBeLessThanOrEqual(dose.reps / 2);
    }
  });

  it("leaves a week alone when the table already asks for enough reps", () => {
    for (const week of WEEKS) {
      const dose = squatDose(week)!;
      const [sets, reps, percent] = WEEK_SPECS[week];
      if (reps < SQUAT_MIN_REPS) continue;
      expect([dose.sets, dose.reps, dose.percent], `week ${week}`).toEqual([sets, reps, percent]);
    }
  });

  it("never drops below two work sets", () => {
    for (const week of WEEKS) expect(squatDose(week)!.sets).toBeGreaterThanOrEqual(2);
  });

  it("scales the load off the tested max, not an estimate", () => {
    expect(squatDose(4)!.kg).toBe(125);
    expect(squatDose(4, 100)!.kg).toBe(87.5);
    expect(squatDose(null)).toBeNull();
    expect(squatDose(99)).toBeNull();
  });

  it("names what each week is for", () => {
    expect(squatDose(1)!.character).toBe("Accumulation");
    expect(squatDose(3)!.character).toBe("Intensification");
    expect(squatDose(7)!.character).toBe("Strength-speed");
  });

  it("recognises the programme's own easy weeks", () => {
    expect(isEasyWeek("Deload and assess")).toBe(true);
    expect(isEasyWeek("Winter review")).toBe(true);
    expect(isEasyWeek("Pre-Easter taper")).toBe(true);
    expect(isEasyWeek("Force peak")).toBe(false);
    expect(isEasyWeek(null)).toBe(false);
  });
});

describe("the winter block, as the athlete sees it", () => {
  it("no longer prescribes the same session eight weeks running", () => {
    const prescriptions = WINTER.map((week) => squatOn(week)?.prescription);
    for (const value of prescriptions) expect(value).toBeTruthy();
    // The exact defect: week 7 "Strength-speed peak" read identically to week 1
    // "Baseline quality".
    expect(prescriptions[6]).not.toBe(prescriptions[0]);
    expect(new Set(prescriptions).size).toBeGreaterThan(1);
  });

  it("changes something every time the block table changes", () => {
    for (let index = 1; index < WINTER.length; index += 1) {
      const before = WEEK_SPECS[WINTER[index - 1]];
      const after = WEEK_SPECS[WINTER[index]];
      if (String(before) === String(after)) continue;
      expect(
        squatOn(WINTER[index])?.prescription,
        `weeks ${WINTER[index - 1]} and ${WINTER[index]} read the same`
      ).not.toBe(squatOn(WINTER[index - 1])?.prescription);
    }
  });

  it("peaks in the middle and deloads at the end", () => {
    const kg = WINTER.map((week) => squatDose(week)!.kg);
    const volume = WINTER.map((week) => squatDose(week)!.sets * squatDose(week)!.reps);

    // Heaviest at the force peak (week 4), not at the end.
    expect(Math.max(...kg)).toBe(kg[3]);
    // Lightest week is the deload, on both load and volume.
    expect(Math.min(...volume)).toBe(volume[7]);
    expect(kg[7]).toBeLessThan(kg[6]);
    // Volume comes down across the block rather than wandering.
    expect(volume[0]).toBeGreaterThan(volume[4]);
    expect(volume[4]).toBeGreaterThan(volume[7]);
  });

  it("stays inside the report's intensity window all block", () => {
    for (const week of WINTER) {
      const dose = squatDose(week)!;
      const share = Math.round((dose.kg / 145) * 100);
      expect(share, `week ${week} at ${dose.kg} kg`).toBeGreaterThanOrEqual(77);
      expect(share, `week ${week} at ${dose.kg} kg`).toBeLessThanOrEqual(87);
    }
  });

  it("says on the day that the numbers move", () => {
    const squat = squatOn(7)!;
    expect(squat.prescription).toBe("3 × 4 @ 120 kg · 83% of tested max");
    expect(String(squat.setup)).toMatch(/change week to week/);
    expect(String(squat.cue)).toMatch(/Strength-speed week/);
    expect(String(squat.evidence)).toMatch(/6 × 2/);
  });

  it("marks the deload as one, without telling the athlete to go slow", () => {
    const squat = squatOn(8)!;
    expect(String(squat.cue)).toMatch(/deload week/i);
    // The bar-speed annotation is appended to every squat cue; a deload cue
    // that said "take it easy" would contradict it on the same line.
    expect(String(squat.cue)).not.toMatch(/stop well short|take it easy/i);
    expect(String(squat.cue)).toMatch(/moves fast/);
  });
});

describe("a session with no readable week", () => {
  it("keeps the fixed window rather than guessing a week", () => {
    const session = {
      title: "",
      focus: "",
      duration: "",
      stress: "",
      description: "",
      tasks: [
        {
          id: "loose-primer",
          stage: 4,
          stageTitle: "Whole-Body Force",
          stageDescription: "",
          name: "Low-volume power primer",
          prescription: "Med-ball rotational scoop toss 2 × 3/side",
          cue: "",
        },
      ],
    };
    const squat = applyBaselineProgramming(session, null, 0).tasks.find(
      (task) => task.name === "Back squat"
    );
    expect(squat).toBeTruthy();
    expect(squat!.prescription).toMatch(/77–87% of tested max/);
  });
});
