import { BASELINE_ANCHORS } from "./baseline";
import { TRAP_BAR_WEEK_SPECS } from "./programmeContent";

/**
 * Monday's primary lift, periodised again.
 *
 * When the tested back squat went in, the trap bar deadlift came off Monday —
 * two heavy bilateral primaries back to back on a day that also throws 45–60
 * balls is not a session either lift progresses through. That call stands. But
 * the trap bar was carrying something nobody noticed it was carrying: the
 * programme's entire week-to-week periodisation.
 *
 * `programmeContent.ts` holds a fifty-two-week table of `[sets, reps, percent]`
 * — a real block plan, with accumulation, intensification, strength-speed and
 * deload weeks — and it was only ever read to price the trap bar. With the trap
 * bar gone from Monday, that table went unread, and the squat that replaced it
 * was a fixed `4 × 5` at a fixed window derived from the 145 kg tested max. So
 * every Monday of the winter block prescribed identical work: week 7,
 * "Strength-speed peak", read exactly the same as week 1, "Baseline quality".
 * The label and the session disagreed for eight weeks.
 *
 * This reads that table and applies it to the squat instead.
 *
 * ## Two deliberate departures
 *
 * **Reps have a floor of four.** The table's strength-speed weeks are doubles,
 * and the ForceDecks report asked for the squat at 4–8 reps × 3–5 sets. A
 * double is a good trap bar prescription and a poor squat one at this athlete's
 * training age. Where the table asks for fewer than four, the reps come up to
 * four and the *sets come down to match the original total*, so the volume
 * curve the block was built on survives intact:
 *
 *     week 5  6 × 2 = 12 reps  →  3 × 4 = 12 reps
 *     week 8  4 × 2 =  8 reps  →  2 × 4 =  8 reps
 *
 * Without that second half the deload disappears: clamping reps alone turns
 * both weeks into `4 × 4` and the athlete's easy week becomes their hardest.
 *
 * **The percentage is relative intensity, not a load claim.** The table's
 * percentages are of a trap bar training max, and they are applied here to the
 * squat's own tested max. What carries across is the *shape* — which weeks are
 * heavy, which are light, and by how much — not an equivalence between the two
 * lifts. The check that matters is where it lands: across the winter block the
 * squat comes out at 79–86% of the tested 145 kg, inside the report's 77–87%
 * window. In-season summer weeks fall below it, and that is correct — those are
 * maintenance weeks and the programme's own table says so.
 */

export type LiftSpec = readonly [sets: number, reps: number, percent: number];

/**
 * The programme's own fifty-two-week block plan.
 *
 * Imported, not copied. This used to be a hand-transcribed duplicate, on the
 * reasoning that `programmeContent.ts` is machine-extracted, carries
 * `@ts-nocheck`, and did not export the table — so a copy guarded by a drift
 * test looked safer than editing a generated file. It was not: the generator
 * has an export list, and adding the name there is a one-line change that
 * survives regeneration. Two sources of truth guarded by a test is still two
 * sources of truth.
 *
 * The cast is the price of the import. The generated file is `@ts-nocheck`, so
 * its entries type as `number[]` rather than as three-element tuples; the test
 * below checks the shape it actually has.
 */
export const WEEK_SPECS = TRAP_BAR_WEEK_SPECS as unknown as Readonly<Record<number, LiftSpec>>;

/** The report's rep floor for the squat. Below this it stops being the lift it asked for. */
export const SQUAT_MIN_REPS = 4;

/** Never fewer than two work sets — one set of four is a warm-up with a number on it. */
const MIN_SETS = 2;

export interface SquatDose {
  sets: number;
  reps: number;
  /** Of the tested squat max, carried across from the table as relative intensity. */
  percent: number;
  kg: number;
  /** What the week is for, from the table's own rep scheme. */
  character: "Accumulation" | "Intensification" | "Strength-speed";
  /** True where the reps were raised to the report's floor and sets rebalanced. */
  rebalanced: boolean;
}

function round(value: number, to = 2.5) {
  return Math.round(value / to) * to;
}

/**
 * The week's squat, or null where there is no week to read.
 *
 * Null rather than a guess: a caller that does not know its week should keep
 * whatever the programme wrote, not receive week 1's dose by default.
 */
export function squatDose(
  week: number | null,
  oneRepMaxKg: number = BASELINE_ANCHORS.backSquat1RmKg
): SquatDose | null {
  if (week === null) return null;
  const spec = WEEK_SPECS[week];
  if (!spec) return null;

  const [specSets, specReps, percent] = spec;
  const reps = Math.max(SQUAT_MIN_REPS, specReps);
  const rebalanced = reps > specReps;
  // Total reps are the block's volume curve, and the whole point of raising the
  // rep count is that it must not raise the week's work.
  const sets = rebalanced
    ? Math.max(MIN_SETS, Math.round((specSets * specReps) / reps))
    : specSets;

  return {
    sets,
    reps,
    percent,
    kg: round((oneRepMaxKg * percent) / 100),
    character: specReps >= 5 ? "Accumulation" : specReps >= 3 ? "Intensification" : "Strength-speed",
    rebalanced,
  };
}

/** A week the programme itself calls a deload, a taper, an unload or a review. */
export function isEasyWeek(focus: string | null | undefined): boolean {
  return /deload|unload|taper|review/i.test(String(focus ?? ""));
}
