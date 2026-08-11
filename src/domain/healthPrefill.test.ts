import { describe, expect, it } from "vitest";
import {
  BASELINE_WINDOW,
  hasImportedData,
  importedBodyweight,
  importedFields,
  median,
  metricSource,
  metricSources,
  personalCheckInBaseline,
  personalMetricBaseline,
  readPrefill,
  readinessContextFor,
  sleepQualityFromScore,
  sourceNames,
  wearableInputs,
} from "./healthPrefill";
import { BASELINE_MIN_COUNT, computeReadiness, ReadinessInputs } from "./readiness";

/** A payload shaped like the Worker's `/api/integrations/daily` response. */
function payload(oura: Record<string, unknown> | null, apple: Record<string, unknown> | null = null) {
  const merged: Record<string, unknown> = {};
  for (const source of [apple, oura]) {
    for (const [key, value] of Object.entries(source ?? {})) {
      if (value !== null && value !== undefined) merged[key] = value;
    }
  }
  return {
    day: "2026-08-11",
    merged,
    sources: {
      oura: { connected: Boolean(oura), data: oura, updatedAt: "", error: "" },
      appleHealth: { connected: Boolean(apple), data: apple, updatedAt: "" },
    },
  };
}

describe("readPrefill", () => {
  it("returns an empty record for a date that has never been fetched", () => {
    expect(readPrefill({}, "2026-08-11")).toEqual({});
  });

  it("survives junk in state rather than throwing", () => {
    // `healthPrefill` round-trips through localStorage and cloud sync, so it
    // can hold anything at all by the time it is read back.
    for (const junk of ["string", 42, null, [], undefined]) {
      expect(readPrefill({ "2026-08-11": junk }, "2026-08-11")).toEqual({});
    }
  });
});

describe("sleepQualityFromScore", () => {
  it("maps Oura's 0-100 score onto the 1-5 scale at v60's cut points", () => {
    expect(sleepQualityFromScore(92)).toBe(5);
    expect(sleepQualityFromScore(85)).toBe(5);
    expect(sleepQualityFromScore(84)).toBe(4);
    expect(sleepQualityFromScore(70)).toBe(4);
    expect(sleepQualityFromScore(60)).toBe(3);
    expect(sleepQualityFromScore(45)).toBe(2);
    expect(sleepQualityFromScore(30)).toBe(1);
  });

  it("returns null rather than a number when there is no score", () => {
    // A missing score must not become a 1 — that would read as the worst
    // possible night and drag the check-in down on no evidence at all.
    expect(sleepQualityFromScore(null)).toBeNull();
    expect(sleepQualityFromScore(undefined)).toBeNull();
    expect(sleepQualityFromScore(0)).toBeNull();
    expect(sleepQualityFromScore("")).toBeNull();
  });
});

describe("median", () => {
  it("averages the middle pair on an even-length sample", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1])).toBe(2);
  });

  it("returns null for nothing to average", () => {
    expect(median([])).toBeNull();
  });
});

describe("metricSource", () => {
  it("prefers Oura, falls back to Apple Health, and admits when neither reported", () => {
    const both = readPrefill({ d: payload({ hrvMs: 70 }, { hrvMs: 65 }) }, "d");
    expect(metricSource(both, "hrvMs")).toBe("oura");

    const appleOnly = readPrefill({ d: payload({ hrvMs: null }, { hrvMs: 65 }) }, "d");
    expect(metricSource(appleOnly, "hrvMs")).toBe("apple");

    const neither = readPrefill({ d: payload({ sleepHours: 8 }) }, "d");
    expect(metricSource(neither, "hrvMs")).toBe("manual");
  });
});

describe("wearableInputs", () => {
  it("carries every field the readiness scorer can actually use", () => {
    const record = readPrefill(
      {
        d: payload({
          sleepHours: 7.4,
          sleepScore: 72,
          readinessScore: 64,
          hrvMs: 58,
          restingHeartRate: 51,
          stressHighMinutes: 210,
          temperatureDeviation: -0.9,
          restMode: true,
        }),
      },
      "d"
    );

    expect(wearableInputs(record)).toEqual({
      sleepHours: 7.4,
      sleepQuality: 4,
      ouraReadinessScore: 64,
      hrvMs: 58,
      restingHeartRate: 51,
      ouraStressHighMinutes: 210,
      ouraTemperatureDeviation: -0.9,
      ouraRestMode: "yes",
    });
  });

  it("omits keys no device reported instead of writing zeroes over them", () => {
    // Spreading this over the form defaults must never blank a field the
    // athlete can still answer for themselves.
    const record = readPrefill({ d: payload({ sleepHours: 8, sleepScore: null, hrvMs: null }) }, "d");
    expect(Object.keys(wearableInputs(record))).toEqual(["sleepHours"]);
  });

  it("keeps a negative temperature deviation, which is a real reading", () => {
    const record = readPrefill({ d: payload({ temperatureDeviation: -1.4 }) }, "d");
    expect(wearableInputs(record).ouraTemperatureDeviation).toBe(-1.4);
  });

  it("keeps a zero temperature deviation, which means 'measured, and normal'", () => {
    const record = readPrefill({ d: payload({ temperatureDeviation: 0 }) }, "d");
    expect(wearableInputs(record).ouraTemperatureDeviation).toBe(0);
  });

  it("distinguishes Rest Mode being off from Rest Mode being unknown", () => {
    expect(wearableInputs(readPrefill({ d: payload({ restMode: false }) }, "d")).ouraRestMode).toBe("no");
    expect(wearableInputs(readPrefill({ d: payload({ restMode: null }) }, "d")).ouraRestMode).toBeUndefined();
  });

  it("reads Oura-only fields from the Oura source, not the merged summary", () => {
    // Stress minutes have no Apple equivalent, and the scorer names Oura in
    // the reason it gives, so the value must come from Oura's own payload.
    const record = readPrefill({ d: payload(null, { stressHighMinutes: 400 }) }, "d");
    expect(wearableInputs(record).ouraStressHighMinutes).toBeUndefined();
  });
});

describe("importedFields", () => {
  it("names the fields a device filled in, so the form can lock them", () => {
    const record = readPrefill({ d: payload({ sleepHours: 7, sleepScore: 80, hrvMs: 60 }) }, "d");
    expect([...importedFields(record)].sort()).toEqual(["hrvMs", "sleepHours", "sleepQuality"]);
  });

  it("locks nothing when nothing was imported", () => {
    expect(importedFields({}).size).toBe(0);
  });

  it("maps bodyweight to the summary's bodyweightKg key", () => {
    const record = readPrefill({ d: payload({ bodyweightKg: 92.4 }) }, "d");
    expect(importedFields(record).has("bodyweight")).toBe(true);
    expect(importedBodyweight(record)).toBe(92.4);
  });
});

describe("sourceNames", () => {
  it("names both devices when both reported", () => {
    expect(sourceNames(readPrefill({ d: payload({ hrvMs: 1 }, { hrvMs: 1 }) }, "d"))).toEqual([
      "Oura",
      "Apple Health",
    ]);
  });

  it("reports no sources for a failed fetch", () => {
    expect(hasImportedData({ error: "offline" })).toBe(false);
  });
});

// --- baselines ---------------------------------------------------------------

/** A stored check-in, in the shape submissions now persist. */
function checkIn(inputs: Partial<ReadinessInputs>, sources: Record<string, string> = {}) {
  return { score: 80, inputs, ...sources };
}

function history(count: number, hrv: number) {
  const pre: Record<string, unknown> = {};
  for (let index = 1; index <= count; index += 1) {
    const day = String(index).padStart(2, "0");
    pre[`2026-07-${day}`] = checkIn({ hrvMs: hrv, energy: 4, sleepHours: 8 }, { hrvSource: "oura" });
  }
  return pre;
}

describe("personalMetricBaseline", () => {
  it("builds a median from prior same-source check-ins", () => {
    const baseline = personalMetricBaseline(history(6, 70), "2026-08-11", "hrvMs", "oura");
    expect(baseline).toEqual({ value: 70, count: 6 });
  });

  it("ignores check-ins recorded against a different device", () => {
    // An Oura HRV and an Apple Health HRV are not the same measurement.
    // Pooling them would manufacture a signal out of a change of wearable.
    const pre = history(6, 70);
    pre["2026-07-20"] = checkIn({ hrvMs: 20 }, { hrvSource: "apple" });
    expect(personalMetricBaseline(pre, "2026-08-11", "hrvMs", "oura").count).toBe(6);
  });

  it("returns nothing for a manual metric", () => {
    expect(personalMetricBaseline(history(6, 70), "2026-08-11", "hrvMs", "manual")).toEqual({
      value: 0,
      count: 0,
    });
  });

  it("never looks at the date being scored or anything after it", () => {
    const pre = history(6, 70);
    pre["2026-08-11"] = checkIn({ hrvMs: 5 }, { hrvSource: "oura" });
    pre["2026-09-01"] = checkIn({ hrvMs: 5 }, { hrvSource: "oura" });
    expect(personalMetricBaseline(pre, "2026-08-11", "hrvMs", "oura").value).toBe(70);
  });

  it(`looks back no further than ${BASELINE_WINDOW} check-ins`, () => {
    const pre = history(20, 70);
    expect(personalMetricBaseline(pre, "2026-08-11", "hrvMs", "oura").count).toBe(BASELINE_WINDOW);
  });

  it("ignores older records that stored no inputs", () => {
    // Submissions written before check-ins persisted their answers are still
    // valid; they simply cannot contribute to a median.
    const pre = { "2026-07-01": { score: 80 }, ...history(3, 70) };
    expect(personalMetricBaseline(pre, "2026-08-11", "hrvMs", "oura").count).toBe(3);
  });
});

describe("personalCheckInBaseline", () => {
  it("medians a subjective answer over prior check-ins", () => {
    expect(personalCheckInBaseline(history(5, 70), "2026-08-11", "energy")).toEqual({
      value: 4,
      count: 5,
    });
  });

  it("keeps a zero soreness score, which is a real answer", () => {
    const pre = {
      "2026-07-01": checkIn({ shoulder: 0 }),
      "2026-07-02": checkIn({ shoulder: 0 }),
    };
    expect(personalCheckInBaseline(pre, "2026-08-11", "shoulder")).toEqual({ value: 0, count: 2 });
  });

  it("drops a zero sleep duration, which is a missing answer", () => {
    const pre = { "2026-07-01": checkIn({ sleepHours: 0 }), "2026-07-02": checkIn({ sleepHours: 8 }) };
    expect(personalCheckInBaseline(pre, "2026-08-11", "sleepHours")).toEqual({ value: 8, count: 1 });
  });
});

describe("readinessContextFor — the wiring the scorer was missing", () => {
  it("lets a depressed HRV reach the scorer once a baseline exists", () => {
    const record = readPrefill({ d: payload({ hrvMs: 40, sleepHours: 8, sleepScore: 80 }) }, "d");
    const pre = history(BASELINE_MIN_COUNT, 80);

    const values = {
      sleepHours: 8,
      sleepQuality: 4,
      energy: 4,
      mood: 4,
      stress: 2,
      shoulder: 0,
      elbow: 0,
      forearm: 0,
      lat: 0,
      lower: 0,
      ...wearableInputs(record),
    } as ReadinessInputs;

    const withContext = computeReadiness(values, readinessContextFor(pre, record, "2026-08-11"));
    expect(withContext.signals.some((signal) => signal.type === "hrv")).toBe(true);
    expect(withContext.hrvSource).toBe("oura");

    // The same day scored the way the rebuilt form used to score it — no
    // context at all — sees nothing. That gap is the bug this module closes.
    const without = computeReadiness(values);
    expect(without.signals.some((signal) => signal.type === "hrv")).toBe(false);
  });

  it("reports metric provenance so reasons name the right device", () => {
    const record = readPrefill({ d: payload({ hrvMs: null }, { hrvMs: 60, restingHeartRate: 50 }) }, "d");
    expect(metricSources(record)).toEqual({
      hrvSource: "apple",
      restingHeartRateSource: "apple",
      sleepSource: undefined,
    });
  });

  it("leaves a source undefined rather than claiming a device for a typed value", () => {
    expect(metricSources({}).hrvSource).toBeUndefined();
  });
});
