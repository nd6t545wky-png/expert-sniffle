import { describe, expect, it } from "vitest";
import {
  MICRONUTRIENTS,
  SHORTFALL_PCT,
  coverageSentence,
  dailyMicronutrients,
  micronutrientCoverage,
  micronutrientFindings,
  targetFor,
} from "./micronutrients";

const row = (totals: ReturnType<typeof dailyMicronutrients>, id: string) =>
  totals.find((entry) => entry.nutrient.id === id)!;

describe("dailyMicronutrients", () => {
  it("sums only the foods that declared the nutrient", () => {
    const totals = dailyMicronutrients([{ iron: 3 }, { iron: 2 }, { calcium: 200 }]);
    expect(row(totals, "iron").total).toBe(5);
    expect(row(totals, "iron").declaredBy).toBe(2);
    expect(row(totals, "iron").foods).toBe(3);
  });

  it("marks a total as partial when any food stayed silent", () => {
    // This is the difference between the app and every calorie tracker: a food
    // with no iron figure is not a food with no iron.
    expect(row(dailyMicronutrients([{ iron: 3 }, { calcium: 200 }]), "iron").partial).toBe(true);
    expect(row(dailyMicronutrients([{ iron: 3 }, { iron: 1 }]), "iron").partial).toBe(false);
  });

  it("treats a declared zero as data, not as silence", () => {
    // "Sugars 0 g" on a label is a real statement about the food.
    const totals = dailyMicronutrients([{ sugars: 0 }, { sugars: 4 }]);
    expect(row(totals, "sugars").declaredBy).toBe(2);
    expect(row(totals, "sugars").partial).toBe(false);
    expect(row(totals, "sugars").total).toBe(4);
  });

  it("ignores a negative or unreadable figure rather than subtracting it", () => {
    const totals = dailyMicronutrients([{ iron: -2 }, { iron: Number.NaN }, { iron: 3 }]);
    expect(row(totals, "iron").total).toBe(3);
    expect(row(totals, "iron").declaredBy).toBe(1);
  });

  it("reports every nutrient in the list, even the untouched ones", () => {
    expect(dailyMicronutrients([])).toHaveLength(MICRONUTRIENTS.length);
    expect(row(dailyMicronutrients([]), "zinc").declaredBy).toBe(0);
  });

  it("works out each nutrient as a percentage of its target", () => {
    // Calcium target is 1000 mg.
    expect(row(dailyMicronutrients([{ calcium: 250 }]), "calcium").percent).toBe(25);
  });
});

describe("targetFor", () => {
  const saturated = MICRONUTRIENTS.find((n) => n.id === "saturatedFat")!;
  const iron = MICRONUTRIENTS.find((n) => n.id === "iron")!;

  it("scales saturated fat with the day's energy, at 10% of calories", () => {
    // 3600 kcal × 10% ÷ 9 kcal per gram = 40 g.
    expect(targetFor(saturated, 3600)).toBe(40);
  });

  it("falls back to the fixed figure without a calorie target", () => {
    expect(targetFor(saturated, null)).toBe(saturated.target);
    expect(targetFor(saturated, 0)).toBe(saturated.target);
  });

  it("leaves every other nutrient's target alone", () => {
    expect(targetFor(iron, 4000)).toBe(iron.target);
  });
});

describe("micronutrientCoverage", () => {
  it("counts the nutrients with something to report", () => {
    const coverage = micronutrientCoverage([{ iron: 3, calcium: 200 }, { sodium: 400 }]);
    expect(coverage.tracked).toBe(3);
    expect(coverage.total).toBe(MICRONUTRIENTS.length);
  });

  it("counts foods that declared nothing at all", () => {
    const coverage = micronutrientCoverage([{ iron: 3 }, {}, {}]);
    expect(coverage.foods).toBe(3);
    expect(coverage.silentFoods).toBe(2);
  });
});

describe("micronutrientFindings", () => {
  it("will not call a partial total a shortfall", () => {
    // Two of three foods stayed silent on iron. Saying "you are low on iron"
    // would be inventing a fact out of a missing label.
    const totals = dailyMicronutrients([{ iron: 0.5 }, {}, {}]);
    expect(micronutrientFindings(totals)).toEqual([]);
  });

  it("calls a shortfall when every food declared the nutrient", () => {
    const totals = dailyMicronutrients([{ iron: 1 }, { iron: 1 }]);
    const findings = micronutrientFindings(totals);
    expect(findings).toHaveLength(1);
    expect(findings[0].text).toMatch(/Iron is 25% of the 8mg target/);
    expect(findings[0].text).toMatch(/every food today declared it/);
  });

  it("says nothing about a nutrient comfortably inside its band", () => {
    const totals = dailyMicronutrients([{ calcium: 900 }]);
    expect(micronutrientFindings(totals)).toEqual([]);
  });

  it("flags a ceiling even on a partial total, because silence can only add", () => {
    // Sodium ceiling is 2000 mg. The declared foods alone already clear it, so
    // the unknown ones cannot bring it back down.
    const totals = dailyMicronutrients([{ sodium: 2500 }, {}]);
    const findings = micronutrientFindings(totals);
    expect(findings).toHaveLength(1);
    expect(findings[0].text).toMatch(/from the foods that declared it alone/);
  });

  it("says nothing about a ceiling that has not been crossed", () => {
    expect(micronutrientFindings(dailyMicronutrients([{ sodium: 800 }, {}]))).toEqual([]);
  });

  it("says nothing at all about a nutrient nobody declared", () => {
    expect(micronutrientFindings(dailyMicronutrients([{}, {}]))).toEqual([]);
  });

  it("uses the shortfall band rather than shouting about a near miss", () => {
    const near = dailyMicronutrients([{ calcium: (SHORTFALL_PCT / 100) * 1000 + 10 }]);
    expect(micronutrientFindings(near)).toEqual([]);
  });
});

describe("coverageSentence", () => {
  it("says nothing is logged when nothing is", () => {
    expect(coverageSentence(micronutrientCoverage([]))).toMatch(/Nothing logged yet/);
  });

  it("says so plainly when no food carried label detail", () => {
    expect(coverageSentence(micronutrientCoverage([{}, {}]))).toMatch(
      /None of today’s 2 foods carried label detail/
    );
  });

  it("names the totals as floors when some foods stayed silent", () => {
    expect(coverageSentence(micronutrientCoverage([{ iron: 3 }, {}]))).toMatch(
      /those totals are floors rather than answers/
    );
  });

  it("says the totals are real when every food declared something", () => {
    expect(coverageSentence(micronutrientCoverage([{ iron: 3 }, { calcium: 90 }]))).toMatch(
      /these are real totals/
    );
  });
});
