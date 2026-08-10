import { MechanicsAnalysis } from "./api";
import { PLYO_EVIDENCE_NOTE } from "./programmeUpdates";

/**
 * Turning a movement screen into work.
 *
 * A screen that returns six numbers and stops is a report, not a training
 * tool. This maps each rated quality onto drills that address it, and builds
 * an ordered routine from the ones actually rated low.
 *
 * Three rules keep it honest:
 *
 *  1. Nothing is prescribed from a metric that was not rated. A rear-view
 *     capture cannot see sequencing or arm timing, and the screen returns
 *     null for those — "not assessed" is reported as not assessed, never
 *     silently treated as fine.
 *  2. Nothing is prescribed at all when the capture was not analyzable.
 *  3. At most two priorities. A list of eighteen drills is not a plan, and
 *     an athlete given everything will do none of it.
 *
 * This remains a qualitative screen from phone video, not laboratory
 * biomechanics. The drills are conventional coaching work, offered for a
 * coach to confirm — not a diagnosis and not a substitute for one.
 */

export type MetricKey =
  | "sequence"
  | "lowerHalf"
  | "trunk"
  | "armTiming"
  | "release"
  | "deceleration";

export const METRIC_LABELS: Record<MetricKey, string> = {
  sequence: "Sequencing",
  lowerHalf: "Lower half",
  trunk: "Trunk",
  armTiming: "Arm timing",
  release: "Release",
  deceleration: "Deceleration",
};

export const METRIC_MEANING: Record<MetricKey, string> = {
  sequence: "The order energy travels — legs, then pelvis, then trunk, then arm.",
  lowerHalf: "Drive into the ground and how firmly the lead leg blocks.",
  trunk: "Posture and rotation between pelvis and shoulders.",
  armTiming: "Whether the arm arrives on time with the trunk rather than early or late.",
  release: "Extension and direction at the point the ball leaves the hand.",
  deceleration: "How the arm is slowed after release.",
};

/** The order the screen's own ratings are read out of the analysis. */
const METRIC_FIELDS: Record<MetricKey, keyof MechanicsAnalysis> = {
  sequence: "sequenceRating",
  lowerHalf: "lowerHalfRating",
  trunk: "trunkRating",
  armTiming: "armTimingRating",
  release: "releaseRating",
  deceleration: "decelerationRating",
};


/**
 * Delivery checkpoints.
 *
 * Borrowed in structure from the Mustard app's analysis approach (Tom House /
 * NPA), which reads a delivery at four still frames rather than as one
 * continuous blur: first movement, max leg lift, foot strike and ball
 * release. It is a good frame for an athlete because it turns "your
 * sequencing is a 2" into "here is the moment it goes wrong".
 *
 * This is the structure only. It is not Tom House's programme, does not
 * reproduce Mustard's model, and the drills below are conventional coaching
 * work rather than his prescriptions.
 */
export type Checkpoint = "firstMovement" | "maxLegLift" | "footStrike" | "release";

export const CHECKPOINTS: { key: Checkpoint; label: string; look: string }[] = [
  {
    key: "firstMovement",
    label: "First movement",
    look: "How the delivery starts — direction and whether the move is gathered or rushed.",
  },
  {
    key: "maxLegLift",
    label: "Max leg lift",
    look: "Balance and posture at the top, and whether the hips are ready to lead.",
  },
  {
    key: "footStrike",
    label: "Foot strike",
    look: "Landing direction, lead-leg block, and where the trunk and arm are when the foot lands.",
  },
  {
    key: "release",
    label: "Ball release",
    look: "Extension, direction and how the arm is slowed afterwards.",
  },
];

/** Which checkpoint each rated quality is judged at. */
export const METRIC_CHECKPOINT: Record<MetricKey, Checkpoint> = {
  sequence: "footStrike",
  lowerHalf: "maxLegLift",
  trunk: "footStrike",
  armTiming: "footStrike",
  release: "release",
  deceleration: "release",
};

/**
 * A single camera cannot see a whole delivery. Mustard asks for a front and a
 * side view and tells you a single view gives you about half the variables;
 * this screen already returns null for what an angle cannot judge, and this
 * makes the same point before the capture rather than after it.
 */
export const ANGLE_COVERAGE: Record<string, { label: string; covers: MetricKey[]; note: string }> = {
  open_side: {
    label: "Open side",
    covers: ["sequence", "lowerHalf", "trunk", "armTiming", "release", "deceleration"],
    note: "Sees the most of the delivery. Best single angle if you only shoot one.",
  },
  rear: {
    label: "Rear",
    covers: ["lowerHalf", "trunk", "release", "deceleration"],
    note: "Cannot judge sequencing or arm timing — those come back unrated rather than assumed good.",
  },
  dual: {
    label: "Dual view",
    covers: ["sequence", "lowerHalf", "trunk", "armTiming", "release", "deceleration"],
    note: "Two angles together. The most complete screen, and what to use before changing anything.",
  },
};

export interface Drill {
  id: string;
  name: string;
  targets: MetricKey[];
  prescription: string;
  /** What the athlete should feel or look for. */
  cue: string;
  /** Why this drill addresses this quality. */
  why: string;
  equipment: string;
  /** Where it belongs in a session. */
  slot: "warm-up" | "pre-throw" | "throwing" | "gym" | "post-throw";
  minutes: number;
  /** Set when the drill uses weighted implements, so the caution travels. */
  weightedBall?: boolean;
}

/**
 * Conventional pitching and strength drills, each mapped to the quality it
 * addresses. Nothing exotic — the point is that the screen's output leads
 * somewhere, not that the drills are novel.
 */
export const DRILL_LIBRARY: Drill[] = [
  // --- sequencing ---------------------------------------------------------
  {
    id: "step-behind-throw",
    name: "Step-behind throw",
    targets: ["sequence", "lowerHalf"],
    prescription: "3 × 5 throws · 60–70% effort",
    cue: "Let the back hip lead. The arm should feel like it is being carried, not driven.",
    why: "Momentum forces the lower half to start the movement, which is the ordering a poor sequence score usually reflects.",
    equipment: "Baseball, throwing lane",
    slot: "throwing",
    minutes: 8,
  },
  {
    id: "med-ball-step-behind",
    name: "Med-ball step-behind rotational throw",
    targets: ["sequence", "trunk"],
    prescription: "3 × 4/side · 2–3 kg",
    cue: "Hips first, then chest, then arms. Stop if the arms start the throw.",
    why: "Loads the same order the delivery needs, without the arm stress of a throw.",
    equipment: "2–3 kg medicine ball, wall",
    slot: "gym",
    minutes: 8,
  },
  {
    id: "hershiser",
    name: "Hershiser drill",
    targets: ["sequence", "trunk"],
    prescription: "2 × 8/side · light band",
    cue: "Hold the front side closed while the hips open. Feel the stretch across the torso.",
    why: "Trains the separation between pelvis and shoulders that a low sequence score often lacks.",
    equipment: "Light resistance band, anchor",
    slot: "pre-throw",
    minutes: 5,
  },

  // --- lower half ---------------------------------------------------------
  {
    id: "lateral-bound-stick",
    name: "Lateral bound to stick",
    targets: ["lowerHalf"],
    prescription: "3 × 3/side · full recovery",
    cue: "Land and freeze. If you have to hop to balance, shorten the bound.",
    why: "Builds the lateral drive and the ability to accept it on one leg, which is what the lead-leg block asks for.",
    equipment: "Open space, non-slip surface",
    slot: "gym",
    minutes: 8,
  },
  {
    id: "wall-hip-lead",
    name: "Wall drill — hip lead",
    targets: ["lowerHalf", "sequence"],
    prescription: "2 × 8/side · no ball",
    cue: "Back pocket to the target first. The shoulders stay quiet.",
    why: "Isolates the direction the pelvis travels before anything else moves.",
    equipment: "Wall",
    slot: "warm-up",
    minutes: 5,
  },
  {
    id: "lead-leg-iso",
    name: "Lead-leg block isometric",
    targets: ["lowerHalf"],
    prescription: "3 × 20 s/side · split stance against a wall",
    cue: "Push the floor away and hold. Nothing should collapse.",
    why: "A soft front leg bleeds energy that should transfer up the chain; isometrics build the position under load.",
    equipment: "Wall or rack",
    slot: "gym",
    minutes: 6,
  },

  // --- trunk --------------------------------------------------------------
  {
    id: "half-kneeling-rotational-throw",
    name: "Half-kneeling rotational med-ball throw",
    targets: ["trunk"],
    prescription: "3 × 5/side · 2 kg",
    cue: "Rotate through the ribs, not the lower back. Hips stay square.",
    why: "Takes the legs out so the trunk has to produce the rotation itself.",
    equipment: "2 kg medicine ball, wall, pad",
    slot: "gym",
    minutes: 7,
  },
  {
    id: "pallof-press",
    name: "Pallof press",
    targets: ["trunk"],
    prescription: "3 × 8/side · 2 s hold",
    cue: "Resist the rotation rather than creating it. Ribs down.",
    why: "Anti-rotation strength is what lets the trunk hold posture while the pelvis turns underneath it.",
    equipment: "Cable or band",
    slot: "gym",
    minutes: 6,
  },
  {
    id: "dead-bug",
    name: "Dead bug",
    targets: ["trunk"],
    prescription: "3 × 6/side · slow",
    cue: "Lower back stays flat on the floor throughout. Stop the set when it lifts.",
    why: "Addresses the extension posture that shows up as a low trunk score under fatigue.",
    equipment: "Mat",
    slot: "warm-up",
    minutes: 5,
  },

  // --- arm timing ---------------------------------------------------------
  {
    id: "towel-drill",
    name: "Towel drill",
    targets: ["armTiming", "sequence"],
    prescription: "3 × 6 · no ball",
    cue: "The towel should snap after the front foot lands, not before.",
    why: "Rehearses the arm arriving on time without loading the elbow, which is the safest way to change timing.",
    equipment: "Hand towel, target",
    slot: "pre-throw",
    minutes: 6,
  },
  {
    id: "pivot-pickoff",
    name: "Pivot pickoff",
    targets: ["armTiming"],
    prescription: "2 × 5/side · 50–60% effort",
    cue: "Quick and connected. The arm and trunk move together.",
    why: "A short, repeatable movement that exposes an arm arriving late without a full delivery's variables.",
    equipment: "Baseball or plyo ball, net",
    slot: "throwing",
    minutes: 6,
    weightedBall: true,
  },
  {
    id: "wall-er-timing",
    name: "Wall external-rotation hold",
    targets: ["armTiming", "deceleration"],
    prescription: "2 × 20 s/side",
    cue: "Elbow at shoulder height, forearm vertical, shoulder blade set.",
    why: "Builds tolerance in the position the arm passes through when timing is late.",
    equipment: "Wall",
    slot: "warm-up",
    minutes: 4,
  },

  // --- release ------------------------------------------------------------
  {
    id: "kneeling-target-throw",
    name: "Half-kneeling target throw",
    targets: ["release"],
    prescription: "3 × 8 · 40–50% effort · 12–15 ft to a target",
    cue: "Finish through the target. Same release point every rep.",
    why: "Removes the lower half so direction and release are the only variables.",
    equipment: "Baseball, net with a marked target",
    slot: "throwing",
    minutes: 8,
  },
  {
    id: "roll-in-throw",
    name: "Roll-in throw",
    targets: ["release", "lowerHalf"],
    prescription: "2 × 5 · 60% effort",
    cue: "Organise the lead leg first, then throw through the target.",
    why: "Links the block to the release, which is where extension is usually lost.",
    equipment: "Plyo ball, wall or net",
    slot: "throwing",
    minutes: 6,
    weightedBall: true,
  },
  {
    id: "bullseye-command",
    name: "Target command set",
    targets: ["release"],
    prescription: "20 throws · 60–70% · one target per throw",
    cue: "Reset rather than rushing a miss. Direction beats effort here.",
    why: "Release consistency is a repetition problem before it is a mechanics problem.",
    equipment: "Baseball, marked target",
    slot: "throwing",
    minutes: 10,
  },

  // --- deceleration -------------------------------------------------------
  {
    id: "eccentric-er",
    name: "Eccentric external rotation",
    targets: ["deceleration"],
    prescription: "3 × 8/side · 4 s lowering",
    cue: "Slow on the way down. The lowering is the whole exercise.",
    why: "The arm is slowed eccentrically after release; eccentric loading is what builds that capacity.",
    equipment: "Light band or dumbbell",
    slot: "post-throw",
    minutes: 6,
  },
  {
    id: "prone-horizontal-abduction",
    name: "Prone horizontal abduction",
    targets: ["deceleration"],
    prescription: "2 × 12/side · light",
    cue: "Thumb up, lift to shoulder height, no shrug.",
    why: "Targets the posterior cuff and scapular muscles that absorb the follow-through.",
    equipment: "Bench, light dumbbells",
    slot: "post-throw",
    minutes: 5,
  },
  {
    id: "rhythmic-stabilisation",
    name: "Rhythmic stabilisation",
    targets: ["deceleration", "armTiming"],
    prescription: "2 × 20 s/side · partner or band perturbation",
    cue: "Hold the position while the load changes direction. Small, quick corrections.",
    why: "Trains the reflexive control that keeps the shoulder centred during deceleration.",
    equipment: "Partner or band",
    slot: "post-throw",
    minutes: 5,
  },
];

export interface MetricScore {
  key: MetricKey;
  label: string;
  meaning: string;
  /** Null when the screen could not rate it from this capture. */
  rating: number | null;
  /** Screen's own reason a metric is unrated, when it is. */
  status: "priority" | "monitor" | "strength" | "not-assessed";
}

export interface RoutineBlock {
  metric: MetricKey;
  label: string;
  rating: number;
  /** The delivery frame this quality is judged at. */
  checkpoint: { key: Checkpoint; label: string; look: string };
  drills: Drill[];
}

export interface Routine {
  /** False when the capture could not be analysed at all. */
  available: boolean;
  reason?: string;
  scores: MetricScore[];
  blocks: RoutineBlock[];
  minutes: number;
  /** True when any prescribed drill uses a weighted implement. */
  usesWeightedBalls: boolean;
  weightedBallNote?: string;
}

/** Below this the screen is telling you to work on it. */
const PRIORITY_AT_OR_BELOW = 2;
const MONITOR_AT = 3;
/** More than this and it stops being a plan. */
const MAX_PRIORITIES = 2;
const MAX_DRILLS_PER_METRIC = 3;

export function readScores(analysis: MechanicsAnalysis): MetricScore[] {
  return (Object.keys(METRIC_LABELS) as MetricKey[]).map((key) => {
    const raw = analysis[METRIC_FIELDS[key]];
    const rating = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    return {
      key,
      label: METRIC_LABELS[key],
      meaning: METRIC_MEANING[key],
      rating,
      status:
        rating === null
          ? "not-assessed"
          : rating <= PRIORITY_AT_OR_BELOW
            ? "priority"
            : rating === MONITOR_AT
              ? "monitor"
              : "strength",
    };
  });
}

export function drillsFor(metric: MetricKey): Drill[] {
  return DRILL_LIBRARY.filter((drill) => drill.targets.includes(metric));
}

/**
 * Build the routine.
 *
 * Priorities are taken worst-first. If nothing is below the threshold but
 * something sits at the monitor mark, that becomes the single focus — a
 * screen with no glaring fault still deserves an answer to "so what do I do".
 */
export function prescribeRoutine(analysis: MechanicsAnalysis | null): Routine {
  if (!analysis) {
    return { available: false, reason: "No screen has been run yet.", scores: [], blocks: [], minutes: 0, usesWeightedBalls: false };
  }

  const scores = readScores(analysis);

  if (!analysis.analyzable) {
    return {
      available: false,
      reason:
        analysis.captureQuality?.blockers?.length
          ? `The capture could not be analysed: ${analysis.captureQuality.blockers.join("; ")}`
          : "The capture could not be analysed, so nothing has been rated and nothing is prescribed.",
      scores,
      blocks: [],
      minutes: 0,
      usesWeightedBalls: false,
    };
  }

  const rated = scores.filter((score) => score.rating !== null);
  if (rated.length === 0) {
    return {
      available: false,
      reason: "This camera angle could not rate any quality. Re-shoot from the open side for a full screen.",
      scores,
      blocks: [],
      minutes: 0,
      usesWeightedBalls: false,
    };
  }

  const candidates = rated
    .filter((score) => score.status === "priority")
    .sort((a, b) => (a.rating as number) - (b.rating as number));

  const chosen = candidates.length
    ? candidates.slice(0, MAX_PRIORITIES)
    : rated.filter((score) => score.status === "monitor").sort((a, b) => (a.rating as number) - (b.rating as number)).slice(0, 1);

  const blocks: RoutineBlock[] = chosen.map((score) => ({
    metric: score.key,
    label: score.label,
    rating: score.rating as number,
    checkpoint:
      CHECKPOINTS.find((item) => item.key === METRIC_CHECKPOINT[score.key]) ?? CHECKPOINTS[0],
    drills: drillsFor(score.key).slice(0, MAX_DRILLS_PER_METRIC),
  }));

  const drills = blocks.flatMap((block) => block.drills);
  const usesWeightedBalls = drills.some((drill) => drill.weightedBall);

  return {
    available: blocks.length > 0,
    reason: blocks.length ? undefined : "Every rated quality scored 4 or better — nothing needs remediation from this screen.",
    scores,
    blocks,
    minutes: drills.reduce((total, drill) => total + drill.minutes, 0),
    usesWeightedBalls,
    weightedBallNote: usesWeightedBalls ? PLYO_EVIDENCE_NOTE : undefined,
  };
}

/** Session order for the routine, so it can be followed top to bottom. */
export const SLOT_ORDER: Drill["slot"][] = ["warm-up", "pre-throw", "throwing", "gym", "post-throw"];

export const SLOT_LABELS: Record<Drill["slot"], string> = {
  "warm-up": "Warm-up",
  "pre-throw": "Before throwing",
  throwing: "Throwing",
  gym: "Gym",
  "post-throw": "After throwing",
};

/** The whole routine flattened into the order it should actually be done. */
export function routineInOrder(routine: Routine): { slot: Drill["slot"]; label: string; drills: Drill[] }[] {
  const seen = new Set<string>();
  const drills = routine.blocks.flatMap((block) => block.drills).filter((drill) => {
    if (seen.has(drill.id)) return false;
    seen.add(drill.id);
    return true;
  });

  return SLOT_ORDER.map((slot) => ({
    slot,
    label: SLOT_LABELS[slot],
    drills: drills.filter((drill) => drill.slot === slot),
  })).filter((group) => group.drills.length > 0);
}
