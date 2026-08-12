import { describe, expect, it } from "vitest";
import {
  HAND_SPEED_MARGIN,
  PoseSample,
  detectCheckpoints,
  enforceOrder,
  inferHandedness,
  inferView,
  readSequence,
  sequenceSummary,
} from "./poseSequence";
import { POSE_INDEX } from "./poseMapping";

/**
 * A synthetic right-handed delivery, side-on.
 *
 * Lead knee lifts then lands; the lead ankle comes down and stops; the
 * throwing wrist whips through after the foot is down. Crude, but it has the
 * shape the detector reads.
 */
function delivery(frames = 40): PoseSample[] {
  return Array.from({ length: frames }, (_, i) => {
    const t = i / (frames - 1);
    // Knee rises to its peak at t=0.35, then comes down.
    const kneeY = t < 0.35 ? 0.7 - (t / 0.35) * 0.25 : 0.45 + ((t - 0.35) / 0.65) * 0.25;
    // Ankle lands at t=0.6 and stays put.
    const ankleY = t < 0.6 ? 0.85 - Math.sin((t / 0.6) * Math.PI) * 0.2 : 0.9;
    const ankleX = t < 0.6 ? 0.4 + t * 0.25 : 0.55;
    // Throwing wrist accelerates hard between 0.6 and 0.8.
    const wristX = t < 0.6 ? 0.35 : 0.35 + (t - 0.6) * 2.2;

    const mark = (x: number, y: number) => ({ x, y, visibility: 0.95 });
    const l: Record<number, { x: number; y: number; visibility: number }> = {
      // Side-on: the shoulders nearly overlap horizontally.
      [POSE_INDEX.leftShoulder]: mark(0.5, 0.35),
      [POSE_INDEX.rightShoulder]: mark(0.52, 0.35),
      [POSE_INDEX.leftHip]: mark(0.5, 0.6),
      [POSE_INDEX.rightHip]: mark(0.52, 0.6),
      [POSE_INDEX.leftKnee]: mark(0.45, kneeY),
      [POSE_INDEX.rightKnee]: mark(0.55, 0.75),
      [POSE_INDEX.leftAnkle]: mark(ankleX, ankleY),
      [POSE_INDEX.rightAnkle]: mark(0.55, 0.95),
      [POSE_INDEX.rightWrist]: mark(Math.min(wristX, 0.98), 0.4),
      [POSE_INDEX.leftWrist]: mark(0.3, 0.55),
      [POSE_INDEX.rightElbow]: mark(0.45, 0.4),
      [POSE_INDEX.leftElbow]: mark(0.35, 0.5),
    };
    return {
      timeSeconds: i * 0.033,
      landmarks: Array.from({ length: 33 }, (_, index) => l[index] ?? { x: 0.5, y: 0.5, visibility: 0.1 }),
    };
  });
}

describe("inferView", () => {
  it("calls a side-on clip side-on", () => {
    expect(inferView(delivery())).toBe("side");
  });

  it("calls a face-on clip front", () => {
    const front = delivery().map((s) => {
      const marks = [...s.landmarks];
      marks[POSE_INDEX.leftShoulder] = { x: 0.35, y: 0.35, visibility: 0.95 };
      marks[POSE_INDEX.rightShoulder] = { x: 0.65, y: 0.35, visibility: 0.95 };
      return { ...s, landmarks: marks };
    });
    expect(inferView(front)).toBe("front");
  });

  it("returns nothing when there is no body to read", () => {
    expect(inferView([])).toBeNull();
  });
});

describe("inferHandedness", () => {
  it("picks the wrist that moves fastest", () => {
    expect(inferHandedness(delivery())).toBe("right");
  });

  it("mirrors for a left-hander", () => {
    const lefty = delivery().map((s) => {
      const marks = [...s.landmarks];
      const r = marks[POSE_INDEX.rightWrist];
      marks[POSE_INDEX.rightWrist] = marks[POSE_INDEX.leftWrist];
      marks[POSE_INDEX.leftWrist] = r;
      return { ...s, landmarks: marks };
    });
    expect(inferHandedness(lefty)).toBe("left");
  });

  it("refuses to call it when neither hand is clearly faster", () => {
    // Someone standing still is not a right-hander with a slow arm.
    const still = delivery().map((s) => {
      const marks = [...s.landmarks];
      marks[POSE_INDEX.rightWrist] = { x: 0.6, y: 0.4, visibility: 0.95 };
      marks[POSE_INDEX.leftWrist] = { x: 0.4, y: 0.4, visibility: 0.95 };
      return { ...s, landmarks: marks };
    });
    expect(inferHandedness(still)).toBeNull();
  });

  it("needs a clear margin, not a hair", () => {
    expect(HAND_SPEED_MARGIN).toBeGreaterThan(1);
  });
});

describe("detectCheckpoints", () => {
  const found = detectCheckpoints(delivery(), "right");

  it("finds all four", () => {
    for (const [key, value] of Object.entries(found)) {
      expect(value, key).not.toBeNull();
    }
  });

  it("puts them in the order a delivery happens", () => {
    expect(found.firstMovement!).toBeLessThan(found.maxLegLift!);
    expect(found.maxLegLift!).toBeLessThan(found.footStrike!);
    expect(found.footStrike!).toBeLessThanOrEqual(found.release!);
  });

  it("puts max leg lift where the knee is highest", () => {
    // The synthetic knee peaks at t=0.35 of a 1.287s clip.
    expect(found.maxLegLift!).toBeCloseTo(0.033 * 39 * 0.35, 1);
  });

  it("puts release after the foot is down", () => {
    expect(found.release!).toBeGreaterThanOrEqual(found.footStrike!);
  });

  it("returns nothing from a clip too short to read", () => {
    const found = detectCheckpoints(delivery(3), "right");
    expect(Object.values(found).every((v) => v === null)).toBe(true);
  });
});

describe("enforceOrder", () => {
  it("drops a checkpoint that lands out of sequence", () => {
    // A foot strike before the leg lift is a failed detection, not a close one.
    const fixed = enforceOrder({
      firstMovement: 0.1,
      maxLegLift: 0.8,
      footStrike: 0.4,
      release: 1.2,
    });
    expect(fixed.footStrike).toBeNull();
    expect(fixed.maxLegLift).toBe(0.8);
    expect(fixed.release).toBe(1.2);
  });

  it("leaves a well-ordered set alone", () => {
    const good = { firstMovement: 0.1, maxLegLift: 0.4, footStrike: 0.8, release: 1.0 };
    expect(enforceOrder(good)).toEqual(good);
  });
});

describe("readSequence", () => {
  it("reads view, hand and checkpoints with nothing supplied", () => {
    const reading = readSequence(delivery());
    expect(reading.view).toBe("side");
    expect(reading.hand).toBe("right");
    expect(reading.checkpoints.footStrike).not.toBeNull();
    expect(sequenceSummary(reading)).toMatch(/side-on delivery from a right-hander/);
  });

  it("places no checkpoints when the throwing arm is unclear", () => {
    // Every checkpoint is defined relative to the lead leg or throwing hand,
    // so without the arm there is nothing to anchor them to.
    const still = delivery().map((s) => {
      const marks = [...s.landmarks];
      marks[POSE_INDEX.rightWrist] = { x: 0.6, y: 0.4, visibility: 0.95 };
      marks[POSE_INDEX.leftWrist] = { x: 0.4, y: 0.4, visibility: 0.95 };
      return { ...s, landmarks: marks };
    });
    const reading = readSequence(still);
    expect(reading.hand).toBeNull();
    expect(Object.values(reading.checkpoints).every((v) => v === null)).toBe(true);
    expect(sequenceSummary(reading)).toMatch(/Could not tell which arm is throwing/);
  });

  it("says so plainly when there is no body in the clip", () => {
    expect(sequenceSummary(readSequence([]))).toMatch(/Could not find a body/);
  });

  it("names the checkpoints it could not find rather than guessing them", () => {
    const summary = sequenceSummary({
      view: "side",
      hand: "right",
      checkpoints: { firstMovement: 0.1, maxLegLift: 0.4, footStrike: null, release: null },
      usable: 40,
      sampled: 40,
    });
    expect(summary).toMatch(/placed 2 of 4 checkpoints/);
    expect(summary).toMatch(/Could not find foot strike or ball release/);
  });
});
