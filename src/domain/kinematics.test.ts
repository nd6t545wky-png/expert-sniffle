import { describe, expect, it } from "vitest";
import {
  Capture,
  LANDMARKS,
  MEASUREMENTS,
  angleAt,
  angleBetweenLines,
  captureProgress,
  intervalMs,
  kinematicFindings,
  leadLegBlock,
  measurementHistory,
  measurementsFor,
  readCaptures,
  readFrame,
  tiltFromVertical,
} from "./kinematics";
import { OBP_SOURCE } from "./obpReference";

const p = (x: number, y: number) => ({ x, y });

describe("angleAt", () => {
  it("measures a right angle as a right angle", () => {
    expect(angleAt(p(0.5, 0.5), p(0.6, 0.5), p(0.5, 0.4))).toBe(90);
  });

  it("measures a straight limb as 180 degrees", () => {
    expect(angleAt(p(0.5, 0.5), p(0.3, 0.5), p(0.7, 0.5))).toBe(180);
  });

  it("corrects for the frame's aspect ratio", () => {
    // A true 45° on a 16:9 frame digitises as 62° if the normalised
    // coordinates are used directly — an arm slot wrong by 17 degrees.
    const wrong = angleAt(p(0.5, 0.5), p(0.6, 0.5), p(0.5, 0.4), 1);
    const right = angleAt(p(0.5, 0.5), p(0.6, 0.5), p(0.6, 0.4), 16 / 9);
    expect(wrong).toBe(90);
    // 0.1 of width on a 16:9 frame is 0.178 square units; 0.1 of height is 0.1.
    expect(right).toBeCloseTo(29.3, 0);
  });

  it("returns nothing for two taps in the same place", () => {
    expect(angleAt(p(0.5, 0.5), p(0.5, 0.5), p(0.7, 0.5))).toBeNull();
  });
});

describe("tiltFromVertical", () => {
  it("calls a vertical trunk zero", () => {
    // Screen y grows downward, so a shoulder above a hip is a smaller y.
    expect(tiltFromVertical(p(0.5, 0.8), p(0.5, 0.3))).toBe(0);
  });

  it("measures a lean off vertical", () => {
    expect(tiltFromVertical(p(0.5, 0.5), p(0.6, 0.4), 1)).toBe(45);
  });

  it("is unsigned, because one camera cannot tell forward from back", () => {
    const forward = tiltFromVertical(p(0.5, 0.5), p(0.6, 0.4), 1);
    const backward = tiltFromVertical(p(0.5, 0.5), p(0.4, 0.4), 1);
    expect(forward).toBe(backward);
  });
});

describe("angleBetweenLines", () => {
  it("folds an angle past 90 back down, because a line has no front", () => {
    // Shoulder line 10° one way and 170° the other are the same separation.
    const a = angleBetweenLines(p(0.4, 0.5), p(0.6, 0.5), p(0.4, 0.5), p(0.6, 0.6), 1);
    const b = angleBetweenLines(p(0.4, 0.5), p(0.6, 0.5), p(0.6, 0.6), p(0.4, 0.5), 1);
    expect(a).toBe(b);
    expect(a!).toBeLessThanOrEqual(90);
  });

  it("calls two parallel lines zero", () => {
    expect(angleBetweenLines(p(0.3, 0.4), p(0.7, 0.4), p(0.3, 0.6), p(0.7, 0.6))).toBe(0);
  });
});

describe("readFrame", () => {
  const capture = (frames: Capture["frames"], view: Capture["view"] = "side"): Capture => ({
    id: "c1",
    date: "2026-08-12",
    view,
    aspect: 1,
    times: {},
    frames,
  });

  it("computes a measurement once every landmark is placed", () => {
    const readings = readFrame(
      capture({ footStrike: { shoulder: p(0.5, 0.4), elbow: p(0.6, 0.4), wrist: p(0.6, 0.3) } }),
      "footStrike"
    );
    const elbow = readings.find((row) => row.measurement.id === "elbowFlexion")!;
    expect(elbow.value).toBe(90);
    expect(elbow.missing).toEqual([]);
  });

  it("reports what is still to be placed rather than estimating", () => {
    const readings = readFrame(capture({ footStrike: { shoulder: p(0.5, 0.4) } }), "footStrike");
    const elbow = readings.find((row) => row.measurement.id === "elbowFlexion")!;
    expect(elbow.value).toBeNull();
    expect(elbow.missing).toEqual(["elbow", "wrist"]);
  });

  it("offers only the measurements the camera view can see", () => {
    const side = readFrame(capture({}), "footStrike").map((row) => row.measurement.id);
    expect(side).toContain("elbowFlexion");
    expect(side).not.toContain("hipShoulderSeparation");

    const front = readFrame(capture({}, "front"), "footStrike").map((row) => row.measurement.id);
    expect(front).toContain("hipShoulderSeparation");
    expect(front).not.toContain("elbowFlexion");
  });

  it("marks a value outside its reference band", () => {
    // The measured elbow band is 92–116°; a straight arm is well outside it.
    const readings = readFrame(
      capture({ footStrike: { shoulder: p(0.3, 0.4), elbow: p(0.5, 0.4), wrist: p(0.7, 0.4) } }),
      "footStrike"
    );
    const elbow = readings.find((row) => row.measurement.id === "elbowFlexion")!;
    expect(elbow.value).toBe(180);
    expect(elbow.outsideBand).toBe(true);
  });

  it("never marks a band on a measurement that has none", () => {
    // Trunk lean is an unsigned lean off vertical; the reference data splits
    // trunk angle into signed anterior and lateral parts. Different quantity,
    // so no band and never a verdict.
    const readings = readFrame(
      capture({ footStrike: { hip: p(0.5, 0.9), shoulder: p(0.9, 0.1) } }),
      "footStrike"
    );
    const trunk = readings.find((row) => row.measurement.id === "trunkTilt")!;
    expect(trunk.value).not.toBeNull();
    expect(trunk.measurement.band).toBeUndefined();
    expect(trunk.outsideBand).toBe(false);
  });

  it("falls back to a square frame rather than dividing by a bad aspect", () => {
    const bad = { ...capture({ footStrike: { shoulder: p(0.5, 0.4), elbow: p(0.6, 0.4), wrist: p(0.6, 0.3) } }), aspect: 0 };
    expect(readFrame(bad, "footStrike").find((r) => r.measurement.id === "elbowFlexion")!.value).toBe(90);
  });
});

describe("leadLegBlock", () => {
  const withKnees = (strikeAngle: [number, number], releaseAngle: [number, number]): Capture => ({
    id: "c",
    date: "2026-08-12",
    view: "side",
    aspect: 1,
    times: {},
    frames: {
      footStrike: { hip: p(0.5, 0.4), leadKnee: p(strikeAngle[0], strikeAngle[1]), leadAnkle: p(0.5, 0.9) },
      release: { hip: p(0.5, 0.4), leadKnee: p(releaseAngle[0], releaseAngle[1]), leadAnkle: p(0.5, 0.9) },
    },
  });

  it("reports the knee straightening between foot strike and release", () => {
    // Knee off the hip–ankle line at strike, on it at release: a straightening.
    const block = leadLegBlock(withKnees([0.35, 0.65], [0.5, 0.65]));
    expect(block).not.toBeNull();
    expect(block!).toBeGreaterThan(0);
  });

  it("returns nothing when either frame is missing the knee", () => {
    const capture: Capture = {
      id: "c",
      date: "2026-08-12",
      view: "side",
      aspect: 1,
      times: {},
      frames: { footStrike: { hip: p(0.5, 0.4), leadKnee: p(0.4, 0.6), leadAnkle: p(0.5, 0.9) } },
    };
    expect(leadLegBlock(capture)).toBeNull();
  });
});

describe("intervalMs", () => {
  const capture = (times: Capture["times"]): Capture => ({
    id: "c",
    date: "2026-08-12",
    view: "side",
    aspect: 1,
    times,
    frames: {},
  });

  it("reports the gap between two checkpoints in milliseconds", () => {
    expect(intervalMs(capture({ footStrike: 1.2, release: 1.35 }), "footStrike", "release")).toBe(150);
  });

  it("returns nothing when a checkpoint was never marked", () => {
    expect(intervalMs(capture({ footStrike: 1.2 }), "footStrike", "release")).toBeNull();
  });

  it("returns nothing for checkpoints marked out of order", () => {
    expect(intervalMs(capture({ footStrike: 1.5, release: 1.2 }), "footStrike", "release")).toBeNull();
  });
});

describe("captureProgress", () => {
  it("counts a checkpoint done only when every landmark is placed", () => {
    const full = Object.fromEntries(LANDMARKS.side.map((mark) => [mark.id, p(0.5, 0.5)]));
    const capture: Capture = {
      id: "c",
      date: "2026-08-12",
      view: "side",
      aspect: 1,
      times: {},
      frames: { footStrike: full, release: { shoulder: p(0.5, 0.5) } },
    };
    expect(captureProgress(capture, ["footStrike", "release"])).toEqual({ done: 1, total: 2 });
  });
});

describe("measurementHistory", () => {
  const at = (date: string, view: Capture["view"], elbowY: number): Capture => ({
    id: date,
    date,
    view,
    aspect: 1,
    times: {},
    frames: { footStrike: { shoulder: p(0.5, 0.4), elbow: p(0.6, 0.4), wrist: p(0.6, elbowY) } },
  });

  it("returns one point per capture, oldest first", () => {
    const history = measurementHistory(
      [at("2026-08-12", "side", 0.3), at("2026-08-05", "side", 0.2)],
      "elbowFlexion",
      "footStrike"
    );
    expect(history.map((row) => row.date)).toEqual(["2026-08-05", "2026-08-12"]);
  });

  it("never mixes camera views on one line", () => {
    // A front-view capture cannot contribute a side-view elbow angle; putting
    // them together would manufacture a change out of a camera move.
    const history = measurementHistory(
      [at("2026-08-12", "side", 0.3), at("2026-08-05", "front", 0.2)],
      "elbowFlexion",
      "footStrike"
    );
    expect(history).toHaveLength(1);
  });

  it("returns nothing for an unknown measurement", () => {
    expect(measurementHistory([at("2026-08-12", "side", 0.3)], "nope", "footStrike")).toEqual([]);
  });
});

describe("readCaptures", () => {
  it("survives junk in the store", () => {
    expect(readCaptures(null)).toEqual([]);
    expect(readCaptures([{ id: 1 }, "x", { id: "a", date: "2026-01-01" }])).toHaveLength(1);
  });
});

describe("kinematicFindings", () => {
  it("names the measurement, the number and the band it fell outside", () => {
    const readings = readFrame(
      {
        id: "c",
        date: "2026-08-12",
        view: "side",
        aspect: 1,
        times: {},
        frames: { footStrike: { shoulder: p(0.3, 0.4), elbow: p(0.5, 0.4), wrist: p(0.7, 0.4) } },
      },
      "footStrike"
    );
    const [finding] = kinematicFindings(readings, null);
    expect(finding.text).toMatch(/Elbow angle measured 180°, outside the 92–115.8° range/);
    expect(finding.text).toMatch(/411 pitches from 100 college and professional pitchers/);
  });

  it("reads a straightening knee as the lead leg blocking", () => {
    const [finding] = kinematicFindings([], 12);
    expect(finding.severity).toBe("note");
    expect(finding.text).toMatch(/straightened 12°/);
  });

  it("reads a collapsing knee as something to watch", () => {
    const [finding] = kinematicFindings([], -8);
    expect(finding.severity).toBe("watch");
    expect(finding.text).toMatch(/bent a further 8°/);
  });

  it("says nothing at all about a frame inside every band", () => {
    expect(kinematicFindings([], null)).toEqual([]);
  });
});

describe("the measurement set", () => {
  it("bands only what the reference population actually measured the same way", () => {
    const banded = MEASUREMENTS.filter((m) => m.band).map((m) => m.id);
    expect(banded.sort()).toEqual(["elbowFlexion", "hipShoulderSeparation", "shoulderAbduction"]);
  });

  it("gives every view at least one measurement it can actually see", () => {
    expect(measurementsFor("side").length).toBeGreaterThan(0);
    expect(measurementsFor("front").length).toBeGreaterThan(0);
  });
});

describe("reference bands", () => {
  it("bands only the measurements whose geometry matches the reference data", () => {
    // Trunk lean and shoulder tilt are a different construction from anything
    // OBP publishes — the lab splits trunk angle into signed anterior and
    // lateral components. A band over the wrong quantity is worse than none.
    const banded = MEASUREMENTS.filter((m) => m.band).map((m) => m.id).sort();
    expect(banded).toEqual([
      "elbowFlexion",
      "hipShoulderSeparation",
      "shoulderAbduction",
    ]);
    expect(MEASUREMENTS.find((m) => m.id === "trunkTilt")?.band).toBeUndefined();
    expect(MEASUREMENTS.find((m) => m.id === "shoulderLineTilt")?.band).toBeUndefined();
  });

  it("uses the measured middle half rather than a remembered range", () => {
    // The hand-written band said 40–60°. 411 measured pitches put the middle
    // half at 25–35°, which is the correction this data bought.
    const separation = MEASUREMENTS.find((m) => m.id === "hipShoulderSeparation")!;
    expect(separation.band!.low).toBeCloseTo(25.2, 1);
    expect(separation.band!.high).toBeCloseTo(34.7, 1);
  });

  it("names the population in the band's own words", () => {
    const elbow = MEASUREMENTS.find((m) => m.id === "elbowFlexion")!;
    expect(elbow.band!.source).toMatch(/411 pitches from 100 college and professional pitchers/);
    expect(elbow.band!.source).toMatch(/OpenBiomechanics/);
  });

  it("carries the source counts for the UI to cite", () => {
    expect(OBP_SOURCE.pitches).toBe(411);
    expect(OBP_SOURCE.athletes).toBe(100);
  });
});
