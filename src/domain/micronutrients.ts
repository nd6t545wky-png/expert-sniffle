/**
 * Micronutrients, tracked honestly.
 *
 * The app counted calories and three macros. Everything else a food carries —
 * iron, calcium, sodium, fibre — was fetched from the label database and
 * thrown away. That is the gap between a calorie counter and a nutrition tool.
 *
 * The hard part is not the arithmetic, it is refusing to lie. A food label
 * that does not declare iron is not a food with no iron, and every tracker on
 * the market treats it as one: it adds a missing value as zero, and the day's
 * iron total comes out as a number that looks precise and is simply wrong,
 * with nothing on screen to say so.
 *
 * So every nutrient here reports three things, not one:
 *
 *   - The total across the foods that *declared* it.
 *   - How many of the day's foods declared it, out of how many were eaten.
 *   - Whether that makes the total a real figure or a floor.
 *
 * When some foods stayed silent the number is presented as "at least", and
 * the app never says a target was missed on the strength of it. Undercounting
 * loudly beats miscounting quietly.
 *
 * Targets are the Australian NRVs (NHMRC/MoH) for a man aged 19–30, which is
 * the athlete's own jurisdiction, with two athlete-specific notes carried in
 * the copy rather than baked into the numbers — sodium and fluid both move
 * with sweat, and a summer session in Brisbane is not a sedentary day.
 * Nothing here is clinical advice, and the UI says so.
 */

/** How a nutrient's target should be read. */
export type TargetKind =
  /** Aim to reach it. */
  | "floor"
  /** Aim to stay under it. */
  | "ceiling";

export interface Micronutrient {
  id: string;
  /** Plain English, as an athlete would say it. */
  label: string;
  unit: "mg" | "µg" | "g";
  /** Australian NRV for a man 19–30, or the guidance figure where there is no RDI. */
  target: number;
  kind: TargetKind;
  /** What it does, for a reader who has not met it before. */
  why: string;
  /** Decimal places when shown. */
  precision: number;
}

/**
 * The tracked list.
 *
 * Chosen on two grounds at once: it matters for a throwing athlete, and a food
 * label plausibly declares it. A nutrient nothing ever reports would be a
 * permanent empty row teaching the athlete to ignore the card.
 */
export const MICRONUTRIENTS: Micronutrient[] = [
  {
    id: "fibre",
    label: "Fibre",
    unit: "g",
    target: 30,
    kind: "floor",
    why: "Keeps digestion steady on a high-carbohydrate training diet.",
    precision: 1,
  },
  {
    id: "saturatedFat",
    label: "Saturated fat",
    unit: "g",
    target: 25,
    kind: "ceiling",
    why: "Guidance is under about 10% of your energy. This figure moves with your calorie target.",
    precision: 1,
  },
  {
    id: "sugars",
    label: "Sugars",
    unit: "g",
    target: 90,
    kind: "ceiling",
    why: "Includes the sugar in fruit and milk, not only added sugar — so a high number is not automatically a problem.",
    precision: 1,
  },
  {
    id: "sodium",
    label: "Sodium",
    unit: "mg",
    target: 2000,
    kind: "ceiling",
    why: "This ceiling is for a normal day. A long session in the heat loses sodium in sweat, and replacing it is not overeating it.",
    precision: 0,
  },
  {
    id: "potassium",
    label: "Potassium",
    unit: "mg",
    target: 3800,
    kind: "floor",
    why: "Works with sodium in fluid balance and muscle contraction.",
    precision: 0,
  },
  {
    id: "calcium",
    label: "Calcium",
    unit: "mg",
    target: 1000,
    kind: "floor",
    why: "Bone. It matters more, not less, for an athlete taking repeated impact.",
    precision: 0,
  },
  {
    id: "iron",
    label: "Iron",
    unit: "mg",
    target: 8,
    kind: "floor",
    why: "Carries oxygen in the blood. Low iron shows up as unexplained fatigue long before anything else.",
    precision: 1,
  },
  {
    id: "magnesium",
    label: "Magnesium",
    unit: "mg",
    target: 400,
    kind: "floor",
    why: "Used in muscle contraction and energy production.",
    precision: 0,
  },
  {
    id: "zinc",
    label: "Zinc",
    unit: "mg",
    target: 14,
    kind: "floor",
    why: "Immune function and tissue repair, both under load in a training block.",
    precision: 1,
  },
  {
    id: "vitaminC",
    label: "Vitamin C",
    unit: "mg",
    target: 45,
    kind: "floor",
    why: "Connective-tissue repair, and it helps you absorb iron from plants.",
    precision: 0,
  },
  {
    id: "vitaminD",
    label: "Vitamin D",
    unit: "µg",
    target: 5,
    kind: "floor",
    why: "Bone and muscle function. Most of it comes from sunlight rather than food, so a low figure here is not the whole picture.",
    precision: 1,
  },
  {
    id: "vitaminB12",
    label: "Vitamin B12",
    unit: "µg",
    target: 2.4,
    kind: "floor",
    why: "Red blood cells and nerve function. Comes almost entirely from animal foods.",
    precision: 1,
  },
];

export type MicronutrientId = (typeof MICRONUTRIENTS)[number]["id"];

/** What one food declared. A missing key means the label did not say. */
export type MicronutrientAmounts = Partial<Record<string, number>>;

/**
 * Saturated fat scales with the energy target, which is the only sensible
 * reading of "under 10% of energy". Everything else is a fixed reference
 * value that does not move with the day.
 */
export function targetFor(nutrient: Micronutrient, calories?: number | null): number {
  if (nutrient.id !== "saturatedFat") return nutrient.target;
  const energy = Number(calories);
  if (!Number.isFinite(energy) || energy <= 0) return nutrient.target;
  // 10% of energy, at 9 kcal per gram of fat.
  return Math.round((energy * 0.1) / 9);
}

export interface NutrientTotal {
  nutrient: Micronutrient;
  /** Summed across the foods that declared it. */
  total: number;
  /** The target in force, which for saturated fat depends on the day. */
  target: number;
  /** How many of the day's foods declared this nutrient. */
  declaredBy: number;
  /** How many foods were eaten in total. */
  foods: number;
  /**
   * True when at least one food stayed silent, so the total is a floor.
   * Nothing downstream may call a floor a shortfall.
   */
  partial: boolean;
  /** Total as a percentage of the target, rounded. */
  percent: number;
}

/**
 * The day, nutrient by nutrient.
 *
 * `foods` is every meal logged, including those that declared nothing — that
 * is precisely the count that makes the coverage figure honest. Dropping them
 * would produce "declared by 2 of 2" on a day of five meals.
 */
export function dailyMicronutrients(
  foods: MicronutrientAmounts[],
  options: { calories?: number | null } = {}
): NutrientTotal[] {
  return MICRONUTRIENTS.map((nutrient) => {
    let total = 0;
    let declaredBy = 0;
    for (const food of foods) {
      const value = Number(food?.[nutrient.id]);
      // Zero is a real declaration — a label saying "sugars 0 g" is data. Only
      // an absent key means the label did not say.
      if (food?.[nutrient.id] === undefined || food?.[nutrient.id] === null) continue;
      if (!Number.isFinite(value) || value < 0) continue;
      total += value;
      declaredBy += 1;
    }

    const target = targetFor(nutrient, options.calories);
    const rounded = Math.round(total * 10) / 10;
    return {
      nutrient,
      total: rounded,
      target,
      declaredBy,
      foods: foods.length,
      partial: declaredBy < foods.length,
      percent: target > 0 ? Math.round((rounded / target) * 100) : 0,
    };
  });
}

/** How much of the day the tracked nutrients actually covered. */
export interface Coverage {
  /** Nutrients with at least one declaration today. */
  tracked: number;
  /** Nutrients in the list. */
  total: number;
  /** Foods logged today. */
  foods: number;
  /** Foods that declared nothing at all beyond the macros. */
  silentFoods: number;
}

export function micronutrientCoverage(foods: MicronutrientAmounts[]): Coverage {
  const totals = dailyMicronutrients(foods);
  return {
    tracked: totals.filter((row) => row.declaredBy > 0).length,
    total: MICRONUTRIENTS.length,
    foods: foods.length,
    silentFoods: foods.filter((food) =>
      MICRONUTRIENTS.every((nutrient) => food?.[nutrient.id] === undefined || food?.[nutrient.id] === null)
    ).length,
  };
}

// --- Plain-English findings --------------------------------------------------

export interface MicronutrientFinding {
  severity: "watch" | "note";
  text: string;
}

/**
 * How far under a floor the day has to be before it is worth saying.
 *
 * A day at 92% of the calcium target is not a finding, it is a day. The band
 * exists so the card is not permanently shouting.
 */
export const SHORTFALL_PCT = 60;

/**
 * What today's numbers say, in words.
 *
 * The rule that shapes all of this: **a partial figure never produces a
 * shortfall finding.** If two of five foods declared iron, the total is a
 * floor, and telling the athlete they are low on iron would be inventing a
 * fact out of a missing label. Those nutrients are reported as unknown
 * instead, which is the true statement.
 */
export function micronutrientFindings(totals: NutrientTotal[]): MicronutrientFinding[] {
  const findings: MicronutrientFinding[] = [];

  for (const row of totals) {
    if (row.declaredBy === 0) continue;

    if (row.nutrient.kind === "ceiling") {
      // A ceiling is the one direction a floor *can* be judged on: if the
      // declared foods alone already exceed it, the silent ones can only make
      // it worse. Under it, a partial figure says nothing.
      if (row.total > row.target) {
        findings.push({
          severity: "watch",
          text: `${row.nutrient.label} is ${row.total}${row.nutrient.unit}${
            row.partial ? " from the foods that declared it alone" : ""
          }, over the ${row.target}${row.nutrient.unit} mark.`,
        });
      }
      continue;
    }

    if (row.partial) continue;
    if (row.percent < SHORTFALL_PCT) {
      findings.push({
        severity: "watch",
        text: `${row.nutrient.label} is ${row.percent}% of the ${row.target}${row.nutrient.unit} target, and every food today declared it — so that is the real figure.`,
      });
    }
  }

  return findings;
}

/**
 * The one sentence the card leads with.
 *
 * Says what is known and what is not, in that order, because the second half
 * is the part every other tracker leaves out.
 */
export function coverageSentence(coverage: Coverage): string {
  if (coverage.foods === 0) return "Nothing logged yet today.";
  if (coverage.tracked === 0) {
    return `None of today’s ${coverage.foods} ${coverage.foods === 1 ? "food" : "foods"} carried label detail beyond the macros, so there is nothing to total here.`;
  }
  const silent =
    coverage.silentFoods > 0
      ? ` ${coverage.silentFoods} of ${coverage.foods} ${coverage.silentFoods === 1 ? "food" : "foods"} declared none of them, so those totals are floors rather than answers.`
      : " Every food today declared at least one, so these are real totals.";
  return `${coverage.tracked} of ${coverage.total} nutrients have something to report.${silent}`;
}
