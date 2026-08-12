import { describe, expect, it } from "vitest";
import {
  APPLE_FIELDS,
  isEmptyPayload,
  readApplePayload,
  suppliedFields,
} from "./appleHealth";

describe("readApplePayload", () => {
  it("reads the three Apple Fitness rings", () => {
    const read = readApplePayload({ activeCalories: 760, exerciseMinutes: 52, standHours: 11 });
    expect(read.activeCalories).toBe(760);
    expect(read.exerciseMinutes).toBe(52);
    expect(read.standHours).toBe(11);
  });

  it("accepts the other spellings a hand-typed Shortcut produces", () => {
    // A Shortcut dictionary is typed by hand, so the near-miss is the normal
    // case rather than the edge one.
    const read = readApplePayload({ activeEnergy: 700, exercise: 40, stand: 9, weight: 89.2 });
    expect(read.activeCalories).toBe(700);
    expect(read.exerciseMinutes).toBe(40);
    expect(read.standHours).toBe(9);
    expect(read.bodyweightKg).toBe(89.2);
  });

  it("prefers the documented name when both are sent", () => {
    expect(readApplePayload({ activeCalories: 800, activeEnergy: 100 }).activeCalories).toBe(800);
  });

  it("leaves an omitted field null rather than zero", () => {
    // A Shortcut that omits Stand Hours has not reported zero stand hours.
    const read = readApplePayload({ activeCalories: 500 });
    expect(read.standHours).toBeNull();
    expect(read.exerciseMinutes).toBeNull();
  });

  it("keeps a genuine zero, which is a real reading", () => {
    expect(readApplePayload({ exerciseMinutes: 0 }).exerciseMinutes).toBe(0);
  });

  it("drops a figure outside its plausible range", () => {
    expect(readApplePayload({ restingHeartRate: 4 }).restingHeartRate).toBeNull();
    expect(readApplePayload({ standHours: 30 }).standHours).toBeNull();
    expect(readApplePayload({ bodyweightKg: 890 }).bodyweightKg).toBeNull();
  });

  it("survives junk where a number was expected", () => {
    expect(readApplePayload({ steps: "lots" }).steps).toBeNull();
    expect(readApplePayload(null).steps).toBeNull();
    expect(readApplePayload("nope").steps).toBeNull();
  });

  it("reads a numeric string, which Shortcuts often sends", () => {
    expect(readApplePayload({ activeCalories: "742" }).activeCalories).toBe(742);
  });
});

describe("isEmptyPayload", () => {
  it("is true when nothing usable arrived", () => {
    expect(isEmptyPayload(readApplePayload({ day: "2026-08-12" }))).toBe(true);
  });

  it("is false for a single ring", () => {
    expect(isEmptyPayload(readApplePayload({ standHours: 0 }))).toBe(false);
  });
});

describe("suppliedFields", () => {
  it("names only what was actually sent", () => {
    expect(suppliedFields(readApplePayload({ activeCalories: 700, steps: 8000 }))).toEqual([
      "activeCalories",
      "steps",
    ]);
  });
});

describe("the field table", () => {
  it("has no duplicate names across fields and aliases", () => {
    // A name claimed twice would be read into whichever field came first, and
    // the athlete would never find out which.
    const seen = new Set<string>();
    for (const field of APPLE_FIELDS) {
      for (const name of [field.id, ...field.aliases]) {
        expect(seen.has(name.toLowerCase())).toBe(false);
        seen.add(name.toLowerCase());
      }
    }
  });

  it("marks exactly the three Apple Fitness rings", () => {
    expect(APPLE_FIELDS.filter((field) => field.ring).map((field) => field.id)).toEqual([
      "activeCalories",
      "exerciseMinutes",
      "standHours",
    ]);
  });

  it("describes every field, since the setup page is generated from this", () => {
    for (const field of APPLE_FIELDS) expect(field.describe.length).toBeGreaterThan(5);
  });
});

describe("case", () => {
  it("matches a name whatever case the Shortcut used", () => {
    // A 400 the phone never surfaces reads exactly like the ring not syncing.
    expect(readApplePayload({ ActiveCalories: 742 }).activeCalories).toBe(742);
    expect(readApplePayload({ STANDHOURS: 11 }).standHours).toBe(11);
    expect(readApplePayload({ vo2max: 54 }).vo2Max).toBe(54);
  });
});
