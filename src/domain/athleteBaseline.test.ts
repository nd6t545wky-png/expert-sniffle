import { afterEach, describe, expect, it } from "vitest";
import { fuelBasis, readAthleteBaseline, seedBaselinePbs, trainingNeeds } from "./baseline";
import { buildSession, setProgrammeContext, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";
import { retestMetricsFor } from "./retest";

const OWNER_NUMBERS = /145 kg|94 kg|116 kg|0\.96|0\.348|354 ms|19\.8|32\.6|soleus|35 kg|52\.5 kg|28 kg|30 kg/i;

function week(lifts: Record<string, unknown> = {}) {
  setProgrammeContext({ pbs: { trainingMaxes: { lifts } } as never });
  const text: string[] = [];
  for (const number of [3, 12, 29, 34]) {
    for (let day = 0; day < 7; day += 1) {
      for (const task of applyBaselineProgramming(buildSession(weekPlan(number), day), null, day).tasks) {
        text.push(JSON.stringify(task));
      }
    }
  }
  return text.join("\n");
}

afterEach(() => setProgrammeContext({}));

describe("an invited athlete's programme", () => {
  it("carries none of the owner's numbers before they enter their own", () => {
    expect(week()).not.toMatch(OWNER_NUMBERS);
  });

  it("loads the squat from their own max once they enter it", () => {
    const text = week({ backSquat: { value: 100, kind: "tested" } });
    expect(text).toMatch(/of the tested 100 kg max/);
    expect(text).not.toMatch(OWNER_NUMBERS);
  });

  it("gets back the owner's maxes an earlier build seeded, and keeps their own", () => {
    const leaked = seedBaselinePbs({ profile: { ownReports: true } } as Record<string, unknown>) as unknown as { pbs: { trainingMaxes: { lifts: Record<string, unknown> } } };
    const lifts = { ...leaked.pbs.trainingMaxes.lifts, benchPress: { value: 80 } };
    const cleaned = seedBaselinePbs({ profile: {}, pbs: { trainingMaxes: { lifts } } }) as typeof leaked;
    expect(Object.keys(cleaned.pbs.trainingMaxes.lifts)).toEqual(["benchPress"]);
  });

  it("starts with no baseline, food basis or retest targets", () => {
    expect(readAthleteBaseline({})).toBeNull();
    expect(fuelBasis({})).toEqual({ bodyweightKg: undefined, leanMassKg: undefined });
    expect(retestMetricsFor(false).every((metric) => metric.baseline === null)).toBe(true);
    expect(retestMetricsFor(false).find((metric) => metric.id === "sj")?.target).toBeNull();
  });

  it("uses what they enter", () => {
    const profile = { baseline: { bodyMassKg: 80, bodyFatPercent: 15, metrics: { cmj: 41 } } };
    expect(fuelBasis(profile)).toEqual({ bodyweightKg: 80, leanMassKg: 68 });
    expect(retestMetricsFor(false, readAthleteBaseline(profile)!.metrics).find((metric) => metric.id === "cmj")?.baseline).toBe(41);
  });

  it("sets retest targets from their own start, or the general standard", () => {
    const metrics = retestMetricsFor(false, { cmj: 40, djRsi: 0.9 });
    expect(metrics.find((metric) => metric.id === "cmj")?.target).toBe(44);
    expect(metrics.find((metric) => metric.id === "djRsi")?.target).toBe(1.2);
  });

  it("changes the work from their test numbers", () => {
    const thursday = (needs: ReturnType<typeof trainingNeeds>) => {
      setProgrammeContext({ needs });
      return applyBaselineProgramming(buildSession(weekPlan(3), 3), null, 3).tasks.find((task) => /Reactive microdose/.test(task.name))!;
    };
    const wednesday = (needs: ReturnType<typeof trainingNeeds>) => {
      setProgrammeContext({ needs, pbs: { trainingMaxes: { lifts: { backSquat: { value: 100, kind: "tested" } } } } as never });
      return applyBaselineProgramming(buildSession(weekPlan(3), 2), null, 2).tasks.find((task) => /Speed squat/.test(task.name))!;
    };
    const weak = trainingNeeds({ bodyMassKg: 85, metrics: { djRsi: 0.9, djContact: 0.34 } }, 100);
    const strong = trainingNeeds({ bodyMassKg: 80, metrics: { djRsi: 1.6, djContact: 0.22 } }, 150);
    expect(weak).toMatchObject({ reactive: true, strength: true });
    expect(strong).toMatchObject({ reactive: false, strength: false });
    expect(thursday(weak).prescription).toMatch(/^Pogo 3 × 10/);
    expect(thursday(weak).cue).toMatch(/RSI 0\.9/);
    expect(thursday(strong).prescription).toMatch(/^Pogo 2 × 10/);
    expect(wednesday(weak).prescription).toMatch(/^3 × 3 @ 65 kg/);
    expect(wednesday(strong).prescription).toMatch(/^4 × 3 @ 65 kg/);
    expect(trainingNeeds(null, null)).toEqual({ reactive: null, strength: null, notes: [] });
  });
});
