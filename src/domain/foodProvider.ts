/**
 * The food database, behind one interface.
 *
 * Nutrition providers are unusually easy to get stuck to. Their responses
 * disagree about nearly everything: per-100 g versus per-serving, kJ versus
 * kcal, `protein` versus `protein_g` versus `nutriments.proteins_100g`, and
 * whether a missing nutrient is `0`, `null`, or an absent key. Code that reads
 * those shapes directly spreads them through the app, and swapping provider
 * then means touching the logging flow, the recents list and the totals.
 *
 * So everything above this file speaks `FoodItem` and nothing else, and the
 * adapter is the only place a provider's vocabulary exists.
 *
 * **Absent is not zero.** A label that does not declare fibre is different from
 * one declaring zero fibre, and the existing micronutrient card is built on
 * exactly that distinction. Optional nutrients are `undefined` when unstated;
 * they are never defaulted to 0 on the way in.
 *
 * **Energy is kcal.** Australian labels are in kilojoules and Open Food Facts
 * returns both; the adapter converts once, here, so no downstream code has to
 * know which it is holding.
 */

import type { MicronutrientAmounts } from "./micronutrients";

/** 1 kcal in kilojoules, by definition of the thermochemical calorie. */
export const KJ_PER_KCAL = 4.184;

export function kjToKcal(kj: number): number {
  return Math.round((Number(kj) / KJ_PER_KCAL) * 10) / 10;
}

/**
 * One food, normalised.
 *
 * Macros are per 100 g, because that is the only basis every provider can
 * supply and the only one that survives a unit change. `gramsPerServing` is
 * what the label calls a serving, when it says.
 */
export interface FoodItem {
  /** Stable within a provider: `off:3017620422003`, `usda:169414`. */
  id: string;
  name: string;
  brand?: string;
  /** Per 100 g. Energy in kcal. */
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  /** What the label calls one serving, in grams. Absent when unstated. */
  gramsPerServing?: number;
  /** g/ml, when the provider knows it. Absent far more often than not. */
  density?: number;
  /** Anything beyond the macros the label declared, keyed as the app keys it. */
  micronutrients?: MicronutrientAmounts;
  /** The barcode, when this came from one or carries one. */
  barcode?: string;
  /** Which database said so, for the provenance line in the UI. */
  source: string;
}

export interface FoodSearchResult {
  items: FoodItem[];
  /** True when the provider was reached; false when this came from cache only. */
  live: boolean;
}

/**
 * What any provider must do.
 *
 * Deliberately three methods. Search and barcode lookup are different queries
 * with different failure modes — a barcode either matches or does not, and
 * falling back to a text search on a miss is the caller's decision, not the
 * adapter's.
 */
export interface FoodProvider {
  readonly name: string;
  /** Free-text search. Returns [] rather than throwing on no matches. */
  search(query: string, signal?: AbortSignal): Promise<FoodItem[]>;
  /** UPC/EAN lookup. Resolves null when the barcode is not in the database. */
  byBarcode(code: string, signal?: AbortSignal): Promise<FoodItem | null>;
}

/** Nutriments as Open Food Facts spells them. Every field may be absent. */
interface OffNutriments {
  "energy-kcal_100g"?: number;
  energy_100g?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sodium_100g?: number;
  calcium_100g?: number;
  iron_100g?: number;
}

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  nutriments?: OffNutriments;
}

const num = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Open Food Facts to `FoodItem`.
 *
 * Exported separately from the fetching so it can be tested against captured
 * payloads without a network, which is where the shape bugs actually live.
 */
export function fromOpenFoodFacts(product: OffProduct): FoodItem | null {
  const name = String(product.product_name ?? "").trim();
  if (!name) return null; // An unnamed product is unloggable; drop it here.

  const n = product.nutriments ?? {};
  // OFF gives kcal directly on most products and only kJ on some. Prefer the
  // stated kcal; fall back to converting the kJ rather than reporting zero.
  const kcal = num(n["energy-kcal_100g"]) ?? (num(n.energy_100g) !== undefined ? kjToKcal(n.energy_100g as number) : undefined);

  // Absent stays absent. `?? 0` here is what would make a label that declares
  // nothing look like a food made of nothing.
  const micros: MicronutrientAmounts = {};
  if (num(n.fiber_100g) !== undefined) micros.fibre = num(n.fiber_100g);
  if (num(n.sodium_100g) !== undefined) micros.sodium = num(n.sodium_100g)! * 1000; // g -> mg
  if (num(n.calcium_100g) !== undefined) micros.calcium = num(n.calcium_100g)! * 1000;
  if (num(n.iron_100g) !== undefined) micros.iron = num(n.iron_100g)! * 1000;

  return {
    id: `off:${product.code ?? name}`,
    name,
    brand: String(product.brands ?? "").split(",")[0]?.trim() || undefined,
    caloriesPer100g: kcal ?? 0,
    proteinPer100g: num(n.proteins_100g) ?? 0,
    carbsPer100g: num(n.carbohydrates_100g) ?? 0,
    fatPer100g: num(n.fat_100g) ?? 0,
    gramsPerServing: num(product.serving_quantity),
    micronutrients: Object.keys(micros).length ? micros : undefined,
    barcode: product.code ? String(product.code) : undefined,
    source: "Open Food Facts",
  };
}
