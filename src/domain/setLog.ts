/**
 * What was actually lifted, set by set.
 *
 * Until now the app recorded that a lift was *done*, never what was done — so
 * every number downstream was really a number about the prescription. The
 * recap card's "volume lifted" was the clearest symptom: drop to 110 kg on a
 * bad day and it still reported 130, because nothing had ever asked.
 *
 * The rule here is the same one the rest of the app runs on: a logged set is
 * evidence, a prescribed set is an intention, and the two are never added
 * together. Tonnage counts logged sets only. A day with nothing logged has no
 * tonnage — not a plausible-looking estimate.
 *
 * The prescription still earns its keep as a *starting point* for the inputs,
 * which is the difference between logging four sets in ten seconds and not
 * bothering.
 */

import { SessionTask } from "./programmeSessions";

export interface LoggedSet {
  /** Repetitions completed in this set. */
  reps: number;
  /** Load in kilograms. Zero is legitimate — bodyweight work. */
  kg: number;
}

/** Logged sets for one task, in the order performed. */
export type TaskSetLog = LoggedSet[];

/** All logging for one date, keyed by task id. */
export type DaySetLog = Record<string, TaskSetLog>;

/**
 * Stages whose work is worth logging as sets and load.
 *
 * "Primer" is in the list because Friday's pre-game primer carries real loaded
 * work — a landmine push press and a band row — and leaving it out meant the
 * one session the athlete asked to keep was the one that could not be logged.
 * Sprint stages are deliberately absent: "3 × 20 m @ 85–90%" has a set×rep
 * shape but no load, and a reps-and-kilograms table is the wrong record for it.
 */
export const LOGGABLE_STAGE = /strength|gym|lift|force|power|primer/i;

/**
 * Movements a reps-and-kilograms table is simply the wrong record for.
 *
 * Same reasoning as the sprint stages above, applied to the drills that sit
 * inside a gym stage rather than beside one. A depth jump is judged on ground
 * contact and a pogo on stiffness; neither has a load to enter, and offering
 * the logger against them produced a progression verdict reading "first logged
 * session — pick a load and log it" on a barefoot jumping drill.
 *
 * Chin-ups are deliberately not here. They carry no load either, but reps
 * against bodyweight are exactly how they progress, and they can be weighted.
 */
const NOT_A_LOADED_LIFT = /pogo|hurdle hop|depth jump|vertical jump|broad jump|bound|a-skip|ankling|dribble/i;

const SETS_REPS = /(\d+)\s*×\s*(\d+)/;
const LOAD_KG = /@\s*(\d+(?:\.\d+)?)\s*(?:[–-]\s*(\d+(?:\.\d+)?)\s*)?kg/i;

/** True when this task is one the athlete should be logging sets against. */
export function isLoggable(task: Pick<SessionTask, "stageTitle" | "prescription" | "name">): boolean {
  if (!LOGGABLE_STAGE.test(String(task.stageTitle ?? ""))) return false;
  if (NOT_A_LOADED_LIFT.test(String(task.name ?? ""))) return false;
  // A prescription with no set×rep shape is a carry, a jump or a hold — real
  // work, but not something a reps-and-load table describes.
  return SETS_REPS.test(String(task.prescription ?? ""));
}

/**
 * The rows to open the logger with, read off the prescription.
 *
 * This is a convenience, never a record: nothing is stored until the athlete
 * confirms it. A load range opens at its bottom, matching how the rest of the
 * app treats ranges.
 */
export function prescribedSets(task: Pick<SessionTask, "prescription">): LoggedSet[] {
  const text = String(task.prescription ?? "");
  const shape = text.match(SETS_REPS);
  if (!shape) return [];
  const load = text.match(LOAD_KG);
  const kg = load ? Number(load[1]) : 0;
  return Array.from({ length: Number(shape[1]) }, () => ({ reps: Number(shape[2]), kg }));
}

function isSet(value: unknown): value is LoggedSet {
  if (typeof value !== "object" || value === null) return false;
  const reps = Number((value as LoggedSet).reps);
  const kg = Number((value as LoggedSet).kg);
  return Number.isFinite(reps) && reps > 0 && Number.isFinite(kg) && kg >= 0;
}

/** A day's log, read defensively out of synced state. */
export function readDayLog(map: Record<string, unknown> | undefined, date: string): DaySetLog {
  const day = map?.[date];
  if (typeof day !== "object" || day === null || Array.isArray(day)) return {};
  const out: DaySetLog = {};
  for (const [taskId, sets] of Object.entries(day as Record<string, unknown>)) {
    if (Array.isArray(sets)) {
      const clean = sets.filter(isSet);
      if (clean.length) out[taskId] = clean;
    }
  }
  return out;
}

/**
 * Total kilograms moved in the logged sets.
 *
 * Logged sets only. Falling back to the prescription here is what produced a
 * card claiming a load that was never lifted.
 */
export function loggedTonnage(log: DaySetLog): number {
  let total = 0;
  for (const sets of Object.values(log)) {
    for (const set of sets) total += set.reps * set.kg;
  }
  return Math.round(total);
}

/** How many sets were logged across the day. */
export function loggedSetCount(log: DaySetLog): number {
  return Object.values(log).reduce((count, sets) => count + sets.length, 0);
}

/**
 * Estimated one-rep max, by the Epley formula.
 *
 * Epley is well behaved in the 1–10 rep range and badly behaved above it, so
 * a high-rep set returns nothing rather than an inflated number. A single at
 * a given load is its own e1RM.
 */
export function estimatedOneRepMax(set: LoggedSet): number | null {
  if (set.kg <= 0 || set.reps <= 0 || set.reps > 10) return null;
  if (set.reps === 1) return Math.round(set.kg * 10) / 10;
  return Math.round(set.kg * (1 + set.reps / 30) * 10) / 10;
}

/** The best estimated 1RM across a task's logged sets. */
export function bestOneRepMax(sets: TaskSetLog): number | null {
  const values = sets.map(estimatedOneRepMax).filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
}

/**
 * The best e1RM for a named lift across every logged day.
 *
 * Matched on the task *name* rather than its id, because ids carry the week
 * and day — the same back squat is a different id every session.
 */
export function oneRepMaxHistory(
  logs: Record<string, unknown> | undefined,
  taskNames: Record<string, string>
): { name: string; kg: number; date: string }[] {
  const best = new Map<string, { name: string; kg: number; date: string }>();
  for (const date of Object.keys(logs ?? {})) {
    const day = readDayLog(logs, date);
    for (const [taskId, sets] of Object.entries(day)) {
      const name = taskNames[taskId];
      if (!name) continue;
      const kg = bestOneRepMax(sets);
      if (kg === null) continue;
      const current = best.get(name);
      if (!current || kg > current.kg) best.set(name, { name, kg, date });
    }
  }
  return [...best.values()].sort((a, b) => b.kg - a.kg);
}
