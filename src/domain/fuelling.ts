/**
 * Today's fuelling targets, set by today's session.
 *
 * The app knows what tomorrow's session is, which no nutrition app does — a
 * tracker with a fixed daily carbohydrate target is fuelling a Tuesday bullpen
 * and a Sunday off-day identically. Carbohydrate is the macronutrient that
 * should move with the work; protein and fluid move much less.
 *
 * Ranges follow mainstream sports-nutrition guidance rather than anything
 * invented here:
 *
 *   - Carbohydrate scales with the day's demand, roughly 3 g/kg on a light or
 *     off day up to 6 g/kg on the heaviest, which is the low-to-moderate band
 *     of the usual 3–10 g/kg athlete range. Baseball is intermittent and
 *     low-volume next to endurance sport; the top of that range does not apply.
 *   - Protein sits at 1.8 g/kg, inside the 1.6–2.2 g/kg band where the
 *     evidence for supporting training adaptation is strongest, and does not
 *     drop on an easy day — recovery is when it is used.
 *   - Fat takes the remaining energy, floored at 0.8 g/kg so it never falls to
 *     a level that compromises hormonal function.
 *
 * These are targets for a healthy athlete's training day, not clinical advice,
 * and the UI says so.
 */

import { PlanLevel } from "./readiness";

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
}

/** Grams of carbohydrate per kilogram of bodyweight, by demand. */
const CARBS_PER_KG: Record<SessionDemand, number> = {
  rest: 3,
  light: 4,
  moderate: 5,
  hard: 6,
};

const PROTEIN_PER_KG = 1.8;
const FAT_FLOOR_PER_KG = 0.8;
/** Litres per kilogram, before the session top-up. */
const FLUID_PER_KG = 0.035;

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
  stress?: unknown;
  duration?: unknown;
  planLevel?: PlanLevel | null;
  hasSession?: boolean;
}): FuelTargets | null {
  const weight = Number(input.bodyweightKg);
  if (!Number.isFinite(weight) || weight <= 0) return null;

  const { demand, reason } = sessionDemand(input);

  const protein = round(weight * PROTEIN_PER_KG, 5);
  const carbs = round(weight * CARBS_PER_KG[demand], 5);
  // A floor rounds *up*. Rounding fat to the nearest 5 g put a 90 kg athlete
  // at 70 g — 0.78 g/kg, under the floor this figure exists to guarantee.
  const fat = Math.ceil((weight * FAT_FLOOR_PER_KG) / 5) * 5;

  const calories = round(
    protein * KCAL.protein + carbs * KCAL.carbs + fat * KCAL.fat,
    50
  );

  // A training day adds roughly half a litre over baseline; a rest day does
  // not need it.
  const fluid = Math.round((weight * FLUID_PER_KG + (demand === "rest" ? 0 : 0.5)) * 10) / 10;

  return { demand, reason, calories, protein, carbs, fat, fluid };
}

/** Plain-English note explaining why today's carbohydrate target moved. */
export const DEMAND_NOTE: Record<SessionDemand, string> = {
  rest: "Lower carbohydrate — there is no session to fuel. Protein stays up for recovery.",
  light: "Carbohydrate eased back for a light day. Protein unchanged.",
  moderate: "Standard training-day carbohydrate.",
  hard: "Carbohydrate raised for the hardest session of the week.",
};
