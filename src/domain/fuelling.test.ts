import { describe, expect, it } from "vitest";
import { fuelTargets, sessionDemand } from "./fuelling";

describe("sessionDemand", () => {
  it("reads the session's own stress label", () => {
    expect(sessionDemand({ stress: "High" }).demand).toBe("hard");
    expect(sessionDemand({ stress: "Low" }).demand).toBe("light");
    expect(sessionDemand({ stress: "Moderate" }).demand).toBe("moderate");
  });

  it("falls back to duration when there is no stress label", () => {
    expect(sessionDemand({ duration: "100 min" }).demand).toBe("hard");
    expect(sessionDemand({ duration: "25 min" }).demand).toBe("light");
  });

  it("treats a day with no session as rest", () => {
    expect(sessionDemand({ hasSession: false }).demand).toBe("rest");
  });

  it("caps a hard day that readiness reduced", () => {
    // Fuelling a 75% day as if it were the session originally written is how
    // a reduced day stops being reduced.
    expect(sessionDemand({ stress: "High", planLevel: "reduced" }).demand).toBe("moderate");
  });

  it("drops a recovery day to light whatever was written", () => {
    expect(sessionDemand({ stress: "High", planLevel: "recovery" }).demand).toBe("light");
  });

  it("treats a health hold as rest", () => {
    expect(sessionDemand({ stress: "High", planLevel: "hold" }).demand).toBe("rest");
  });

  it("says why, so the number is never unexplained", () => {
    expect(sessionDemand({ stress: "High", planLevel: "hold" }).reason).toBe("Health hold");
    expect(sessionDemand({ hasSession: false }).reason).toBe("No session scheduled");
  });
});

describe("fuelTargets", () => {
  const weight = 90;

  it("refuses to guess without a bodyweight", () => {
    // Every figure is per kilogram; a guessed weight makes them all wrong.
    expect(fuelTargets({ bodyweightKg: null, stress: "High" })).toBeNull();
    expect(fuelTargets({ bodyweightKg: 0, stress: "High" })).toBeNull();
  });

  it("moves carbohydrate with the day and leaves protein alone", () => {
    const hard = fuelTargets({ bodyweightKg: weight, stress: "High" })!;
    const rest = fuelTargets({ bodyweightKg: weight, hasSession: false })!;

    expect(hard.carbs).toBeGreaterThan(rest.carbs);
    // Protein is for recovery — it does not fall on the day off.
    expect(hard.protein).toBe(rest.protein);
  });

  it("keeps protein inside the evidence-backed band", () => {
    const targets = fuelTargets({ bodyweightKg: weight, stress: "Moderate" })!;
    const perKg = targets.protein / weight;
    expect(perKg).toBeGreaterThanOrEqual(1.6);
    expect(perKg).toBeLessThanOrEqual(2.2);
  });

  it("keeps carbohydrate inside a defensible range for an intermittent sport", () => {
    for (const stress of ["Low", "Moderate", "High"]) {
      const perKg = fuelTargets({ bodyweightKg: weight, stress })!.carbs / weight;
      expect(perKg).toBeGreaterThanOrEqual(3);
      expect(perKg).toBeLessThanOrEqual(7);
    }
  });

  it("never drops fat below the hormonal floor", () => {
    const targets = fuelTargets({ bodyweightKg: weight, hasSession: false })!;
    expect(targets.fat / weight).toBeGreaterThanOrEqual(0.8);
  });

  it("adds up — calories match the macros it prescribes", () => {
    const t = fuelTargets({ bodyweightKg: weight, stress: "Moderate" })!;
    const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    // Calories are rounded to the nearest 50, so allow that much drift.
    expect(Math.abs(t.calories - fromMacros)).toBeLessThanOrEqual(25);
  });

  it("adds fluid for a training day and not for a rest day", () => {
    const training = fuelTargets({ bodyweightKg: weight, stress: "Moderate" })!;
    const rest = fuelTargets({ bodyweightKg: weight, hasSession: false })!;
    expect(training.fluid).toBeGreaterThan(rest.fluid);
  });

  it("carries the reason through to the targets", () => {
    expect(fuelTargets({ bodyweightKg: weight, planLevel: "hold" })!.reason).toBe("Health hold");
  });
});
