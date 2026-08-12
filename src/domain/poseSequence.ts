/**
 * Reading a whole delivery out of a clip, with nothing asked of the athlete.
 *
 * Placing the landmarks automatically removed six taps a frame. This removes
 * the rest: which camera view it is, which arm throws, and where in the clip
 * the four checkpoints fall are all read from the motion itself.
 *
 * Every inference here is a property of the trajectories, not a guess:
 *
 *   - **The view** comes from how far apart the shoulders sit. Face-on, the
 *     shoulder line spans a large fraction of the torso's height; side-on, one
 *     shoulder hides behind the other and that span collapses.
 *   - **The throwing arm** is the wrist that moves fastest. Across a delivery
 *     the throwing hand's peak speed is several times the glove hand's, and
 *     the gap is not close.
 *   - **The direction of travel** is where the lead ankle goes, so nothing has
 *     to be told which way the pitcher faces.
 *   - **The checkpoints** are the extremes the delivery is defined by: the
 *     first real movement, the highest the lead knee gets, the moment the lead
 *     ankle stops, and the fastest the throwing wrist travels.
 *
 * The rule that matters most: **an inference the data does not support is
 * reported as unfound, never as a frame chosen anyway.** A confidently wrong
 * foot strike puts every angle at the wrong instant, and nothing downstream
 * could tell.
 */

import { PoseLandmark, POSE_INDEX, Handedness } from "./poseMapping";
import { KinematicView } from "./kinematics";

/** One sampled frame: the pose, and when in the clip it was taken. */
export interface PoseSample {
  timeSeconds: number;
  landmarks: PoseLandmark[];
}

/** One sampled frame before a subject is chosen: everyone the model found. */
export interface CrowdSample {
  timeSeconds: number;
  people: PoseLandmark[][];
}

// --- Picking the pitcher out of the frame ------------------------------------

/**
 * Hip centre, which is the most stable point to track a person by — it stays
 * visible through a delivery where wrists and ankles do not.
 */
function centre(person: PoseLandmark[]): { x: number; y: number } | null {
  const lh = person[POSE_INDEX.leftHip];
  const rh = person[POSE_INDEX.rightHip];
  if (!lh || !rh) return null;
  if (!Number.isFinite(lh.x) || !Number.isFinite(rh.x)) return null;
  return { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
}

/**
 * How far apart two people can be between frames and still be the same person.
 *
 * A pitcher crosses a fraction of the frame in a thirtieth of a second; two
 * different people standing metres apart do not swap places in one.
 */
export const SAME_PERSON_DISTANCE = 0.2;

interface Track {
  samples: PoseSample[];
  motion: number;
  last: { x: number; y: number };
}

/**
 * Follow each person through the clip and return the one who is pitching.
 *
 * A bullpen video almost always has someone else in it — a catcher, a coach, a
 * team-mate waiting their turn. Asking the model for one pose gives whichever
 * body it likes, and on a real clip it took the team-mate standing still: the
 * knees never moved for seven seconds and every checkpoint was nonsense.
 *
 * The pitcher is the person who moves. Bodies are followed frame to frame by
 * hip centre, and the track with the most accumulated motion is the subject —
 * which is true whoever is in shot, wherever they stand, and however many of
 * them there are.
 */
export function chooseSubject(frames: CrowdSample[]): PoseSample[] {
  const tracks: Track[] = [];

  for (const frame of frames) {
    const claimed = new Set<Track>();
    for (const person of frame.people) {
      const here = centre(person);
      if (!here) continue;

      let best: Track | null = null;
      let bestDistance = SAME_PERSON_DISTANCE;
      for (const track of tracks) {
        if (claimed.has(track)) continue;
        const distance = Math.hypot(track.last.x - here.x, track.last.y - here.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = track;
        }
      }

      if (best) {
        best.motion += bestDistance;
        best.last = here;
        best.samples.push({ timeSeconds: frame.timeSeconds, landmarks: person });
        claimed.add(best);
      } else {
        const track: Track = {
          samples: [{ timeSeconds: frame.timeSeconds, landmarks: person }],
          motion: 0,
          last: here,
        };
        tracks.push(track);
        claimed.add(track);
      }
    }
  }

  if (tracks.length === 0) return [];
  // Longer tracks accumulate motion simply by lasting, so it is compared per
  // frame — a person present throughout who barely moves must not win over the
  // one who is actually throwing.
  return tracks.reduce((best, track) =>
    track.motion / Math.max(1, track.samples.length) >
    best.motion / Math.max(1, best.samples.length)
      ? track
      : best
  ).samples;
}

const at = (sample: PoseSample, index: number): PoseLandmark | null => {
  const mark = sample.landmarks[index];
  if (!mark || !Number.isFinite(mark.x) || !Number.isFinite(mark.y)) return null;
  if (mark.visibility !== undefined && mark.visibility < 0.4) return null;
  return mark;
};

/** Samples carrying enough of a body to reason about. */
function usableSamples(samples: PoseSample[]): PoseSample[] {
  return samples.filter(
    (sample) => at(sample, POSE_INDEX.leftHip) && at(sample, POSE_INDEX.rightHip)
  );
}

// --- What kind of shot is this -----------------------------------------------

/**
 * Shoulder span, as a fraction of torso height, averaged over the clip.
 *
 * Above the threshold the camera is looking at the chest or back; below it,
 * side-on. Averaged rather than taken from one frame because a pitcher rotates
 * through the delivery and any single frame can look like either.
 */
export const FRONT_VIEW_RATIO = 0.55;

export function inferView(samples: PoseSample[]): KinematicView | null {
  const ratios: number[] = [];
  for (const sample of usableSamples(samples)) {
    const ls = at(sample, POSE_INDEX.leftShoulder);
    const rs = at(sample, POSE_INDEX.rightShoulder);
    const lh = at(sample, POSE_INDEX.leftHip);
    const rh = at(sample, POSE_INDEX.rightHip);
    if (!ls || !rs || !lh || !rh) continue;

    const span = Math.abs(ls.x - rs.x);
    const torso = Math.abs((ls.y + rs.y) / 2 - (lh.y + rh.y) / 2);
    if (torso <= 0.001) continue;
    ratios.push(span / torso);
  }
  if (ratios.length === 0) return null;

  const mean = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
  return mean >= FRONT_VIEW_RATIO ? "front" : "side";
}

// --- Which arm throws --------------------------------------------------------

function peakSpeed(samples: PoseSample[], index: number): number {
  let peak = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const now = at(samples[i], index);
    const before = at(samples[i - 1], index);
    const dt = samples[i].timeSeconds - samples[i - 1].timeSeconds;
    if (!now || !before || dt <= 0) continue;
    peak = Math.max(peak, Math.hypot(now.x - before.x, now.y - before.y) / dt);
  }
  return peak;
}

/**
 * How much faster the throwing hand must be before the call is made.
 *
 * In a real delivery the ratio is large. Requiring a clear margin means a clip
 * of someone standing still, or one where the arm is out of shot, returns
 * nothing rather than picking a side on noise.
 */
export const HAND_SPEED_MARGIN = 1.5;

export function inferHandedness(samples: PoseSample[]): Handedness | null {
  const right = peakSpeed(samples, POSE_INDEX.rightWrist);
  const left = peakSpeed(samples, POSE_INDEX.leftWrist);
  if (right <= 0 && left <= 0) return null;

  if (right >= left * HAND_SPEED_MARGIN) return "right";
  if (left >= right * HAND_SPEED_MARGIN) return "left";
  return null;
}

// --- The four checkpoints ----------------------------------------------------

export interface DetectedCheckpoints {
  firstMovement: number | null;
  maxLegLift: number | null;
  footStrike: number | null;
  release: number | null;
}

/** How much of the frame a joint must move before it counts as started. */
export const MOVEMENT_THRESHOLD = 0.02;

/**
 * Find the delivery's four checkpoints, in clip seconds.
 *
 * Found in the order the delivery happens, each constrained to fall after the
 * one before, because a foot strike earlier than the leg lift is not a
 * detection — it is a failure that would otherwise be stored as data.
 */
export function detectCheckpoints(
  samples: PoseSample[],
  hand: Handedness
): DetectedCheckpoints {
  const usable = usableSamples(samples);
  const none: DetectedCheckpoints = {
    firstMovement: null,
    maxLegLift: null,
    footStrike: null,
    release: null,
  };
  if (usable.length < 5) return none;

  const leadKnee = hand === "right" ? POSE_INDEX.leftKnee : POSE_INDEX.rightKnee;
  const leadAnkle = hand === "right" ? POSE_INDEX.leftAnkle : POSE_INDEX.rightAnkle;
  const throwWrist = hand === "right" ? POSE_INDEX.rightWrist : POSE_INDEX.leftWrist;

  // --- first movement: the first frame the lead knee leaves where it started.
  const startKnee = at(usable[0], leadKnee);
  let firstMovement: number | null = null;
  if (startKnee) {
    for (const sample of usable) {
      const knee = at(sample, leadKnee);
      if (!knee) continue;
      if (Math.hypot(knee.x - startKnee.x, knee.y - startKnee.y) > MOVEMENT_THRESHOLD) {
        firstMovement = sample.timeSeconds;
        break;
      }
    }
  }

  // --- max leg lift: the highest the lead knee gets. Screen y grows downward,
  // so the highest knee is the smallest y.
  let maxLegLift: number | null = null;
  let highest = Infinity;
  for (const sample of usable) {
    const knee = at(sample, leadKnee);
    if (!knee || knee.y >= highest) continue;
    highest = knee.y;
    maxLegLift = sample.timeSeconds;
  }

  // --- foot strike: after the lift, the first frame where the lead ankle has
  // both come down and stopped. Landing is the ankle's motion ending, which is
  // more robust than looking for its lowest point — the ankle often rolls
  // slightly lower afterwards.
  let footStrike: number | null = null;
  const afterLift = usable.filter((s) => maxLegLift === null || s.timeSeconds > maxLegLift);
  const ankleLows = afterLift
    .map((s) => at(s, leadAnkle)?.y)
    .filter((y): y is number => y !== undefined);
  if (ankleLows.length > 2) {
    const lowest = Math.max(...ankleLows);
    for (let i = 1; i < afterLift.length; i += 1) {
      const now = at(afterLift[i], leadAnkle);
      const before = at(afterLift[i - 1], leadAnkle);
      const dt = afterLift[i].timeSeconds - afterLift[i - 1].timeSeconds;
      if (!now || !before || dt <= 0) continue;
      const speed = Math.hypot(now.x - before.x, now.y - before.y) / dt;
      // Down where the foot ends up, and no longer travelling.
      if (now.y >= lowest - 0.03 && speed < 0.35) {
        footStrike = afterLift[i].timeSeconds;
        break;
      }
    }
  }

  // --- release: the throwing wrist's fastest frame, after foot strike.
  let release: number | null = null;
  const afterStrike = usable.filter((s) => footStrike === null || s.timeSeconds >= footStrike);
  let fastest = 0;
  for (let i = 1; i < afterStrike.length; i += 1) {
    const now = at(afterStrike[i], throwWrist);
    const before = at(afterStrike[i - 1], throwWrist);
    const dt = afterStrike[i].timeSeconds - afterStrike[i - 1].timeSeconds;
    if (!now || !before || dt <= 0) continue;
    const speed = Math.hypot(now.x - before.x, now.y - before.y) / dt;
    if (speed > fastest) {
      fastest = speed;
      release = afterStrike[i].timeSeconds;
    }
  }

  return enforceOrder({ firstMovement, maxLegLift, footStrike, release });
}

/**
 * Drop any checkpoint that does not fall after the one before it.
 *
 * A delivery happens in one order. A detection that violates it is not a
 * slightly-wrong answer, it is a failed one, and keeping it would put the
 * angles at the wrong instant with nothing downstream able to tell.
 */
export function enforceOrder(found: DetectedCheckpoints): DetectedCheckpoints {
  const order: (keyof DetectedCheckpoints)[] = [
    "firstMovement",
    "maxLegLift",
    "footStrike",
    "release",
  ];
  const out: DetectedCheckpoints = { ...found };
  let previous = -Infinity;
  for (const key of order) {
    const value = out[key];
    if (value === null) continue;
    if (value <= previous) out[key] = null;
    else previous = value;
  }
  return out;
}

// --- Saying what happened ----------------------------------------------------

export interface SequenceReading {
  view: KinematicView | null;
  hand: Handedness | null;
  checkpoints: DetectedCheckpoints;
  /** Frames that carried a usable body, out of those sampled. */
  usable: number;
  sampled: number;
}

export function readSequence(samples: PoseSample[]): SequenceReading {
  const view = inferView(samples);
  const hand = inferHandedness(samples);
  return {
    view,
    hand,
    // Without a confident throwing arm the checkpoints cannot be found either:
    // every one of them is defined relative to the lead leg or throwing hand.
    checkpoints: hand
      ? detectCheckpoints(samples, hand)
      : { firstMovement: null, maxLegLift: null, footStrike: null, release: null },
    usable: usableSamples(samples).length,
    sampled: samples.length,
  };
}

const CHECKPOINT_NAMES: Record<keyof DetectedCheckpoints, string> = {
  firstMovement: "first movement",
  maxLegLift: "max leg lift",
  footStrike: "foot strike",
  release: "ball release",
};

/** What the clip gave up, in words, including what it did not. */
export function sequenceSummary(reading: SequenceReading): string {
  if (reading.usable < 5) {
    return "Could not find a body in enough of this clip. Make sure the whole delivery is in shot, then try again — or place the points yourself.";
  }
  if (!reading.hand) {
    return "Could not tell which arm is throwing from this clip, so the checkpoints were not placed. Set the throwing arm and try again.";
  }

  const missing = (Object.keys(CHECKPOINT_NAMES) as (keyof DetectedCheckpoints)[]).filter(
    (key) => reading.checkpoints[key] === null
  );
  const found = 4 - missing.length;
  const view = reading.view === "front" ? "front-on" : "side-on";

  if (missing.length === 0) {
    return `Read a ${view} delivery from a ${reading.hand}-hander and placed all four checkpoints. Check each one and adjust anything that looks wrong.`;
  }
  return `Read a ${view} delivery from a ${reading.hand}-hander and placed ${found} of 4 checkpoints. Could not find ${missing
    .map((key) => CHECKPOINT_NAMES[key])
    .join(" or ")} — scrub to those yourself rather than trusting a guess.`;
}
