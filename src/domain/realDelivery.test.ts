/**
 * The detector, run against a real delivery instead of a synthetic one.
 *
 * Everything else in this suite is built from generated landmarks that move
 * the way the code expects them to, which makes those tests good at catching
 * regressions and useless at catching wrong assumptions. This fixture is the
 * pose output from an actual phone clip of a bullpen — a right-hander filmed
 * side-on, at 540x960, with the motion blur and dropped landmarks that come
 * with real footage.
 *
 * It caught three things no synthetic test could:
 *
 *   - the view classifier read the athlete's body instead of the camera's
 *     position, and called a side-on clip front-on;
 *   - wrist speed does not identify the throwing arm on footage like this;
 *   - the checkpoint heuristics, given the right hand, are actually correct —
 *     the four times below were checked against the frames by eye.
 *
 * The timings are hard-coded deliberately. If a change to the heuristics moves
 * them, that change needs looking at against the video, not waving through.
 */

import { describe, expect, it } from "vitest";
import fixture from "./fixtures/realDelivery.json";
import { PoseSample, detectCheckpoints, inferHandedness, inferView, readSequence, sequenceSummary } from "./poseSequence";

const EMPTY = { x: 0.5, y: 0.5, visibility: 0 };

const samples: PoseSample[] = fixture.frames.map((frame) => ({
  timeSeconds: frame.t,
  landmarks: Array.from({ length: 33 }, (_, index) => {
    const mark = (frame.m as Record<string, { x: number; y: number; visibility?: number }>)[
      String(index)
    ];
    return mark ?? EMPTY;
  }),
}));

describe("a real side-on delivery", () => {
  it("gives a body in every frame it was asked about", () => {
    expect(samples.length).toBe(206);
    expect(readSequence(samples, "right").usable).toBe(206);
  });

  it("is read as side-on, because the stride crosses the frame", () => {
    expect(inferView(samples)).toBe("side");
  });

  it("finds all four checkpoints when told which arm throws", () => {
    const found = detectCheckpoints(samples, "right");
    // Checked frame by frame against the video: knee at the top of the lift,
    // lead foot planted with the arm cocked, arm through with the trunk over.
    expect(found.firstMovement).toBeCloseTo(1.17, 1);
    expect(found.maxLegLift).toBeCloseTo(5.27, 1);
    expect(found.footStrike).toBeCloseTo(5.83, 1);
    expect(found.release).toBeCloseTo(6.0, 1);
  });

  it("puts the checkpoints in the order a delivery happens", () => {
    const found = detectCheckpoints(samples, "right");
    const times = [found.firstMovement, found.maxLegLift, found.footStrike, found.release];
    expect(times.every((time) => time !== null)).toBe(true);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]!).toBeGreaterThan(times[i - 1]!);
    }
  });

  it("would place the checkpoints after the ball had gone if the arm were wrong", () => {
    // Why handedness is taken from the profile and never guessed: the same
    // clip read as a left-hander puts max leg lift at 6.5s, which is half a
    // second after the actual release.
    const wrong = detectCheckpoints(samples, "left");
    expect(wrong.maxLegLift!).toBeGreaterThan(detectCheckpoints(samples, "right").release!);
  });

  it("cannot tell the throwing arm from wrist speed on footage like this", () => {
    // The glove arm whips down about as fast as the throwing arm, and the
    // throwing wrist is blurred exactly when it is quickest. Returning null
    // here is the honest answer, and is why the profile supplies it instead.
    expect(inferHandedness(samples)).toBeNull();
  });

  it("uses the arm it is given rather than the one it guessed", () => {
    expect(readSequence(samples, "right").hand).toBe("right");
    expect(readSequence(samples, "left").hand).toBe("left");
    expect(readSequence(samples).hand).toBeNull();
  });

  it("says plainly what it read", () => {
    const summary = sequenceSummary(readSequence(samples, "right"));
    expect(summary).toContain("side-on");
    expect(summary).toContain("right-hander");
    expect(summary).toContain("all four checkpoints");
  });
});
