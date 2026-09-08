/**
 * The training maxes the programme multiplies its percentages by.
 *
 * Four lifts in the fifty-two-week plan are prescribed as a share of a max:
 * the back squat, the trap bar deadlift, the bench press and the push press.
 * Each has a percentage for every week it appears in, and each falls back to a
 * written prescription when the app has no max to multiply.
 *
 * That fallback is the reason this module exists. It is a sensible default and
 * it is also silent: "3 × 5 @ RPE 6" looks like a deliberate RPE prescription
 * rather than what it is, a percentage table with nothing to multiply. The
 * trap bar spent the whole year in that state — a periodised table, a
 * percentage for all fifty-two weeks, and no number behind it — and nothing in
 * the app said so.
 *
 * So the maxes are editable, they carry where they came from, and a lift with
 * no max says plainly that it is running on the written fallback.
 */

/** A lift the programme computes loads for. */
export interface MaxedLift {
  /** The key `pbs.trainingMaxes.lifts` is stored under. */
  key: string;
  name: string;
  /** What the plan does with it, in one line. */
  drives: string;
}

export const MAXED_LIFTS: readonly MaxedLift[] = Object.freeze([
  {
    key: "backSquat",
    name: "Back squat",
    drives: "Monday's squat, at the block's percentage for the week.",
  },
  {
    key: "trapBarDeadlift",
    name: "Trap bar deadlift",
    drives: "The trap bar in every week it appears, from the programme's own fifty-two-week table.",
  },
  {
    key: "benchPress",
    name: "Bench press",
    drives: "Monday's bench and the Wednesday pairing. Without it both fall back to an RPE cap.",
  },
  {
    key: "pushPress",
    name: "Push press",
    drives: "Wednesday's push press. Without it the plan writes a flat 35 kg.",
  },
]);

/** Where a max came from, which decides how much to trust it. */
export type MaxKind = "tested" | "derived" | "entered";

export interface TrainingMax {
  value: number;
  kind: MaxKind;
  source?: string;
  recordedAt?: string;
}

export const MAX_KIND_LABEL: Record<MaxKind, string> = {
  tested: "Tested",
  derived: "Derived",
  entered: "You entered this",
};

/**
 * The bounds an entered max has to sit inside.
 *
 * Not arbitrary: under 20 kg is not a training max for any of these lifts, and
 * over 400 kg is a typo. A value outside them would silently rewrite every
 * percentage in the year, which is the one thing this screen must not do by
 * accident.
 */
export const MAX_RANGE: [number, number] = [20, 400];

/** The stored maxes, read defensively out of synced state. */
export function readTrainingMaxes(pbs: unknown): Record<string, TrainingMax> {
  const lifts = (pbs as { trainingMaxes?: { lifts?: unknown } } | undefined)?.trainingMaxes?.lifts;
  if (typeof lifts !== "object" || lifts === null || Array.isArray(lifts)) return {};

  const out: Record<string, TrainingMax> = {};
  for (const [key, raw] of Object.entries(lifts as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    const value = Number(entry.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    const kind = entry.kind === "tested" || entry.kind === "derived" ? entry.kind : "entered";
    out[key] = {
      value,
      kind,
      ...(typeof entry.source === "string" ? { source: entry.source } : {}),
      ...(typeof entry.recordedAt === "string" ? { recordedAt: entry.recordedAt } : {}),
    };
  }
  return out;
}

/**
 * Whether a typed value is one this is willing to store.
 *
 * Rejecting rather than clamping. A clamp would accept 4000 as 400 and put a
 * number the athlete never meant behind every load in the year.
 */
export function isUsableMax(value: number): boolean {
  return Number.isFinite(value) && value >= MAX_RANGE[0] && value <= MAX_RANGE[1];
}

/**
 * Set one lift's max, keeping the rest of `pbs` intact.
 *
 * A value the athlete typed is always `entered`: it outranks a derived figure
 * and it does not claim to be a test. Passing `null` removes the entry, which
 * puts that lift back on the programme's written fallback — the honest way to
 * say "I do not know this one" rather than leaving a guess in place.
 */
export function setTrainingMax(pbs: unknown, key: string, value: number | null): Record<string, unknown> {
  const base = (typeof pbs === "object" && pbs !== null ? pbs : {}) as Record<string, unknown>;
  const trainingMaxes = (base.trainingMaxes ?? {}) as Record<string, unknown>;
  const lifts = { ...((trainingMaxes.lifts ?? {}) as Record<string, unknown>) };

  if (value === null) delete lifts[key];
  else if (isUsableMax(value)) lifts[key] = { value, kind: "entered", recordedAt: new Date().toISOString().slice(0, 10) };
  else return base;

  return { ...base, trainingMaxes: { ...trainingMaxes, lifts } };
}
