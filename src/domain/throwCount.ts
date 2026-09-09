/**
 * The day's throw count, read off the session instead of typed in twice.
 *
 * Every throwing task in the programme states its own volume — "45–60 total
 * throws", "2 × 5" of a plyo ball, "8 pulldowns" — and the athlete was then
 * asked to add them up in their head and retype the total on the Workload tab.
 * Two records of the same afternoon, kept by hand, in two places. They drifted,
 * and the one that drifted is the one the acute:chronic ratio is built on.
 *
 * So the tick is the record. Completing a throwing task contributes its
 * prescribed volume to the day, and the total is shown on the session screen
 * where the ticking happens.
 *
 * ## The two directions a range is read
 *
 * A prescription like "45–60 total throws · 60–75% effort" carries two ranges
 * and they are read opposite ways, deliberately:
 *
 *  - **Volume opens at the bottom.** 45, not 60. This is the app's convention
 *    for a range everywhere else, and here it has a second reason: the athlete
 *    can see the number on the screen they are already looking at and raise it
 *    in one tap. A default that is too high is a number nobody corrects
 *    downward, because correcting it looks like admitting you did less.
 *  - **Intent takes the top.** 75%, not 60%. What a set costs an arm is set by
 *    its hardest throws, not its average one. Reading intent at the bottom of
 *    the range would file a set that finished at 75% as recovery work.
 *
 * ## What counts as a throw
 *
 * Baseball throws, from the three stages that produce them: the throwing
 * stages, the plyo-ball ladder (weighted baseballs, thrown), and a logged game
 * appearance. Medicine-ball work is not here — a scoop toss is a gym exercise
 * that happens to be thrown, it loads the trunk rather than the elbow, and
 * counting it would put a lower-body power drill into an arm workload figure.
 *
 * Nothing here writes anything. It produces a tally; whether that tally is
 * adopted is the caller's decision, and an entry the athlete typed themselves
 * is never overwritten by one of these.
 */

import { Game } from "./gameLog";
import { SessionTask } from "./programmeSessions";
import { INTENT_PERCENT } from "./recoveryProtocol";
import { ThrowIntent } from "./session";

/** Stages whose tasks put a baseball through the air. */
const THROWING_STAGE = /^(throw|team throwing|plyo ball preparation)$/i;

/**
 * Throwing work that states a volume this can read.
 *
 * A game appearance is deliberately not one of them: "Team pitch/inning limits
 * apply" is the honest prescription for an appearance whose length nobody knows
 * in advance, and the pitch count comes from the game log once it exists.
 */
/**
 * A stated count, allowing the adjectives the programme puts in front of the
 * noun — "10 *measured* throws", "6–8 *high-quality* pulldowns", "25–40 *pitch*
 * bullpen". Two words at most, so a number early in one clause cannot reach
 * across a separator and claim a noun belonging to the next.
 */
const TOTAL_THROWS =
  /(\d+)(?:\s*[–—-]\s*(\d+))?((?:\s+[a-z][a-z-]*){0,2})\s+(?:total\s+)?(?:throws?|pitch(?:es)?|pulldowns?)\b/i;
const SETS_REPS = /(\d+)\s*×\s*(\d+)/;
/** An effort figure, as either "65–75%" or "about 50%". */
const EFFORT = /(\d+)\s*(?:[–—-]\s*(\d+)\s*)?%/;

/** The intent words, hardest first. */
const BANDS: readonly ThrowIntent[] = Object.freeze(["high", "moderate", "low", "recovery"]);

/**
 * The intent word a stated effort percentage belongs to.
 *
 * Nearest published value, not a threshold. `INTENT_PERCENT` holds the single
 * number each word is *prescribed at* — 40, 60, 75, 95 — and reading those as
 * lower bounds files a 90% throw as moderate and a 70% one as low, because
 * both sit just under the next figure up. `velocity.ts` makes the same choice
 * for its own four bands, and for the same reason.
 *
 * A tie resolves *down*, which is the one place this differs from rounding:
 * 50% is ten points from both recovery and low, and calling it low on the
 * strength of a rounding rule would inflate an arm-workload figure by fiat.
 *
 * Measured against the athlete's own reading of the words where they have
 * edited it, because that setting exists precisely so "moderate" means what
 * they say it means.
 */
export function intentForPercent(
  percent: number,
  scale: Record<string, number> = INTENT_PERCENT
): ThrowIntent {
  const value = (band: ThrowIntent) => scale[band] ?? INTENT_PERCENT[band];
  // Ascending, so the first band at the minimum distance is the lowest one —
  // which is the downward tie-break.
  return [...BANDS]
    .reverse()
    .reduce((best, band) =>
      Math.abs(percent - value(band)) < Math.abs(percent - value(best)) ? band : best
    );
}

/** True when this task is throwing work at all. */
export function isThrowingTask(task: Pick<SessionTask, "stageTitle">): boolean {
  return THROWING_STAGE.test(String(task.stageTitle ?? "").trim());
}

/**
 * How many throws this task prescribes, or null when it does not say.
 *
 * Two shapes cover the programme: a plyo ladder writes `sets × reps` and a
 * throwing set writes a count in words. The sets-and-reps form is checked first
 * because a plyo prescription — "2 × 5 · 70% · hybrid B intent" — has no throw
 * noun in it at all, while a throwing set never writes `×`.
 */
export function throwsPrescribed(task: Pick<SessionTask, "stageTitle" | "prescription">): number | null {
  if (!isThrowingTask(task)) return null;
  const text = String(task.prescription ?? "");

  const shape = text.match(SETS_REPS);
  if (shape) return Number(shape[1]) * Number(shape[2]);

  const stated = text.match(TOTAL_THROWS);
  // The bottom of the range — see the note at the top of this file.
  if (stated) return Number(stated[1]);

  return null;
}

/**
 * The intent this task is thrown at.
 *
 * From the stated effort where there is one. Where there is not, the task's own
 * name is the fallback: a pulldown set says "high-intent" in its name and
 * nowhere in its numbers, and a pregame bullpen builds to game intent without
 * ever naming a percentage.
 */
export function intentPrescribed(
  task: Pick<SessionTask, "stageTitle" | "prescription" | "name">,
  scale: Record<string, number> = INTENT_PERCENT
): ThrowIntent | null {
  if (!isThrowingTask(task)) return null;
  const text = String(task.prescription ?? "");
  const name = String(task.name ?? "");

  const effort = text.match(EFFORT);
  // The top of the range — see the note at the top of this file.
  if (effort) return intentForPercent(Number(effort[2] ?? effort[1]), scale);

  if (/pulldown|high[- ]intent|max(?:imal)? intent/i.test(`${name} ${text}`)) return "high";
  if (/bullpen|game/i.test(`${name} ${text}`)) return "moderate";
  return "low";
}

export interface ThrowSource {
  /** Task id, or the game's id for a logged appearance. */
  id: string;
  name: string;
  throws: number;
  intent: ThrowIntent;
}

export interface ThrowTally {
  /** Throws across every completed throwing task and logged game. */
  throws: number;
  /**
   * The hardest intent reached today.
   *
   * Not an average. A day of easy catch play with eight pulldowns in the middle
   * of it is a high-intent day, and averaging would file it as a light one —
   * which is the reading the acute:chronic ratio must not be given.
   */
  intent: ThrowIntent;
  /** What made up the total, so the screen can show its working. */
  sources: ThrowSource[];
  /**
   * Completed throwing tasks whose prescription states no volume.
   *
   * Four exist: a handful of Wednesday pulldown slots carry a week-level note
   * where a dose would go ("Short competitive bullpen; no fatigue chase"). They
   * are real throwing and they contribute nothing to the total, so the screen
   * names them rather than letting the figure quietly read low.
   */
  unread: string[];
}

/**
 * What the day's throwing adds up to, from what has actually been ticked.
 *
 * Completed tasks only. A prescribed session is an intention and this is a
 * record — the same rule the set log runs on, and for the same reason: a
 * workload figure that counts work nobody did is worse than no figure.
 *
 * Games are counted whether or not a task was ticked, because a logged
 * appearance is evidence in its own right and its pitch count is measured
 * rather than prescribed.
 */
export function tallyThrows(
  tasks: readonly Pick<SessionTask, "id" | "name" | "stageTitle" | "prescription">[],
  completed: readonly string[],
  games: readonly Game[] = [],
  scale: Record<string, number> = INTENT_PERCENT
): ThrowTally | null {
  const done = new Set(completed);
  const sources: ThrowSource[] = [];
  const unread: string[] = [];

  for (const task of tasks) {
    if (!done.has(String(task.id))) continue;
    if (!isThrowingTask(task)) continue;
    const throws = throwsPrescribed(task);
    if (throws === null || throws <= 0) {
      unread.push(String(task.name ?? "Throwing"));
      continue;
    }
    sources.push({
      id: String(task.id),
      name: String(task.name ?? "Throwing"),
      throws,
      intent: intentPrescribed(task, scale) ?? "low",
    });
  }

  for (const game of games) {
    const pitches = Number(game.pitches);
    if (!Number.isFinite(pitches) || pitches <= 0) continue;
    sources.push({
      id: game.id,
      name: game.opponent ? `Game vs ${game.opponent}` : "Game appearance",
      throws: Math.round(pitches),
      intent: "high",
    });
  }

  if (!sources.length && !unread.length) return null;

  const throws = sources.reduce((total, source) => total + source.throws, 0);
  const intent =
    BANDS.find((band) => sources.some((source) => source.intent === band)) ?? "low";
  return { throws, intent, sources, unread };
}

// --- Reconciling with what the athlete typed ---------------------------------

/**
 * A day's throwing, as stored.
 *
 * `source` is the whole of the reconciliation. An entry the athlete typed is
 * theirs and is never overwritten by a tally, however out of date the tally
 * thinks it is — the alternative is an app that silently corrects a number the
 * person standing in the bullpen entered on purpose.
 *
 * Entries written before this field existed carry no `source`. They were all
 * typed by hand, which is exactly what an absent value has to mean, so the
 * default is the protective one and no migration is needed.
 */
export interface ThrowingRecord {
  date: string;
  intent: ThrowIntent;
  throws: number;
  source?: "auto" | "manual";
}

export type TallyOutcome =
  /** Store this. */
  | { action: "write"; entry: ThrowingRecord }
  /** Remove the stored entry: it was ours, and there is nothing left to claim. */
  | { action: "clear" }
  /** Leave what is stored alone. */
  | { action: "keep" };

/**
 * What to do with the day's stored throwing entry, given a fresh tally.
 *
 * Called when completion changes, so it runs on every tick and every untick.
 * Unticking the last throwing task of the day clears an entry this wrote,
 * because leaving a stale figure behind would be the same drift the automatic
 * count exists to end — but it will not clear one the athlete typed.
 */
export function adoptTally(
  existing: ThrowingRecord | undefined | null,
  tally: ThrowTally | null,
  date: string
): TallyOutcome {
  const ours = existing == null || existing.source === "auto";
  if (!ours) return { action: "keep" };
  if (!tally || tally.throws <= 0) return existing == null ? { action: "keep" } : { action: "clear" };
  if (existing && existing.throws === tally.throws && existing.intent === tally.intent) {
    return { action: "keep" };
  }
  return {
    action: "write",
    entry: { date, throws: tally.throws, intent: tally.intent, source: "auto" },
  };
}
