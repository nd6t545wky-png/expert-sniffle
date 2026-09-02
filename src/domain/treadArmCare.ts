import { IsoDate } from "./state";

/**
 * The athlete's actual arm-care programme, as his coach wrote it.
 *
 * Everything else in the recovery protocol is derived from the literature and
 * written generically — "7 movements, 2 sets each", "10 min on forearm flexors
 * and lats". That was the right shape while there was nothing better. There is
 * now something better: the three sessions below are transcribed from the
 * athlete's own Tread Athletics programme, with the coach's exercise names and
 * the coach's doses.
 *
 * A named exercise beats a described one for the same reason a named lift beats
 * "a hinge pattern": the athlete has already been taught it, has watched the
 * video, and knows what it should feel like. "Pec Minor Release w/ active ER"
 * is a thing he can do. "10 min soft tissue on the posterior shoulder" is a
 * thing he has to interpret, and interpret differently every time.
 *
 * ## What this replaces
 *
 * These do not sit *alongside* the generic blocks — they take their place. Two
 * scapular circuits on the same day is not twice the stimulus, it is one
 * session the athlete abandons halfway through. The mapping is in
 * `recoveryProtocol.ts`:
 *
 *   - `scap-strength` (day 1)  →  SCAP_SESSIONS, alternating
 *   - `soft-tissue`   (day 2)  →  MOBILITY_PROGRAM
 *
 * ## Two honest gaps
 *
 * The capture of session B starts mid-scroll, so anything the coach programmed
 * above its first superset is not here. And `Posterior Wall Angels` is written
 * `20` in the programme but was logged 12/10/10 — the coach's number is kept,
 * because what the athlete managed on one day is not the prescription.
 */

/** One movement, exactly as the programme names it. */
export interface TreadExercise {
  name: string;
  /** The coach's dose, verbatim. */
  dose: string;
}

/** Movements performed back to back for a given number of rounds. */
export interface TreadSuperset {
  sets: number;
  exercises: TreadExercise[];
}

export interface TreadSession {
  id: string;
  title: string;
  /** The date this was captured from, so the source of every dose is checkable. */
  capturedOn: IsoDate;
  /** Straight sets, done before the supersets. */
  opener: TreadExercise[];
  supersets: TreadSuperset[];
  /** Recorded completion time, where the programme logged one. */
  minutes?: number;
}

/**
 * The scapular and serratus sessions.
 *
 * Two of them, twelve days apart in the source programme, which is what makes
 * them alternating rather than alternatives. Session A is scap-and-grip and
 * runs 27 minutes; session B is posterior-chain and serratus.
 */
export const SCAP_SESSIONS: readonly TreadSession[] = Object.freeze([
  {
    id: "tread-scap-a",
    title: "Scapular, serratus and grip",
    capturedOn: "2025-01-29",
    minutes: 27,
    opener: [
      { name: "Split Stance Flexion Ball Drops", dose: "50–75 reps" },
      { name: "Tripod T Dribbles", dose: "20 seconds" },
    ],
    supersets: [
      {
        sets: 2,
        exercises: [
          { name: "Scap Lifts Off Wall", dose: "15" },
          { name: "90/90 to Y Scap Wall Slides", dose: "max reps" },
          { name: "Pivot Pick (low/mid trap recruitment)", dose: "15" },
        ],
      },
      {
        sets: 2,
        exercises: [
          { name: "Sidelying Serratus Punch with Stability Ball", dose: "20 reps" },
          { name: "Back to Wall Serratus Scoops", dose: "15 reps" },
        ],
      },
      {
        sets: 3,
        exercises: [
          { name: "Fingertip Farmer Carrys", dose: "45–60 seconds" },
          { name: "1st and 2nd Digit / Wrist Flexion", dose: "40 reps" },
        ],
      },
    ],
  },
  {
    id: "tread-scap-b",
    title: "Posterior chain and serratus",
    capturedOn: "2025-01-17",
    opener: [],
    supersets: [
      {
        sets: 3,
        exercises: [
          { name: "Posterior Wall Angels", dose: "20" },
          { name: "Arm Bar Banded External Rotations (abduction)", dose: "12" },
        ],
      },
      {
        sets: 3,
        exercises: [
          { name: "Single Arm Serratus Slides", dose: "15 each" },
          { name: "Tripod Rotations with oscillations, weighted ball", dose: "12 reps with oscillations" },
          { name: "SA Split Stance Serratus Scoops", dose: "15 slow scoops" },
        ],
      },
    ],
  },
]);

/**
 * The recovery and mobility programme.
 *
 * The coach's own instruction: done on a low-workload throwing day, before or
 * after throwing at the athlete's preference. That lands it on day 2 of the
 * protocol, which is already the mobility-and-soft-tissue day, and on day 3,
 * which is the first re-load.
 *
 * Nine items, all soft tissue or range, all of it aimed at the throwing side
 * and the shoulder girdle around it — which is why it moves from the general
 * "Recover" stage into "Arm Care" when it goes onto the plan.
 */
export const MOBILITY_PROGRAM: readonly TreadExercise[] = Object.freeze([
  { name: "T-Spine Levered Extension over Foam Roll", dose: "1–2 minutes" },
  { name: "Thoracic Spine Windmills", dose: "15 reps each direction" },
  { name: "Lat / Triceps Long Head Stretch at Wall", dose: "45 seconds" },
  { name: "Pec Minor Release with active external rotation", dose: "2 minutes" },
  { name: "Single Arm Pec Stretch", dose: "1 minute" },
  { name: "Infraspinatus / Teres Minor Self Mobilisation", dose: "2 minutes" },
  { name: "Biceps Tack and Pump", dose: "2 minutes" },
  { name: "Levator Scap Elongation", dose: "3 seconds each direction" },
  { name: "Foam Roll Levered 90/90 to Y's", dose: "12 slides" },
]);

/** `Name dose`, joined the way the rest of the protocol writes a prescription. */
const list = (exercises: readonly TreadExercise[]): string =>
  exercises.map((exercise) => `${exercise.name} ${exercise.dose}`).join(" · ");

/** A session written out as one prescription line. */
export function describeSession(session: TreadSession): string {
  const parts: string[] = [];
  if (session.opener.length) parts.push(list(session.opener));
  for (const superset of session.supersets) {
    parts.push(`${superset.sets} rounds: ${list(superset.exercises)}`);
  }
  return parts.join(" — ");
}

export function describeMobility(): string {
  return list(MOBILITY_PROGRAM);
}

/**
 * Which scapular session this outing gets.
 *
 * Alternates, so both halves of the programme actually run. Keyed off the
 * outing date rather than a counter: there is no state to keep, the same
 * outing always resolves to the same session, and re-opening a past day shows
 * what was prescribed then rather than what is next in a queue.
 */
export function scapSessionFor(outingDate: IsoDate): TreadSession {
  const days = Math.floor(Date.parse(`${outingDate}T00:00:00Z`) / 86_400_000);
  const index = Number.isFinite(days) ? Math.abs(days) % SCAP_SESSIONS.length : 0;
  return SCAP_SESSIONS[index];
}

/** Total movements in a session, for a plan that wants to say how big it is. */
export function movementCount(session: TreadSession): number {
  return (
    session.opener.length +
    session.supersets.reduce((total, superset) => total + superset.exercises.length, 0)
  );
}
