import { IsoDate } from "./state";
import { LoggedSet, readDayLog } from "./setLog";
import { SessionTask } from "./programmeSessions";

/**
 * What you lifted last time, and whether to put more on the bar.
 *
 * The app has recorded sets since the set logger went in, and then never
 * showed them again on the screen where they would change a decision. Standing
 * in front of a rack, the question is not "what is my e1RM trend" — it is
 * "what did I do last Monday, and should today be heavier". That needs the
 * previous performance beside the prescription, and a verdict rather than a
 * chart.
 *
 * ## The one distinction that matters
 *
 * Two kinds of lift are prescribed here and they take opposite advice:
 *
 *  - **Percentage-driven.** "3 × 4 @ 120 kg · 83% of tested max" — the load is
 *    the block's, computed from tested strength. Adding 2.5 kg because last
 *    week felt easy is not progression, it is opting out of the periodisation;
 *    the load moves when the block moves it, and rises for real when the max is
 *    retested. So the advice here is a *comparison*, never an instruction to
 *    add weight.
 *  - **Self-selected.** "3 × 5 @ RPE 7", "3 × 5/leg @ RPE 7 · 24–28 kg
 *    dumbbells as tolerated" — the programme names an effort and leaves the
 *    load to the athlete. This is where progression advice belongs, and where
 *    its absence meant the same dumbbells came off the rack for months.
 *
 * Conflating the two would either freeze the accessories or quietly dismantle
 * the squat block, so the verdicts are kept separate.
 *
 * ## The rule for the self-selected lifts
 *
 * Double progression, which is the ordinary answer: hold the load until every
 * prescribed set reaches the top of the prescribed rep range, then add the
 * smallest useful increment. It is conservative by construction — it cannot
 * advance on a single good set — and it is the rule most likely to match what
 * a coach standing there would say.
 */

// --- Reading the prescription ------------------------------------------------

const SETS_REPS = /(\d+)\s*×\s*(\d+)/;
/**
 * The load, in either shape the programme writes it.
 *
 * "@ 120 kg" states the load; "suggested start 50–52.5 kg" and "24–28 kg
 * dumbbells as tolerated" offer one without the "@". Matching only the first
 * form left every accessory looking loadless, which is precisely the set of
 * lifts this feature exists for. A range opens at its bottom, as ranges do
 * everywhere else in the app.
 */
const TARGET_KG = /(?:@\s*)?(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*kg/i;
const PERCENT_OF_MAX = /%\s*of\s*tested/i;
const RPE = /RPE/i;
const PER_SIDE = /\/\s*(?:leg|side|arm|hand)/i;
const BODYWEIGHT = /bodyweight|\bbw\b/i;

export interface PrescribedShape {
  sets: number;
  reps: number;
  /** The bottom of the prescribed load, where one is named. */
  kg: number | null;
  /** True where the load is the block's rather than the athlete's. */
  fixedLoad: boolean;
  perSide: boolean;
  bodyweight: boolean;
}

export function prescribedShape(prescription: string): PrescribedShape | null {
  const text = String(prescription ?? "");
  const shape = text.match(SETS_REPS);
  if (!shape) return null;

  const load = text.match(TARGET_KG);
  const kg = load ? Number(load[1]) : null;

  return {
    sets: Number(shape[1]),
    reps: Number(shape[2]),
    kg,
    // A percentage of a tested max is the block's number. So is a bare load
    // with no RPE beside it — "4 × 3 @ 94 kg · every rep maximal intent" is the
    // measured optimal power load, not a suggestion. A load offered *with* an
    // RPE ("24–28 kg dumbbells as tolerated") is a starting point.
    fixedLoad: PERCENT_OF_MAX.test(text) || (kg !== null && !RPE.test(text)),
    perSide: PER_SIDE.test(text),
    bodyweight: BODYWEIGHT.test(text),
  };
}

// --- Finding the last time -----------------------------------------------------

export interface Performance {
  date: IsoDate;
  sets: LoggedSet[];
}

/**
 * Every logged performance of a named lift before a given date, newest first.
 *
 * Matched on the lift's *name*: a task id carries its week and day, so the same
 * back squat is a different id every session and matching on ids would report
 * "no history" forever.
 */
export function liftHistory(
  logs: Record<string, unknown> | undefined,
  taskNames: Record<string, string>,
  name: string,
  before: IsoDate
): Performance[] {
  const out: Performance[] = [];
  for (const date of Object.keys(logs ?? {})) {
    if (date >= before) continue;
    const day = readDayLog(logs, date);
    for (const [taskId, sets] of Object.entries(day)) {
      if (taskNames[taskId] !== name || sets.length === 0) continue;
      out.push({ date: date as IsoDate, sets });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** The load carried through the whole performance — the lightest working set. */
export function workingLoad(sets: LoggedSet[]): number {
  return Math.min(...sets.map((set) => set.kg));
}

/**
 * The fewest reps any set managed.
 *
 * This, and not the heaviest set, is what says whether a load was too much. On
 * a straight-sets prescription every set is at the same weight, so "the
 * heaviest set" is just the first one — and reading its reps meant a session
 * that went 5, 3, 2 looked like a clean five.
 */
export function worstReps(sets: LoggedSet[]): number {
  return Math.min(...sets.map((set) => set.reps));
}

// --- The verdict ---------------------------------------------------------------

export type Verdict = "first_time" | "increase" | "repeat" | "back_off" | "follow_plan";

export interface Advice {
  verdict: Verdict;
  /** One line, imperative, safe to read mid-set. */
  headline: string;
  /** Why the verdict is what it is. */
  reason: string;
  /** Where to set the bar today, where this can say. */
  suggestedKg?: number;
  last?: Performance;
}

/**
 * The smallest increment worth adding, by implement.
 *
 * Dumbbells are checked first because the accessory that names them is also a
 * squat — "Rear-foot-elevated split squat · 24–28 kg dumbbells" — and jumping
 * it 2.5 kg a hand is a 5 kg jump the rack usually cannot make anyway.
 */
const INCREMENTS: { match: RegExp; kg: number; unit: string }[] = [
  { match: /dumbbell|db\b/i, kg: 2, unit: "per hand" },
  { match: /squat|deadlift|hinge|lunge|press|bench|row|pull|chin|carry|raise/i, kg: 2.5, unit: "" },
];

function incrementFor(task: Pick<SessionTask, "name" | "prescription">): { kg: number; unit: string } {
  const text = `${task.name} ${task.prescription}`;
  return INCREMENTS.find((rule) => rule.match.test(text)) ?? { kg: 2.5, unit: "" };
}

function round(value: number, to: number): number {
  return Math.round(value / to) * to;
}

function describe(sets: LoggedSet[]): string {
  return sets.map((set) => `${set.reps}×${set.kg || "bw"}`).join(" · ");
}

/** Whole days between two ISO dates. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * How badly a set has to miss before the answer is "take weight off".
 *
 * Missing the last rep of the last set is an ordinary session and the right
 * response is to repeat the load. Losing a third of the prescribed reps on the
 * heaviest set is a different event, and repeating that load next time is how
 * an athlete spends a month failing the same weight.
 */
const BACK_OFF_SHARE = 0.67;
/** How much comes off when it does. */
const BACK_OFF = 0.9;

export function progressionFor(
  task: Pick<SessionTask, "name" | "prescription">,
  history: Performance[],
  today: IsoDate
): Advice | null {
  const shape = prescribedShape(String(task.prescription));
  if (!shape) return null;

  const last = history[0];

  if (!last) {
    return {
      verdict: "first_time",
      headline: shape.fixedLoad && shape.kg
        ? `First logged session — the plan sets today at ${shape.kg} kg.`
        : "First logged session — pick a load and log it.",
      reason:
        "Nothing logged for this lift yet. Log today's sets and every session after this one opens with what you did last time and whether to move up.",
      ...(shape.kg !== null ? { suggestedKg: shape.kg } : {}),
    };
  }

  const load = workingLoad(last.sets);
  const worst = worstReps(last.sets);
  const ago = daysBetween(last.date, today);
  const when = ago === 1 ? "yesterday" : `${ago} days ago`;
  const did = describe(last.sets);

  // A lift whose load the block owns. The useful thing here is the comparison,
  // never an instruction to add plates on top of the periodisation.
  if (shape.fixedLoad && shape.kg !== null) {
    const step = round(shape.kg - load, 0.5);
    const headline =
      step > 0
        ? `Up ${step} kg on last time — ${load} kg → ${shape.kg} kg.`
        : step < 0
          ? `Lighter than last time by ${Math.abs(step)} kg — that is the block, not a mistake.`
          : `Same load as last time — ${shape.kg} kg.`;
    return {
      verdict: "follow_plan",
      headline,
      reason: `${when} you lifted ${did}. Today's load is set by the block from your tested max, so it moves when the block moves it — the way to make this number bigger is to retest, not to add plates.`,
      suggestedKg: shape.kg,
      last,
    };
  }

  // Self-selected load: double progression.
  const enoughSets = last.sets.length >= shape.sets;
  const allReps = last.sets.every((set) => set.reps >= shape.reps);
  const increment = incrementFor(task);

  if (shape.bodyweight || load === 0) {
    return {
      verdict: allReps && enoughSets ? "increase" : "repeat",
      headline:
        allReps && enoughSets
          ? `Add a rep or slow the tempo — you cleared ${shape.sets} × ${shape.reps}.`
          : `Same again — you are chasing ${shape.sets} × ${shape.reps}.`,
      reason: `${when} you did ${did}. This one carries no external load, so it progresses by reps, tempo or range rather than by weight.`,
      last,
    };
  }

  if (worst < Math.floor(shape.reps * BACK_OFF_SHARE)) {
    const suggested = round(load * BACK_OFF, increment.kg);
    return {
      verdict: "back_off",
      headline: `Drop to ${suggested} kg${increment.unit ? ` ${increment.unit}` : ""}.`,
      reason: `${when} a set came in at ${worst} reps against ${shape.reps} prescribed. That is far enough short that repeating ${load} kg means failing it again — take about 10% off and build back.`,
      suggestedKg: suggested,
      last,
    };
  }

  if (allReps && enoughSets) {
    const suggested = round(load + increment.kg, increment.kg);
    return {
      verdict: "increase",
      headline: `Go up to ${suggested} kg${increment.unit ? ` ${increment.unit}` : ""}.`,
      reason: `${when} you completed ${did} — every set at ${shape.reps} reps or better. That is the signal to add the smallest useful jump, ${increment.kg} kg${increment.unit ? ` ${increment.unit}` : ""}.`,
      suggestedKg: suggested,
      last,
    };
  }

  const missed = last.sets.filter((set) => set.reps < shape.reps).length;
  return {
    verdict: "repeat",
    headline: `Stay at ${load} kg${increment.unit ? ` ${increment.unit}` : ""}.`,
    reason: enoughSets
      ? `${when} you did ${did}, and ${missed} ${missed === 1 ? "set was" : "sets were"} short of ${shape.reps} reps. The load goes up when every set gets there, not before.`
      : `${when} you logged ${last.sets.length} of ${shape.sets} sets. Complete the prescribed sets at this load before adding to it.`,
    suggestedKg: load,
    last,
  };
}

/** Short label for the verdict, for a chip beside the lift. */
export const VERDICT_LABELS: Record<Verdict, string> = {
  first_time: "First time",
  increase: "Go up",
  repeat: "Repeat",
  back_off: "Back off",
  follow_plan: "Follow the plan",
};
