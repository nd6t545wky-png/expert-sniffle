import { describe, expect, it } from "vitest";
import {
  POSE_INDEX,
  PoseLandmark,
  VISIBILITY_FLOOR,
  landmarkPlan,
  poseSummary,
  poseToFrame,
} from "./poseMapping";

/** A full-confidence 33-point pose with every landmark in a distinct place. */
function pose(over: Record<number, Partial<PoseLandmark>> = {}): PoseLandmark[] {
  return Array.from({ length: 33 }, (_, index) => ({
    x: 0.3 + index * 0.01,
    y: 0.3 + index * 0.01,
    visibility: 0.9,
    ...over[index],
  }));
}

describe("landmarkPlan", () => {
  it("takes the throwing arm and the opposite lead leg for a righty", () => {
    const plan = landmarkPlan("side", "right");
    expect(plan.shoulder).toBe(POSE_INDEX.rightShoulder);
    expect(plan.wrist).toBe(POSE_INDEX.rightWrist);
    // A right-hander lands on the left leg.
    expect(plan.leadKnee).toBe(POSE_INDEX.leftKnee);
    expect(plan.leadAnkle).toBe(POSE_INDEX.leftAnkle);
  });

  it("mirrors the whole plan for a lefty", () => {
    const plan = landmarkPlan("side", "left");
    expect(plan.shoulder).toBe(POSE_INDEX.leftShoulder);
    expect(plan.leadKnee).toBe(POSE_INDEX.rightKnee);
  });

  it("uses both sides for the front view, where handedness does not apply", () => {
    expect(landmarkPlan("front", "right")).toEqual(landmarkPlan("front", "left"));
  });
});

describe("poseToFrame", () => {
  it("places every point the model found", () => {
    const { frame, unplaced } = poseToFrame(pose(), "side", "right");
    expect(unplaced).toEqual([]);
    expect(Object.keys(frame).sort()).toEqual([
      "elbow",
      "hip",
      "leadAnkle",
      "leadKnee",
      "shoulder",
      "wrist",
    ]);
  });

  it("leaves out a landmark the model was unsure of", () => {
    // A confidently-wrong shoulder is worse than a missing one: the angle it
    // produces looks exactly like a measurement.
    const shy = pose({ [POSE_INDEX.rightShoulder]: { visibility: VISIBILITY_FLOOR - 0.01 } });
    const { frame, unplaced } = poseToFrame(shy, "side", "right");
    expect(frame.shoulder).toBeUndefined();
    expect(unplaced).toEqual(["shoulder"]);
  });

  it("leaves out a landmark the model put outside the picture", () => {
    const off = pose({ [POSE_INDEX.leftAnkle]: { y: 1.4 } });
    expect(poseToFrame(off, "side", "right").unplaced).toEqual(["leadAnkle"]);
  });

  it("accepts a landmark that carries no visibility score", () => {
    const bare = pose({ [POSE_INDEX.rightWrist]: { visibility: undefined } });
    expect(poseToFrame(bare, "side", "right").frame.wrist).toBeDefined();
  });

  it("never overwrites a point the athlete placed by hand", () => {
    // A hand-placed point is a correction. Re-running the model must not undo it.
    const mine = { x: 0.11, y: 0.22 };
    const { frame, unplaced } = poseToFrame(pose(), "side", "right", { shoulder: mine });
    expect(frame.shoulder).toEqual(mine);
    expect(unplaced).toEqual([]);
  });

  it("survives a pose with nothing in it", () => {
    const { frame, unplaced } = poseToFrame([], "side", "right");
    expect(frame).toEqual({});
    expect(unplaced).toHaveLength(6);
  });
});

describe("poseSummary", () => {
  it("says so when it found everything", () => {
    expect(poseSummary({ frame: {}, unplaced: [] }, 6)).toMatch(/Found all 6 points/);
  });

  it("names how many are left rather than letting a partial pass as complete", () => {
    expect(poseSummary({ frame: {}, unplaced: ["hip", "leadKnee"] }, 6)).toMatch(
      /Found 4 of 6 points/
    );
  });

  it("says plainly when it found nothing", () => {
    const all = ["a", "b", "c", "d", "e", "f"];
    expect(poseSummary({ frame: {}, unplaced: all }, 6)).toMatch(/Could not find the body/);
  });
});

describe("a frame with no body in it", () => {
  it("reports everything as unplaced rather than as found", () => {
    // The failure this guards: an empty `unplaced` reads downstream as "found
    // all of them", so a total miss announced complete success and placed
    // nothing. Caught in a browser, not in reasoning.
    const result = poseToFrame([], "side", "right");
    expect(result.unplaced).toHaveLength(6);
    expect(poseSummary(result, 6)).toMatch(/Could not find the body/);
  });

  it("still reports the ones already placed by hand", () => {
    const result = poseToFrame([], "side", "right", { shoulder: { x: 0.4, y: 0.3 } });
    expect(result.unplaced).toHaveLength(5);
    expect(poseSummary(result, 6)).toMatch(/Found 1 of 6 points/);
  });
});
