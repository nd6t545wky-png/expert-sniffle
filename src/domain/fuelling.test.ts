import { describe, expect, it } from "vitest";
import { fuelTargets, fuelTargetsFromBaseline, sessionDemand } from "./fuelling";

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

describe("fuelTargets — built on the athlete's own measurements", () => {
  // The DEXA figures: 89.4 kg total, 65.6 kg lean, BMR 2028.
  const scan = { bodyweightKg: 89.4, leanMassKg: 65.6, basalKcal: 2028 };

  it("scales protein to lean mass, not total mass", () => {
    const measured = fuelTargets({ ...scan, stress: "Moderate" })!;
    // 65.6 x 2.4 = 157.4 -> 155 to the nearest 5.
    expect(measured.protein).toBe(155);
    expect(measured.proteinFromLeanMass).toBe(true);
  });

  it("holds the protein target as fat comes off", () => {
    // The flaw in scaling to total mass: losing 5 kg of fat would cut the
    // protein target by 9 g at exactly the moment it should hold.
    const before = fuelTargets({ ...scan, stress: "Moderate" })!;
    const after = fuelTargets({ ...scan, bodyweightKg: 84.4, stress: "Moderate" })!;
    expect(after.protein).toBe(before.protein);
  });

  it("falls back to total mass when no scan is available", () => {
    const estimated = fuelTargets({ bodyweightKg: 89.4, stress: "Moderate" })!;
    expect(estimated.proteinFromLeanMass).toBe(false);
    expect(estimated.protein).toBe(160);
  });

  it("builds energy from the measured basal rate", () => {
    const measured = fuelTargets({ ...scan, stress: "Moderate" })!;
    expect(measured.energyFromMeasuredBmr).toBe(true);
    // 2028 x 1.7 = 3448, before the macro split rounds it.
    expect(measured.calories).toBeGreaterThan(3200);
    expect(measured.calories).toBeLessThan(3700);
  });

  it("moves energy with the day, not just carbohydrate", () => {
    const hard = fuelTargets({ ...scan, stress: "High" })!;
    const rest = fuelTargets({ ...scan, hasSession: false })!;
    expect(hard.calories).toBeGreaterThan(rest.calories);
    expect(hard.carbs).toBeGreaterThan(rest.carbs);
  });

  it("never thins fat below the floor to make the sum work", () => {
    // A low basal rate against a hard day's carbohydrate leaves no room for
    // fat. The floor wins and energy rises, rather than prescribing a split
    // that compromises hormonal function.
    const squeezed = fuelTargets({ ...scan, basalKcal: 1200, stress: "High" })!;
    expect(squeezed.fat / 89.4).toBeGreaterThanOrEqual(0.8);
    const fromMacros = squeezed.protein * 4 + squeezed.carbs * 4 + squeezed.fat * 9;
    expect(Math.abs(squeezed.calories - fromMacros)).toBeLessThanOrEqual(25);
  });

  it("still adds up on a normal day", () => {
    const day = fuelTargets({ ...scan, stress: "Moderate" })!;
    const fromMacros = day.protein * 4 + day.carbs * 4 + day.fat * 9;
    expect(Math.abs(day.calories - fromMacros)).toBeLessThanOrEqual(25);
  });

  it("uses the scan by default, but a fresher bodyweight when there is one", () => {
    const fromScan = fuelTargetsFromBaseline({ stress: "Moderate" })!;
    expect(fromScan.proteinFromLeanMass).toBe(true);
    expect(fromScan.energyFromMeasuredBmr).toBe(true);

    // Bodyweight is the figure expected to move; lean mass and basal rate
    // only change with a new scan.
    const weighedToday = fuelTargetsFromBaseline({ bodyweightKg: 86, stress: "Moderate" })!;
    expect(weighedToday.carbs).toBeLessThan(fromScan.carbs);
    expect(weighedToday.protein).toBe(fromScan.protein);
  });
});
