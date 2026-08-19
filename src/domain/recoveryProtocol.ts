/**
 * Recovery Protocol v2 — the no-cold build.
 *
 * Implemented from the athlete's own written specification
 * (`recovery-protocol-v2.md`), which rebuilt post-throwing recovery on the
 * evidence and added a post-gym track that did not exist before. This module
 * is that spec in code: every block carries its trigger, its prescription, and
 * the citation it came from, so a prescription can always be traced back to
 * the paper that justifies it rather than to somebody's memory.
 *
 * Three findings drive the shape of it:
 *
 *   1. **The arm is not recovered on day 2.** Internal and external rotation
 *      peak force are lowest immediately post-outing and *highest at day 5*;
 *      IR range of motion peaks at day 3 (Pexa 2025). Recovery is a five-day
 *      curve. A protocol that goes quiet after 48 hours is guessing at the
 *      part that matters.
 *   2. **Ruling out cold removes the hardest conflict.** Cold is the one
 *      modality that helps the throwing track and harms the lifting one —
 *      icing after pitching raised 48 h external-rotation torque (Huang 2026),
 *      while cold after resistance training blunts type II hypertrophy and
 *      mTOR signalling (Roberts 2015, Fyfe 2019). With ice out, the same
 *      modality set is safe after throwing and after lifting: no session-type
 *      gating, no exclusion windows, no way to get it wrong.
 *   3. **Heat and compression go the other way.** Heat may *enhance* strength
 *      adaptation (McGorm 2018); compression's largest documented effect is
 *      specifically strength recovery at 2–8 h and >24 h (Brown 2017) — the
 *      exact window and variable that matter for a pitcher's arm.
 *
 * **No cold appears anywhere in this file.** Not ice, not cold-water immersion,
 * not contrast, not between-innings cooling. That is the athlete's constraint,
 * and `COLD_POLICY` states what it costs rather than pretending it costs
 * nothing.
 *
 * What this deliberately does not do: decide anything on pitch count alone.
 * In the same study that produced the five-day curve, pitch count, RPE and
 * arm-specific session RPE showed *no* significant association with the
 * musculoskeletal changes (all P > .057).
 */

import { IsoDate } from "./state";
import { addDays } from "./calendar";

// --- Evidence ---------------------------------------------------------------

/** A source, named so a prescription can be argued with rather than obeyed. */
export interface Citation {
  key: string;
  detail: string;
}

export const SOURCES = {
  pexa: {
    key: "Pexa 2025, J Athl Train",
    detail:
      "36 adolescent pitchers measured pre, post, and days 1/3/5. Rotation peak force lowest immediately post-outing and highest at day 5; IR range of motion peaked at day 3. Pitch count, RPE and arm sRPE showed no significant association with the changes.",
  },
  brown: {
    key: "Brown 2017, Sports Med",
    detail:
      "Meta-analysis of 23 studies. Overall recovery ES 0.38; strength recovery ES 0.62 overall and ES 1.14 (95% CI 0.72–1.56) at 2–8 h post-exercise, ES 1.03 beyond 24 h. Pressure below vs above 15 mmHg did not change the result.",
  },
  hill: {
    key: "Hill 2013, BJSM",
    detail:
      "12-study meta-analysis: moderate effects on soreness (g = 0.40), strength (g = 0.46), power (g = 0.49) and creatine kinase (g = 0.44).",
  },
  huang: {
    key: "Huang 2026, JSCR",
    detail:
      "n = 16, single within-subject study. Percussive massage improved joint position sense immediately post-treatment but was worse than ice at 48 h.",
  },
  dupuy: {
    key: "Dupuy 2018, Front Physiol",
    detail: "Across 99 studies, massage was the single most effective technique for DOMS and perceived fatigue.",
  },
  mallinson: {
    key: "Mallinson 2023",
    detail: "30 g raised myofibrillar synthetic rate over 24 h where 15 g did not; 30 g and 60 g performed alike.",
  },
  areta: {
    key: "Areta 2013, J Physiol",
    detail:
      "20 g every 3 h across 12 h beat both 10 g/1.5 h and 40 g/6 h for myofibrillar protein synthesis — 31–48% higher.",
  },
  mah: {
    key: "Mah 2011, Sleep",
    detail: "Sleep extension to ≥10 h in bed produced faster sprints and +9% shooting accuracy in collegiate athletes.",
  },
  jensen: {
    key: "Jensen 2025",
    detail:
      "Randomised crossover, 13 D1 pitchers. Day-1 scapular strengthening showed MORE internal-rotation ROM loss at day 2, then the BEST ROM by day 4 (47.3° vs baseline 40.4°). 12 of 13 preferred the stretching routine; strengthening worked better. One trial, n = 13, 0 citations.",
  },
  iida: {
    key: "Iida 2025, PM&R",
    detail: "Meta-analysis, 6 RCTs, 255 overhead athletes with GIRD: +7° internal rotation, +6° horizontal adduction.",
  },
  lo: {
    key: "Lo 2021, Medicina",
    detail: "The sleeper stretch acutely REDUCES external rotator strength.",
  },
  zhou: {
    key: "Zhou 2024",
    detail: "Foam rolling's soreness effect is strongest at 24–48 h rather than immediately. Contested — Medeiros 2023 found none versus no intervention.",
  },
  fares: {
    key: "Fares 2021",
    detail: "Active recovery reduces soreness and strength loss versus passive rest.",
  },
  mcgorm: {
    key: "McGorm 2018, Sports Med",
    detail:
      "Unlike cold, heat upregulates heat-shock proteins and growth-related gene expression and may enhance the muscle-mass benefit of strength training.",
  },
  rousse: {
    key: "Rousse 2025, Sports Med",
    detail: "Hot-water immersion rated the most effective single method for restoring muscle function after exercise-induced damage.",
  },
  ahokas: {
    key: "Ahokas 2025, Sports Med Open",
    detail: "Systematic review of 14 studies found heat's acute effects genuinely mixed — 4 positive, 4 null, 1 adverse.",
  },
  qin: {
    key: "Qin 2025, BMC SSMR",
    detail:
      "Lowest injury incidence with an acute:chronic workload ratio of 0.8–1.3 across 22 cohorts. The same meta-analysis warns of heterogeneity, publication bias and inconsistent calculation.",
  },
  driveline: {
    key: "Driveline, 'Why We Are Changing Our Recovery Protocols'",
    detail:
      "Removed rebounders, waiter walks, band work and shoulder tube immediately post-throw, on the grounds that throwing is itself a fatiguing endurance stimulus. Cuff work moved into the lifting sessions; the post-throw slot became a mobility cool-down.",
  },
  pitchSmart: {
    key: "MLB / USA Baseball Pitch Smart",
    detail: "Required rest counted in calendar days by age band; no pitcher appears on three consecutive calendar days.",
  },
  ipc: {
    key: "IPC meta-analysis 2024, lower-limb sports recovery",
    detail:
      "17 studies, 319 athletes. Intermittent pneumatic compression gave a TRIVIAL-to-SMALL benefit for muscle function and a small-to-moderate one for pain and soreness, largest around 48 h. Its immediate pain relief was no greater than massage. Effective protocols clustered at 20–30 min around 80 mmHg.",
  },
  cuppingEvidence: {
    key: "Mohamed 2023, J Back Musculoskelet Rehabil · Bridgett 2017 RCT review",
    detail:
      "Low-to-moderate evidence overall; moderate specifically for soft-tissue flexibility. In the athlete-only review of randomised trials, most had unclear or high risk of bias, none reported safety, and the authors made no recommendation for or against. No study has directly investigated cupping for delayed-onset muscle soreness.",
  },
  iastm: {
    key: "IASTM meta-analysis 2024, BMC Musculoskelet Disord",
    detail:
      "9 trials, 450 participants. Instrument-assisted soft-tissue mobilisation improved range of motion by 4.94° (95% CI 3.29–6.60) where there was a deficit, and 2.32° (1.30–3.34) where there was not. A second meta-analysis of 20 RCTs (1,420 participants) found pain and range benefits strongest when it was an ADJUNCT to other work rather than done alone.",
  },
  lambert: {
    key: "Lambert 2023, JSES",
    detail:
      "28 D1 pitchers, 8 weeks. BFR + low-load cuff work gained shoulder-region lean mass (+227 g vs +75 g, ES 1.0) and IR strength at 90° (ES 0.9); the non-BFR group lost shoulder flexion and IR strength at 0°.",
  },
} as const satisfies Record<string, Citation>;

// --- The cold policy --------------------------------------------------------

/**
 * Why there is no ice anywhere, and what that costs.
 *
 * Stated rather than assumed, because the honest answer is that the no-cold
 * build does lose one documented effect and the app should not pretend
 * otherwise — nor nag about it.
 */
export const COLD_POLICY = {
  id: "throwing-recovery-no-cold-v2",
  allowed: false,
  rule: "No ice, no cold-water immersion, no contrast, no between-innings cooling — anywhere in the protocol.",
  cost:
    "One effect is given up: 15 min at 15 °C after a 75-pitch simulated start raised external-rotation peak torque at 48 h and cut soreness. That is n = 16, a single within-subject study.",
  insteadCarriedBy:
    "Compression carries the strength-recovery load instead, on 23- and 12-study meta-analyses, and the cold-blunts-hypertrophy literature is far better established than the cold-helps-arms literature.",
  citations: [SOURCES.huang, SOURCES.brown, SOURCES.hill],
} as const;

// --- Equipment --------------------------------------------------------------

/**
 * Kit a block needs before it can honestly be prescribed.
 *
 * The app has been here before: it once asked for dynamometer readings from an
 * athlete who does not own a dynamometer, and a prompt for a measurement that
 * cannot be taken is a standing nag rather than a plan. A block that needs
 * equipment declares it, and is left out when the equipment is not there.
 */
export type RecoveryEquipment =
  | "compression_sleeve"
  | "compression_boots"
  | "percussion_gun"
  | "cups"
  | "scraper"
  | "roller"
  | "bands"
  | "heat";

/**
 * What this athlete actually owns. The one place to change it.
 *
 * Not a guess: boots, cups and a scraper were stated directly, and the rest
 * were already being prescribed and used.
 */
export const OWNED_EQUIPMENT: readonly RecoveryEquipment[] = Object.freeze([
  "compression_sleeve",
  "compression_boots",
  "percussion_gun",
  "cups",
  "scraper",
  "roller",
  "bands",
  "heat",
]);

/** What each piece is called where the athlete sets it. */
export const EQUIPMENT_LABELS: Record<RecoveryEquipment, string> = {
  compression_sleeve: "Compression sleeve",
  compression_boots: "NormaTec boots",
  percussion_gun: "Percussive gun",
  cups: "Cupping set",
  scraper: "IASTM scraper",
  roller: "Foam roller / ball",
  bands: "Resistance bands",
  heat: "Heat pack",
};

const EQUIPMENT_IDS = Object.keys(EQUIPMENT_LABELS) as RecoveryEquipment[];

/**
 * Read the athlete's kit out of stored state.
 *
 * Absent means "not set yet", which takes the default list rather than an
 * empty one — a workspace saved before this existed must not suddenly lose
 * every block that needs equipment. An explicitly empty list is honoured: an
 * athlete who owns nothing is a real answer, and the plan then holds only the
 * work they can actually do.
 */
export function readEquipment(value: unknown): readonly RecoveryEquipment[] {
  if (!Array.isArray(value)) return OWNED_EQUIPMENT;
  const kept = value.filter((item): item is RecoveryEquipment =>
    EQUIPMENT_IDS.includes(item as RecoveryEquipment)
  );
  return Object.freeze([...new Set(kept)]);
}

// --- Load tiers -------------------------------------------------------------

export type ThrowingLoadTier = "light" | "moderate" | "heavy";

/** What a logged throwing session gives us to classify it by. */
export interface ThrowingLoad {
  /** Pitches thrown in a game. */
  gamePitches?: number | null;
  /** Every throw in the session, warm-up included. */
  totalThrows?: number | null;
  /** Effort as a percentage. */
  intentPercent?: number | null;
  /** True for a competitive start, which is heavy whatever the count says. */
  competitiveStart?: boolean;
}

/**
 * The protocol runs at all only above this. Below it, a session is not a
 * recovery event.
 */
export const TRIGGER = { intentPercent: 80, totalThrows: 30 } as const;

/**
 * The throwing log's intent words as percentages.
 *
 * The protocol's thresholds are stated in percent — 80% triggers it, ≤70% is a
 * light day, ≥95% is full intent — while the log records a word. These are the
 * midpoints of what each word means, not measurements, which is why a
 * "moderate" session lands below the trigger rather than on it. If they are
 * wrong for a particular athlete this is the one place to change them.
 */
export const INTENT_PERCENT: Record<string, number> = {
  recovery: 40,
  low: 60,
  moderate: 75,
  high: 95,
};

/**
 * The bounds an edited intent percentage has to sit inside.
 *
 * Not arbitrary: below 20% is not throwing, above 100% is not a percentage,
 * and a value outside those turns the trigger into something the athlete can
 * accidentally switch off entirely — setting "high" to 10 would mean no
 * session ever starts a recovery protocol.
 */
export const INTENT_PERCENT_RANGE: [number, number] = [20, 100];

/**
 * Read the athlete's own reading of the intent words.
 *
 * Merged over the defaults rather than replacing them, so setting one word
 * cannot leave the others undefined, and each value is clamped — a number
 * typed into a form is not a measurement and should not be able to disable
 * the protocol.
 */
export function readIntentPercent(value: unknown): Record<string, number> {
  const merged = { ...INTENT_PERCENT };
  if (!value || typeof value !== "object" || Array.isArray(value)) return merged;
  const [low, high] = INTENT_PERCENT_RANGE;
  for (const word of Object.keys(INTENT_PERCENT)) {
    const raw = Number((value as Record<string, unknown>)[word]);
    if (!Number.isFinite(raw)) continue;
    merged[word] = Math.min(high, Math.max(low, Math.round(raw)));
  }
  return merged;
}

const HEAVY_PITCHES = 60;
const MODERATE_PITCHES = 30;
const LIGHT_INTENT = 70;
const FULL_INTENT = 95;

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Whether this session starts a recovery protocol at all.
 *
 * An absent field is absent, never zero — a session logged with no intent
 * recorded must not read as 0% and quietly fall below the trigger.
 */
export function triggersRecovery(load: ThrowingLoad): boolean {
  if (load.competitiveStart) return true;
  const intent = finite(load.intentPercent);
  const throws = finite(load.totalThrows) ?? finite(load.gamePitches);
  if (intent !== null && intent >= TRIGGER.intentPercent) return true;
  return throws !== null && throws >= TRIGGER.totalThrows;
}

/**
 * Which tier a session lands in, or null when it cannot be told.
 *
 * Deliberately reads more than the pitch count. In the study behind the
 * five-day curve, pitch count, RPE and arm sRPE all failed to predict the
 * musculoskeletal change — so a competitive start is heavy regardless, and a
 * full-intent bullpen is at least moderate however few pitches it was.
 */
export function classifyThrowingLoadTier(load: ThrowingLoad): ThrowingLoadTier | null {
  if (load.competitiveStart) return "heavy";

  const pitches = finite(load.gamePitches);
  const throws = finite(load.totalThrows);
  const intent = finite(load.intentPercent);
  const count = pitches ?? throws;

  if (count === null && intent === null) return null;

  // A game is a game: pitches thrown in one carry the tier on their own.
  if (pitches !== null && pitches >= HEAVY_PITCHES) return "heavy";

  // The spec's light row reads "< 30 throws, OR bullpen ≤ 70% intent" — the
  // intent clause is not qualified by volume. A long, easy catch-play session
  // is a light day however many balls it took, which is the whole reason the
  // tier is not decided by count alone.
  if (intent !== null && intent <= LIGHT_INTENT) return "light";

  if (intent !== null && intent >= FULL_INTENT) return "moderate";
  if (count !== null && count >= HEAVY_PITCHES) return "heavy";
  if (count !== null && count >= MODERATE_PITCHES) return "moderate";
  return "light";
}

/** How many days the protocol runs, counting Day 0. */
export function protocolLengthForTier(tier: ThrowingLoadTier): number {
  // Light: Day 0 + Day 1. Moderate: Day 0 → Day 3. Heavy: Day 0 → Day 4.
  return tier === "heavy" ? 5 : tier === "moderate" ? 4 : 2;
}

// --- Blocks -----------------------------------------------------------------

export interface RecoveryBlock {
  id: string;
  name: string;
  prescription: string;
  /** Why this is here, in the athlete's language. */
  why: string;
  citation?: Citation;
  /** Offered, not prescribed — the evidence is split. */
  optional?: boolean;
  /** Said out loud because the honest caveat matters. */
  caveat?: string;
  /** Kit this needs. Left out of the plan when the athlete has none. */
  requires?: RecoveryEquipment;
}

export interface RecoveryDay {
  /** 0 is the day of the outing. */
  dayOffset: number;
  date: IsoDate;
  title: string;
  focus: string;
  blocks: RecoveryBlock[];
  /** Shown when a reading on this day would otherwise look like a problem. */
  annotation?: string;
}

const proteinDose = (bodyweightKg: number | null): string =>
  bodyweightKg === null
    ? "0.3–0.4 g/kg protein plus carbohydrate"
    : `${Math.round(bodyweightKg * 0.3)}–${Math.round(bodyweightKg * 0.4)} g protein plus carbohydrate`;

function dayZero(bodyweightKg: number | null): RecoveryBlock[] {
  return [
    {
      id: "walkdown",
      name: "Walk-down and breathing",
      prescription: "5 min easy walk, then 10 breaths: 4 s in through the nose, 8 s out.",
      why: "Brings the system down before anything else is asked of it.",
    },
    {
      id: "mobility-cooldown",
      name: "Mobility cool-down circuit",
      prescription:
        "~8 min: half-kneeling shoulder CARs ×10 · band pull-aparts ×10 each direction · band “no money” ×10 · hip flow 2–3 each direction",
      why: "Throwing is already a fatiguing endurance stimulus, so this slot is mobility rather than more work. Driveline removed rebounders, waiter walks and band work from immediately post-throw for exactly that reason and moved cuff work into the lifts.",
      citation: SOURCES.driveline,
    },
    {
      id: "compression",
      name: "Compression sleeve, throwing arm",
      prescription: "On within 30 min, worn 2–8 h.",
      requires: "compression_sleeve",
      why: "The primary replacement for ice and the best-evidenced piece of the no-cold stack. Strength recovery ES 1.14 at 2–8 h post-exercise — the window and the variable that matter for an arm. An ordinary sleeve is enough; pressure below vs above 15 mmHg did not change the result, so no medical-grade garment is needed.",
      citation: SOURCES.brown,
    },
    {
      id: "percussive",
      name: "Percussive massage, throwing shoulder",
      prescription:
        "10 min total — forearm flexors 3 min · biceps and triceps 3 min · posterior shoulder and teres 2 min · upper trap and levator 2 min. Sweep, do not press into one spot.",
      requires: "percussion_gun",
      why: "Improved joint position sense immediately post-treatment, and massage is the most effective technique for soreness and perceived fatigue across 99 studies.",
      citation: SOURCES.huang,
      caveat:
        "In the same trial it was worse than ice at 48 h. It is here for the acute proprioceptive effect, not as an ice substitute on the 48 h measure.",
    },
    {
      id: "boots",
      name: "Compression boots, legs",
      prescription: "20–30 min at about 80 mmHg, legs up, any time this evening.",
      why: "The legs take real load from an outing, and this is what the boots are actually good at: how the legs feel. Across 17 studies and 319 athletes the benefit to soreness was small-to-moderate and largest around 48 h — the benefit to muscle function was trivial-to-small. Worth doing, not worth expecting strength back from.",
      citation: SOURCES.ipc,
      requires: "compression_boots",
      caveat:
        "This does not replace the arm sleeve, and it is not a substitute for the feed or the sleep. Its own evidence says the immediate pain relief is no better than massage.",
    },
    {
      id: "feed",
      name: "Feed inside 60 minutes",
      prescription: proteinDose(bodyweightKg),
      why: "30 g raised the myofibrillar synthetic rate over 24 h where 15 g did not.",
      citation: SOURCES.mallinson,
    },
    {
      id: "sleep",
      name: "Sleep target tonight",
      prescription: "9 h in bed.",
      why: "Sleep extension produced faster sprints and better accuracy in collegiate athletes. Adolescent athletes average about 6.3 h against an 8–10 h need.",
      citation: SOURCES.mah,
    },
    {
      id: "heat",
      name: "Heat — optional, evening",
      prescription: "15–20 min hot bath or sauna, at least 2 h after throwing.",
      why: "Rated the most effective single modality for restoring muscle function after exercise-induced damage.",
      citation: SOURCES.rousse,
      optional: true,
      caveat: "Genuinely split: across 14 studies, 4 positive, 4 null, 1 adverse. Offered, not prescribed.",
    },
  ];
}

function dayOne(): RecoveryBlock[] {
  return [
    {
      id: "scap-strength",
      name: "Scapular strengthening",
      prescription:
        "7 movements, 2 sets each, heavy band or dumbbell: band row × 8 · external rotation at 90° × 8/side · band W (lower trap) × 8 · prone Y raise × 8 · serratus wall slide × 8 · side-lying dumbbell external rotation × 8/side · plank protraction hold × 20 s. Last rep of each set should be hard but clean.",
      why: "The counter-intuitive one, and the block most worth having. Against stretching and against throwing, day-1 strengthening gave the best range of motion by day 4. Higher intensity and lower volume matches pitching demand better than light-band endurance work.",
      citation: SOURCES.jensen,
      caveat: "One crossover trial, n = 13. Best direct evidence on the exact question, and thin.",
    },
    {
      id: "mobility",
      name: "Dedicated mobility",
      prescription:
        "10–12 min: shoulder CARs × 5/side · thoracic open book × 8/side · side-lying windmill × 8/side · 90/90 hip switch × 8/side · half-kneeling hip flexor stretch 2 × 30 s/side · lat stretch on the rack 2 × 30 s/side.",
      why: "Two days of ≥10 min mobility is the practitioner standard after a start.",
    },
    {
      id: "boots-day1",
      name: "Compression boots, legs",
      prescription: "20–30 min at about 80 mmHg.",
      why: "The soreness effect is largest around 48 h, so the day after is the session that matters most, not the night of.",
      citation: SOURCES.ipc,
      requires: "compression_boots",
    },
    {
      id: "aerobic-flush",
      name: "Low-intensity aerobic flush",
      prescription:
        "15–20 min on the bike, or an easy jog. Nasal breathing throughout — if you cannot hold a conversation, it is too hard.",
      why: "Active recovery reduces soreness and strength loss versus passive rest.",
      citation: SOURCES.fares,
    },
  ];
}

function dayTwo(): RecoveryBlock[] {
  return [
    {
      id: "sleeper-stretch",
      name: "Sleeper and/or cross-body stretch",
      prescription: "3 × 30 s each.",
      why: "+7° internal rotation and +6° horizontal adduction in overhead athletes with GIRD.",
      citation: SOURCES.iida,
      caveat:
        "Never inside 2 h before throwing — it acutely reduces external rotator strength. Non-throwing or post-throwing slots only.",
    },
    {
      id: "scraper",
      name: "Scraper, posterior shoulder and lat",
      prescription:
        "2–3 min per area, light to moderate pressure: posterior shoulder · lat · forearm flexors. Straight after the stretch, not instead of it.",
      why: "Its evidence is range of motion, and only that: 4.94° where there is a deficit, 2.32° where there is not, and strongest when it is an adjunct to other work rather than done alone. Which is why it sits with the stretch — the two are doing the same job, and together they beat either.",
      citation: SOURCES.iastm,
      requires: "scraper",
      caveat:
        "Light to moderate. Scraping hard enough to bruise is not a bigger dose of the same thing, and nothing in the evidence supports it. Expect a few degrees, not a transformation.",
    },
    {
      id: "soft-tissue",
      name: "Soft tissue",
      prescription:
        "10 min on forearm flexors and extensors 2 min/side · lats 2 min/side · posterior shoulder 2 min · upper back 2 min. Massage or roller — or cups on the lats and upper back for part of it. Slow passes, no pressing into a painful point.",
      why: "Massage is the most effective modality for soreness and perceived fatigue. Foam rolling is weaker but real, and strongest at 24–48 h rather than immediately — which is why the roller belongs here and not at T+0. Cups are an alternative tool for the same ten minutes, not an eleventh: the same tissue worked three ways is not three times the effect.",
      citation: SOURCES.dupuy,
      caveat:
        "On the cups: the evidence is low-to-moderate, and moderate only for soft-tissue flexibility — in athletes specifically, most trials carried a high or unclear risk of bias, none reported safety, and no study has looked at cupping for muscle soreness at all. Marks are expected and are not an injury. Not over broken or already-bruised skin.",
    },
    {
      id: "compression-overnight",
      name: "Compression, overnight",
      prescription: "Sleeve back on the throwing arm for 6–8 h, or overnight.",
      why: "The beyond-24 h benefit is documented at ES 1.03.",
      citation: SOURCES.brown,
    },
  ];
}

function dayThree(): RecoveryBlock[] {
  return [
    {
      id: "reload",
      name: "Light catch-play or touch-and-feel bullpen",
      prescription:
        "First re-load, roughly 72 h post-outing. Catch play out to 120 ft, 25–35 throws — or a 15–20 pitch touch-and-feel bullpen at 60–70% intent. Not both.",
      why: "Internal rotation range of motion peaks here, which is what makes this the natural bullpen day on a five-day rotation.",
      citation: SOURCES.pexa,
    },
    {
      id: "band-routine",
      name: "Full arm-care band routine",
      prescription:
        "11-exercise light-band routine, 10 reps each, before and after throwing: forward arm circles · backward arm circles · external rotation at 0°/side · internal rotation at 0°/side · external rotation at 90°/side · internal rotation at 90°/side · horizontal abduction · front raise · band row · deceleration (reverse throw) pattern/side · acceleration (throw) pattern/side.",
      why: "This is where J-Bands belong — driving blood flow around a throw, not as post-outing fatigue work.",
      citation: SOURCES.driveline,
    },
  ];
}

function dayFour(): RecoveryBlock[] {
  return [
    {
      id: "prime",
      name: "Short priming session",
      prescription:
        "10–15 throws at 70–80% intent, then stop. No new stimulus — this wakes the arm up, it does not train it.",
      why: "Peak force in both rotations is highest at day 5, so the arm is still climbing through day 4. Prime it; do not tax it.",
      citation: SOURCES.pexa,
    },
    {
      id: "full-mobility",
      name: "Full mobility",
      prescription:
        "The full 10–12 min routine: shoulder CARs × 5/side · thoracic open book × 8/side · side-lying windmill × 8/side · 90/90 hip switch × 8/side · half-kneeling hip flexor stretch 2 × 30 s/side · lat stretch 2 × 30 s/side.",
      why: "Keeps the range that came back on day 3.",
    },
  ];
}

/**
 * The day-2 dip that is not a problem.
 *
 * Day-1 scapular strengthening costs internal-rotation range at day 2 and pays
 * it back by day 4. If the readiness model treats that dip as a warning, it
 * punishes the athlete for doing the right thing — so it is annotated instead.
 */
export function postScapularRangeAnnotation(dayOffset: number): string | null {
  return dayOffset === 2
    ? "Expected — you did scapular work yesterday. Internal-rotation range dips today and comes back better by day 4. Not a red flag."
    : null;
}

/**
 * Whether a posterior-shoulder stretch is blocked right now.
 *
 * The sleeper stretch acutely reduces external rotator strength, so it is
 * blocked inside two hours before throwing. Unknown timing is not "safe" —
 * with no next throw recorded there is nothing to be inside of, so it is
 * allowed and the caller is told why.
 */
export const PRE_THROW_STRETCH_BLOCK_HOURS = 2;

export function isPosteriorStretchBlocked(hoursUntilThrowing: number | null): boolean {
  if (hoursUntilThrowing === null) return false;
  return hoursUntilThrowing >= 0 && hoursUntilThrowing < PRE_THROW_STRETCH_BLOCK_HOURS;
}

// --- The throwing plan ------------------------------------------------------

export interface ThrowingRecoveryPlan {
  tier: ThrowingLoadTier;
  outingDate: IsoDate;
  days: RecoveryDay[];
  coldPolicy: typeof COLD_POLICY;
}

const DAY_TITLES = [
  { title: "Day 0 — the outing", focus: "T+0 to T+90 min. Settle it down, protect strength, feed it." },
  { title: "Day 1 — scapular strength", focus: "Active, not rest. The block that buys back range by day 4." },
  { title: "Day 2 — mobility and soft tissue", focus: "Range work and tissue. Expect the range dip." },
  { title: "Day 3 — range returns, first re-load", focus: "Internal rotation peaks. The natural bullpen day." },
  { title: "Day 4 — strength restored, prime", focus: "Still climbing. Prime it, do not tax it." },
];

/**
 * Build the protocol for one outing.
 *
 * Days are real dates, so the plan sits on the calendar rather than as a list
 * of offsets the athlete has to count out themselves.
 */
export function buildThrowingRecoveryPlan(options: {
  tier: ThrowingLoadTier;
  outingDate: IsoDate;
  bodyweightKg?: number | null;
  equipment?: readonly RecoveryEquipment[];
}): ThrowingRecoveryPlan {
  const bodyweight = finite(options.bodyweightKg);
  const owned = new Set(options.equipment ?? OWNED_EQUIPMENT);
  const available = (blocks: RecoveryBlock[]) =>
    blocks.filter((block) => !block.requires || owned.has(block.requires));
  const builders = [dayZero(bodyweight), dayOne(), dayTwo(), dayThree(), dayFour()];
  const length = protocolLengthForTier(options.tier);

  const days: RecoveryDay[] = [];
  for (let offset = 0; offset < length; offset += 1) {
    const annotation = postScapularRangeAnnotation(offset);
    days.push({
      dayOffset: offset,
      date: addDays(options.outingDate, offset),
      title: DAY_TITLES[offset].title,
      focus: DAY_TITLES[offset].focus,
      blocks: available(builders[offset]),
      ...(annotation ? { annotation } : {}),
    });
  }

  return { tier: options.tier, outingDate: options.outingDate, days, coldPolicy: COLD_POLICY };
}

// --- The gym track ----------------------------------------------------------

export type GymSessionType = "hypertrophy" | "max_strength" | "conditioning";

export const GYM_SESSION_LABELS: Record<GymSessionType, string> = {
  hypertrophy: "Hypertrophy",
  max_strength: "Max strength / power",
  conditioning: "Conditioning",
};

export interface GymRecoveryPlan {
  sessionType: GymSessionType;
  sessionDate: IsoDate;
  days: RecoveryDay[];
  coldPolicy: typeof COLD_POLICY;
}

/**
 * Post-lift recovery, which the app did not have at all.
 *
 * With cold out, this track shares its whole modality set with the throwing
 * track — the two differ in dose and timing, not in what is allowed.
 */
export function buildGymRecoveryPlan(options: {
  sessionType: GymSessionType;
  sessionDate: IsoDate;
  bodyweightKg?: number | null;
  equipment?: readonly RecoveryEquipment[];
}): GymRecoveryPlan {
  const bodyweight = finite(options.bodyweightKg);
  const owned = new Set(options.equipment ?? OWNED_EQUIPMENT);
  const available = (blocks: RecoveryBlock[]) =>
    blocks.filter((block) => !block.requires || owned.has(block.requires));
  const perFeed = bodyweight === null ? "30–40 g" : `${Math.round(bodyweight * 0.3)}–${Math.round(bodyweight * 0.4)} g`;

  const dayZeroBlocks: RecoveryBlock[] = [
    {
      id: "protein-spread",
      name: "Protein, spread across the day",
      prescription: `${perFeed} within 60 min, then every ~3 h — four feeds, not one large shake.`,
      why: "20 g every 3 h across 12 h beat both 10 g every 1.5 h and 40 g every 6 h for myofibrillar protein synthesis, by 31–48%. 30 g and 60 g performed alike; 15 g did nothing.",
      citation: SOURCES.areta,
    },
    {
      id: "carbs-fluid",
      name: "Carbohydrate and fluid",
      prescription:
        "1–1.2 g/kg carbohydrate across the next 2 h, and 1.5 L of fluid per kg of bodyweight lost in the session.",
      why: "Replaces what the session actually cost, rather than a fixed number.",
    },
    {
      id: "compression-limbs",
      name: "Compression on the trained limbs",
      prescription: "2–8 h.",
      why: "Compression's effect was largest after resistance exercise specifically — ES 0.49 overall and ES 1.33 beyond 24 h.",
      citation: SOURCES.brown,
    },
    {
      id: "boots-gym",
      name: "Compression boots, legs",
      prescription: "20–30 min at about 80 mmHg, any time after the session.",
      why: "A lower-body lift is the clearest case for these: the modality is legs, and the measured benefit is how the legs feel over the next two days.",
      citation: SOURCES.ipc,
      requires: "compression_boots",
    },
    {
      id: "downregulate",
      name: "Downregulation breathing",
      prescription: "5 min: 4 s in through the nose, 8 s out, lying with the legs up.",
      why: "Ends the session deliberately rather than leaving the system up.",
    },
    {
      id: "heat-gym",
      name: "Heat — permitted, and may help",
      prescription:
        "15–20 min hot bath, shower or sauna. No timing restriction relative to lifts — before, after or between is all fine.",
      why: "Unlike cold, heat upregulates heat-shock proteins and growth-related gene expression, and may enhance the muscle-mass benefit of strength training. This is the whole reason the no-cold build has no gating.",
      citation: SOURCES.mcgorm,
      optional: true,
    },
  ];

  const dayAfter: RecoveryBlock[] = [
    {
      id: "aerobic-flush-gym",
      name: "Low-intensity aerobic flush or mobility flow",
      prescription:
        "20–30 min easy bike, walk or mobility flow. Conversational the whole way — this is circulation, not conditioning.",
      why: "Active recovery beats passive rest for soreness and strength loss.",
      citation: SOURCES.fares,
    },
    {
      id: "soft-tissue-gym",
      name: "Soft tissue",
      prescription:
        "10 min on what was trained, massage or roller: quads 2 min/side · glutes and hips 2 min/side · thoracic spine 2 min. Slow passes.",
      why: "The effect is largest at 24–48 h, which is today rather than yesterday.",
      citation: SOURCES.zhou,
    },
    {
      id: "compression-continue",
      name: "Compression may continue",
      prescription: "Garment on the trained limbs for a further 6–8 h, or overnight.",
      why: "The beyond-24 h benefit is documented.",
      citation: SOURCES.brown,
      optional: true,
    },
  ];

  return {
    sessionType: options.sessionType,
    sessionDate: options.sessionDate,
    coldPolicy: COLD_POLICY,
    days: [
      {
        dayOffset: 0,
        date: options.sessionDate,
        title: `Day 0 — after the ${GYM_SESSION_LABELS[options.sessionType].toLowerCase()} session`,
        focus: "T+0 to T+60. Feed it, compress it, bring it down.",
        blocks: available(dayZeroBlocks),
      },
      {
        dayOffset: 1,
        date: addDays(options.sessionDate, 1),
        title: "Day 1 — flush",
        focus: "Move it, work the tissue.",
        blocks: available(dayAfter),
      },
    ],
  };
}

// --- Both on one day --------------------------------------------------------

export interface ConflictRule {
  situation: string;
  rule: string;
}

/**
 * With cold removed, the gating table collapses to scheduling only.
 *
 * This is the payoff of the no-cold constraint: there is no modality conflict
 * left to resolve, so nothing here is about what is allowed — only about
 * order, and about not counting the same thing twice.
 */
export const CONFLICT_RULES: ConflictRule[] = [
  { situation: "Lift and throw on the same day", rule: "Throw first, lift second. No modality conflicts remain." },
  {
    situation: "Heavy competitive outing",
    rule: "Lower-body lift on day 1; hold upper-body volume until day 2–3.",
  },
  {
    situation: "Both sessions logged",
    rule: "The protein target is per day, not per session — do not double-count the four feeds.",
  },
  { situation: "Compression after both", rule: "One garment period covers both; do not prescribe two." },
];

// --- Workload ---------------------------------------------------------------

export const ACWR_BAND: [number, number] = [0.8, 1.3];

export interface AcwrReading {
  ratio: number;
  inBand: boolean;
  note: string;
}

/**
 * Acute:chronic workload, shown with its band and never used as a gate.
 *
 * The meta-analysis recommending 0.8–1.3 also warns of heterogeneity,
 * publication bias and inconsistent calculation, so this reports and bands the
 * number rather than deciding anything with it.
 */
export function acwrReading(acuteLoad: number | null, chronicLoad: number | null): AcwrReading | null {
  const acute = finite(acuteLoad);
  const chronic = finite(chronicLoad);
  if (acute === null || chronic === null || chronic <= 0) return null;

  const ratio = Math.round((acute / chronic) * 100) / 100;
  const [low, high] = ACWR_BAND;
  const inBand = ratio >= low && ratio <= high;
  return {
    ratio,
    inBand,
    note: inBand
      ? `In the ${low}–${high} band, where injury incidence was lowest across 22 cohorts.`
      : ratio < low
        ? `Below the ${low}–${high} band — the load has dropped off faster than the base.`
        : `Above the ${low}–${high} band — the recent load has climbed faster than the base supports.`,
  };
}

// --- Pitch Smart ------------------------------------------------------------

export interface RestCheck {
  ok: boolean;
  problem?: string;
}

/**
 * Check a planned next outing against the rest rules, in calendar days.
 *
 * Deliberately says so rather than programming through it: the app's job here
 * is to point out that the plan breaks the rule, not to silently rewrite it.
 */
export function checkPitchSmartRest(options: {
  lastOuting: IsoDate;
  nextOuting: IsoDate;
  requiredRestDays: number;
  recentOutings?: IsoDate[];
}): RestCheck {
  const { lastOuting, nextOuting, requiredRestDays } = options;
  if (nextOuting <= lastOuting) {
    return { ok: false, problem: "The next outing is not after the last one." };
  }

  // Counted in calendar days, which is how the guideline counts them.
  let restDays = 0;
  let cursor = addDays(lastOuting, 1);
  while (cursor < nextOuting) {
    restDays += 1;
    cursor = addDays(cursor, 1);
  }
  if (restDays < requiredRestDays) {
    return {
      ok: false,
      problem: `${restDays} rest day${restDays === 1 ? "" : "s"} before the next outing, and this load requires ${requiredRestDays}.`,
    };
  }

  const outings = [...new Set([...(options.recentOutings ?? []), lastOuting, nextOuting])].sort();
  for (let i = 2; i < outings.length; i += 1) {
    if (outings[i] === addDays(outings[i - 1], 1) && outings[i - 1] === addDays(outings[i - 2], 1)) {
      return { ok: false, problem: `That would be three consecutive days pitching — ${outings[i - 2]} to ${outings[i]}.` };
    }
  }

  return { ok: true };
}

// --- Blood flow restriction -------------------------------------------------

/**
 * The BFR cuff block, with the guardrail that makes it honest.
 *
 * The studied prescription depends on a measured occlusion pressure. Without a
 * calibrated cuff it is not the studied prescription, and substituting an
 * unmeasured band while keeping the citation would be dressing up a guess.
 */
export const BFR_BLOCK = {
  name: "Blood-flow-restriction cuff block",
  prescription:
    "Throwing arm only, 2×/week. 4 sets (30/15/15/to-fatigue) at 20% isometric max, 50% limb occlusion pressure, proximal arm cuff. Four exercises: cable external rotation, cable internal rotation, dumbbell scaption, side-lying dumbbell external rotation.",
  why: "Over 8 weeks the BFR group gained shoulder-region lean mass and internal-rotation strength at 90°, while the group doing the same work without BFR lost shoulder flexion and internal-rotation strength at 0°.",
  citation: SOURCES.lambert,
  guardrail:
    "This needs a calibrated cuff for the 50% occlusion figure. Without one, it is not the studied prescription — use a band and the evidence above no longer applies to what you are doing.",
  experimentalNote:
    "Passive BFR as a recovery modality (no exercise) is experimental: one trial returned strength and range faster than sham, but the systematic review found only 11 studies, inconsistent protocols and mixed results. Not part of the default plan.",
} as const;

// --- Into the daily plan ----------------------------------------------------

/**
 * Which stage of the day's session each block belongs in.
 *
 * The protocol is not a separate programme running alongside the training —
 * it is part of the day. Compression and feeding are recovery work; the
 * scapular block and the stretches are arm care; and two of the blocks are
 * not tasks at all.
 *
 * `guidance` is that third case. The day-3 re-load and the day-4 priming
 * session describe *what the day should be*, and the programme already
 * prescribes that day's throwing. Adding them as tasks would put a second
 * bullpen on a day that already has one, so they are surfaced as a note
 * against the session instead of as work to tick off.
 */
export type BlockPlacement = "arm_care" | "recover" | "guidance";

const PLACEMENT: Record<string, BlockPlacement> = {
  // --- Day 0. Anything done to the throwing arm is arm care; the systemic
  // work — breathing, feeding, sleeping — is recovery.
  walkdown: "recover",
  "mobility-cooldown": "arm_care", // shoulder CARs, pull-aparts, "no money"
  compression: "arm_care", // the sleeve goes on the throwing arm
  percussive: "arm_care", // the throwing shoulder
  feed: "recover",
  sleep: "recover",
  heat: "recover", // whole-body immersion or sauna

  // --- Day 1
  "scap-strength": "arm_care",
  mobility: "recover", // general, not shoulder-specific
  "aerobic-flush": "recover",

  // Boots are a legs modality: systemic recovery, not arm care.
  boots: "recover",
  "boots-day1": "recover",
  "boots-gym": "recover",

  // --- Day 2. The scraper is a range tool for the throwing side, so it sits
  // with the stretch it is an adjunct to.
  scraper: "arm_care",
  "sleeper-stretch": "arm_care",
  "soft-tissue": "recover", // general tissue work
  "compression-overnight": "arm_care", // the same arm sleeve, re-worn

  // --- Days 3 and 4. The re-load and the prime describe the day's own shape
  // rather than adding to it, so they are notes, not tasks.
  reload: "guidance",
  "band-routine": "arm_care",
  prime: "guidance",
  "full-mobility": "recover",

  // --- Gym track. Nothing here is directed at the throwing arm: the
  // compression goes on whichever limbs were trained, and the rest is
  // systemic. So the whole track is recovery.
  "protein-spread": "recover",
  "carbs-fluid": "recover",
  "compression-limbs": "recover",
  downregulate: "recover",
  "heat-gym": "recover",
  "aerobic-flush-gym": "recover",
  "soft-tissue-gym": "recover",
  "compression-continue": "recover",
};

export function placementFor(blockId: string): BlockPlacement {
  return PLACEMENT[blockId] ?? "recover";
}

/** One outing the athlete logged, as the plan needs to see it. */
export interface LoggedOuting {
  date: IsoDate;
  load: ThrowingLoad;
}

export interface RecoveryForDay {
  tier: ThrowingLoadTier;
  /** 0 on the day of the outing. */
  dayOffset: number;
  outingDate: IsoDate;
  day: RecoveryDay;
  /** Blocks that are work to do today. */
  tasks: RecoveryBlock[];
  /** Blocks that describe the day rather than add to it. */
  guidance: RecoveryBlock[];
}

/**
 * What today owes to a recent outing, read from the log.
 *
 * Looks back only as far as the longest protocol runs, takes the most recent
 * qualifying outing, and returns nothing at all when today falls outside it.
 * Nothing is asked of the athlete: if they logged the session, the plan knows.
 *
 * The most recent outing wins rather than the heaviest. Throwing again resets
 * what the arm is recovering from, and a five-day protocol from Saturday
 * should not keep prescribing day-4 work through Wednesday's bullpen.
 */
export function recoveryForDay(
  date: IsoDate,
  outings: LoggedOuting[],
  bodyweightKg: number | null = null,
  equipment?: readonly RecoveryEquipment[]
): RecoveryForDay | null {
  let best: { outing: LoggedOuting; tier: ThrowingLoadTier; offset: number } | null = null;

  for (const outing of outings) {
    if (!triggersRecovery(outing.load)) continue;
    const tier = classifyThrowingLoadTier(outing.load);
    if (!tier) continue;

    // Offset in whole days, counted forward from the outing.
    let offset = 0;
    let cursor = outing.date;
    const limit = protocolLengthForTier(tier);
    while (cursor < date && offset < limit) {
      cursor = addDays(cursor, 1);
      offset += 1;
    }
    if (cursor !== date || offset >= limit) continue;

    if (!best || outing.date > best.outing.date) best = { outing, tier, offset };
  }
  if (!best) return null;

  const plan = buildThrowingRecoveryPlan({
    tier: best.tier,
    outingDate: best.outing.date,
    bodyweightKg,
    equipment,
  });
  const day = plan.days[best.offset];
  if (!day) return null;

  return {
    tier: best.tier,
    dayOffset: best.offset,
    outingDate: best.outing.date,
    day,
    tasks: day.blocks.filter((block) => placementFor(block.id) !== "guidance"),
    guidance: day.blocks.filter((block) => placementFor(block.id) === "guidance"),
  };
}

// --- Reading a gym session off the day's own plan ----------------------------

/**
 * The stages the programme uses for loaded gym work, and what kind each is.
 *
 * The gym track needs to know a session happened and roughly what it was, and
 * the plan already says both. Rather than adding a form asking the athlete to
 * classify a session they have just finished, this reads the stage the
 * programme itself prescribed.
 */
const GYM_STAGE_TYPE: Record<string, GymSessionType> = {
  "Whole-Body Force": "max_strength",
  "Whole-Body Power": "max_strength",
  "Whole-Body Gym": "hypertrophy",
  "Whole-Body Rebuild": "hypertrophy",
  "Whole-Body Primer": "conditioning",
  Microdose: "conditioning",
};

/** A task as this module needs to see it — stage title and id, nothing more. */
export interface PlannedTask {
  id: string;
  stageTitle: string;
}

/**
 * What kind of gym session the day held, if the athlete actually did it.
 *
 * Requires at least one of that stage's tasks to be resolved. A prescribed
 * session that was not trained is not something to recover from, and
 * prescribing a recovery block for work nobody did is how an app teaches the
 * athlete to ignore it.
 */
export function gymSessionForDay(
  tasks: PlannedTask[],
  resolvedTaskIds: Iterable<string>
): GymSessionType | null {
  const resolved = new Set(resolvedTaskIds);
  for (const task of tasks) {
    const type = GYM_STAGE_TYPE[task.stageTitle];
    if (type && resolved.has(task.id)) return type;
  }
  return null;
}

/**
 * Blocks that cover the same ground across the two tracks.
 *
 * When a day holds both a throwing outing and a lift, the protocol's own
 * conflict rules apply: the protein target is per day rather than per session,
 * and one compression period covers both. So the gym track's version of a
 * block is dropped when the throwing track has already prescribed it.
 */
const EQUIVALENT_ACROSS_TRACKS: Record<string, string> = {
  "protein-spread": "feed",
  "compression-limbs": "compression",
  // Both tracks reach for the boots; one 20–30 min session covers the day.
  "boots-gym": "boots",
  downregulate: "walkdown",
  "heat-gym": "heat",
  "soft-tissue-gym": "soft-tissue",
  "aerobic-flush-gym": "aerobic-flush",
  "compression-continue": "compression-overnight",
};

/**
 * The gym blocks that still apply once the throwing track has had its say.
 *
 * Returns them in order, minus anything the throwing day already covers.
 */
export function gymBlocksAfter(
  gym: GymRecoveryPlan,
  dayOffset: number,
  throwingBlockIds: Iterable<string>
): RecoveryBlock[] {
  const already = new Set(throwingBlockIds);
  const day = gym.days[dayOffset];
  if (!day) return [];
  return day.blocks.filter((block) => {
    const equivalent = EQUIVALENT_ACROSS_TRACKS[block.id];
    return !(equivalent && already.has(equivalent));
  });
}

/**
 * Rest problems in what has already been thrown.
 *
 * `checkPitchSmartRest` answers "is this next outing legal", which needs a
 * planned date the app does not have. This asks the question it *can* answer
 * from the log alone: did the rest that was actually taken break the rule?
 *
 * Retrospective is still worth saying. Three consecutive days is the one
 * hard floor in the guideline, and an athlete who has just done it should be
 * told, even though the app cannot un-throw it.
 */
export function restProblems(outings: LoggedOuting[]): string[] {
  const dates = [...new Set(outings.filter((o) => triggersRecovery(o.load)).map((o) => o.date))].sort();
  const problems: string[] = [];

  for (let i = 2; i < dates.length; i += 1) {
    if (dates[i] === addDays(dates[i - 1], 1) && dates[i - 1] === addDays(dates[i - 2], 1)) {
      problems.push(`Three consecutive days throwing: ${dates[i - 2]} to ${dates[i]}.`);
    }
  }

  // A heavy outing followed inside its own protocol by another one.
  for (let i = 1; i < dates.length; i += 1) {
    const previous = outings.find((o) => o.date === dates[i - 1]);
    const tier = previous ? classifyThrowingLoadTier(previous.load) : null;
    if (tier !== "heavy") continue;
    const gap = protocolLengthForTier("heavy") - 1;
    let cursor = dates[i - 1];
    let days = 0;
    while (days < gap && cursor < dates[i]) {
      cursor = addDays(cursor, 1);
      days += 1;
    }
    if (cursor > dates[i] || (cursor === dates[i] && days < gap)) {
      problems.push(`Threw again on ${dates[i]}, inside the five-day protocol from ${dates[i - 1]}.`);
    }
  }

  return [...new Set(problems)];
}
