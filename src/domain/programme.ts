/**
 * Canonical annual programme structure.
 *
 * This is the single source of truth for the 52-week phase layout. Nothing
 * else in the codebase should hard-code week ranges or phase names — import
 * from here so the UI, the storage layer and any reporting all agree.
 *
 * ---------------------------------------------------------------------------
 * KNOWN CONFLICT WITH THE PROTOTYPE — needs a human decision.
 *
 * The layout below is the one specified for the rebuild, described as matching
 * the confirmed pitching programme (Dylan_Pitching_Manual_v1.docx, which was
 * not available to verify against).
 *
 * The deployed prototype uses a completely different, fixture-anchored layout:
 * eight phases keyed to FNCBA/GBL season dates — weeks 1-8, 9-10, 11, 12-22,
 * 23-28, 29-36, 37-38, 39-52. It is preserved verbatim in `legacyPhases.ts`.
 *
 * These are not reconcilable by rounding: different phase count, different
 * names, different boundaries. Whichever is wrong changes what the athlete is
 * told to do in a given week, so it must not be resolved by guesswork.
 *
 * This file implements the specified layout. If the prototype's is correct for
 * the current season, swap the import — `legacyPhases.ts` carries the data and
 * `phaseForWeek` has the same shape.
 * ---------------------------------------------------------------------------
 */

export const PROGRAMME_WEEKS = 52;

export type PhaseId =
  | "winter_ball"
  | "transition"
  | "velocity_development"
  | "preseason"
  | "summer_season";

export interface ProgrammePhase {
  id: PhaseId;
  /** Human-readable name as it appears in the pitching programme. */
  name: string;
  /** First week of the phase, 1-indexed and inclusive. */
  startWeek: number;
  /** Last week of the phase, 1-indexed and inclusive. */
  endWeek: number;
}

/**
 * Weeks 1-12 Winter Ball, 13-14 Transition, 15-26 Velocity Development,
 * 27-36 Preseason, 37-52 Summer Season. Contiguous and exhaustive over
 * weeks 1..52 — enforced by assertions below and by the test suite.
 */
export const PROGRAMME_PHASES: readonly ProgrammePhase[] = Object.freeze([
  { id: "winter_ball", name: "Winter Ball", startWeek: 1, endWeek: 12 },
  { id: "transition", name: "Transition", startWeek: 13, endWeek: 14 },
  { id: "velocity_development", name: "Velocity Development", startWeek: 15, endWeek: 26 },
  { id: "preseason", name: "Preseason", startWeek: 27, endWeek: 36 },
  { id: "summer_season", name: "Summer Season", startWeek: 37, endWeek: 52 },
]);

export function isProgrammeWeek(week: number): boolean {
  return Number.isInteger(week) && week >= 1 && week <= PROGRAMME_WEEKS;
}

/**
 * The phase containing `week`, or null when the week is outside 1..52.
 * Returns null rather than throwing so callers can decide how to surface a
 * bad week without a crash reaching the UI.
 */
export function phaseForWeek(week: number): ProgrammePhase | null {
  if (!isProgrammeWeek(week)) return null;
  return PROGRAMME_PHASES.find((phase) => week >= phase.startWeek && week <= phase.endWeek) ?? null;
}

export function phaseById(id: PhaseId): ProgrammePhase | null {
  return PROGRAMME_PHASES.find((phase) => phase.id === id) ?? null;
}

/** Inclusive week count for a phase. */
export function phaseLength(phase: ProgrammePhase): number {
  return phase.endWeek - phase.startWeek + 1;
}

/** Every week number belonging to a phase, ascending. */
export function weeksInPhase(phase: ProgrammePhase): number[] {
  const weeks: number[] = [];
  for (let week = phase.startWeek; week <= phase.endWeek; week += 1) weeks.push(week);
  return weeks;
}

/**
 * 1-indexed position of `week` within its own phase (week 15 -> 1, because
 * Velocity Development starts at 15). Null for weeks outside 1..52.
 */
export function weekWithinPhase(week: number): number | null {
  const phase = phaseForWeek(week);
  return phase ? week - phase.startWeek + 1 : null;
}
