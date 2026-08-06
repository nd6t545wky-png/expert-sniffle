import { describe, expect, it } from "vitest";
import {
  BASELINE_MIN_COUNT,
  ReadinessInputs,
  WORKLOAD_FACTOR,
  canOverridePlanLevel,
  computeReadiness,
} from "./readiness";

/** A well-recovered athlete: should score "full" with no flags. */
function healthy(overrides: Partial<ReadinessInputs> = {}): ReadinessInputs {
  return {
    sleepHours: 8.5,
    sleepQuality: 5,
    energy: 5,
    mood: 5,
    stress: 1,
    shoulder: 0,
    elbow: 0,
    forearm: 0,
    lat: 0,
    lower: 0,
    illness: "no",
    warningSigns: "no",
    previousSessionResponse: "same",
    ...overrides,
  };
}

describe("baseline case", () => {
  it("gives a fully recovered athlete a full plan and a high score", () => {
    const result = computeReadiness(healthy());
    expect(result.planLevel).toBe("full");
    expect(result.risk).toBe("green");
    expect(result.workloadFactor).toBe(1);
    expect(result.score).toBe(100);
    expect(result.reasons).toEqual(["Readiness inputs are within the full-session guardrails"]);
  });

  it("maps every plan level to its workload factor", () => {
    expect(WORKLOAD_FACTOR).toEqual({ full: 1, reduced: 0.75, recovery: 0.5, hold: 0 });
  });
});

describe("red flags force a hold", () => {
  it.each([
    ["shoulder symptoms at 5", { shoulder: 5 }],
    ["elbow symptoms at 5", { elbow: 5 }],
    ["illness", { illness: "yes" as const }],
    ["warning signs", { warningSigns: "yes" as const }],
  ])("%s → hold / red", (_label, override) => {
    const result = computeReadiness(healthy(override));
    expect(result.planLevel).toBe("hold");
    expect(result.risk).toBe("red");
    expect(result.workloadFactor).toBe(0);
  });

  it("takes precedence over everything else", () => {
    // Inputs that would otherwise be recovery-level, plus a red flag.
    const result = computeReadiness(healthy({ shoulder: 5, stress: 5, energy: 1, sleepHours: 4 }));
    expect(result.planLevel).toBe("hold");
  });

  it("holds just below the shoulder/elbow threshold do NOT trigger", () => {
    expect(computeReadiness(healthy({ shoulder: 4 })).planLevel).not.toBe("hold");
    expect(computeReadiness(healthy({ elbow: 4 })).planLevel).not.toBe("hold");
  });

  it("cannot be overridden in-app", () => {
    const held = computeReadiness(healthy({ warningSigns: "yes" }));
    expect(canOverridePlanLevel(held)).toBe(false);
  });

  it("explains itself", () => {
    const result = computeReadiness(healthy({ shoulder: 7, illness: "yes", warningSigns: "yes" }));
    expect(result.reasons).toContain("A new or worsening symptom warning sign was reported");
    expect(result.reasons).toContain("Illness symptoms were reported");
    expect(result.reasons).toContain("Shoulder symptoms 7/10");
  });
});

describe("recovery-level triggers", () => {
  it.each([
    ["life stress at 5", { stress: 5 }],
    ["energy at 1", { energy: 1 }],
    ["sleep under 5.5h", { sleepHours: 5 }],
    ["a soreness area at 4", { forearm: 4 }],
    ["much worse after last session", { previousSessionResponse: "much_worse" as const }],
  ])("%s → recovery / orange", (_label, override) => {
    const result = computeReadiness(healthy(override));
    expect(result.planLevel).toBe("recovery");
    expect(result.risk).toBe("orange");
    expect(result.workloadFactor).toBe(0.5);
  });

  it("triggers on Oura rest mode", () => {
    expect(computeReadiness(healthy({ ouraRestMode: "yes" })).planLevel).toBe("recovery");
  });

  it("triggers at 300+ Oura high-stress minutes", () => {
    expect(computeReadiness(healthy({ ouraStressHighMinutes: 300 })).planLevel).toBe("recovery");
  });

  it("can be overridden, unlike a hold", () => {
    expect(canOverridePlanLevel(computeReadiness(healthy({ stress: 5 })))).toBe(true);
  });
});

describe("reduced-level triggers", () => {
  it.each([
    ["life stress at 4", { stress: 4 }],
    ["energy at 2", { energy: 2 }],
    ["a soreness area at 3", { lat: 3 }],
    ["worse after last session", { previousSessionResponse: "worse" as const }],
  ])("%s → reduced / yellow", (_label, override) => {
    const result = computeReadiness(healthy(override));
    expect(result.planLevel).toBe("reduced");
    expect(result.risk).toBe("yellow");
    expect(result.workloadFactor).toBe(0.75);
  });

  it("triggers at 180 Oura high-stress minutes but not 179", () => {
    expect(computeReadiness(healthy({ ouraStressHighMinutes: 180 })).planLevel).toBe("reduced");
    expect(computeReadiness(healthy({ ouraStressHighMinutes: 179 })).planLevel).toBe("full");
  });
});

describe("threshold boundaries", () => {
  it("sleep 6.5h is reduced, 6.6h is full", () => {
    expect(computeReadiness(healthy({ sleepHours: 6.4 })).planLevel).toBe("reduced");
    expect(computeReadiness(healthy({ sleepHours: 6.6 })).planLevel).toBe("full");
  });

  it("sleep below 5.5h escalates from reduced to recovery", () => {
    expect(computeReadiness(healthy({ sleepHours: 5.6 })).planLevel).toBe("reduced");
    expect(computeReadiness(healthy({ sleepHours: 5.4 })).planLevel).toBe("recovery");
  });

  it("soreness escalates 3 → reduced, 4 → recovery, 5 → hold (shoulder)", () => {
    expect(computeReadiness(healthy({ shoulder: 3 })).planLevel).toBe("reduced");
    expect(computeReadiness(healthy({ shoulder: 4 })).planLevel).toBe("recovery");
    expect(computeReadiness(healthy({ shoulder: 5 })).planLevel).toBe("hold");
  });
});

describe("Oura readiness blending", () => {
  it("blends 75/25 with the subjective score when present", () => {
    const withoutOura = computeReadiness(healthy());
    const withOura = computeReadiness(healthy({ ouraReadinessScore: 40 }));
    expect(withoutOura.score).toBe(100);
    // 100 * 0.75 + 40 * 0.25 = 85
    expect(withOura.score).toBe(85);
  });

  it("ignores a zero or missing Oura score rather than treating it as 0/100", () => {
    expect(computeReadiness(healthy({ ouraReadinessScore: 0 })).score).toBe(100);
    expect(computeReadiness(healthy({ ouraReadinessScore: NaN })).score).toBe(100);
  });

  it("drops to recovery when Oura readiness is under 60", () => {
    expect(computeReadiness(healthy({ ouraReadinessScore: 59 })).planLevel).toBe("recovery");
  });

  it("drops to reduced when Oura readiness is under 70", () => {
    const result = computeReadiness(healthy({ ouraReadinessScore: 65 }));
    expect(result.planLevel).toBe("reduced");
    expect(result.reasons).toContain("Oura readiness was 65/100");
  });
});

describe("deviation signals", () => {
  const strongBaseline = { value: 100, count: 10 };

  it("flags HRV more than 20% below baseline", () => {
    const result = computeReadiness(healthy({ hrvMs: 70 }), {
      hrvBaseline: strongBaseline,
      hrvSource: "oura",
    });
    expect(result.signals.some((signal) => signal.type === "hrv")).toBe(true);
    expect(result.signals[0].text).toContain("Oura HRV is 30% below");
  });

  it("does not flag HRV inside the 20% band", () => {
    const result = computeReadiness(healthy({ hrvMs: 85 }), { hrvBaseline: strongBaseline });
    expect(result.signals).toHaveLength(0);
  });

  it("ignores baselines with too few observations", () => {
    const result = computeReadiness(healthy({ hrvMs: 10 }), {
      hrvBaseline: { value: 100, count: BASELINE_MIN_COUNT - 1 },
    });
    expect(result.signals).toHaveLength(0);
    expect(result.planLevel).toBe("full");
  });

  it("costs 6 points per signal, capped at 12", () => {
    const one = computeReadiness(healthy({ hrvMs: 70 }), { hrvBaseline: strongBaseline });
    expect(one.score).toBe(94);

    // Three signals: HRV, Oura stress, temperature — capped at -12.
    const many = computeReadiness(
      healthy({ hrvMs: 70, ouraStressHighMinutes: 200, ouraTemperatureDeviation: 1.0 }),
      { hrvBaseline: strongBaseline }
    );
    expect(many.signals.length).toBeGreaterThanOrEqual(3);
    expect(many.score).toBe(88);
  });

  it("one signal alone drops the plan to reduced", () => {
    const result = computeReadiness(healthy({ hrvMs: 70 }), { hrvBaseline: strongBaseline });
    expect(result.signals).toHaveLength(1);
    expect(result.planLevel).toBe("reduced");
  });

  it("two signals drop the plan to recovery", () => {
    const result = computeReadiness(healthy({ hrvMs: 70, ouraTemperatureDeviation: 0.9 }), {
      hrvBaseline: strongBaseline,
    });
    expect(result.signals).toHaveLength(2);
    expect(result.planLevel).toBe("recovery");
  });

  it("flags elevated resting heart rate using a 10% / 7bpm floor", () => {
    const flagged = computeReadiness(healthy({ restingHeartRate: 60 }), {
      restingHeartRateBaseline: { value: 50, count: 10 },
      restingHeartRateSource: "apple",
    });
    expect(flagged.signals.some((signal) => signal.type === "rhr")).toBe(true);
    expect(flagged.signals[0].text).toContain("Apple Health");

    const withinBand = computeReadiness(healthy({ restingHeartRate: 55 }), {
      restingHeartRateBaseline: { value: 50, count: 10 },
    });
    expect(withinBand.signals.some((signal) => signal.type === "rhr")).toBe(false);
  });

  it("flags temperature deviation in either direction at 0.8C", () => {
    for (const deviation of [0.8, -0.8]) {
      const result = computeReadiness(healthy({ ouraTemperatureDeviation: deviation }));
      expect(result.signals.some((signal) => signal.type === "temperature")).toBe(true);
    }
    expect(computeReadiness(healthy({ ouraTemperatureDeviation: 0.7 })).signals).toHaveLength(0);
  });

  it("escalates temperature severity at 1.2C", () => {
    expect(computeReadiness(healthy({ ouraTemperatureDeviation: 1.2 })).signals[0].severity).toBe("high");
    expect(computeReadiness(healthy({ ouraTemperatureDeviation: 0.9 })).signals[0].severity).toBe("moderate");
  });

  it("flags subjective values below their own baselines", () => {
    const result = computeReadiness(healthy({ sleepHours: 6.9, energy: 3, mood: 3 }), {
      sleepHoursBaseline: { value: 8.5, count: 10 },
      energyBaseline: { value: 5, count: 10 },
      moodBaseline: { value: 5, count: 10 },
    });
    const types = result.signals.map((signal) => signal.type);
    expect(types).toContain("sleep_baseline");
    expect(types).toContain("energy_baseline");
    expect(types).toContain("mood_baseline");
  });
});

describe("score bounds", () => {
  it("never goes below 0 or above 100", () => {
    const worst = computeReadiness({
      sleepHours: 0,
      sleepQuality: 0,
      energy: 0,
      mood: 0,
      stress: 5,
      shoulder: 10,
      elbow: 10,
      forearm: 10,
      lat: 10,
      lower: 10,
      illness: "yes",
      warningSigns: "yes",
      previousSessionResponse: "much_worse",
    });
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(100);

    const best = computeReadiness(healthy({ sleepHours: 12 }));
    expect(best.score).toBeLessThanOrEqual(100);
  });
});
