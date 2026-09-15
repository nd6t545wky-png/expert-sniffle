import { describe, expect, it } from "vitest";
import { convert, scalePer100g, toGrams } from "./servingSize";

describe("mass converts exactly", () => {
  it("uses the defined ounce and pound, not rounded ones", () => {
    // 28.35 and 453.6 are the rounded values people reach for. Over a 200 g
    // chicken breast logged daily the drift is small; over a year of logging
    // it is a systematic bias, and there is no reason to accept one.
    expect(toGrams(1, "oz")).toMatchObject({ ok: true, grams: 28.3495, exact: true });
    expect(toGrams(1, "lb")).toMatchObject({ ok: true, grams: 453.5924, exact: true });
    expect(toGrams(2.5, "kg")).toMatchObject({ ok: true, grams: 2500, exact: true });
  });

  it("round-trips without a basis", () => {
    expect(convert(500, "g", "lb")).toMatchObject({ ok: true, exact: true });
    const back = convert(1.1023, "lb", "g");
    expect(back.ok && Math.abs(back.grams - 500)).toBeLessThan(0.05);
  });
});

describe("the tablespoon trap", () => {
  it("is 20 ml here and 15 ml in America", () => {
    // The single highest-value assertion in this file. An Australian tablespoon
    // is four teaspoons; everywhere else it is three. Reading a US recipe with
    // Australian spoons overstates by a third, silently, every time.
    const oil = { density: 0.92 };
    const au = toGrams(1, "tbsp", oil, "metric");
    const us = toGrams(1, "tbsp", oil, "us");
    expect(au).toMatchObject({ ok: true, grams: 18.4 });
    expect(us).toMatchObject({ ok: true, grams: 13.8 });
    expect(au.ok && us.ok && au.grams / us.grams).toBeCloseTo(20 / 15, 6);
  });

  it("defaults to the Australian measures, because the athlete is in Brisbane", () => {
    expect(toGrams(1, "cup", { density: 1 })).toMatchObject({ grams: 250 });
    expect(toGrams(1, "cup", { density: 1 }, "us")).toMatchObject({ grams: 240 });
  });
});

describe("volume refuses to become mass without a density", () => {
  it("will not guess", () => {
    // The failure this module exists for. A cup of oats is ~90 g and a cup of
    // honey is ~340 g; anything that answers this question without knowing
    // which is in the cup is wrong by up to 3.8x.
    const refused = toGrams(1, "cup", {});
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.reason).toBe("needs-density");
    expect(refused.ok === false && refused.detail).toContain("250 ml");
  });

  it("obliges once told, and marks the answer inexact", () => {
    const oats = toGrams(1, "cup", { density: 0.36 });
    const honey = toGrams(1, "cup", { density: 1.42 });
    expect(oats).toMatchObject({ ok: true, grams: 90, exact: false });
    expect(honey).toMatchObject({ ok: true, grams: 355, exact: false });
  });

  it("converts volume to volume with no density at all", () => {
    // The grams cancel, so this one is exact and needs nothing.
    expect(convert(1, "cup", "tbsp")).toMatchObject({ ok: true, grams: 12.5, exact: true });
    expect(convert(1, "l", "ml")).toMatchObject({ ok: true, grams: 1000, exact: true });
  });
});

describe("servings only work when the food says what one weighs", () => {
  it("refuses an unweighed serving", () => {
    const r = toGrams(2, "serving", {});
    expect(r.ok === false && r.reason).toBe("needs-serving-weight");
  });

  it("uses the declared weight when there is one", () => {
    expect(toGrams(2, "serving", { gramsPerServing: 30 })).toMatchObject({ ok: true, grams: 60, exact: false });
  });
});

describe("rejects nonsense rather than returning a number", () => {
  it.each([
    [NaN, "g", "not-a-number"],
    [Infinity, "g", "not-a-number"],
    [-1, "g", "negative"],
    [1, "furlong", "unknown-unit"],
  ])("%s %s -> %s", (qty, unit, reason) => {
    const r = toGrams(qty as number, unit);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe(reason);
  });

  it("treats zero as a real quantity, not an error", () => {
    expect(toGrams(0, "g")).toMatchObject({ ok: true, grams: 0 });
  });
});

describe("scaling per-100g figures", () => {
  it("is the multiplication the whole log depends on", () => {
    expect(scalePer100g(389, 40)).toBe(155.6);   // oats, 40 g
    expect(scalePer100g(0, 250)).toBe(0);
    expect(scalePer100g(165, 0)).toBe(0);
  });

  it("never returns NaN for missing data", () => {
    // A database entry with a null nutrient must read as 0 in the total, not
    // poison every downstream sum.
    expect(scalePer100g(NaN, 100)).toBe(0);
    expect(scalePer100g(100, NaN)).toBe(0);
  });
});
