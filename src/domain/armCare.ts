/**
 * Objective arm testing.
 *
 * The largest gap in the app for a pitcher: arm health was a soreness slider,
 * which is the weakest signal available. This is the measured version — a
 * repeatable hand-held dynamometer battery, scored against the athlete's own
 * history rather than a population.
 *
 * Nothing here is a black box. Every figure is arithmetic the athlete can
 * check, and the UI prints the definition beside it:
 *
 *   - Strength is normalised to bodyweight, because an absolute kilogram
 *     figure is not comparable across a season in which bodyweight moved.
 *   - Arm Score is the summed throwing-arm strength as a percentage of
 *     bodyweight. That is the whole definition.
 *   - ER:IR is external over internal rotation on the throwing arm. Throwers
 *     drift toward internal-rotation dominance, and a low ratio is the
 *     long-standing screening flag for it.
 *   - Symmetry is throwing arm over non-throwing arm.
 *   - Fatigue is post-outing over pre-outing on the same day, against the 90%
 *     retention target used in the field.
 *
 * These are screening numbers for a healthy athlete's own tracking. They are
 * not a diagnosis and not clearance to throw, and the screen says so.
 */

import { IsoDate } from "./state";

/** The battery. Ordered as it is performed, so the form reads as a protocol. */
export const ARM_TESTS = [
  { id: "shoulderIr", label: "Shoulder internal rotation", short: "IR" },
  { id: "shoulderEr", label: "Shoulder external rotation", short: "ER" },
  { id: "scaption", label: "Scaption", short: "Scap" },
  { id: "elbowFlexion", label: "Elbow flexion", short: "Flex" },
  { id: "elbowExtension", label: "Elbow extension", short: "Ext" },
  { id: "grip", label: "Grip", short: "Grip" },
] as const;

export type ArmTestId = (typeof ARM_TESTS)[number]["id"];

/** One side's readings, in kilograms. Absent means not measured. */
export type SideReadings = Partial<Record<ArmTestId, number>>;

export interface ArmExam {
  id: string;
  date: IsoDate;
  /** "fresh" is a normal test day; the other two bracket an outing. */
  timing: "fresh" | "preOuting" | "postOuting";
  bodyweightKg: number;
  throwing: SideReadings;
  nonThrowing: SideReadings;
  notes?: string;
}

/** The tests that make up the composite. Elbow and grip included — the whole
 * limb carries throwing load, not just the cuff. */
const SCORE_TESTS: ArmTestId[] = [
  "shoulderIr",
  "shoulderEr",
  "scaption",
  "elbowFlexion",
  "elbowExtension",
  "grip",
];

function positive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Sum of the readings actually taken, and how many there were. */
function sumTaken(side: SideReadings, tests: ArmTestId[] = SCORE_TESTS) {
  let total = 0;
  let count = 0;
  for (const test of tests) {
    const value = positive(side[test]);
    if (value !== null) {
      total += value;
      count += 1;
    }
  }
  return { total, count };
}

export interface ArmScore {
  /** Summed throwing-arm strength as a percentage of bodyweight. */
  score: number;
  /** How many of the six tests contributed. */
  testsUsed: number;
  /** True only when the whole battery was completed. */
  complete: boolean;
}

/**
 * Arm Score: summed throwing-arm strength ÷ bodyweight × 100.
 *
 * Returns null without a bodyweight or without any reading — a score built
 * from a guessed bodyweight is wrong in a way nobody can see afterwards.
 *
 * A partial battery still scores, but is flagged incomplete: comparing a
 * four-test score against a six-test one would read as a large strength loss
 * that never happened, so the UI must never plot them together silently.
 */
export function armScore(exam: Pick<ArmExam, "throwing" | "bodyweightKg">): ArmScore | null {
  const weight = positive(exam.bodyweightKg);
  if (weight === null) return null;
  const { total, count } = sumTaken(exam.throwing);
  if (count === 0) return null;
  return {
    score: Math.round((total / weight) * 100),
    testsUsed: count,
    complete: count === SCORE_TESTS.length,
  };
}

/** A ratio, plus whether it clears the screening threshold. */
export interface RatioResult {
  value: number;
  /** Below the threshold this is worth attention. */
  belowThreshold: boolean;
}

/**
 * External over internal rotation on the throwing arm.
 *
 * Throwing drives internal-rotation dominance over a season. 0.70 is the
 * conventional screening floor — a threshold for a conversation, not a
 * diagnosis.
 */
export const ER_IR_FLOOR = 0.7;

export function erIrRatio(side: SideReadings): RatioResult | null {
  const er = positive(side.shoulderEr);
  const ir = positive(side.shoulderIr);
  if (er === null || ir === null) return null;
  const value = Math.round((er / ir) * 100) / 100;
  return { value, belowThreshold: value < ER_IR_FLOOR };
}

/** Throwing arm as a percentage of the non-throwing arm. */
export const SYMMETRY_BAND: [number, number] = [85, 115];

export function limbSymmetry(exam: Pick<ArmExam, "throwing" | "nonThrowing">): RatioResult | null {
  // Only tests taken on *both* sides may be compared — summing four throwing
  // readings against six non-throwing ones manufactures an asymmetry.
  const shared = SCORE_TESTS.filter(
    (test) => positive(exam.throwing[test]) !== null && positive(exam.nonThrowing[test]) !== null
  );
  if (shared.length === 0) return null;

  const throwing = sumTaken(exam.throwing, shared).total;
  const other = sumTaken(exam.nonThrowing, shared).total;
  if (other <= 0) return null;

  const value = Math.round((throwing / other) * 100);
  return { value, belowThreshold: value < SYMMETRY_BAND[0] || value > SYMMETRY_BAND[1] };
}

/**
 * Strength retained after an outing, as a percentage of the pre-outing test.
 *
 * The field target is to hold better than 90%. Only readings present in both
 * tests are compared, for the same reason symmetry only compares shared tests.
 */
export const RETENTION_TARGET = 90;

export function fatigueRetention(pre: ArmExam, post: ArmExam): RatioResult | null {
  const shared = SCORE_TESTS.filter(
    (test) => positive(pre.throwing[test]) !== null && positive(post.throwing[test]) !== null
  );
  if (shared.length === 0) return null;

  const before = sumTaken(pre.throwing, shared).total;
  const after = sumTaken(post.throwing, shared).total;
  if (before <= 0) return null;

  const value = Math.round((after / before) * 100);
  return { value, belowThreshold: value < RETENTION_TARGET };
}

// --- History -----------------------------------------------------------------

/** How many prior exams before the app will call a score unusual. */
export const MIN_EXAMS_FOR_TREND = 3;

export interface ArmTrend {
  latest: number;
  /** Mean of the complete prior exams. */
  average: number | null;
  /** Latest minus the average, as a percentage of the average. */
  changePct: number | null;
  verdict: "stronger" | "steady" | "weaker" | "unknown";
  observations: number;
}

/**
 * The latest score against the athlete's own average.
 *
 * Only *complete* batteries are compared, so a rushed four-test day cannot
 * register as a strength loss. Below three prior exams there is no average
 * worth the name and the verdict stays unknown.
 */
export function armTrend(exams: ArmExam[]): ArmTrend | null {
  const scored = exams
    .map((exam) => ({ exam, score: armScore(exam) }))
    .filter((row): row is { exam: ArmExam; score: ArmScore } => row.score !== null)
    .filter((row) => row.exam.timing !== "postOuting")
    .sort((a, b) => a.exam.date.localeCompare(b.exam.date));

  const complete = scored.filter((row) => row.score.complete);
  if (complete.length === 0) return null;

  const latest = complete[complete.length - 1];
  const priors = complete.slice(0, -1);

  if (priors.length < MIN_EXAMS_FOR_TREND) {
    return {
      latest: latest.score.score,
      average: null,
      changePct: null,
      verdict: "unknown",
      observations: priors.length,
    };
  }

  const average =
    Math.round((priors.reduce((sum, row) => sum + row.score.score, 0) / priors.length) * 10) / 10;
  const changePct = Math.round(((latest.score.score - average) / average) * 1000) / 10;

  // A 5% band around the athlete's own average is treated as unchanged —
  // dynamometry is not precise enough to call a 2% move a real one.
  const verdict = changePct > 5 ? "stronger" : changePct < -5 ? "weaker" : "steady";

  return {
    latest: latest.score.score,
    average,
    changePct,
    verdict,
    observations: priors.length,
  };
}

/** The most recent pre/post pair on the same day, for the fatigue figure. */
export function latestOutingPair(exams: ArmExam[]): { pre: ArmExam; post: ArmExam } | null {
  const byDate = [...exams].sort((a, b) => b.date.localeCompare(a.date));
  for (const post of byDate) {
    if (post.timing !== "postOuting") continue;
    const pre = byDate.find(
      (exam) => exam.date === post.date && exam.timing === "preOuting"
    );
    if (pre) return { pre, post };
  }
  return null;
}

function isExam(value: unknown): value is ArmExam {
  if (typeof value !== "object" || value === null) return false;
  const exam = value as ArmExam;
  return typeof exam.id === "string" && typeof exam.date === "string";
}

/** Exams read defensively out of synced state, oldest first. */
export function readExams(value: unknown): ArmExam[] {
  return Array.isArray(value)
    ? value.filter(isExam).sort((a, b) => a.date.localeCompare(b.date))
    : [];
}

// --- Plain-English findings --------------------------------------------------

export interface ArmFinding {
  severity: "watch" | "note";
  text: string;
}

/**
 * What the numbers say, in words.
 *
 * Deliberately conservative: each finding names the measurement and the
 * threshold it crossed, so it can be argued with. Nothing here says what to do
 * about it — that is a decision for the athlete and whoever is qualified to
 * advise them.
 */
export function armFindings(exam: ArmExam, trend: ArmTrend | null, fatigue: RatioResult | null): ArmFinding[] {
  const findings: ArmFinding[] = [];

  const ratio = erIrRatio(exam.throwing);
  if (ratio?.belowThreshold) {
    findings.push({
      severity: "watch",
      text: `External-to-internal rotation is ${ratio.value.toFixed(2)}, below the ${ER_IR_FLOOR} screening floor.`,
    });
  }

  const symmetry = limbSymmetry(exam);
  if (symmetry?.belowThreshold) {
    findings.push({
      severity: "watch",
      text: `Throwing arm is ${symmetry.value}% of the other side, outside the ${SYMMETRY_BAND[0]}–${SYMMETRY_BAND[1]}% band.`,
    });
  }

  if (fatigue?.belowThreshold) {
    findings.push({
      severity: "watch",
      text: `Held ${fatigue.value}% of pre-outing strength, under the ${RETENTION_TARGET}% target.`,
    });
  }

  if (trend?.verdict === "weaker" && trend.changePct !== null) {
    findings.push({
      severity: "watch",
      text: `Arm Score is ${Math.abs(trend.changePct)}% below your own average of ${trend.average}.`,
    });
  }

  if (trend?.verdict === "stronger" && trend.changePct !== null) {
    findings.push({
      severity: "note",
      text: `Arm Score is ${trend.changePct}% above your average — strength is trending up.`,
    });
  }

  return findings;
}
