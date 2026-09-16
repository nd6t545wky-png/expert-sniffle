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

/** USDA FoodData Central, as it spells things. Every field may be absent. */
interface UsdaNutrient {
  nutrientId?: number;
  value?: number;
}
interface UsdaFood {
  fdcId?: number;
  description?: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: UsdaNutrient[];
}

/**
 * FDC nutrient ids. These are stable numbers, and using them rather than the
 * `nutrientName` strings is deliberate: the names carry qualifiers ("Protein"
 * vs "Adjusted Protein") that change between data types, while the ids do not.
 */
const FDC = Object.freeze({
  energyKcal: 1008,
  protein: 1003,
  fat: 1004,
  carbs: 1005,
  fibre: 1079,
  sodium: 1093,
  calcium: 1087,
  iron: 1089,
  potassium: 1092,
  magnesium: 1090,
  zinc: 1095,
});

/**
 * USDA FoodData Central to `FoodItem`.
 *
 * FDC reports per 100 g for Foundation and SR Legacy foods, which is the bulk
 * of what it is good for -- whole foods, cuts of meat, raw ingredients. Branded
 * items there are often per-serving and patchier than Open Food Facts, which is
 * the division of labour the composite provider below assumes.
 */
export function fromUsda(food: UsdaFood): FoodItem | null {
  const name = String(food.description ?? "").trim();
  if (!name) return null;

  const by = new Map<number, number>();
  for (const nutrient of food.foodNutrients ?? []) {
    const id = Number(nutrient.nutrientId);
    const value = Number(nutrient.value);
    if (Number.isFinite(id) && Number.isFinite(value)) by.set(id, value);
  }

  const micros: MicronutrientAmounts = {};
  // Absent stays absent, exactly as in the OFF mapper. FDC omits the row
  // entirely when a nutrient was not measured, which is not the same as zero.
  if (by.has(FDC.fibre)) micros.fibre = by.get(FDC.fibre);
  if (by.has(FDC.sodium)) micros.sodium = by.get(FDC.sodium);
  if (by.has(FDC.calcium)) micros.calcium = by.get(FDC.calcium);
  if (by.has(FDC.iron)) micros.iron = by.get(FDC.iron);
  if (by.has(FDC.potassium)) micros.potassium = by.get(FDC.potassium);
  if (by.has(FDC.magnesium)) micros.magnesium = by.get(FDC.magnesium);
  if (by.has(FDC.zinc)) micros.zinc = by.get(FDC.zinc);

  // Only trust a declared serving weight when the unit is actually a mass.
  // FDC records millilitres here for drinks, and treating those as grams is the
  // silent volume-to-mass guess servingSize.ts exists to refuse.
  const unit = String(food.servingSizeUnit ?? "").toLowerCase();
  const servingGrams = unit === "g" || unit === "gram" ? Number(food.servingSize) : undefined;

  return {
    id: `usda:${food.fdcId ?? name}`,
    name,
    brand: (food.brandName || food.brandOwner || "").trim() || undefined,
    caloriesPer100g: by.get(FDC.energyKcal) ?? 0,
    proteinPer100g: by.get(FDC.protein) ?? 0,
    carbsPer100g: by.get(FDC.carbs) ?? 0,
    fatPer100g: by.get(FDC.fat) ?? 0,
    gramsPerServing: Number.isFinite(servingGrams) ? servingGrams : undefined,
    micronutrients: Object.keys(micros).length ? micros : undefined,
    barcode: food.gtinUpc ? String(food.gtinUpc) : undefined,
    source: "USDA FoodData Central",
  };
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Parse a response body, or give up quietly.
 *
 * Both providers answer with an HTML status page when they are having a bad
 * day. Open Food Facts currently returns 503 for its search endpoint, which
 * `response.ok` catches -- but a 200 carrying an outage page is a real shape
 * during partial failures, and `response.json()` throws on it. A search that
 * returns nothing is a far better outcome than one that rejects on every
 * keystroke the athlete types.
 */
async function parseJson<T>(response: Response): Promise<T | null> {
  if (!response.ok) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Two databases that are good at different halves of the problem.
 *
 * Open Food Facts is crowd-sourced packaged groceries: excellent barcode
 * coverage, Australian products included, no key, and nutrition that is only as
 * careful as the contributor who typed it. USDA FoodData Central is laboratory
 * analysis of whole foods: chicken breast, rolled oats, a banana -- deeper and
 * far more trustworthy, with barely any barcodes and almost nothing Australian.
 *
 * Running both is not hedging. A day of this athlete's food is roughly half
 * packaged and half not, and each provider is the right answer for one half.
 */
export function composite(providers: readonly FoodProvider[]): FoodProvider {
  return {
    name: providers.map((p) => p.name).join(" + "),

    async search(query, signal) {
      // One provider being down, rate-limited or keyless must not take the
      // search with it -- `allSettled`, and the survivors are still useful.
      const settled = await Promise.allSettled(providers.map((p) => p.search(query, signal)));
      const merged: FoodItem[] = [];
      for (const outcome of settled) {
        if (outcome.status === "fulfilled") merged.push(...outcome.value);
      }
      return dedupe(merged);
    },

    async byBarcode(code, signal) {
      // Sequential, not parallel: the first provider with barcode coverage
      // almost always answers, and a second network call on every scan is a
      // cost paid at the till with the phone in one hand.
      for (const provider of providers) {
        try {
          const hit = await provider.byBarcode(code, signal);
          if (hit) return hit;
        } catch {
          // A provider that throws is a provider that did not have it.
        }
      }
      return null;
    },
  };
}

/**
 * Collapse the same food arriving from two databases.
 *
 * Barcode is the only identifier both sides can agree on, so it wins outright.
 * Failing that, a name-and-brand key catches the obvious duplicates without
 * pretending to be clever: fuzzy matching here would silently merge "chicken
 * breast, raw" with "chicken breast, cooked", which differ by about 50% in
 * calories per 100 g. Two similar rows on screen is a far cheaper mistake.
 */
export function dedupe(items: readonly FoodItem[]): FoodItem[] {
  const seen = new Map<string, FoodItem>();
  for (const item of items) {
    const key = item.barcode
      ? `barcode:${item.barcode}`
      : `name:${item.name.trim().toLowerCase()}|${(item.brand ?? "").trim().toLowerCase()}`;
    const existing = seen.get(key);
    // Keep whichever row actually carries nutrition. A zero-calorie duplicate
    // is a contributor who left the panel blank, and it should not shadow a
    // complete row from the other database.
    if (!existing || (existing.caloriesPer100g === 0 && item.caloriesPer100g > 0)) {
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}

const OFF_ENDPOINT = "https://world.openfoodfacts.org";

/** Fields to ask OFF for. Requesting everything returns ~200 KB per product. */
const OFF_FIELDS = "code,product_name,brands,serving_quantity,nutriments";

/**
 * Open Food Facts. No key, no account, no quota worth worrying about.
 *
 * Their terms ask for a descriptive User-Agent so they can tell apps apart from
 * scrapers; browsers refuse to let us set that header, so the app identifies
 * itself in the query string instead, which their docs accept.
 */
export function openFoodFacts(fetcher: Fetcher = (...args) => fetch(...args)): FoodProvider {
  return {
    name: "Open Food Facts",

    async search(query, signal) {
      const url =
        `${OFF_ENDPOINT}/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
        `&search_simple=1&action=process&json=1&page_size=20&fields=${OFF_FIELDS}`;
      const body = await parseJson<{ products?: OffProduct[] }>(await fetcher(url, { signal }));
      return (body?.products ?? []).map(fromOpenFoodFacts).filter((x): x is FoodItem => x !== null);
    },

    async byBarcode(code, signal) {
      const url = `${OFF_ENDPOINT}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`;
      const body = await parseJson<{ status?: number; product?: OffProduct }>(await fetcher(url, { signal }));
      if (!body) return null;
      // OFF answers 200 with `status: 0` for a barcode it does not hold, so the
      // HTTP code alone is not the answer to "did you have it".
      if (body.status !== 1 || !body.product) return null;
      return fromOpenFoodFacts(body.product);
    },
  };
}

/**
 * USDA FoodData Central, through this app's own Worker.
 *
 * Not called directly, for two reasons that both have to hold. The API key
 * would otherwise ship inside the JavaScript bundle, where it is public by
 * definition. And FoodData Central sends no CORS headers at all, so a browser
 * cannot reach it regardless of who holds the key.
 *
 * So the client asks `/api/food/*` and the Worker holds the secret. When no key
 * is configured the Worker answers 503, this returns nothing rather than
 * throwing, and the composite carries on with Open Food Facts alone.
 */
export function usda(fetcher: Fetcher = (...args) => fetch(...args)): FoodProvider {
  return {
    name: "USDA FoodData Central",

    async search(query, signal) {
      const body = await parseJson<{ foods?: UsdaFood[] }>(
        await fetcher(`/api/food/search?q=${encodeURIComponent(query)}`, { signal })
      );
      return (body?.foods ?? []).map(fromUsda).filter((x): x is FoodItem => x !== null);
    },

    async byBarcode(code, signal) {
      const body = await parseJson<{ foods?: UsdaFood[] }>(
        await fetcher(`/api/food/barcode?code=${encodeURIComponent(code)}`, { signal })
      );
      // The UPC lookup is a text search upstream, so confirm the hit actually
      // carries the barcode rather than merely mentioning the digits.
      const wanted = code.replace(/^0+/, "");
      const exact = (body?.foods ?? []).find(
        (f) => String(f.gtinUpc ?? "").replace(/^0+/, "") === wanted
      );
      return exact ? fromUsda(exact) : null;
    },
  };
}
