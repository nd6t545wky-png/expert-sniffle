import { describe, expect, it, vi } from "vitest";
import { composite, dedupe, fromOpenFoodFacts, fromUsda, kjToKcal, openFoodFacts, usda } from "./foodProvider";
import type { FoodItem, FoodProvider } from "./foodProvider";

const json = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

describe("mapping Open Food Facts", () => {
  it("takes the stated kcal when there is one", () => {
    const item = fromOpenFoodFacts({
      code: "9300675024235",
      product_name: "Rolled Oats",
      brands: "Uncle Tobys, Nestle",
      nutriments: { "energy-kcal_100g": 389, proteins_100g: 13.1, carbohydrates_100g: 58, fat_100g: 8.1 },
    });
    expect(item).toMatchObject({
      id: "off:9300675024235",
      name: "Rolled Oats",
      brand: "Uncle Tobys",     // first brand only, not the whole comma list
      caloriesPer100g: 389,
      source: "Open Food Facts",
    });
  });

  it("falls back to converting the kilojoules", () => {
    // Australian labels are in kJ. A product with only energy_100g must not
    // report zero calories — that is a food that looks free to eat.
    const item = fromOpenFoodFacts({ product_name: "Muesli Bar", nutriments: { energy_100g: 1650 } });
    expect(item?.caloriesPer100g).toBeCloseTo(kjToKcal(1650), 1);
    expect(item?.caloriesPer100g).toBeGreaterThan(390);
  });

  it("leaves undeclared micronutrients undefined, not zero", () => {
    // The micronutrient card is built on this distinction: a label that says
    // nothing about iron is not a label declaring no iron.
    const declared = fromOpenFoodFacts({ product_name: "A", nutriments: { fiber_100g: 10, iron_100g: 0.004 } });
    expect(declared?.micronutrients).toEqual({ fibre: 10, iron: 4 }); // g -> mg
    const silent = fromOpenFoodFacts({ product_name: "B", nutriments: { proteins_100g: 5 } });
    expect(silent?.micronutrients).toBeUndefined();
  });

  it("drops an unnamed product rather than logging a blank", () => {
    expect(fromOpenFoodFacts({ code: "123", nutriments: { proteins_100g: 5 } })).toBeNull();
  });
});

describe("mapping USDA", () => {
  it("reads nutrients by id, not by name", () => {
    const item = fromUsda({
      fdcId: 171705,
      description: "Chicken, broilers or fryers, breast, meat only, raw",
      foodNutrients: [
        { nutrientId: 1008, value: 120 },
        { nutrientId: 1003, value: 22.5 },
        { nutrientId: 1004, value: 2.6 },
        { nutrientId: 1093, value: 45 },
      ],
    });
    expect(item).toMatchObject({ caloriesPer100g: 120, proteinPer100g: 22.5, fatPer100g: 2.6 });
    expect(item?.micronutrients).toEqual({ sodium: 45 });
  });

  it("refuses a serving size measured in millilitres", () => {
    // FDC records ml for drinks. Taking that as grams is exactly the silent
    // volume-to-mass guess the conversion module exists to refuse.
    const drink = fromUsda({ fdcId: 1, description: "Cola", servingSize: 355, servingSizeUnit: "ml" });
    expect(drink?.gramsPerServing).toBeUndefined();
    const solid = fromUsda({ fdcId: 2, description: "Oats", servingSize: 40, servingSizeUnit: "g" });
    expect(solid?.gramsPerServing).toBe(40);
  });
});

describe("running both", () => {
  const off: FoodItem = { id: "off:1", name: "Rolled Oats", caloriesPer100g: 389, proteinPer100g: 13, carbsPer100g: 58, fatPer100g: 8, barcode: "9300675024235", source: "Open Food Facts" };
  const stub = (name: string, items: FoodItem[]): FoodProvider => ({
    name, search: () => Promise.resolve(items), byBarcode: () => Promise.resolve(items[0] ?? null),
  });
  const broken = (name: string): FoodProvider => ({
    name, search: () => Promise.reject(new Error("down")), byBarcode: () => Promise.reject(new Error("down")),
  });

  it("returns the survivors when one provider is down", async () => {
    const both = composite([broken("USDA"), stub("OFF", [off])]);
    await expect(both.search("oats")).resolves.toHaveLength(1);
  });

  it("returns nothing rather than throwing when both are down", async () => {
    const both = composite([broken("A"), broken("B")]);
    await expect(both.search("oats")).resolves.toEqual([]);
    await expect(both.byBarcode("123")).resolves.toBeNull();
  });

  it("stops at the first provider that has the barcode", async () => {
    const second = vi.fn(() => Promise.resolve(null));
    const both = composite([stub("OFF", [off]), { name: "USDA", search: () => Promise.resolve([]), byBarcode: second }]);
    await expect(both.byBarcode("9300675024235")).resolves.toMatchObject({ id: "off:1" });
    expect(second, "second provider should not be called on a hit").not.toHaveBeenCalled();
  });
});

describe("collapsing duplicates", () => {
  const base = { proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0, source: "x" };

  it("treats a shared barcode as the same food", () => {
    const a: FoodItem = { ...base, id: "off:1", name: "Oats", caloriesPer100g: 389, barcode: "123" };
    const b: FoodItem = { ...base, id: "usda:2", name: "Oats, rolled", caloriesPer100g: 380, barcode: "123" };
    expect(dedupe([a, b])).toHaveLength(1);
  });

  it("prefers the row that actually has nutrition", () => {
    // A contributor who left the panel blank should not shadow a complete row
    // from the other database.
    const blank: FoodItem = { ...base, id: "off:1", name: "Oats", caloriesPer100g: 0, barcode: "123" };
    const full: FoodItem = { ...base, id: "usda:2", name: "Oats", caloriesPer100g: 389, barcode: "123" };
    expect(dedupe([blank, full])[0]).toMatchObject({ id: "usda:2", caloriesPer100g: 389 });
  });

  it("does not merge raw and cooked", () => {
    // ~50% apart per 100 g. Fuzzy matching would quietly collapse these, so the
    // key is exact name+brand and two similar rows on screen is the cheap error.
    const raw: FoodItem = { ...base, id: "u:1", name: "Chicken breast, raw", caloriesPer100g: 120 };
    const cooked: FoodItem = { ...base, id: "u:2", name: "Chicken breast, cooked", caloriesPer100g: 165 };
    expect(dedupe([raw, cooked])).toHaveLength(2);
  });
});

describe("against a real payload", () => {
  it("maps the Nutella response Open Food Facts actually returns", () => {
    // Captured live from
    // world.openfoodfacts.org/api/v2/product/3017620422003.json
    // Pinned because the shape assumptions here -- a comma-joined brand list,
    // sodium reported in grams, both kcal and kJ present, serving_quantity
    // absent -- are the ones a provider change would quietly break.
    const item = fromOpenFoodFacts({
      code: "3017620422003",
      product_name: "Nutella",
      brands: "Nutella, Ferrero",
      nutriments: {
        "energy-kcal_100g": 539,
        energy_100g: 2252,
        proteins_100g: 6.3,
        carbohydrates_100g: 57.5,
        fat_100g: 30.9,
        sodium_100g: 0.0428,
      },
    });
    expect(item).toMatchObject({
      id: "off:3017620422003",
      name: "Nutella",
      brand: "Nutella",
      caloriesPer100g: 539,
      proteinPer100g: 6.3,
      gramsPerServing: undefined,
    });
    expect(item?.micronutrients).toEqual({ sodium: 42.8 });
    // The stated kcal and the stated kJ agree to within a rounding step, which
    // is the check that the kJ fallback would have produced the same answer.
    expect(Math.abs(kjToKcal(2252) - 539)).toBeLessThan(1);
  });
});

describe("the wire", () => {
  it("reads OFF's status field, not just the HTTP code", async () => {
    // OFF answers 200 with status 0 for a barcode it does not hold.
    const provider = openFoodFacts(() => json({ status: 0 }));
    await expect(provider.byBarcode("000")).resolves.toBeNull();
  });

  it("asks this app's Worker, never USDA directly", async () => {
    // The key would be public if it shipped in the bundle, and FoodData Central
    // sends no CORS headers, so the browser could not reach it anyway.
    const seen: string[] = [];
    const fetcher = ((input: string) => {
      seen.push(input);
      return json({ foods: [] });
    }) as never;
    await usda(fetcher).search("rolled oats");
    const url = seen[0] ?? "";
    expect(url).toMatch(/^\/api\/food\/search\?q=/);
    expect(url).not.toContain("nal.usda.gov");
    expect(url).not.toContain("api_key");
  });

  it("degrades to nothing when the Worker says the key is unconfigured", async () => {
    // The Worker answers 503 with a message naming the fix. The app should fall
    // back to Open Food Facts alone, not error on every keystroke.
    const unconfigured = () =>
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ error: "not configured" }) } as unknown as Response);
    await expect(usda(unconfigured).search("oats")).resolves.toEqual([]);
    await expect(usda(unconfigured).byBarcode("123")).resolves.toBeNull();
  });

  it("only accepts a USDA barcode hit that really carries that barcode", async () => {
    // The UPC lookup is a text search upstream, so a product merely mentioning
    // the digits must not be returned as a scan match.
    const provider = usda(() =>
      json({ foods: [{ fdcId: 1, description: "Not it", gtinUpc: "999", foodNutrients: [] }] })
    );
    await expect(provider.byBarcode("123")).resolves.toBeNull();
  });
});

describe("an outage is not an exception", () => {
  it("survives a 200 carrying an HTML status page", async () => {
    // Open Food Facts is currently serving 503 + text/html on its search
    // endpoint. `response.ok` catches that one, but a 200 with an outage page
    // is a real shape during partial failures and `.json()` throws on it.
    const htmlOk = () =>
      Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("Unexpected token <")) } as unknown as Response);
    await expect(openFoodFacts(htmlOk).search("oats")).resolves.toEqual([]);
    await expect(openFoodFacts(htmlOk).byBarcode("3017620422003")).resolves.toBeNull();
  });

  it("survives the 503 the search endpoint is returning today", async () => {
    const down = () => Promise.resolve({ ok: false, status: 503, json: () => Promise.reject(new Error()) } as unknown as Response);
    await expect(openFoodFacts(down).search("oats")).resolves.toEqual([]);
    await expect(usda(down).search("oats")).resolves.toEqual([]);
  });
});
