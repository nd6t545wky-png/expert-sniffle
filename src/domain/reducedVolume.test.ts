import { describe, expect, it } from "vitest";
import {
  originalPrescription,
  prescriptionKind,
  reduceSetsAndReps,
} from "./reducedVolume";

describe("stating the reduced dose instead of describing it", () => {
  it("drops the final work set and takes 90% of a barbell load", () => {
    // The instruction this replaces: "Remove the final work set · use no more
    // than 90% of the listed load · cap at RPE 7".
    expect(reduceSetsAndReps("6 × 2 @ 120 kg", "output", "reduced")).toBe("5 × 2 · 107.5 kg · cap RPE 7");
  });

  it("keeps per-side notation, because 3 × 5/leg is not 3 × 5", () => {
    expect(reduceSetsAndReps("3 × 5/leg @ RPE 7", "output", "reduced")).toBe("2 × 5/leg · cap RPE 7");
    expect(reduceSetsAndReps("2 × 3/side · 2–3 kg", "output", "reduced")).toBe(
      "1 × 3/side · 2–3 kg · cap RPE 7"
    );
  });

  it("scales a dumbbell range and rounds to the kilo, not to 2.5", () => {
    expect(reduceSetsAndReps("3 × 5/leg @ RPE 7 · 24–28 kg dumbbells", "output", "reduced")).toBe(
      "2 × 5/leg · 22–25 kg · cap RPE 7"
    );
  });

  it("never drops below a single set", () => {
    expect(reduceSetsAndReps("1 × 5 @ 60 kg", "output", "reduced")).toMatch(/^1 × 5/);
  });

  it("takes 75% of plyo reps and keeps the set count", () => {
    // The shape of the work survives; only the dose changes.
    expect(reduceSetsAndReps("2 × 4 · 60% perceived effort", "plyo", "reduced")).toBe(
      "2 × 3 · 65–70% effort"
    );
    // Rounds down: 75% of 5 is 3.75, and 4 would be more than asked for.
    expect(reduceSetsAndReps("2 × 5", "plyo", "reduced")).toBe("2 × 3 · 65–70% effort");
  });

  it("scales throw counts down to the nearest five, never up", () => {
    // 75% of 45–60 is 33.75–45; rounding 33.75 up to 35 would hand back more
    // volume than the reduction asked for.
    expect(reduceSetsAndReps("45–60 total throws · 60–75 ft · 50–60% effort", "throw", "reduced")).toBe(
      "30–45 total throws"
    );
    // 50% of 45 is 22.5 — down to 20, not up to 25.
    expect(reduceSetsAndReps("45–60 total throws", "throw", "recovery")).toBe("20–30 total throws");
  });

  it("scales conditioning duration", () => {
    expect(reduceSetsAndReps("15–20 minutes bike · RPE 2–3/10", "conditioning", "reduced")).toBe(
      "10–15 minutes"
    );
    expect(reduceSetsAndReps("15–20 minutes bike", "conditioning", "recovery")).toBe("10–20 minutes");
  });

  it("turns a recovery day into one or two light sets, not a smaller session", () => {
    expect(reduceSetsAndReps("3 × 5 @ 100 kg", "output", "recovery")).toBe("1–2 × 5 · RPE 5–6");
  });

  it("leaves the load alone on a recovery day, where RPE governs it", () => {
    expect(reduceSetsAndReps("3 × 5 @ 100 kg", "output", "recovery")).not.toMatch(/kg/);
  });

  it("scales an isometric hold by time", () => {
    // Removing a set is the right reduction for an isometric; the hold length
    // stays, and the unit must survive or "2 × 20" reads as twenty reps.
    expect(reduceSetsAndReps("3 × 20 s/side against a wall", "output", "reduced")).toBe(
      "2 × 20 s/side · cap RPE 7"
    );
    expect(reduceSetsAndReps("20 s hold", "generic", "reduced")).toBe("15 s · cap RPE 7");
  });

  it("returns null rather than inventing numbers it cannot read", () => {
    expect(reduceSetsAndReps("Loose arc, clean direction", "throw", "reduced")).toBeNull();
    expect(reduceSetsAndReps("", "output", "reduced")).toBeNull();
  });

  it("says nothing for a plyo recovery day, which the programme omits entirely", () => {
    expect(reduceSetsAndReps("2 × 4", "plyo", "recovery")).toBeNull();
  });
});

describe("classifying a prescription", () => {
  it("reads the kind from the stage it sits in", () => {
    expect(prescriptionKind("Plyo Ball Preparation", "Rocker Throw")).toBe("plyo");
    expect(prescriptionKind("Throw", "Recovery catch")).toBe("throw");
    expect(prescriptionKind("Condition", "Aerobic base")).toBe("conditioning");
    expect(prescriptionKind("Whole-Body Force", "Trap bar deadlift")).toBe("output");
    expect(prescriptionKind("Whole-Body Power", "Med-ball")).toBe("output");
  });

  it("falls back to the movement name when the stage is unhelpful", () => {
    expect(prescriptionKind("Prepare", "Farmer carry")).toBe("output");
    expect(prescriptionKind("Prepare", "Dynamic mobility flow")).toBe("generic");
  });
});

describe("recovering the original prescription", () => {
  it("reads what the programme stashed", () => {
    expect(originalPrescription("Original plan: 3 × 5 @ RPE 7")).toBe("3 × 5 @ RPE 7");
  });

  it("ignores anything else", () => {
    expect(originalPrescription("Approved mechanics focus")).toBeNull();
    expect(originalPrescription(undefined)).toBeNull();
    expect(originalPrescription(42)).toBeNull();
  });
});
