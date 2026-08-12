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
  chooseSubject,
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
    // Side-on, so the stride is laid out across the frame and the hips carry
    // most of the way with it. Torso here is 0.25, so this is 1.2 torso
    // lengths of travel — what a camera off to the side sees.
    const hipX = 0.35 + Math.min(t, 0.6) * 0.5;

    const mark = (x: number, y: number) => ({ x, y, visibility: 0.95 });
    const l: Record<number, { x: number; y: number; visibility: number }> = {
      // Side-on: the shoulders nearly overlap horizontally.
      [POSE_INDEX.leftShoulder]: mark(hipX, 0.35),
      [POSE_INDEX.rightShoulder]: mark(hipX + 0.02, 0.35),
      [POSE_INDEX.leftHip]: mark(hipX, 0.6),
      [POSE_INDEX.rightHip]: mark(hipX + 0.02, 0.6),
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
    // Down the line: the stride comes at the camera, so the hips barely move
    // sideways however wide the shoulders look.
    const front = delivery().map((s) => {
      const marks = [...s.landmarks];
      marks[POSE_INDEX.leftShoulder] = { x: 0.35, y: 0.35, visibility: 0.95 };
      marks[POSE_INDEX.rightShoulder] = { x: 0.65, y: 0.35, visibility: 0.95 };
      marks[POSE_INDEX.leftHip] = { x: 0.42, y: 0.6, visibility: 0.95 };
      marks[POSE_INDEX.rightHip] = { x: 0.5, y: 0.6, visibility: 0.95 };
      return { ...s, landmarks: marks };
    });
    expect(inferView(front)).toBe("front");
  });

  it("refuses to call a shot that is neither", () => {
    // Half a torso length of drift is a diagonal camera. Naming it would
    // decide which angles get measured on the strength of nothing.
    const diagonal = delivery().map((s, i) => {
      const t = i / 39;
      const marks = [...s.landmarks];
      const x = 0.4 + t * 0.17; // 0.68 torso lengths
      marks[POSE_INDEX.leftShoulder] = { x, y: 0.35, visibility: 0.95 };
      marks[POSE_INDEX.rightShoulder] = { x: x + 0.1, y: 0.35, visibility: 0.95 };
      marks[POSE_INDEX.leftHip] = { x, y: 0.6, visibility: 0.95 };
      marks[POSE_INDEX.rightHip] = { x: x + 0.1, y: 0.6, visibility: 0.95 };
      return { ...s, landmarks: marks };
    });
    expect(inferView(diagonal)).toBeNull();
  });

  it("is not fooled by which way the athlete happens to be facing", () => {
    // Shoulders square to the camera the whole time, but the stride still
    // crosses the frame: that is a side-on camera and a rotating pitcher.
    // Reading the body instead of the camera called this one front-on, and
    // then measured a rotation the camera could not see.
    const squareButStriding = delivery().map((s) => {
      const marks = [...s.landmarks];
      const hip = marks[POSE_INDEX.leftHip]!;
      marks[POSE_INDEX.leftShoulder] = { x: hip.x - 0.06, y: 0.35, visibility: 0.95 };
      marks[POSE_INDEX.rightShoulder] = { x: hip.x + 0.06, y: 0.35, visibility: 0.95 };
      return { ...s, landmarks: marks };
    });
    expect(inferView(squareButStriding)).toBe("side");
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

describe("chooseSubject", () => {
  const person = (x: number, y: number) =>
    Array.from({ length: 33 }, (_, i) =>
      i === POSE_INDEX.leftHip || i === POSE_INDEX.rightHip
        ? { x, y, visibility: 0.95 }
        : { x, y, visibility: 0.95 }
    );

  it("picks the person who moves, not the one standing still", () => {
    // The failure this exists for: a real bullpen clip had a team-mate
    // standing behind the pitcher, the model tracked the team-mate, and the
    // knees never moved for seven seconds.
    const frames = Array.from({ length: 20 }, (_, i) => ({
      timeSeconds: i * 0.033,
      people: [person(0.2, 0.5), person(0.5 + i * 0.01, 0.5)],
    }));
    const chosen = chooseSubject(frames);
    expect(chosen).toHaveLength(20);
    // The mover started at 0.5 and drifted right.
    expect(chosen[19].landmarks[POSE_INDEX.leftHip].x).toBeGreaterThan(0.6);
  });

  it("keeps a person's identity as they cross the frame", () => {
    const frames = Array.from({ length: 15 }, (_, i) => ({
      timeSeconds: i * 0.033,
      // Order deliberately swapped each frame, as a model may report it.
      people:
        i % 2 === 0
          ? [person(0.15, 0.5), person(0.5 + i * 0.02, 0.5)]
          : [person(0.5 + i * 0.02, 0.5), person(0.15, 0.5)],
    }));
    const chosen = chooseSubject(frames);
    // Every sample should belong to the mover, never the stationary one.
    expect(chosen.every((s) => s.landmarks[POSE_INDEX.leftHip].x > 0.4)).toBe(true);
  });

  it("returns the only person when there is only one", () => {
    const frames = [{ timeSeconds: 0, people: [person(0.4, 0.5)] }];
    expect(chooseSubject(frames)).toHaveLength(1);
  });

  it("returns nothing when the model found nobody", () => {
    expect(chooseSubject([{ timeSeconds: 0, people: [] }])).toEqual([]);
  });
});
