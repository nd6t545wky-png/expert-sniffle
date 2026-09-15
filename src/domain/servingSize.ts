/**
 * Serving sizes, and the conversions between them.
 *
 * This module exists because the conversion is where a nutrition tracker
 * silently lies to you. Every other part of the feature fails loudly: a search
 * returns nothing, a barcode does not match, a save errors. A bad conversion
 * returns a plausible number and is believed.
 *
 * Three rules follow from that, and they are the whole design.
 *
 * **Mass converts; volume does not.** Grams, ounces and pounds are the same
 * quantity in different clothes, so those conversions are exact and always
 * available. Millilitres are not grams. A cup of rolled oats is about 90 g and
 * a cup of honey is about 340 g, so any code that turns a volume into a mass
 * without knowing *what* is in the cup is guessing, and a guess that is out by
 * 3.8x is not a rounding error. Volume converts to mass only when a density is
 * supplied, or when the food itself declares what one of its servings weighs.
 *
 * **A tablespoon is not a tablespoon.** The US tablespoon is 14.79 ml; the
 * Australian one is 20 ml. Using the wrong one overstates or understates by
 * 35%, every time, invisibly. The athlete is in Brisbane, so `metric` (the
 * Australian standard) is the default, and the system in force is recorded on
 * every result rather than assumed.
 *
 * **Refusing is a result.** `convert` returns a discriminated union, not a
 * number-or-NaN. "I cannot turn 1 cup into grams without a density" is a
 * legitimate answer that the caller must handle, and making it unrepresentable
 * as a silent zero is the point.
 */

/** Mass units. These convert between each other exactly, always. */
export const MASS_UNITS = ["g", "kg", "oz", "lb"] as const;
/** Volume units. Exact between each other; to mass only with a density. */
export const VOLUME_UNITS = ["ml", "l", "tsp", "tbsp", "cup", "floz"] as const;
/** Units that mean "whatever the food says one of these weighs". */
export const COUNT_UNITS = ["serving", "piece"] as const;

export type MassUnit = (typeof MASS_UNITS)[number];
export type VolumeUnit = (typeof VOLUME_UNITS)[number];
export type CountUnit = (typeof COUNT_UNITS)[number];
export type Unit = MassUnit | VolumeUnit | CountUnit;

/**
 * Which measuring spoons are in the drawer.
 *
 * `metric` is the Australian standard and the default: 250 ml cup, 20 ml
 * tablespoon, 5 ml teaspoon. `us` is the American one, which nutrition labels
 * there round to a 240 ml cup and a 30 ml fluid ounce.
 */
export type UnitSystem = "metric" | "us";

/** Exact by definition — the international pound and ounce. */
const GRAMS_PER: Record<MassUnit, number> = Object.freeze({
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
});

const ML_PER: Record<UnitSystem, Record<VolumeUnit, number>> = Object.freeze({
  // Australian metric measures. The 20 ml tablespoon is the one that catches
  // people: it is four teaspoons here and three everywhere else.
  metric: Object.freeze({ ml: 1, l: 1000, tsp: 5, tbsp: 20, cup: 250, floz: 30 }),
  // US nutrition-labelling measures, which are the rounded legal ones rather
  // than the customary fractions of a gallon.
  us: Object.freeze({ ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 240, floz: 30 }),
});

export function isMassUnit(unit: string): unit is MassUnit {
  return (MASS_UNITS as readonly string[]).includes(unit);
}
export function isVolumeUnit(unit: string): unit is VolumeUnit {
  return (VOLUME_UNITS as readonly string[]).includes(unit);
}
export function isCountUnit(unit: string): unit is CountUnit {
  return (COUNT_UNITS as readonly string[]).includes(unit);
}

/**
 * What the food itself tells us about one serving.
 *
 * `gramsPerServing` is what a label means by "per serving (30 g)". `density`
 * is grams per millilitre, and is the only thing that licenses a volume-to-mass
 * conversion. Both are optional because most database entries carry neither.
 */
export interface ServingBasis {
  gramsPerServing?: number | null;
  /** g/ml. Water is 1. Only set this when it is known, never as a default. */
  density?: number | null;
}

export type ConversionFailure =
  | "unknown-unit"
  | "not-a-number"
  | "negative"
  | "needs-density"
  | "needs-serving-weight";

export type Conversion =
  | { ok: true; grams: number; system: UnitSystem; exact: boolean }
  | { ok: false; reason: ConversionFailure; detail: string };

const round = (value: number, places = 4) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/**
 * Turn a quantity of some unit into grams.
 *
 * `exact` marks conversions that are true by definition (mass to mass, volume
 * to volume) as opposed to ones that depended on a density or a declared
 * serving weight, which are only as good as that input.
 */
export function toGrams(
  quantity: number,
  unit: string,
  basis: ServingBasis = {},
  system: UnitSystem = "metric"
): Conversion {
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
    return { ok: false, reason: "not-a-number", detail: `quantity ${String(quantity)} is not a finite number` };
  }
  if (quantity < 0) {
    return { ok: false, reason: "negative", detail: "a quantity cannot be negative" };
  }

  if (isMassUnit(unit)) {
    return { ok: true, grams: round(quantity * GRAMS_PER[unit]), system, exact: true };
  }

  if (isVolumeUnit(unit)) {
    const ml = quantity * ML_PER[system][unit];
    const density = Number(basis.density);
    if (!Number.isFinite(density) || density <= 0) {
      return {
        ok: false,
        reason: "needs-density",
        detail: `${quantity} ${unit} is ${round(ml, 2)} ml, but turning millilitres into grams needs the food's density`,
      };
    }
    return { ok: true, grams: round(ml * density), system, exact: false };
  }

  if (isCountUnit(unit)) {
    const perServing = Number(basis.gramsPerServing);
    if (!Number.isFinite(perServing) || perServing <= 0) {
      return {
        ok: false,
        reason: "needs-serving-weight",
        detail: `this food does not say what one ${unit} weighs`,
      };
    }
    return { ok: true, grams: round(quantity * perServing), system, exact: false };
  }

  return { ok: false, reason: "unknown-unit", detail: `unit "${unit}" is not one this app measures in` };
}

/**
 * Convert between any two units, via grams.
 *
 * Mass to mass and volume to volume within the same system stay exact and need
 * no basis; anything crossing between the two needs one, and says so.
 */
export function convert(
  quantity: number,
  from: string,
  to: string,
  basis: ServingBasis = {},
  system: UnitSystem = "metric"
): Conversion {
  // Volume to volume never needs a density: the grams cancel out.
  if (isVolumeUnit(from) && isVolumeUnit(to)) {
    if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
      return { ok: false, reason: "not-a-number", detail: `quantity ${String(quantity)} is not a finite number` };
    }
    if (quantity < 0) return { ok: false, reason: "negative", detail: "a quantity cannot be negative" };
    const ml = quantity * ML_PER[system][from];
    return { ok: true, grams: round(ml / ML_PER[system][to]), system, exact: true };
  }

  const grams = toGrams(quantity, from, basis, system);
  if (!grams.ok) return grams;

  if (isMassUnit(to)) {
    return { ok: true, grams: round(grams.grams / GRAMS_PER[to]), system, exact: grams.exact };
  }
  if (isVolumeUnit(to)) {
    const density = Number(basis.density);
    if (!Number.isFinite(density) || density <= 0) {
      return { ok: false, reason: "needs-density", detail: "converting a mass into a volume needs the food's density" };
    }
    return { ok: true, grams: round(grams.grams / density / ML_PER[system][to]), system, exact: false };
  }
  if (isCountUnit(to)) {
    const perServing = Number(basis.gramsPerServing);
    if (!Number.isFinite(perServing) || perServing <= 0) {
      return { ok: false, reason: "needs-serving-weight", detail: `this food does not say what one ${to} weighs` };
    }
    return { ok: true, grams: round(grams.grams / perServing), system, exact: false };
  }
  return { ok: false, reason: "unknown-unit", detail: `unit "${to}" is not one this app measures in` };
}

/**
 * Scale a per-100 g nutrient figure to an actual amount eaten.
 *
 * Per-100 g is the form every food database agrees on, so this is the single
 * multiplication the whole logging flow depends on. Kept here, next to the
 * conversion it consumes, so the two are tested together.
 */
export function scalePer100g(per100g: number, grams: number): number {
  if (!Number.isFinite(per100g) || !Number.isFinite(grams)) return 0;
  return round((per100g * grams) / 100, 2);
}
