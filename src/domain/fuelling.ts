/**
 * Today's fuelling targets, set by today's session.
 *
 * The app knows what tomorrow's session is, which no nutrition app does — a
 * tracker with a fixed daily carbohydrate target is fuelling a Tuesday bullpen
 * and a Sunday off-day identically. Carbohydrate is the macronutrient that
 * should move with the work; protein and fluid move much less.
 *
 * Where the numbers come from, in order of preference: the athlete's own
 * measurements, then mainstream sports-nutrition guidance. Nothing here is
 * invented.
 *
 *   - Energy is the measured basal rate from the DEXA scan multiplied by an
 *     activity factor for the day. That beats any per-kilogram formula,
 *     because it is this athlete's own resting expenditure rather than a
 *     population estimate of it.
 *   - Protein scales to *lean* mass, not total mass, at 2.4 g/kg — inside the
 *     usual 2.2–2.5 g/kg-lean band. Scaling to total mass over-prescribes for
 *     an athlete carrying fat, and does something worse besides: it would cut
 *     the protein target as fat came off, which is exactly when it should hold.
 *   - Carbohydrate scales with the day's demand against *total* mass, roughly
 *     3 g/kg on a light or off day up to 6 g/kg on the heaviest. Carbohydrate
 *     fuels the whole body's work, so total mass is the right denominator here.
 *     That is the low-to-moderate band of the usual 3–10 g/kg athlete range;
 *     baseball is intermittent and the top of that range does not apply.
 *   - Fat takes whatever energy is left, floored at 0.8 g/kg so it never falls
 *     to a level that compromises hormonal function.
 *
 * These are targets for a healthy athlete's training day, not clinical advice,
 * and the UI says so.
 */

import { PlanLevel } from "./readiness";
import { BASELINE_ANCHORS } from "./baseline";

export type SessionDemand = "rest" | "light" | "moderate" | "hard";

export interface FuelTargets {
  demand: SessionDemand;
  /** What drove the demand call, in words, for the UI to show. */
  reason: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Litres. */
  fluid: number;
  /** True when protein came from measured lean mass rather than total mass. */
  proteinFromLeanMass: boolean;
  /** True when energy came from the measured basal rate. */
  energyFromMeasuredBmr: boolean;
}

/** Grams of carbohydrate per kilogram of bodyweight, by demand. */
const CARBS_PER_KG: Record<SessionDemand, number> = {
  rest: 3,
  light: 4,
  moderate: 5,
  hard: 6,
};

/** Grams of protein per kilogram of *lean* mass. */
const PROTEIN_PER_KG_LEAN = 2.4;
/** Fallback when lean mass is unknown: per kilogram of total mass. */
const PROTEIN_PER_KG_TOTAL = 1.8;
const FAT_FLOOR_PER_KG = 0.8;
/** Litres per kilogram, before the session top-up. */
const FLUID_PER_KG = 0.035;

/**
 * Activity factors applied to the measured basal rate.
 *
 * Deliberately conservative for an intermittent sport: a bullpen and a gym
 * session are not an endurance block, and over-estimating expenditure is how
 * a body-composition goal quietly stops working.
 */
const ACTIVITY_FACTOR: Record<SessionDemand, number> = {
  rest: 1.35,
  light: 1.5,
  moderate: 1.7,
  hard: 1.9,
};

const KCAL = { protein: 4, carbs: 4, fat: 9 } as const;

/**
 * How demanding today's session is.
 *
 * Read from the session's own stress label and duration, then capped by the
 * readiness plan level — a day reduced to 50% is not a hard day however it was
 * written, and fuelling it as one is how a recovery day stops being one.
 */
export function sessionDemand(input: {
  stress?: unknown;
  duration?: unknown;
  planLevel?: PlanLevel | null;
  hasSession?: boolean;
}): { demand: SessionDemand; reason: string } {
  if (input.hasSession === false) {
    return { demand: "rest", reason: "No session scheduled" };
  }

  const stress = String(input.stress ?? "").toLowerCase();
  const minutes = Number(String(input.duration ?? "").match(/(\d+)/)?.[1] ?? 0);

  let demand: SessionDemand = "moderate";
  let reason = "Moderate session";

  if (/high|hard|max|heavy/.test(stress)) {
    demand = "hard";
    reason = "High-stress session";
  } else if (/low|easy|light|recovery/.test(stress)) {
    demand = "light";
    reason = "Low-stress session";
  } else if (minutes >= 90) {
    demand = "hard";
    reason = "Long session";
  } else if (minutes > 0 && minutes < 40) {
    demand = "light";
    reason = "Short session";
  }

  // Readiness caps it. A held or halved day is fuelled as what it became, not
  // as what was written.
  if (input.planLevel === "hold") return { demand: "rest", reason: "Health hold" };
  if (input.planLevel === "recovery") {
    return { demand: "light", reason: "Recovery day — 50% plan" };
  }
  if (input.planLevel === "reduced" && demand === "hard") {
    return { demand: "moderate", reason: "Reduced day — 75% plan" };
  }

  return { demand, reason };
}

function round(value: number, step = 1): number {
  return Math.round(value / step) * step;
}

/**
 * Targets for the day.
 *
 * Returns null without a bodyweight — every figure here is per kilogram, and
 * guessing a bodyweight would make every number wrong at once.
 */
export function fuelTargets(input: {
  bodyweightKg?: number | null;
  /** Measured lean mass. Falls back to a total-mass figure when absent. */
  leanMassKg?: number | null;
  /** Measured basal rate. Falls back to an estimate when absent. */
  basalKcal?: number | null;
  stress?: unknown;
  duration?: unknown;
  planLevel?: PlanLevel | null;
  hasSession?: boolean;
}): FuelTargets | null {
  const weight = Number(input.bodyweightKg);
  if (!Number.isFinite(weight) || weight <= 0) return null;

  const { demand, reason } = sessionDemand(input);

  // Protein against lean mass where it is known. See the header: scaling to
  // total mass would lower the target as fat came off.
  const lean = Number(input.leanMassKg);
  const proteinFromLeanMass = Number.isFinite(lean) && lean > 0;
  const protein = round(
    proteinFromLeanMass ? lean * PROTEIN_PER_KG_LEAN : weight * PROTEIN_PER_KG_TOTAL,
    5
  );

  const carbs = round(weight * CARBS_PER_KG[demand], 5);

  // Energy from the measured basal rate where it exists. Without one, fall
  // back to building energy up from the macros themselves.
  const basal = Number(input.basalKcal);
  const energyFromMeasuredBmr = Number.isFinite(basal) && basal > 0;

  // A floor rounds *up*. Rounding fat to the nearest 5 g put a 90 kg athlete
  // at 70 g — 0.78 g/kg, under the floor this figure exists to guarantee.
  const fatFloor = Math.ceil((weight * FAT_FLOOR_PER_KG) / 5) * 5;

  let calories: number;
  let fat: number;

  if (energyFromMeasuredBmr) {
    calories = round(basal * ACTIVITY_FACTOR[demand], 50);
    // Fat takes what protein and carbohydrate leave. If that is under the
    // floor, the floor wins and energy rises to match — a split that cannot
    // be eaten is not a target, and silently thinning fat to make the sum
    // work is how a plan starts compromising hormonal function.
    const remaining = calories - protein * KCAL.protein - carbs * KCAL.carbs;
    fat = Math.max(fatFloor, round(remaining / KCAL.fat, 5));
    calories = round(protein * KCAL.protein + carbs * KCAL.carbs + fat * KCAL.fat, 50);
  } else {
    fat = fatFloor;
    calories = round(protein * KCAL.protein + carbs * KCAL.carbs + fat * KCAL.fat, 50);
  }

  // A training day adds roughly half a litre over baseline; a rest day does
  // not need it.
  const fluid = Math.round((weight * FLUID_PER_KG + (demand === "rest" ? 0 : 0.5)) * 10) / 10;

  return {
    demand,
    reason,
    calories,
    protein,
    carbs,
    fat,
    fluid,
    proteinFromLeanMass,
    energyFromMeasuredBmr,
  };
}

/**
 * Targets using the athlete's own scan, unless a newer measurement is given.
 *
 * Bodyweight is the one figure expected to move week to week, so a current
 * reading from a check-in beats the scan's. Lean mass and basal rate only
 * change with a new scan.
 */
export function fuelTargetsFromBaseline(input: {
  bodyweightKg?: number | null;
  stress?: unknown;
  duration?: unknown;
  planLevel?: PlanLevel | null;
  hasSession?: boolean;
}): FuelTargets | null {
  return fuelTargets({
    ...input,
    bodyweightKg: input.bodyweightKg ?? BASELINE_ANCHORS.bodyMassKg,
    leanMassKg: BASELINE_ANCHORS.leanMassKg,
    basalKcal: BASELINE_ANCHORS.basalMetabolicRateKcal,
  });
}

/** Plain-English note explaining why today's carbohydrate target moved. */
export const DEMAND_NOTE: Record<SessionDemand, string> = {
  rest: "Lower carbohydrate — there is no session to fuel. Protein stays up for recovery.",
  light: "Carbohydrate eased back for a light day. Protein unchanged.",
  moderate: "Standard training-day carbohydrate.",
  hard: "Carbohydrate raised for the hardest session of the week.",
};
