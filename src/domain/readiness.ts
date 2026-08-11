/**
 * Pre-session readiness scoring.
 *
 * Ported from the prototype (`legacy/app.js`, `calculateReadiness`) with the
 * weightings, thresholds and flag precedence preserved exactly. Behaviour is
 * intentionally unchanged — this is a migration, not a redesign.
 *
 * The prototype read baselines from module-level state. Here they are passed
 * in explicitly, so scoring is a pure function and can be tested without a
 * browser or a populated store.
 */

export type PlanLevel = "full" | "reduced" | "recovery" | "hold";
export type RiskLevel = "green" | "yellow" | "orange" | "red";
export type MetricSource = "oura" | "apple";
// "as_expected" is the prototype's wording for the neutral answer; "same" is
// the same thing under an older name. Both are accepted so stored records from
// either vintage keep scoring identically — neither raises a signal.
export type PreviousSessionResponse = "better" | "as_expected" | "same" | "worse" | "much_worse" | "";

/** Workload multiplier applied to prescriptions for each plan level. */
export const WORKLOAD_FACTOR: Readonly<Record<PlanLevel, number>> = Object.freeze({
  full: 1,
  reduced: 0.75,
  recovery: 0.5,
  hold: 0,
});

export interface ReadinessInputs {
  /** Hours slept. Scored against an 8.5h reference. */
  sleepHours: number;
  /** 1-5 scales. */
  sleepQuality: number;
  energy: number;
  mood: number;
  /** 1-5, higher is worse. */
  stress: number;

  /** Soreness / symptoms, 0-10, higher is worse. */
  shoulder: number;
  elbow: number;
  forearm: number;
  lat: number;
  lower: number;

  illness?: "yes" | "no" | "";
  /** New or worsening symptom warning signs. */
  warningSigns?: "yes" | "no" | "";
  previousSessionResponse?: PreviousSessionResponse;

  /** Optional wearable inputs. */
  ouraReadinessScore?: number;
  ouraStressHighMinutes?: number;
  ouraTemperatureDeviation?: number;
  ouraRestMode?: "yes" | "no" | "";
  hrvMs?: number;
  restingHeartRate?: number;
}

export interface Baseline {
  /** Median of recent same-source values. */
  value: number;
  /** How many observations back the median. Gated at >= 5 before use. */
  count: number;
}

/**
 * Personal baselines and metric provenance for the date being scored.
 * Supplied by the caller so this module stays pure.
 */
export interface ReadinessContext {
  hrvBaseline?: Baseline;
  restingHeartRateBaseline?: Baseline;
  sleepHoursBaseline?: Baseline;
  energyBaseline?: Baseline;
  moodBaseline?: Baseline;
  stressBaseline?: Baseline;
  hrvSource?: MetricSource;
  restingHeartRateSource?: MetricSource;
  sleepSource?: MetricSource;
}

export type SignalSeverity = "moderate" | "high";

export interface ReadinessSignal {
  type: string;
  severity: SignalSeverity;
  text: string;
}

export interface ReadinessResult {
  score: number;
  risk: RiskLevel;
  planLevel: PlanLevel;
  workloadFactor: number;
  reasons: string[];
  signals: ReadinessSignal[];
  hrvSource?: MetricSource;
  restingHeartRateSource?: MetricSource;
  sleepSource?: MetricSource;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

const NO_BASELINE: Baseline = { value: 0, count: 0 };
const sourceLabel = (source?: MetricSource) => (source === "oura" ? "Oura" : "Apple Health");

/** Baselines are only trusted once there are at least this many observations. */
export const BASELINE_MIN_COUNT = 5;

export function computeReadiness(values: ReadinessInputs, context: ReadinessContext = {}): ReadinessResult {
  // --- Subjective component -------------------------------------------------
  const sleep = clamp((Number(values.sleepHours) / 8.5) * 100, 0, 100);
  const sleepQuality = (Number(values.sleepQuality) / 5) * 100;
  const energy = (Number(values.energy) / 5) * 100;
  const mood = (Number(values.mood) / 5) * 100;
  const stress = ((6 - Number(values.stress)) / 5) * 100;

  const painValues = [values.shoulder, values.elbow, values.forearm, values.lat, values.lower].map(Number);
  const pain = 100 - (painValues.reduce((sum, item) => sum + item, 0) / painValues.length) * 10;

  const subjectiveScore =
    sleep * 0.2 + sleepQuality * 0.1 + energy * 0.15 + mood * 0.1 + stress * 0.15 + pain * 0.3;

  // --- Blend in Oura readiness when present --------------------------------
  const ouraReadiness = Number(values.ouraReadinessScore);
  const ouraStressMinutes = Number(values.ouraStressHighMinutes);
  const ouraTemperatureDeviation = Number(values.ouraTemperatureDeviation);
  const ouraRestMode = values.ouraRestMode === "yes";

  let score =
    Number.isFinite(ouraReadiness) && ouraReadiness > 0
      ? subjectiveScore * 0.75 + ouraReadiness * 0.25
      : subjectiveScore;

  // --- Deviation signals ----------------------------------------------------
  const hrvBaseline = context.hrvBaseline ?? NO_BASELINE;
  const rhrBaseline = context.restingHeartRateBaseline ?? NO_BASELINE;
  const hrv = Number(values.hrvMs);
  const restingHeartRate = Number(values.restingHeartRate);
  const signals: ReadinessSignal[] = [];

  if (hrvBaseline.count >= BASELINE_MIN_COUNT && Number.isFinite(hrv) && hrv > 0 && hrv < hrvBaseline.value * 0.8) {
    const change = Math.round((1 - hrv / hrvBaseline.value) * 100);
    signals.push({
      type: "hrv",
      severity: "moderate",
      text: `${sourceLabel(context.hrvSource)} HRV is ${change}% below its recent same-source median`,
    });
  }

  if (rhrBaseline.count >= BASELINE_MIN_COUNT && Number.isFinite(restingHeartRate) && restingHeartRate > 0) {
    const threshold = Math.max(7, rhrBaseline.value * 0.1);
    if (restingHeartRate > rhrBaseline.value + threshold) {
      signals.push({
        type: "rhr",
        severity: "moderate",
        text: `${sourceLabel(context.restingHeartRateSource)} resting heart rate is elevated versus its recent same-source median`,
      });
    }
  }

  if (Number.isFinite(ouraStressMinutes) && ouraStressMinutes >= 180) {
    signals.push({
      type: "oura_stress",
      severity: ouraStressMinutes >= 300 ? "high" : "moderate",
      text: `Oura recorded ${Math.round(ouraStressMinutes)} high-stress minutes`,
    });
  }

  if (Number.isFinite(ouraTemperatureDeviation) && Math.abs(ouraTemperatureDeviation) >= 0.8) {
    signals.push({
      type: "temperature",
      severity: Math.abs(ouraTemperatureDeviation) >= 1.2 ? "high" : "moderate",
      text: `Oura temperature deviation was ${ouraTemperatureDeviation > 0 ? "+" : ""}${ouraTemperatureDeviation.toFixed(1)}°C`,
    });
  }

  if (ouraRestMode) signals.push({ type: "rest_mode", severity: "high", text: "Oura Rest Mode is active" });

  const sleepBaseline = context.sleepHoursBaseline ?? NO_BASELINE;
  const energyBaseline = context.energyBaseline ?? NO_BASELINE;
  const moodBaseline = context.moodBaseline ?? NO_BASELINE;
  const stressBaseline = context.stressBaseline ?? NO_BASELINE;

  if (sleepBaseline.count >= BASELINE_MIN_COUNT && Number(values.sleepHours) <= sleepBaseline.value - 1.5) {
    signals.push({
      type: "sleep_baseline",
      severity: "moderate",
      text: `Sleep is ${round(sleepBaseline.value - Number(values.sleepHours), 1)} hours below your recent median`,
    });
  }
  if (energyBaseline.count >= BASELINE_MIN_COUNT && Number(values.energy) <= energyBaseline.value - 2) {
    signals.push({ type: "energy_baseline", severity: "moderate", text: "Energy is at least two points below your recent median" });
  }
  if (moodBaseline.count >= BASELINE_MIN_COUNT && Number(values.mood) <= moodBaseline.value - 2) {
    signals.push({ type: "mood_baseline", severity: "moderate", text: "Mood / motivation is at least two points below your recent median" });
  }
  if (stressBaseline.count >= BASELINE_MIN_COUNT && Number(values.stress) >= stressBaseline.value + 2) {
    signals.push({ type: "stress_baseline", severity: "moderate", text: "Life stress is at least two points above your recent median" });
  }

  if (values.previousSessionResponse === "worse") {
    signals.push({ type: "previous_response", severity: "moderate", text: "You reported feeling worse after the previous logged session" });
  }
  if (values.previousSessionResponse === "much_worse") {
    signals.push({ type: "previous_response", severity: "high", text: "You reported feeling much worse after the previous logged session" });
  }

  // Signals cost 6 points each, capped at 12.
  score -= Math.min(12, signals.length * 6);
  score = Math.round(clamp(score, 0, 100));

  // --- Flags. Precedence: red > recovery > reduced > full -------------------
  const warningSigns = values.warningSigns === "yes";
  const redFlag =
    Number(values.shoulder) >= 5 || Number(values.elbow) >= 5 || values.illness === "yes" || warningSigns;

  const recoveryFlag =
    !redFlag &&
    (score < 60 ||
      (Number.isFinite(ouraReadiness) && ouraReadiness > 0 && ouraReadiness < 60) ||
      (Number.isFinite(ouraStressMinutes) && ouraStressMinutes >= 300) ||
      ouraRestMode ||
      Number(values.stress) >= 5 ||
      Number(values.energy) <= 1 ||
      Number(values.sleepHours) < 5.5 ||
      painValues.some((value) => value >= 4) ||
      values.previousSessionResponse === "much_worse" ||
      signals.length >= 2);

  const reducedFlag =
    !redFlag &&
    !recoveryFlag &&
    (score < 75 ||
      (Number.isFinite(ouraReadiness) && ouraReadiness > 0 && ouraReadiness < 70) ||
      (Number.isFinite(ouraStressMinutes) && ouraStressMinutes >= 180) ||
      Number(values.stress) >= 4 ||
      Number(values.energy) <= 2 ||
      Number(values.sleepHours) < 6.5 ||
      painValues.some((value) => value >= 3) ||
      values.previousSessionResponse === "worse" ||
      signals.length === 1);

  const reasons: string[] = [];
  if (warningSigns) reasons.push("A new or worsening symptom warning sign was reported");
  if (values.illness === "yes") reasons.push("Illness symptoms were reported");
  if (Number(values.shoulder) >= 5) reasons.push(`Shoulder symptoms ${values.shoulder}/10`);
  if (Number(values.elbow) >= 5) reasons.push(`Elbow symptoms ${values.elbow}/10`);
  if (!redFlag && painValues.some((value) => value >= 3)) {
    reasons.push("One or more soreness areas reached the workload-adjustment threshold");
  }
  if (Number(values.sleepHours) < 6.5) reasons.push(`Sleep was ${values.sleepHours} hours`);
  if (Number(values.stress) >= 4) reasons.push(`Life stress was ${values.stress}/5`);
  if (Number(values.energy) <= 2) reasons.push(`Energy was ${values.energy}/5`);
  if (Number.isFinite(ouraReadiness) && ouraReadiness > 0 && ouraReadiness < 70) {
    reasons.push(`Oura readiness was ${ouraReadiness}/100`);
  }
  reasons.push(...signals.map((signal) => signal.text));

  const planLevel: PlanLevel = redFlag ? "hold" : recoveryFlag ? "recovery" : reducedFlag ? "reduced" : "full";
  const risk: RiskLevel = redFlag ? "red" : recoveryFlag ? "orange" : reducedFlag ? "yellow" : "green";

  return {
    score,
    risk,
    planLevel,
    workloadFactor: WORKLOAD_FACTOR[planLevel],
    reasons: reasons.length ? reasons : ["Readiness inputs are within the full-session guardrails"],
    signals,
    hrvSource: context.hrvSource,
    restingHeartRateSource: context.restingHeartRateSource,
    sleepSource: context.sleepSource,
  };
}

/**
 * A `hold` is a medical gate, not a workload preference: it is raised by
 * new/worsening warning signs, illness, or shoulder/elbow symptoms at 5+.
 * The prototype refuses to let it be overridden in-app, and so does this.
 */
export function canOverridePlanLevel(result: Pick<ReadinessResult, "planLevel" | "risk">): boolean {
  return result.planLevel !== "hold" && result.risk !== "red";
}
