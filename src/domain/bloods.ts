import { IsoDate } from "./state";

/**
 * Blood work, kept beside the training that produced it.
 *
 * The idea is WHOOP's Advanced Labs: a biomarker panel is far more useful when
 * it sits next to what the body was actually doing in the fortnight before the
 * needle went in. A creatine kinase of 480 means one thing drawn on a rest day
 * and something else entirely drawn thirty-six hours after a start, and the
 * pathology report has no way of knowing which it was. This app does.
 *
 * ## The line this does not cross
 *
 * WHOOP employs clinicians to review results. This does not, so it does not
 * interpret them. What it does is narrower and honest:
 *
 *   - records what the lab measured, in the units the lab used;
 *   - compares each value against **the reference range printed on the
 *     athlete's own report**, falling back to a typical adult-male range only
 *     until that is entered;
 *   - shows what the training week around the draw looked like;
 *   - and sends anything outside the range to a doctor rather than explaining
 *     it.
 *
 * No value here is ever labelled as a cause, a diagnosis or a thing to treat.
 * A number outside a range is reported as a number outside a range.
 *
 * ## Units
 *
 * SI throughout, because the athlete tests in Australia and every Australian
 * pathology report reads in SI. Testosterone in nmol/L, glucose in mmol/L,
 * ferritin in µg/L. Copying US reference ranges onto an Australian report is
 * the single easiest way to make this feature dangerous — a testosterone of
 * "15" is mid-range in nmol/L and profoundly low in ng/dL.
 */

export type MarkerGroup =
  | "oxygen"
  | "muscle"
  | "hormonal"
  | "inflammation"
  | "metabolic"
  | "organ"
  | "micronutrient";

export const GROUP_LABELS: Record<MarkerGroup, string> = {
  oxygen: "Oxygen carrying",
  muscle: "Muscle and load",
  hormonal: "Hormonal",
  inflammation: "Inflammation and immune",
  metabolic: "Metabolic",
  organ: "Organ function",
  micronutrient: "Micronutrients",
};

export interface Marker {
  id: string;
  label: string;
  unit: string;
  group: MarkerGroup;
  /**
   * A typical adult-male range, used only until the athlete enters the one
   * printed on their own report. Ranges differ between laboratories and
   * assays; the printed one always wins.
   */
  typical: { low: number | null; high: number | null };
  places: number;
  /**
   * Why a thrower might care, and — where it applies — why the population
   * range is the wrong lens. Never an interpretation of a result.
   */
  note: string;
  /**
   * Markers that routinely sit outside the population range in a trained
   * athlete without anything being wrong. These are flagged as "expected to
   * vary" rather than as out of range, because a red mark on every post-game
   * CK trains the athlete to ignore red marks.
   */
  expectedToVary?: boolean;
}

/**
 * The panel.
 *
 * Chosen for a throwing athlete rather than copied from a consumer product:
 * every one of these is routinely orderable through a GP in Australia, and
 * each has a plausible connection to training availability, recovery or
 * fatigue. It is deliberately shorter than WHOOP's sixty-five — a marker
 * nobody will act on is a number that makes the page harder to read.
 */
export const MARKERS: readonly Marker[] = Object.freeze([
  // --- oxygen carrying
  {
    id: "haemoglobin",
    label: "Haemoglobin",
    unit: "g/L",
    group: "oxygen",
    typical: { low: 130, high: 175 },
    places: 0,
    note: "Oxygen carrying capacity. Endurance and repeat-effort recovery lean on it.",
  },
  {
    id: "ferritin",
    label: "Ferritin",
    unit: "µg/L",
    group: "oxygen",
    typical: { low: 30, high: 300 },
    places: 0,
    note: "Iron stores. Worth watching even inside the range — a low-normal ferritin is a common and treatable cause of unexplained fatigue in athletes, and it is the number to take to a doctor rather than to self-manage with supplements.",
  },
  {
    id: "transferrinSat",
    label: "Transferrin saturation",
    unit: "%",
    group: "oxygen",
    typical: { low: 20, high: 50 },
    places: 0,
    note: "Read alongside ferritin: it separates genuinely low iron stores from ferritin raised by inflammation.",
  },

  // --- muscle and load
  {
    id: "ck",
    label: "Creatine kinase",
    unit: "U/L",
    group: "muscle",
    typical: { low: 40, high: 200 },
    places: 0,
    expectedToVary: true,
    note: "Muscle damage. Routinely several times the population range in a trained athlete for days after hard work, so the population range is close to meaningless here — the useful comparison is against your own previous draws taken at a similar point in the week.",
  },
  {
    id: "urea",
    label: "Urea",
    unit: "mmol/L",
    group: "muscle",
    typical: { low: 3.0, high: 8.0 },
    places: 1,
    expectedToVary: true,
    note: "Rises with protein intake, heavy training and dehydration. Read with creatinine rather than alone.",
  },

  // --- hormonal
  {
    id: "testosterone",
    label: "Testosterone (total)",
    unit: "nmol/L",
    group: "hormonal",
    typical: { low: 10, high: 30 },
    places: 1,
    note: "Anabolic status. A single reading says little — it varies through the day and falls with acute fatigue — so the trend across draws taken at the same time of morning is what carries information.",
  },
  {
    id: "shbg",
    label: "SHBG",
    unit: "nmol/L",
    group: "hormonal",
    typical: { low: 15, high: 50 },
    places: 0,
    note: "How much of that testosterone is bound rather than free. Only meaningful beside the testosterone figure.",
  },
  {
    id: "cortisol",
    label: "Cortisol (morning)",
    unit: "nmol/L",
    group: "hormonal",
    typical: { low: 130, high: 550 },
    places: 0,
    note: "Take it at the same hour every time — cortisol falls steeply through the morning, so a draw at 7am and one at 10am are not comparable.",
  },

  // --- inflammation and immune
  {
    id: "hsCrp",
    label: "hs-CRP",
    unit: "mg/L",
    group: "inflammation",
    typical: { low: null, high: 3 },
    places: 1,
    expectedToVary: true,
    note: "Systemic inflammation. Rises with any recent infection and with heavy eccentric work, so a single high reading after a hard week is not the same as a persistently high one.",
  },
  {
    id: "wbc",
    label: "White cell count",
    unit: "×10⁹/L",
    group: "inflammation",
    typical: { low: 4.0, high: 11.0 },
    places: 1,
    note: "Immune status. Relevant mostly when it moves alongside a run of poor sleep or a period of unusually high load.",
  },

  // --- metabolic
  {
    id: "glucose",
    label: "Fasting glucose",
    unit: "mmol/L",
    group: "metabolic",
    typical: { low: 3.0, high: 5.5 },
    places: 1,
    note: "Fasting only — a reading taken after breakfast means nothing against this range.",
  },
  {
    id: "hba1c",
    label: "HbA1c",
    unit: "%",
    group: "metabolic",
    typical: { low: null, high: 5.7 },
    places: 1,
    note: "Average glucose over roughly three months, so it is the one metabolic marker a single bad week cannot move.",
  },

  // --- organ function
  {
    id: "creatinine",
    label: "Creatinine",
    unit: "µmol/L",
    group: "organ",
    typical: { low: 60, high: 110 },
    places: 0,
    expectedToVary: true,
    note: "Runs high in muscular athletes and after heavy training without anything being wrong. eGFR calculated from it carries the same caveat.",
  },
  {
    id: "alt",
    label: "ALT",
    unit: "U/L",
    group: "organ",
    typical: { low: null, high: 41 },
    places: 0,
    expectedToVary: true,
    note: "Liver enzyme, but also released by skeletal muscle — so it rises after hard training too. Read beside CK before reading anything into it.",
  },
  {
    id: "tsh",
    label: "TSH",
    unit: "mIU/L",
    group: "organ",
    typical: { low: 0.4, high: 4.0 },
    places: 2,
    note: "Thyroid. On the panel because it is one of the ordinary explanations for persistent fatigue that has nothing to do with training.",
  },

  // --- micronutrients
  {
    id: "vitaminD",
    label: "Vitamin D (25-OH)",
    unit: "nmol/L",
    group: "micronutrient",
    typical: { low: 50, high: 150 },
    places: 0,
    note: "Bone and muscle function. Falls through winter even in Queensland, and winter is when this athlete's season runs.",
  },
  {
    id: "magnesium",
    label: "Magnesium",
    unit: "mmol/L",
    group: "micronutrient",
    typical: { low: 0.7, high: 1.1 },
    places: 2,
    note: "Serum magnesium is a blunt instrument — most of the body's magnesium is not in serum — so treat it as a rough screen rather than a verdict.",
  },
  {
    id: "zinc",
    label: "Zinc",
    unit: "µmol/L",
    group: "micronutrient",
    typical: { low: 10, high: 18 },
    places: 1,
    note: "Involved in immune function and healing. Ranges vary widely between laboratories, so the printed range matters more than usual.",
  },
]);

const BY_ID = new Map(MARKERS.map((marker) => [marker.id, marker]));

// --- Stored panels --------------------------------------------------------------

export interface MarkerResult {
  value: number;
  /** The range printed on the athlete's own report, when they entered it. */
  low?: number;
  high?: number;
}

export interface BloodPanel {
  /** The date of the draw, not the date of the report. */
  date: IsoDate;
  /** Where it was done, for the athlete's own records. */
  lab?: string;
  results: Record<string, MarkerResult>;
  note?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function readPanels(value: unknown): BloodPanel[] {
  if (!Array.isArray(value)) return [];
  const out: BloodPanel[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.date !== "string" || !ISO.test(entry.date)) continue;

    const results: Record<string, MarkerResult> = {};
    if (typeof entry.results === "object" && entry.results !== null) {
      for (const [id, item] of Object.entries(entry.results as Record<string, unknown>)) {
        if (!BY_ID.has(id) || typeof item !== "object" || item === null) continue;
        const record = item as Record<string, unknown>;
        const value = finite(record.value);
        // Zero is a plausible reading for almost none of these and is what an
        // emptied input coerces to, so it is treated as "not entered".
        if (value === null || value <= 0) continue;
        const low = finite(record.low);
        const high = finite(record.high);
        results[id] = {
          value,
          ...(low !== null && low >= 0 ? { low } : {}),
          ...(high !== null && high > 0 ? { high } : {}),
        };
      }
    }
    if (Object.keys(results).length === 0) continue;

    out.push({
      date: entry.date as IsoDate,
      results,
      ...(typeof entry.lab === "string" && entry.lab.trim() ? { lab: entry.lab.trim() } : {}),
      ...(typeof entry.note === "string" && entry.note.trim() ? { note: entry.note.trim() } : {}),
    });
  }
  const byDate = new Map(out.map((panel) => [panel.date, panel]));
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

// --- Reading a result -------------------------------------------------------------

export type Flag = "in-range" | "below" | "above" | "expected-to-vary" | "no-range";

export interface Reading {
  marker: Marker;
  result: MarkerResult;
  /** The range actually used — the athlete's if entered, otherwise typical. */
  low: number | null;
  high: number | null;
  /** True when the range came from the athlete's own report. */
  ownRange: boolean;
  flag: Flag;
  /** The previous panel's value for the same marker, for a direction. */
  previous: { value: number; date: IsoDate } | null;
  change: number | null;
}

export function rangeFor(marker: Marker, result: MarkerResult): { low: number | null; high: number | null; ownRange: boolean } {
  const hasOwn = result.low !== undefined || result.high !== undefined;
  if (hasOwn) return { low: result.low ?? null, high: result.high ?? null, ownRange: true };
  return { ...marker.typical, ownRange: false };
}

export function flagFor(marker: Marker, result: MarkerResult): Flag {
  const { low, high } = rangeFor(marker, result);
  if (low === null && high === null) return "no-range";
  const outside = (low !== null && result.value < low) || (high !== null && result.value > high);
  if (!outside) return "in-range";
  // A marker that routinely sits outside the population range in a trained
  // athlete is reported as such. Flagging every post-game CK as abnormal is
  // how an athlete learns to ignore the flags that matter.
  return marker.expectedToVary ? "expected-to-vary" : result.value < (low ?? -Infinity) ? "below" : "above";
}

/** Every marker in a panel, with its range, flag and change since last time. */
export function readPanel(panel: BloodPanel, history: readonly BloodPanel[]): Reading[] {
  const earlier = history.filter((entry) => entry.date < panel.date);

  return MARKERS.filter((marker) => panel.results[marker.id] !== undefined).map((marker) => {
    const result = panel.results[marker.id];
    const { low, high, ownRange } = rangeFor(marker, result);
    const found = earlier.find((entry) => entry.results[marker.id] !== undefined);
    const previous = found ? { value: found.results[marker.id].value, date: found.date } : null;

    return {
      marker,
      result,
      low,
      high,
      ownRange,
      flag: flagFor(marker, result),
      previous,
      change:
        previous === null
          ? null
          : Number((result.value - previous.value).toFixed(marker.places + 1)),
    };
  });
}

/** Anything a doctor should be looking at, in the order it should be raised. */
export function needsReview(readings: readonly Reading[]): Reading[] {
  return readings.filter((reading) => reading.flag === "below" || reading.flag === "above");
}

export function formatValue(marker: Marker, value: number): string {
  return `${value.toFixed(marker.places)} ${marker.unit}`;
}

export function formatRange(reading: Pick<Reading, "marker" | "low" | "high">): string {
  const { marker, low, high } = reading;
  if (low === null && high === null) return "no range";
  if (low === null) return `< ${high!.toFixed(marker.places)}`;
  if (high === null) return `> ${low.toFixed(marker.places)}`;
  return `${low.toFixed(marker.places)}–${high.toFixed(marker.places)}`;
}

// --- What the training looked like around the draw ----------------------------

/**
 * The fortnight the sample was taken in.
 *
 * This is the whole reason the panel lives inside a training app rather than
 * in the pathology portal. A creatine kinase of 480 means one thing on a rest
 * day and something quite different thirty-six hours after a start, and the
 * laboratory has no way of knowing which it was.
 *
 * It reports what happened. It does not say what any of it caused — that
 * inference is a doctor's, and it is a better one for having these numbers in
 * front of them.
 */
export interface DrawContext {
  /** Days since the most recent game or high-intent throwing day. */
  daysSinceHardThrow: number | null;
  hardThrowOn: IsoDate | null;
  /** Throws logged in the seven days up to and including the draw. */
  throwsInWeek: number;
  /** Sessions with any throwing in that week. */
  throwingDays: number;
  /** Mean sleep across the check-ins in that week, where recorded. */
  meanSleepHours: number | null;
  /** Kilograms lifted in that week, from logged sets only. */
  tonnageKg: number;
}

/** Days between two ISO dates, positive when `to` is later. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  );
}

export interface ContextInput {
  outings: readonly { date: IsoDate; gamePitches?: number | null; totalThrows?: number | null; intentPercent?: number | null; competitiveStart?: boolean }[];
  /** Check-ins, for sleep. */
  sleepByDate: Record<string, number | undefined>;
  /** Kilograms lifted per date, from logged sets. */
  tonnageByDate: Record<string, number | undefined>;
}

/** What "hard" means here: a competitive start, or genuine high intent. */
const HARD_INTENT = 85;

export function drawContext(date: IsoDate, input: ContextInput): DrawContext {
  const windowStart = new Date(Date.parse(`${date}T00:00:00Z`) - 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const inWindow = input.outings.filter((outing) => outing.date >= windowStart && outing.date <= date);

  let throwsInWeek = 0;
  for (const outing of inWindow) {
    throwsInWeek += Number(outing.totalThrows ?? 0) || Number(outing.gamePitches ?? 0) || 0;
  }

  const hard = input.outings
    .filter(
      (outing) =>
        outing.date <= date &&
        (outing.competitiveStart === true || Number(outing.intentPercent ?? 0) >= HARD_INTENT)
    )
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  const sleeps: number[] = [];
  for (const [day, hours] of Object.entries(input.sleepByDate)) {
    if (day < windowStart || day > date) continue;
    const value = Number(hours);
    if (Number.isFinite(value) && value > 0) sleeps.push(value);
  }

  let tonnageKg = 0;
  for (const [day, kg] of Object.entries(input.tonnageByDate)) {
    if (day < windowStart || day > date) continue;
    tonnageKg += Number(kg) || 0;
  }

  return {
    daysSinceHardThrow: hard ? daysBetween(hard.date, date) : null,
    hardThrowOn: hard ? hard.date : null,
    throwsInWeek,
    throwingDays: inWindow.length,
    meanSleepHours: sleeps.length
      ? Number((sleeps.reduce((sum, value) => sum + value, 0) / sleeps.length).toFixed(1))
      : null,
    tonnageKg: Math.round(tonnageKg),
  };
}

/** One line describing the week, for the panel header. */
export function describeContext(context: DrawContext): string {
  const parts: string[] = [];
  if (context.daysSinceHardThrow !== null) {
    parts.push(
      context.daysSinceHardThrow === 0
        ? "drawn on a high-intent throwing day"
        : `${context.daysSinceHardThrow} day${context.daysSinceHardThrow === 1 ? "" : "s"} after the last high-intent throwing day`
    );
  }
  if (context.throwsInWeek > 0) {
    parts.push(
      `${context.throwsInWeek} throws across ${context.throwingDays} session${context.throwingDays === 1 ? "" : "s"} in the week before`
    );
  }
  if (context.tonnageKg > 0) parts.push(`${context.tonnageKg.toLocaleString()} kg lifted`);
  if (context.meanSleepHours !== null) parts.push(`${context.meanSleepHours} h mean sleep`);

  if (parts.length === 0) return "No training logged in the week before this draw.";
  return `${parts[0][0].toUpperCase()}${parts[0].slice(1)}${parts.length > 1 ? ` · ${parts.slice(1).join(" · ")}` : ""}.`;
}
