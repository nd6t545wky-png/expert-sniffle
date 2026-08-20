/**
 * The splitter, held against every prescription the programme can produce.
 *
 * A heuristic on strings is only as good as the corpus it was checked on, so
 * the important test here is the sweep: for all 52 weeks × 7 days × 3 readiness
 * levels, either the prescription splits into movements that each carry a dose,
 * or it renders untouched. Nothing in between, and nothing invented.
 *
 * The failure to avoid is inventing an exercise — turning "2 × 10 · low
 * amplitude · minimal ground contact" into three of them. That is worse than
 * not splitting at all, which is why the rule refuses whenever it cannot tell.
 */

import { describe, expect, it } from "vitest";
import { splitPrescription } from "./prescription";
import { buildSession, setProgrammeContext, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";
import { PROGRAMME_WEEK_COUNT } from "./calendar";

describe("prescriptions that are a list of movements", () => {
  it("splits the warm-up flow, digits in a movement name and all", () => {
    // "90/90 switch" opens with digits that are the name of a position, not a
    // count. This is the case a naive "starts with a number" rule gets wrong.
    const movements = splitPrescription(
      "Ankle rock 8/side · 90/90 switch 6/side · adductor rock 6/side · World's Greatest Stretch (lunge + rotation) 4/side · open book 5/side"
    );
    expect(movements).toEqual([
      { name: "Ankle rock", dose: "8/side" },
      { name: "90/90 switch", dose: "6/side" },
      { name: "adductor rock", dose: "6/side" },
      { name: "World's Greatest Stretch (lunge + rotation)", dose: "4/side" },
      { name: "open book", dose: "5/side" },
    ]);
  });

  it("splits the hip prep", () => {
    expect(
      splitPrescription(
        "Half-kneeling hip flexor with posterior tilt 2 × 20 s/side · 90/90 internal rotation lift-off 6/side · lateral band walk 10 steps each way · single-leg glute bridge 8/side"
      )
    ).toEqual([
      { name: "Half-kneeling hip flexor with posterior tilt", dose: "2 × 20 s/side" },
      { name: "90/90 internal rotation lift-off", dose: "6/side" },
      { name: "lateral band walk", dose: "10 steps each way" },
      { name: "single-leg glute bridge", dose: "8/side" },
    ]);
  });

  it("splits a two-movement pairing", () => {
    expect(splitPrescription("Pallof press 2 × 8/side · farmer carry 2 × 20 m (no straps)")).toEqual([
      { name: "Pallof press", dose: "2 × 8/side" },
      { name: "farmer carry", dose: "2 × 20 m (no straps)" },
    ]);
  });

  it("splits the sprint drills", () => {
    const movements = splitPrescription(
      "Leg swings forward–back 10/side · leg swings lateral 10/side · A-skip 2 × 15 m · ankle dribble 2 × 15 m"
    );
    expect(movements).toHaveLength(4);
    expect(movements?.[2]).toEqual({ name: "A-skip", dose: "2 × 15 m" });
  });
});

describe("prescriptions that are one movement", () => {
  it("refuses a dose followed by qualifiers", () => {
    // The pogos. Three segments, one exercise.
    expect(splitPrescription("2 × 10 · low amplitude · minimal ground contact")).toBeNull();
  });

  it("refuses a set-and-rep scheme with an effort note", () => {
    expect(splitPrescription("1 × 5 · 50% perceived effort")).toBeNull();
    expect(splitPrescription("3 × 6 @ RPE 7 · hinge to mid-shin")).toBeNull();
    expect(splitPrescription("4 × 5 @ 112.5–125 kg · 77–87% of tested max")).toBeNull();
  });

  it("refuses a throwing prescription with its parameters", () => {
    expect(splitPrescription("45–55 total throws · 90–120 ft · 65–75% effort")).toBeNull();
    expect(splitPrescription("2 × 10 m build-up · 3 × 20 m @ 85–90% · 2 min rest")).toBeNull();
    expect(splitPrescription("Close catch → 60 → 90 → 120 → 150 ft · 35–50 throws")).toBeNull();
  });

  it("refuses a duration with an intensity", () => {
    expect(splitPrescription("20–25 minutes bike or incline walk · RPE 2–3/10")).toBeNull();
    expect(splitPrescription("5–10 minutes down-regulation · target 8–9 hours sleep")).toBeNull();
    expect(splitPrescription("20–30 minute easy walk · 8–10 minute gentle mobility")).toBeNull();
  });

  it("refuses anything with a segment carrying no number at all", () => {
    expect(splitPrescription("No baseball throwing · no gym session")).toBeNull();
  });

  it("refuses a single segment, however long", () => {
    expect(splitPrescription("Med-ball rotational scoop toss 2 × 3/side")).toBeNull();
    expect(splitPrescription("5 minutes easy bike, jog or brisk walk")).toBeNull();
  });

  it("refuses anything that is not a string", () => {
    expect(splitPrescription(undefined)).toBeNull();
    expect(splitPrescription(null)).toBeNull();
    expect(splitPrescription(42)).toBeNull();
    expect(splitPrescription("")).toBeNull();
  });
});

describe("across every prescription the programme produces", () => {
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

  const ALL: string[] = (() => {
    const seen = new Set<string>();
    for (let week = 1; week <= PROGRAMME_WEEK_COUNT; week += 1) {
      const plan = weekPlan(week, PBS);
      for (let day = 0; day < 7; day += 1) {
        for (const level of [null, "reduced", "recovery"] as const) {
          for (const task of applyBaselineProgramming(buildSession(plan, day), level, day).tasks) {
            seen.add(task.prescription);
          }
        }
      }
    }
    return [...seen];
  })();

  it("covers a real corpus", () => {
    expect(ALL.length).toBeGreaterThan(100);
  });

  it("never loses or invents a word", () => {
    // Whatever comes back must be the original text, minus the separators.
    for (const prescription of ALL) {
      const movements = splitPrescription(prescription);
      if (!movements) continue;
      const rebuilt = movements
        .map((movement) => [movement.name, movement.dose].filter(Boolean).join(" "))
        .join(" · ");
      const normalise = (text: string) => text.replace(/\s*·\s*/g, " · ").replace(/\s+/g, " ").trim();
      expect(normalise(rebuilt), prescription).toBe(normalise(prescription));
    }
  });

  it("gives every split movement a name and a dose", () => {
    for (const prescription of ALL) {
      const movements = splitPrescription(prescription);
      if (!movements) continue;
      for (const movement of movements) {
        expect(movement.name.trim().length, prescription).toBeGreaterThan(0);
        expect(/[a-z]/i.test(movement.name), `${prescription} → "${movement.name}"`).toBe(true);
        expect(movement.dose, `${prescription} → "${movement.name}"`).toBeTruthy();
      }
    }
  });

  it("never splits a prescription whose segments are parameters", () => {
    // Spot-check the whole corpus against the shape that would be mangled:
    // a segment that is only a measurement.
    const PARAMETER = /^(?:RPE|about|approx)\b|^\d+(?:\s*[–—-]\s*\d+)?\s*(?:%|ft|m|kg|min|minutes?|s|sec|reps?|sets?|throws?|total)\b/i;
    for (const prescription of ALL) {
      const movements = splitPrescription(prescription);
      if (!movements) continue;
      for (const movement of movements) {
        expect(PARAMETER.test(movement.name), `${prescription} → "${movement.name}"`).toBe(false);
      }
    }
  });

  it("splits a meaningful share of the corpus, and leaves most of it alone", () => {
    // If this ever swings hard in either direction the rule has drifted: all
    // splitting means parameters are being mangled, none means the feature is
    // dead. Both are silent failures without a number on them.
    const split = ALL.filter((prescription) => splitPrescription(prescription) !== null).length;
    expect(split).toBeGreaterThan(8);
    expect(split).toBeLessThan(ALL.length / 2);
  });
});
