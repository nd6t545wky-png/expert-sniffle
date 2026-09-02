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
 * ## Where they go
 *
 * On the weekdays the coach wrote them for. The capture dates are the
 * placement, not trivia — 29 January 2025 was a Wednesday, 13 February a
 * Thursday, 17 January a Friday — and each session belongs to a kind of day:
 *
 *   Wednesday   scapular, serratus and grip    the high-intent throwing day
 *   Friday      posterior chain and serratus   the primer before Saturday
 *
 * The third is placed by rule rather than by weekday, because the coach wrote
 * a rule for it: "designed to be done on a low workload throwing day". It was
 * captured on a Thursday, but Thursday is not the instruction — so it goes on
 * every low-workload throwing day the week has, which in the winter block is
 * Monday and Thursday, both recovery catch at 50–60%.
 *
 * `programmeUpdates.ts` rewrites that day's existing arm-care task rather than
 * adding beside it. Every day already carries a post-throw arm-care circuit; a
 * second circuit next to it is not twice the stimulus, it is one session the
 * athlete gives up on halfway through.
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
 * Two of them, and the dates they were captured on are the placement rather
 * than trivia: 29 January 2025 was a Wednesday and 17 January a Friday. They
 * are not two versions of one session to rotate through — one belongs to the
 * high-intent day and the other to the primer before a game.
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
 * after throwing at the athlete's preference. It was captured on a Thursday,
 * and Thursday in this programme is "Recovery + Aerobic Restore" — so the
 * instruction and the calendar agree without anything being forced.
 *
 * Nine items, all soft tissue or range, all of it aimed at the throwing side
 * and the shoulder girdle around it.
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

/**
 * The mobility programme as a session, so all three days carry one shape.
 *
 * It is nine straight items with no supersets, which the superset list being
 * empty says exactly.
 */
export const MOBILITY_SESSION: TreadSession = Object.freeze({
  id: "tread-mobility",
  title: "Recovery and mobility",
  capturedOn: "2025-02-13" as IsoDate,
  opener: [...MOBILITY_PROGRAM],
  supersets: [],
});

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
 * The two scapular sessions, pinned to the weekday each was captured on.
 *
 * Day 0 is Monday, matching the rest of the app. These two stay pinned because
 * the day is the point: one was written for the high-intent throwing day and
 * the other for the primer before a game, and neither belongs anywhere else.
 */
const SCAP_BY_WEEKDAY: Readonly<Record<number, TreadSession>> = Object.freeze({
  2: SCAP_SESSIONS[0], // Wednesday — captured 29 Jan 2025
  4: SCAP_SESSIONS[1], // Friday — captured 17 Jan 2025
});

/**
 * Effort written as a percentage — "50–60% effort", "about 50%".
 *
 * The top of a range is what counts. A day written 50–60% is a 60% day for the
 * purpose of deciding whether it is easy.
 */
const EFFORT = /(\d{2,3})\s*(?:[–—-]\s*(\d{2,3}))?\s*%/g;

/** The ceiling for "low workload". Above this the day is not an easy one. */
export const LOW_WORKLOAD_EFFORT = 60;

/** Stages whose prescriptions describe the day's throwing. */
const THROWING_STAGES = new Set(["Throw", "High-Intent Prep", "Game Warm-up", "Compete", "Team Throwing"]);

/** Work that rules a day out however gently the catch-play is written. */
const NOT_EASY = /pulldown|game appearance|bullpen|compete|max.?effort|run.?and.?gun/i;

/**
 * Is this a low-workload throwing day, in the coach's sense?
 *
 * His instruction on the mobility programme is "designed to be done on a low
 * workload throwing day" — so that, and not the weekday it happened to be
 * screenshotted on, is where it belongs. Read off the session's own throwing
 * prescriptions: there has to *be* throwing, the hardest of it has to sit at
 * or under 60% effort, and nothing on the day can be a pulldown set, a bullpen
 * or a game.
 *
 * A day whose throwing carries no percentage at all is not assumed easy. Most
 * of those are games.
 */
export function isLowWorkloadThrowingDay(
  tasks: readonly { stageTitle?: unknown; name?: unknown; prescription?: unknown }[]
): boolean {
  const throwing = tasks.filter((task) => THROWING_STAGES.has(String(task.stageTitle)));
  if (throwing.length === 0) return false;

  const text = throwing.map((task) => `${String(task.name)} ${String(task.prescription)}`).join(" | ");
  if (NOT_EASY.test(text)) return false;

  let hardest = 0;
  for (const match of text.matchAll(EFFORT)) {
    hardest = Math.max(hardest, Number(match[2] ?? match[1]));
  }
  return hardest > 0 && hardest <= LOW_WORKLOAD_EFFORT;
}

/**
 * The session this day gets, or null where the coach programmed none.
 *
 * The two scapular sessions go by weekday. The mobility programme goes by the
 * coach's own rule instead — any low-workload throwing day that is not already
 * carrying a scapular session. That is why Monday gets it as well as Thursday:
 * both are recovery catch at 50–60%, and the programme note does not say
 * "Thursday", it says "a low workload throwing day".
 *
 * Null rather than a fallback: a day with no session keeps whatever the app
 * already prescribed, which is the honest answer to "what does the coach want
 * here" when nobody knows.
 */
export function armCareForDay(
  day: number | null,
  tasks: readonly { stageTitle?: unknown; name?: unknown; prescription?: unknown }[] = []
): TreadSession | null {
  // A day outside the week is not a day. Without the range check a nonsense
  // index fell past the pins and collected a session from the low-workload
  // rule, which would have put arm care on a day that does not exist.
  if (day === null || !Number.isInteger(day) || day < 0 || day > 6) return null;

  // Nothing was captured on a game day, and the weekday pins must not put one
  // there by accident. In the summer block Friday is a game rather than the
  // primer it is in winter, and without this the Friday pin dropped a
  // wall-angel and serratus session onto game day.
  if (isGameDay(tasks)) return null;

  const scap = SCAP_BY_WEEKDAY[day];
  if (scap) return scap;
  return isLowWorkloadThrowingDay(tasks) ? MOBILITY_SESSION : null;
}

/** A day the athlete competes on, whatever the weekday says. */
export function isGameDay(
  tasks: readonly { stageTitle?: unknown }[]
): boolean {
  return tasks.some((task) => String(task.stageTitle) === "Compete");
}

/** Total movements in a session, for a plan that wants to say how big it is. */
export function movementCount(session: TreadSession): number {
  return (
    session.opener.length +
    session.supersets.reduce((total, superset) => total + superset.exercises.length, 0)
  );
}
