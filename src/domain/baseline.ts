/**
 * Baseline testing data for the athlete.
 *
 * Two measured reports, transcribed verbatim. Nothing here is estimated,
 * interpolated or inferred — every value carries the report it came from and
 * the date it was measured, because a training prescription computed from a
 * number is only as good as the provenance of that number.
 *
 * Sources:
 *  1. Griffith University Bone Densitometry & Body Composition — 2D fan-beam
 *     DEXA, scanned 27/04/2026, reported 11/06/2026.
 *  2. VALD ForceDecks Performance Report — squat jump, countermovement jump,
 *     drop jump, back-squat load-velocity profile and MFT muscle-typology
 *     scan. Undated in the document; filed under the 2026 pre-season block.
 *
 * The DEXA report states "BMD from Whole Body mode not for diagnostic use."
 * That caveat travels with the data: this is training context, not a clinical
 * assessment, and it does not replace medical review.
 */

export interface Measurement {
  label: string;
  value: string;
  /** Report's own classification or reference context, where it gave one. */
  context?: string;
  /** True when the report itself flagged this as below target. */
  flagged?: boolean;
}

export interface BaselineSection {
  title: string;
  source: string;
  measuredOn: string;
  note?: string;
  measures: Measurement[];
}

/**
 * Training anchors the reports established directly. These are the numbers
 * the programme computes loads from.
 */
export const BASELINE_ANCHORS = {
  /** Confirmed by 5-set velocity-based testing, R² = 0.942. */
  backSquat1RmKg: 145,
  /** L0/2 from the load-velocity profile — the report's prescribed load zone
   *  for power-focused squat work. */
  optimalPowerLoadKg: 94,
  /** The report's strength-block intensity window. */
  strengthPercentRange: [77, 87] as const,
  /** Mean bar velocity measured at 80% of 1RM. */
  meanVelocityAt80Pct: 0.51,
  /** Report's reactive-development box height. */
  depthJumpBoxCm: [15, 20] as const,
  /**
   * Trap bar deadlift training max, back-derived from the programme itself.
   *
   * Not from a test — from arithmetic on the athlete's own plan. The programme
   * carries a fifty-two-week trap bar table of `sets × reps @ percent`
   * (`TRAP_BAR_WEEK_SPECS`) *and*, separately, the winter block's written
   * loads: "4 × 5 @ 120 kg", "5 × 3 @ 127.5 kg", "6 × 2 @ 125 kg" and so on.
   * One is a percentage of a max the app was never told; the other is that
   * same max already multiplied out. So the max is solvable.
   *
   * At 150 kg the two tables agree on nine of their twelve weeks — every week
   * where they also agree on the set and rep count — and no other candidate
   * agrees on even one. The three that miss are the three where the shapes
   * disagree as well (the specs say 3 × 5, the literals say 4 × 2), so those
   * rows describe different weeks rather than a different max.
   *
   * Marked `derived` rather than `tested`, which is what `trapBarDose` reads
   * to write "estimated training max" beside the load. Retest it and the
   * athlete's own number replaces this one, as it should.
   */
  trapBarDeadlift1RmKg: 150,
  /**
   * External load on the trap bar jump, as a share of the tested squat max.
   *
   * Back-derived, not prescribed by a study: the programme writes the trap bar
   * jump at a flat 30 kg, and 30 kg is 20% of this athlete's tested 145 kg. It
   * is written as a percentage so it moves when the max is retested, which the
   * flat number never did.
   *
   * Twenty per cent sits inside the band the loaded-jump literature reports for
   * peak power — studies of the jump squat put it low, commonly between
   * bodyweight alone and about 30% of squat 1RM, and they disagree with each
   * other about where in that band, which is why Cormie, McGuigan & Newton
   * (Sports Med 2011;41(1):17–38 and 41(2):125–146, "Developing maximal
   * neuromuscular power") conclude the optimal load is exercise- and
   * athlete-specific and has to be individualised rather than looked up. So the
   * athlete's own programme supplies the number and the literature supplies the
   * check that it is a sane one.
   *
   * The hexagonal bar is the right implement for it: Swinton, Stewart, Lloyd,
   * Agouris & Keogh (J Strength Cond Res 2012;26(4):906–13, "Effect of load
   * positioning on the kinematics and kinetics of weighted vertical jumps")
   * compared hexagonal-barbell and straight-barbell weighted jumps across a
   * range of loads and found the hexagonal bar produced greater peak power,
   * force and velocity — the load sits at the hips rather than on the back, so
   * more of it goes into the jump.
   */
  jumpPowerPercentOf1Rm: 20,
  /** Measured basal metabolic rate, Harris-Benedict via DEXA lean mass. */
  basalMetabolicRateKcal: 2028,
  /** DEXA, 2026-04-27. Lean mass is what protein targets should scale to. */
  bodyMassKg: 89.4,
  leanMassKg: 65.6,
  fatMassKg: 20.2,
  bodyFatPercent: 22.6,
  heightCm: 177,
} as const;

export const BASELINE_SECTIONS: BaselineSection[] = [
  {
    title: "Body composition",
    source: "Griffith University DEXA (2D fan beam)",
    measuredOn: "2026-04-27",
    note: "Whole-body BMD is not for diagnostic use. Training context only.",
    measures: [
      { label: "Body mass", value: "89.4 kg", context: "88.0 kg on the scan header" },
      { label: "Height", value: "177 cm" },
      { label: "Body fat", value: "22.6%", context: "Fat mass 20.2 kg" },
      { label: "Lean mass", value: "65.6 kg", context: "73.4% of total" },
      { label: "Fat mass index", value: "6.5 kg/m²", context: "Normal band, near the excess-fat boundary" },
      { label: "Lean mass index", value: "21.0 kg/m²" },
      { label: "Appendicular lean mass index", value: "9.3 kg/m²" },
      { label: "BMI", value: "28.09 kg/m²", context: "Report classifies 25–29.9 as overweight", flagged: true },
      { label: "Visceral adipose tissue", value: "504.7 g", context: "92.5 cm² area" },
      { label: "Android : gynoid fat ratio", value: "0.97" },
      { label: "Basal metabolic rate", value: "2028 kcal/day", context: "Harris-Benedict" },
      { label: "Total bone mineral density", value: "1.441 g/cm²" },
      {
        label: "Arm lean mass (L / R)",
        value: "3.98 / 3.93 kg",
        context: "1.2% difference — within scan precision, not a finding",
      },
      { label: "Leg lean mass (L / R)", value: "10.48 / 10.86 kg", context: "3.6% difference" },
    ],
  },
  {
    title: "Force plate — jump testing",
    source: "VALD ForceDecks",
    measuredOn: "2026-pre-season",
    measures: [
      { label: "Squat jump height", value: "19.8 cm", context: "Below average", flagged: true },
      { label: "Countermovement jump height", value: "32.6 cm", context: "Average" },
      { label: "Drop jump height", value: "29.6 cm", context: "Average" },
      {
        label: "Eccentric utilisation ratio",
        value: "1.646",
        context: "Exceptional, but driven by a low squat jump rather than strong reactive ability",
      },
      { label: "RSI-modified (CMJ)", value: "0.49 m/s", context: "Below average — target ≥0.70", flagged: true },
      { label: "Drop jump RSI", value: "0.96 m/s", context: "Poor — below 1.0", flagged: true },
      {
        label: "Drop jump ground contact",
        value: "0.348 s",
        context: "Target is under 0.25 s — slow, not reactive",
        flagged: true,
      },
      { label: "Time to peak force (SJ)", value: "354 ms", context: "Slow rate of force development", flagged: true },
      { label: "CMJ contraction time", value: "730 ms", context: "Target under 650 ms", flagged: true },
      { label: "Countermovement depth", value: "31.3 cm", context: "Within the optimal 30–40 cm range" },
      { label: "Eccentric peak velocity (CMJ)", value: "1.24 m/s" },
      { label: "Concentric mean force — SJ", value: "1276 N", context: "1.45× body weight" },
      { label: "Concentric mean force — CMJ", value: "1753 N", context: "1.99× body weight" },
      { label: "Concentric mean force — DJ", value: "2083 N", context: "2.36× body weight" },
    ],
  },
  {
    title: "Load–velocity profile — back squat",
    source: "VALD ForceDecks, 5-set velocity-based testing",
    measuredOn: "2026-pre-season",
    note: "R² = 0.942. The report notes the fit is noisier than its comparators, likely technical breakdown near true max.",
    measures: [
      { label: "True 1RM", value: "145 kg", context: "1.61× body weight" },
      { label: "Theoretical max load (L0)", value: "188.6 kg", context: "2.10× body weight" },
      { label: "Theoretical max velocity (V0)", value: "1.324 m/s", context: "Report's flagged limiter", flagged: true },
      { label: "Estimated Pmax", value: "613 W", context: "6.82 W/kg", flagged: true },
      { label: "Optimal load for Pmax", value: "94 kg", context: "65% of 1RM — the power-work load zone" },
      { label: "Mean velocity at 80% 1RM", value: "0.510 m/s" },
      {
        label: "Force–velocity ratio",
        value: "142.4 kg/(m/s)",
        context: "Force-oriented — velocity qualities lag force qualities",
        flagged: true,
      },
    ],
  },
  {
    title: "Muscle typology (MFT scan)",
    source: "VALD ForceDecks",
    measuredOn: "2026-pre-season",
    note: "The report's own reading: a slower, force-endurance-leaning profile can still be trained toward faster force expression.",
    measures: [
      { label: "Soleus carnosine", value: "4.75 a.u.", context: "Z −1.51, below average (control mean 6.92)" },
      { label: "Gastrocnemius carnosine", value: "10.28 a.u.", context: "Z −0.25, average (control mean 10.93)" },
      { label: "Mean Z-score", value: "−0.88", context: "Moderately slow-twitch leaning" },
    ],
  },
];

/**
 * The reports' own training recommendations, kept verbatim in substance so
 * the programme changes made downstream can be traced back to them.
 */
export const BASELINE_RECOMMENDATIONS = [
  {
    heading: "Build force capacity and explosive expression together",
    detail:
      "The report is explicit that velocity work should run alongside general strength rather than wait for a strength-first block to finish.",
  },
  {
    heading: "Strength block, 8–10 weeks",
    detail:
      "Anterior-chain (back squat) and posterior-chain (RDL) work at 4–8 reps × 3–5 sets, 77–87% of estimated max, with explicit bar-speed intent cueing to address the 354 ms time to peak force.",
  },
  {
    heading: "Reactive strength needs dedicated remediation",
    detail:
      "Drop jump RSI of 0.96 and a 0.348 s ground contact are the primary limiters. Low box-height depth jumps at 15–20 cm with a stiffness and contact-time focus, plus light-load max-velocity squat work in the 94 kg zone.",
  },
  {
    heading: "Baseball-specific transfer",
    detail:
      "Rotational power, first-step acceleration and throwing velocity all rely on the same fast force expression flagged as the limiter. Rotational med-ball throws and resisted sprint starts alongside general strength.",
  },
  {
    heading: "Training tolerance",
    detail:
      "The slow-twitch-leaning MFT profile suggests higher resistance-training frequency and higher-volume blocks are tolerable, with reactive work introduced progressively rather than as an early priority.",
  },
];

/**
 * Seed the known training maxes into the athlete's personal bests.
 *
 * The programme computes lift loads from `pbs.trainingMaxes.lifts`, so a max
 * is only useful once it lives there. Two rules:
 *
 *  - never overwrite an existing entry. A number the athlete or their coach
 *    has since updated is newer than a report from April, and silently
 *    replacing it would undo real work.
 *  - say where each one came from. The back squat is `tested` — confirmed by
 *    5-set velocity-based testing rather than estimated from a rep-max
 *    formula. The trap bar is `derived`: solved out of the programme's own
 *    two tables, and shown as an estimate wherever it is used.
 *
 * Seeded lift by lift, not all-or-nothing. The original guard returned early
 * if a back squat already existed, which was right when the back squat was the
 * only entry and wrong the moment a second one was added: every athlete who
 * had already used the app had a back squat, so the trap bar max would never
 * have reached any of them, and the fifty-two-week trap bar table would have
 * gone on multiplying a number that was not there.
 */
export function seedBaselinePbs<T extends Record<string, unknown>>(state: T): T {
  const pbs = (state.pbs ?? {}) as Record<string, unknown>;
  const trainingMaxes = (pbs.trainingMaxes ?? {}) as Record<string, unknown>;
  const lifts = (trainingMaxes.lifts ?? {}) as Record<string, unknown>;

  const seeds: Record<string, unknown> = {
    backSquat: {
      value: BASELINE_ANCHORS.backSquat1RmKg,
      kind: "tested",
      source: "VALD ForceDecks load-velocity profile",
      recordedAt: "2026-04-27",
    },
    trapBarDeadlift: {
      value: BASELINE_ANCHORS.trapBarDeadlift1RmKg,
      kind: "derived",
      source: "Solved from the programme's own week table: the only max at which its percentages reproduce its written loads",
    },
  };

  const missing = Object.entries(seeds).filter(([lift]) => !lifts[lift]);
  if (missing.length === 0) return state;

  return {
    ...state,
    pbs: {
      ...pbs,
      trainingMaxes: {
        ...trainingMaxes,
        lifts: {
          ...lifts,
          ...Object.fromEntries(missing),
        },
      },
    },
  };
}
