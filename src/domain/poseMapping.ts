/**
 * Turning a pose model's output into the points this app measures.
 *
 * The manual tool asks for six taps a frame. A pose model finds thirty-three
 * landmarks in one pass, and four of the six measurements only need a handful
 * of them — so the tapping becomes a correction step rather than the work.
 *
 * What this deliberately does *not* change: the measurement, the projection
 * caveat, or the reference bands. The model places the points; the same
 * trigonometry runs on them, and a placed point is still visible and still
 * adjustable. Auto-detection removes the tedium, not the 2D-versus-3D error —
 * a model that finds a shoulder in a photograph is still looking at a
 * photograph.
 *
 * Two things it refuses:
 *
 *   - **A landmark the model is unsure of is not placed.** Every landmark
 *     carries a visibility score; below the floor it is left out, and the
 *     athlete taps that one themselves. A confidently-wrong shoulder is worse
 *     than a missing one, because the angle it produces looks like a
 *     measurement.
 *   - **It never guesses handedness.** Which arm throws decides which
 *     landmarks are the throwing arm and which leg is the lead leg. Getting it
 *     backwards silently measures the glove arm, so it is a setting rather
 *     than an inference.
 */

import { Frame, KinematicView, Point } from "./kinematics";

/** One landmark as the pose model reports it: normalised to the frame. */
export interface PoseLandmark {
  x: number;
  y: number;
  /** How sure the model is this landmark is present and visible, 0–1. */
  visibility?: number;
}

export type Handedness = "right" | "left";

/**
 * Indices into MediaPipe's 33-point pose.
 *
 * Left and right here are the *subject's* own, which is what makes the
 * handedness mapping below correct rather than mirrored.
 */
export const POSE_INDEX = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

/**
 * Below this the landmark is treated as not found.
 *
 * MediaPipe reports visibility for occluded and out-of-frame points, and a
 * pitcher's trail leg spends much of the delivery hidden behind the lead one.
 * 0.5 is the model's own conventional floor.
 */
export const VISIBILITY_FLOOR = 0.5;

function usable(landmark: PoseLandmark | undefined): Point | null {
  if (!landmark) return null;
  if (!Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) return null;
  // Absent visibility means the model did not report one, which is treated as
  // usable — only an explicit low score rejects the point.
  if (landmark.visibility !== undefined && landmark.visibility < VISIBILITY_FLOOR) return null;
  // Outside the frame entirely: the model extrapolates past the edges, and a
  // point off-picture cannot have been seen.
  if (landmark.x < 0 || landmark.x > 1 || landmark.y < 0 || landmark.y > 1) return null;
  return { x: landmark.x, y: landmark.y };
}

/**
 * Which pose landmark stands behind each of this app's, given the view and
 * which arm throws.
 *
 * A right-handed pitcher throws with the right arm and lands on the left leg,
 * so the lead knee and ankle are the left ones. Mirrored for a lefty.
 */
export function landmarkPlan(
  view: KinematicView,
  hand: Handedness
): Record<string, number> {
  const throwing = hand === "right" ? "right" : "left";
  const lead = hand === "right" ? "left" : "right";

  if (view === "front") {
    return {
      leftShoulder: POSE_INDEX.leftShoulder,
      rightShoulder: POSE_INDEX.rightShoulder,
      leftHip: POSE_INDEX.leftHip,
      rightHip: POSE_INDEX.rightHip,
    };
  }

  return {
    shoulder: POSE_INDEX[`${throwing}Shoulder` as keyof typeof POSE_INDEX],
    elbow: POSE_INDEX[`${throwing}Elbow` as keyof typeof POSE_INDEX],
    wrist: POSE_INDEX[`${throwing}Wrist` as keyof typeof POSE_INDEX],
    hip: POSE_INDEX[`${throwing}Hip` as keyof typeof POSE_INDEX],
    leadKnee: POSE_INDEX[`${lead}Knee` as keyof typeof POSE_INDEX],
    leadAnkle: POSE_INDEX[`${lead}Ankle` as keyof typeof POSE_INDEX],
  };
}

export interface PoseResult {
  /** Points the model placed confidently. */
  frame: Frame;
  /** App landmark ids the model could not place, for the athlete to tap. */
  unplaced: string[];
}

/**
 * Read a pose into this app's frame.
 *
 * Existing points are never overwritten: a landmark the athlete has already
 * placed by hand is their correction, and a later run of the model must not
 * silently undo it.
 */
export function poseToFrame(
  landmarks: PoseLandmark[],
  view: KinematicView,
  hand: Handedness,
  existing: Frame = {}
): PoseResult {
  const plan = landmarkPlan(view, hand);
  const frame: Frame = { ...existing };
  const unplaced: string[] = [];

  for (const [id, index] of Object.entries(plan)) {
    if (frame[id]) continue;
    const point = usable(landmarks[index]);
    if (point) frame[id] = point;
    else unplaced.push(id);
  }

  return { frame, unplaced };
}

/**
 * Plain-English account of what the model managed.
 *
 * Said out loud because a silently-partial placement looks identical to a
 * complete one until the measurement comes back missing.
 */
export function poseSummary(result: PoseResult, total: number): string {
  const placed = total - result.unplaced.length;
  if (result.unplaced.length === 0) {
    return `Found all ${total} points. Check them and drag any that look wrong.`;
  }
  if (placed === 0) {
    return "Could not find the body in this frame. Try a frame where more of you is visible, or tap the points yourself.";
  }
  return `Found ${placed} of ${total} points. Tap the rest yourself — the ones it was unsure of are left out rather than guessed.`;
}
