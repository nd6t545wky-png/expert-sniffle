/**
 * Telling the app something hurts, and having the plan change.
 *
 * Until now the only way soreness reached the programme was the check-in's
 * five 0–10 sliders, and all they could do was scale the *whole* day down:
 * full → reduced → recovery → hold. That is the right response to feeling
 * generally beaten up and the wrong response to one part hurting. A sore
 * medial elbow does not mean do less of everything — it means do not load the
 * flexor-pronator mass or throw at intent today, and it means do something
 * specific for the elbow, while the legs, the trunk and the aerobic work carry
 * on untouched.
 *
 * So this module reads a report of *where* it hurts, *what kind* of pain, and
 * *when it shows up*, and produces three things:
 *
 *   1. a **tier** — monitor, modify, hold or refer
 *   2. a set of **exercises to take out** of the day, matched against the
 *      programme's actual task names
 *   3. a set of **exercises to put in**, with sets, reps and a dose
 *
 * Three decisions worth stating plainly, because they are the ones a physio
 * would ask about:
 *
 * **Pain is not a reason to stop by itself.** In the trial that established
 * the pain-monitoring model, athletes with Achilles tendinopathy who kept
 * running and jumping under a pain ceiling did no worse at 12 months than
 * those told to stop (Silbernagel 2007). Blanket rest is not the safe option
 * it feels like. What matters is the ceiling, and whether pain settles by the
 * next morning.
 *
 * **Isometrics are the tool for the painful days.** A single bout of heavy
 * isometric holds dropped tendon pain from 7.0/10 to 0.2/10 immediately and
 * held for 45 minutes, while *raising* maximal voluntary contraction 18.7%
 * (Rio 2015). That is the rare intervention that reduces pain without costing
 * force, which is exactly what a pitcher needs on a day he still has to train.
 *
 * **Throwing is treated more conservatively than lifting.** Pitching with arm
 * pain and fatigue is a named risk factor for throwing injury (Zaremski 2018),
 * and unlike a lift there is no way to take 20% off the load of a throw
 * without changing what it is. So any arm pain above the monitor tier caps
 * intent, and anything at hold stops throwing outright.
 *
 * **What this does not do.** It does not diagnose, and it does not run a
 * rehabilitation programme. It gets the athlete safely through today and
 * writes down what happened. Anything with a red flag on it, or anything that
 * has not settled in ten days, is handed to the physio — who now has a live
 * link to this data. Prescribing a full tendinopathy progression autonomously
 * would be pretending to a competence this app does not have.
 */

import { IsoDate } from "./state";
import { Citation } from "./recoveryProtocol";
import { addDays } from "./calendar";

// --- Evidence ---------------------------------------------------------------

export const PAIN_SOURCES = {
  silbernagel: {
    key: "Silbernagel 2007, Am J Sports Med",
    detail:
      "RCT, n = 38. Athletes who continued running and jumping under a pain-monitoring model improved as much as those who stopped for six weeks — VISA-A 57 to 85 versus 57 to 91, no significant difference in rate of improvement. Continued loading under a pain ceiling showed no negative effect.",
  },
  rioIsometric: {
    key: "Rio 2015, BJSM",
    detail:
      "Randomised cross-over, n = 6 volleyball players with patellar tendinopathy. A single bout of isometric holds cut pain 7.0/10 to 0.17/10 immediately and held the reduction at 45 min, while raising maximal voluntary contraction 18.7%. Isotonic work in the same athletes gave less than half the relief and none of it lasted.",
  },
  rioNeuroplastic: {
    key: "Rio 2016, BJSM",
    detail:
      "Narrative review. Externally paced strength work — a metronome rather than self-selected tempo — modulates corticospinal excitability and inhibition, which self-paced work does not. The tempo is part of the prescription, not a detail.",
  },
  girgis: {
    key: "Girgis 2020, Phys Ther Sport",
    detail:
      "Umbrella review of 40 systematic reviews. Eccentric exercise for tendinopathy is supported by qualitative evidence only, and the authors caution explicitly that findings do not transfer between tendons. A protocol proven at the Achilles is not proven at the elbow.",
  },
  zaremski: {
    key: "Zaremski 2018, Orthop J Sports Med",
    detail:
      "Observational, 115 high-school starting-pitcher outings. Names pitching with arm pain and fatigue as a known risk factor, and found 42.4% of game-day pitches — bullpen and warm-up — go uncounted entirely.",
  },
  popchak: {
    key: "Popchak 2015, Am J Phys Med Rehabil",
    detail:
      "Review of injury risk in baseball pitching: fatigue, volume and pitching through symptoms recur across studies as the modifiable risks.",
  },
} as const satisfies Record<string, Citation>;

// --- What can hurt ----------------------------------------------------------

/**
 * Where it hurts.
 *
 * Split finely enough that the prescription actually changes — medial and
 * lateral elbow load completely different tissue and want opposite work — and
 * coarsely enough to be picked on a phone in ten seconds while standing on a
 * mound.
 */
export type BodyRegion =
  | "shoulder_front"
  | "shoulder_back"
  | "shoulder_top"
  | "elbow_medial"
  | "elbow_lateral"
  | "elbow_posterior"
  | "forearm"
  | "wrist_hand"
  | "lat_teres"
  | "low_back"
  | "hip_groin"
  | "knee"
  | "ankle_foot"
  | "other";

export const REGION_LABELS: Record<BodyRegion, string> = {
  shoulder_front: "Front of shoulder",
  shoulder_back: "Back of shoulder",
  shoulder_top: "Top of shoulder",
  elbow_medial: "Inside of elbow",
  elbow_lateral: "Outside of elbow",
  elbow_posterior: "Back of elbow",
  forearm: "Forearm",
  wrist_hand: "Wrist or hand",
  lat_teres: "Lat / under the armpit",
  low_back: "Lower back",
  hip_groin: "Hip or groin",
  knee: "Knee",
  ankle_foot: "Ankle or foot",
  other: "Somewhere else",
};

/** A plain-language hint so the right region gets picked. */
export const REGION_HINTS: Partial<Record<BodyRegion, string>> = {
  elbow_medial: "The UCL side. Where a pitcher's elbow usually talks.",
  elbow_lateral: "Outside, over the bony point.",
  elbow_posterior: "The point of the elbow at ball release.",
  shoulder_front: "Anterior — biceps tendon, front of the joint.",
  shoulder_back: "Posterior cuff, behind the joint.",
  shoulder_top: "The AC joint, on top of the shoulder.",
};

/** Regions that carry the throwing arm, and therefore gate throwing. */
export const ARM_REGIONS: readonly BodyRegion[] = Object.freeze([
  "shoulder_front",
  "shoulder_back",
  "shoulder_top",
  "elbow_medial",
  "elbow_lateral",
  "elbow_posterior",
  "forearm",
  "wrist_hand",
  "lat_teres",
]);

/**
 * What the pain feels like.
 *
 * Quality is not decoration. Sharp, burning and pins-and-needles describe
 * tissue and nerve behaviour that no amount of load management is the answer
 * to, and "it gave way" describes instability. Those route to the physio
 * rather than to a prescription.
 */
export type PainQuality = "ache" | "stiff" | "sharp" | "burning" | "pinching" | "giving_way";

export const QUALITY_LABELS: Record<PainQuality, string> = {
  ache: "Dull ache",
  stiff: "Stiff or tight",
  sharp: "Sharp or stabbing",
  burning: "Burning, pins and needles, or numb",
  pinching: "Pinching at end of range",
  giving_way: "Weak, unstable, or it gave way",
};

/** When it shows up. The single most useful question after "where". */
export type PainTiming =
  | "warms_up"
  | "during"
  | "after"
  | "next_morning"
  | "at_rest"
  | "at_night";

export const TIMING_LABELS: Record<PainTiming, string> = {
  warms_up: "There at the start, eases once warm",
  during: "During throwing or lifting",
  after: "Afterwards, same day",
  next_morning: "Still there the next morning",
  at_rest: "There even at rest",
  at_night: "Wakes me at night",
};

export type PainTrend = "new" | "same" | "worse" | "better";

export const TREND_LABELS: Record<PainTrend, string> = {
  new: "New — first time",
  same: "About the same",
  worse: "Getting worse",
  better: "Getting better",
};

export interface SorenessReport {
  id: string;
  /** The day it was reported for. */
  date: IsoDate;
  region: BodyRegion;
  /** 0–10, where 0 is nothing and 10 is the worst imaginable. */
  severity: number;
  quality: PainQuality;
  timing: PainTiming;
  trend: PainTrend;
  note?: string;
  /** Set when the athlete says it has gone. */
  resolvedOn?: IsoDate;
  createdAt: string;
}

// --- Triage -----------------------------------------------------------------

/**
 * What today does about it.
 *
 * `monitor` trains as written. `modify` trains around it. `hold` rests the
 * region and trains everything else. `refer` does what hold does and says to
 * ring the physio, because the report described something load management is
 * not the answer to.
 */
export type PainTier = "monitor" | "modify" | "hold" | "refer";

export const TIER_LABELS: Record<PainTier, string> = {
  monitor: "Train as written, watch it",
  modify: "Train around it",
  hold: "Rest this area today",
  refer: "Rest it and get it looked at",
};

/**
 * The pain ceiling, on the 0–10 the athlete is already answering.
 *
 * Silbernagel's model allowed loading up to 5/10 during activity provided it
 * settled by the next morning and did not climb week to week. This uses the
 * same ceiling and the same two escape clauses, because the ceiling on its own
 * is what people remember and the escape clauses are what make it safe.
 */
export const PAIN_CEILING = 5;

/** At or above this, the region gets the day off whatever else is true. */
export const HOLD_SEVERITY = 6;

/** Below this and with nothing else wrong, carry on as written. */
export const MONITOR_SEVERITY = 3;

/** Qualities that are a referral on their own, at any severity. */
const RED_FLAG_QUALITIES: readonly PainQuality[] = Object.freeze(["burning", "giving_way"]);

/** Timings that are a referral on their own. */
const RED_FLAG_TIMINGS: readonly PainTiming[] = Object.freeze(["at_night"]);

/** How long a report speaks for the region before the app asks again. */
export const REPORT_LIFETIME_DAYS = 7;

/** Unresolved this long, it stops being a training problem. */
export const REFER_AFTER_DAYS = 10;

export interface Triage {
  tier: PainTier;
  /** Every rule that fired, in the athlete's words, so it can be argued with. */
  reasons: string[];
  /** Throwing intent ceiling as a percentage, or 0 for no throwing. */
  throwingCapPercent: number | null;
  /** Said out loud when the answer is "see someone", never buried. */
  referral?: string;
}

function clampSeverity(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(10, Math.max(0, Math.round(parsed)));
}

/**
 * Turn one report into a decision.
 *
 * Rules are additive and the worst one wins — there is no scoring, because a
 * score would let a low number average away a red flag. `daysRunning` lets a
 * report that has simply not gone away escalate on its own.
 */
export function triageReport(report: SorenessReport, daysRunning = 0): Triage {
  const severity = clampSeverity(report.severity);
  const reasons: string[] = [];
  let referral: string | undefined;

  // Held as an index rather than a string so that "the worst rule wins" is a
  // max() over one number. Tiers only ever move up here — a later rule cannot
  // talk an earlier, more serious one down, which is the property that keeps a
  // red flag from being averaged away.
  const ORDER: PainTier[] = ["monitor", "modify", "hold", "refer"];
  let level = 0;
  const raise = (next: PainTier) => {
    level = Math.max(level, ORDER.indexOf(next));
  };

  if (RED_FLAG_QUALITIES.includes(report.quality)) {
    raise("refer");
    referral =
      report.quality === "burning"
        ? "Burning, pins and needles or numbness is a nerve description, not a load description. Load management is not the answer to it."
        : "Weakness, instability or a joint giving way needs examining before it is loaded again.";
    reasons.push(`Reported as ${QUALITY_LABELS[report.quality].toLowerCase()}.`);
  }

  if (RED_FLAG_TIMINGS.includes(report.timing)) {
    raise("refer");
    referral ??= "Pain that wakes you at night is one of the few symptoms that is a reason to be examined regardless of how it behaves in training.";
    reasons.push("Waking at night with it.");
  }

  if (report.timing === "at_rest") {
    raise("hold");
    reasons.push("It is there at rest, not only under load.");
  }

  if (severity >= HOLD_SEVERITY) {
    raise("hold");
    reasons.push(`Severity ${severity}/10, at or above the ${HOLD_SEVERITY}/10 line for resting the area.`);
  } else if (severity > MONITOR_SEVERITY) {
    raise("modify");
    reasons.push(`Severity ${severity}/10, inside the ceiling of ${PAIN_CEILING}/10 but not nothing.`);
  } else if (severity > 0) {
    reasons.push(`Severity ${severity}/10, under the ${MONITOR_SEVERITY}/10 line.`);
  }

  if (report.trend === "worse") {
    raise("hold");
    reasons.push("Getting worse rather than settling.");
  }

  if (report.timing === "next_morning") {
    raise("modify");
    reasons.push("Still there the next morning — the pain-monitoring model's signal that yesterday was too much.");
  }

  if (report.quality === "sharp" && severity > MONITOR_SEVERITY) {
    raise("hold");
    reasons.push("Sharp rather than aching, above the monitoring line.");
  }

  if (report.quality === "pinching" && report.timing !== "warms_up") {
    raise("modify");
    reasons.push("Pinching at end of range — the range itself is the provocation.");
  }

  // Warming up out of it is the most reassuring answer there is, and the one
  // the model was built around — so it is the single rule allowed to lower a
  // tier. It can only undo `modify`, and only when nothing else is wrong: a
  // red flag, a 6/10 or a worsening trend all sit above it and stay.
  if (
    report.timing === "warms_up" &&
    level === ORDER.indexOf("modify") &&
    severity <= PAIN_CEILING &&
    report.trend !== "worse"
  ) {
    level = ORDER.indexOf("monitor");
    reasons.push("Eases once warm, which is the pattern the pain ceiling was written for.");
  }

  if (daysRunning >= REFER_AFTER_DAYS) {
    raise("refer");
    referral ??= `This has been going ${daysRunning} days. Past about ${REFER_AFTER_DAYS} it stops being something to train around and starts being something to have looked at.`;
    reasons.push(`Running ${daysRunning} days without resolving.`);
  }

  const tier = ORDER[level];
  const arm = ARM_REGIONS.includes(report.region);
  const throwingCapPercent = !arm
    ? null
    : tier === "monitor"
      ? null
      : tier === "modify"
        ? 60
        : 0;

  return { tier, reasons, throwingCapPercent, ...(referral ? { referral } : {}) };
}

// --- Which reports are live -------------------------------------------------

export interface ActiveReport {
  report: SorenessReport;
  triage: Triage;
  /** Days since the region was first reported in this unbroken run. */
  daysRunning: number;
  /** True once the report is older than its lifetime and needs re-confirming. */
  stale: boolean;
}

function isReport(value: unknown): value is SorenessReport {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SorenessReport>;
  return typeof candidate.id === "string" && typeof candidate.date === "string" && typeof candidate.region === "string";
}

/** Read stored reports, dropping anything malformed rather than trusting it. */
export function readReports(value: unknown): SorenessReport[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isReport).map((report) => ({
    ...report,
    severity: clampSeverity(report.severity),
  }));
}

/**
 * How long this region has been complaining without a break.
 *
 * Counts back from the newest report through earlier ones for the same region,
 * allowing a gap of up to the report lifetime — an athlete who mentions their
 * elbow on Monday and again on Friday has had a sore elbow all week, not two
 * separate elbows.
 */
function runLength(reports: SorenessReport[], newest: SorenessReport): number {
  const sameRegion = reports
    .filter((report) => report.region === newest.region && report.date <= newest.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  let earliest = newest.date;
  for (const report of sameRegion) {
    if (report.date > earliest) continue;
    const gap = daysBetween(report.date, earliest);
    if (gap > REPORT_LIFETIME_DAYS) break;
    earliest = report.date;
  }
  return daysBetween(earliest, newest.date);
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

/**
 * The reports that speak for today — one per region, newest first.
 *
 * A report keeps applying after the day it was made, because pain does not
 * stop existing because nobody opened the app. It stops applying when the
 * athlete resolves it, or when it is older than its lifetime, at which point
 * it is returned marked `stale` so the app can ask rather than silently
 * carrying a week-old report into today's plan.
 */
export function activeReports(reports: SorenessReport[], date: IsoDate): ActiveReport[] {
  const byRegion = new Map<BodyRegion, SorenessReport>();

  for (const report of reports) {
    if (report.date > date) continue;
    if (report.resolvedOn && report.resolvedOn <= date) continue;
    const held = byRegion.get(report.region);
    if (!held || report.date > held.date) byRegion.set(report.region, report);
  }

  // A resolution wins over anything at or before it, whichever record carried
  // it: saying "that's gone" must not be undone by an older report surviving.
  for (const report of reports) {
    if (!report.resolvedOn || report.resolvedOn > date) continue;
    const held = byRegion.get(report.region);
    if (held && held.date <= report.resolvedOn) byRegion.delete(report.region);
  }

  return [...byRegion.values()]
    .map((report) => {
      const age = daysBetween(report.date, date);
      const daysRunning = runLength(reports, report) + age;
      return {
        report,
        triage: triageReport(report, daysRunning),
        daysRunning,
        stale: age > REPORT_LIFETIME_DAYS,
      };
    })
    .sort((a, b) => b.report.date.localeCompare(a.report.date));
}

/** The single worst thing going on, for a one-line summary. */
export function worstTier(active: ActiveReport[]): PainTier | null {
  const order: PainTier[] = ["monitor", "modify", "hold", "refer"];
  let worst: PainTier | null = null;
  for (const entry of active) {
    if (entry.stale) continue;
    if (!worst || order.indexOf(entry.triage.tier) > order.indexOf(worst)) worst = entry.triage.tier;
  }
  return worst;
}

/**
 * The throwing ceiling across everything reported, or null for no limit.
 *
 * Zero means no throwing. Taken as the *minimum* across active arm reports,
 * because two regions each allowing 60% do not add up to permission.
 */
export function throwingCap(active: ActiveReport[]): number | null {
  const caps = active
    .filter((entry) => !entry.stale && entry.triage.throwingCapPercent !== null)
    .map((entry) => entry.triage.throwingCapPercent as number);
  return caps.length ? Math.min(...caps) : null;
}

// --- What to take out, and what to put in -----------------------------------

/** One prescribed movement. Named, dosed, and justified. */
export interface ExerciseRx {
  id: string;
  name: string;
  /** Sets, reps, tempo, load. Never "some mobility work". */
  prescription: string;
  cue: string;
  why: string;
  /** When to stop the set — the thing that keeps a pain protocol safe. */
  stop?: string;
  citation?: Citation;
}

/** A like-for-like replacement, so the day keeps its shape. */
export interface Swap {
  /** Matched against the programme's task name. */
  match: RegExp;
  name: string;
  prescription: string;
  why: string;
}

export interface RegionPlaybook {
  /** Programme tasks that load this tissue, matched by name. */
  avoid: RegExp[];
  /** Tasks that can continue in an altered form rather than being removed. */
  swaps: Swap[];
  /** Added when training around it. */
  modify: ExerciseRx[];
  /** Added when the region is being rested. Supersedes `modify`. */
  hold: ExerciseRx[];
}

/**
 * The isometric dose, used across every region.
 *
 * Five holds of 45 seconds at roughly 70% of a maximal effort, two minutes
 * between — the protocol that produced the analgesia in Rio 2015. Held at a
 * joint angle that does not provoke, and stopped if pain climbs above the
 * ceiling: the point is to load the tissue without stirring it up.
 */
const ISOMETRIC_DOSE = "5 × 45 s holds at about 70% effort, 2 min between sets.";
const ISOMETRIC_STOP = `Stop the set if pain goes above ${PAIN_CEILING}/10 or climbs set to set. It should feel the same or better by the last hold.`;

const isometric = (id: string, name: string, cue: string, why: string): ExerciseRx => ({
  id,
  name,
  prescription: ISOMETRIC_DOSE,
  cue,
  why,
  stop: ISOMETRIC_STOP,
  citation: PAIN_SOURCES.rioIsometric,
});

/** Grip work is a wrist-and-elbow load, so it comes out for those regions. */
const GRIP_TASKS = [/farmer carry/i, /Chin-up/i, /Trap bar deadlift/i];

const STRAPPED_DEADLIFT: Swap = {
  match: /Trap bar deadlift/i,
  name: "Trap bar deadlift — straps, same load",
  prescription: "As programmed, using lifting straps. Sets, reps and load unchanged.",
  why: "Straps take the forearm and grip out of the lift without touching the training stimulus the day was built around.",
};

const PALLOF_WITHOUT_CARRY: Swap = {
  match: /Pallof press \+ farmer carry/i,
  name: "Pallof press",
  prescription: "As programmed for the Pallof press. The farmer carry is out today.",
  why: "The anti-rotation work is the point of the pairing; the carry is the part that loads the grip and the forearm.",
};

export const REGION_PLAYBOOK: Record<BodyRegion, RegionPlaybook> = {
  elbow_medial: {
    avoid: [
      /High-intent pulldowns/i,
      /Plyo Ball Reverse Throw/i,
      /Rotational med-ball/i,
      /Wrist and forearm prep/i,
      ...GRIP_TASKS,
    ],
    swaps: [STRAPPED_DEADLIFT, PALLOF_WITHOUT_CARRY],
    modify: [
      isometric(
        "wrist-flexion-iso",
        "Wrist flexion isometric — throwing arm",
        "Forearm supported on a bench, palm up, light dumbbell. Hold the wrist just off neutral — not at end range.",
        "The flexor-pronator mass is the elbow's active defence against valgus load. Isometric holds load it and reduce pain without the range that provokes it."
      ),
      isometric(
        "pronation-iso",
        "Forearm pronation isometric",
        "Elbow at 90°, tucked to your side, holding a hammer or a light bar off-centre. Resist the twist rather than moving it.",
        "Pronator teres is the deepest of the dynamic stabilisers over the medial elbow, and it is the one that fatigues in the late innings."
      ),
    ],
    hold: [
      isometric(
        "wrist-flexion-iso",
        "Wrist flexion isometric — throwing arm",
        "Forearm supported, palm up, light load. Pain-free angle only.",
        "Keeps a load stimulus on the tissue on a day nothing else is loading it, which is what stops a rested area from deconditioning."
      ),
      {
        id: "elbow-range",
        name: "Elbow and forearm range, unloaded",
        prescription: "Full flexion/extension and pronation/supination, 2 × 10 each, slow, no load.",
        cue: "Move to where it starts to talk and stop there. This is a range check, not a stretch.",
        why: "Losing extension range is the first measurable sign of a medial elbow that is not settling. Doing it daily makes a loss visible early.",
        stop: "Any sharp catch at end range: stop and tell your physio the range you reached.",
      },
    ],
  },

  elbow_lateral: {
    avoid: [/Plyo Ball Reverse Throw/i, /Wrist and forearm prep/i, ...GRIP_TASKS],
    swaps: [STRAPPED_DEADLIFT, PALLOF_WITHOUT_CARRY],
    modify: [
      isometric(
        "wrist-extension-iso",
        "Wrist extension isometric",
        "Forearm supported, palm down, light dumbbell held just above neutral. Elbow slightly bent, not locked.",
        "The common extensor origin is what hurts on the outside of a thrower's elbow, and an isometric hold is the one loading that reliably reduces its pain in the short term."
      ),
    ],
    hold: [
      isometric(
        "wrist-extension-iso",
        "Wrist extension isometric",
        "Forearm supported, palm down, pain-free angle, light load.",
        "Maintains a load stimulus while the aggravating work is out."
      ),
    ],
  },

  elbow_posterior: {
    avoid: [/High-intent pulldowns/i, /Plyo Ball/i, /Push press/i, /landmine push press/i],
    swaps: [],
    modify: [
      isometric(
        "triceps-iso",
        "Triceps isometric — elbow just short of lockout",
        "Press into an immovable bar with the elbow at about 20° of bend. Never into full lockout.",
        "Posterior elbow pain at release is usually the olecranon meeting its fossa. Loading short of lockout trains the tissue without repeating the impact."
      ),
    ],
    hold: [
      isometric(
        "triceps-iso",
        "Triceps isometric — elbow just short of lockout",
        "Press into an immovable object at about 20° of bend, pain-free.",
        "Keeps load on without repeating the end-range contact that provokes it."
      ),
    ],
  },

  shoulder_front: {
    avoid: [/Bench press/i, /Push press/i, /landmine push press/i, /Plyo Ball Reverse Throw/i, /High-intent pulldowns/i],
    swaps: [
      {
        match: /Bench press/i,
        name: "Floor press — same load scheme",
        prescription: "As programmed for the bench press, from the floor. Stop when the upper arms touch down.",
        why: "The floor caps how far the shoulder can extend behind the body, which is the position that provokes an irritable anterior shoulder — the pressing stimulus is otherwise unchanged.",
      },
      {
        match: /Bench press \+ chest-supported row/i,
        name: "Floor press + chest-supported row",
        prescription: "As programmed, pressing from the floor rather than a bench. Row unchanged.",
        why: "Same reason as the floor press: the row was never the problem.",
      },
    ],
    modify: [
      isometric(
        "er-iso-neutral",
        "External rotation isometric at neutral",
        "Elbow tucked to your side at 90°, a towel between elbow and ribs, pressing out into a band or a doorframe. Do not let the elbow drift forward.",
        "Cuff isometrics at neutral load the rotator cuff in the one position that does not compress the front of the joint."
      ),
    ],
    hold: [
      isometric(
        "er-iso-neutral",
        "External rotation isometric at neutral",
        "Elbow at your side, pressing out into a doorframe. Pain-free effort only.",
        "The only shoulder loading that reliably stays under the ceiling on a bad day."
      ),
      {
        id: "scap-setting",
        name: "Scapular setting, unloaded",
        prescription: "3 × 8 slow retract-and-depress holds of 5 s, sitting or standing, no band.",
        cue: "Blade down and back into your pocket. The arm does nothing.",
        why: "Keeps the scapular pattern the throw depends on while the arm itself is off, so the shoulder does not come back with the timing changed.",
      },
    ],
  },

  shoulder_back: {
    avoid: [/High-intent pulldowns/i, /Plyo Ball Reverse Throw/i],
    swaps: [],
    modify: [
      isometric(
        "er-iso-neutral",
        "External rotation isometric at neutral",
        "Elbow at your side at 90°, towel roll under the elbow, pressing out into a band. Hold, do not pulse.",
        "Posterior cuff pain in a thrower is a deceleration problem. Isometric external rotation loads the decelerators without the range that irritates them."
      ),
      {
        id: "prone-horizontal",
        name: "Prone horizontal abduction — light",
        prescription: "3 × 12 with 1–2 kg, thumb up, 3 s down on every rep.",
        cue: "Lift to shoulder height only. If the neck or the traps take over, the weight is too heavy.",
        why: "Low-load posterior cuff work that keeps the tissue moving on a day the throwing load is off it.",
        stop: `Stop at ${PAIN_CEILING}/10 or if you cannot keep the 3 s lowering.`,
      },
    ],
    hold: [
      isometric(
        "er-iso-neutral",
        "External rotation isometric at neutral",
        "Elbow at your side, pressing into a band or a doorframe, pain-free.",
        "Loads the cuff on a day the arm is otherwise resting."
      ),
    ],
  },

  shoulder_top: {
    avoid: [/Bench press/i, /Push press/i, /landmine push press/i, /Chin-up/i],
    swaps: [
      {
        match: /Bench press/i,
        name: "Floor press — narrower grip",
        prescription: "As programmed, from the floor, hands just inside your usual grip.",
        why: "Both the floor and the narrower grip reduce the horizontal-adduction load across the AC joint, which is what a sore point-of-the-shoulder objects to.",
      },
    ],
    modify: [
      isometric(
        "scap-iso",
        "Scapular depression isometric",
        "Hands on parallettes or the arms of a chair, press down and hold the shoulder blades away from your ears.",
        "Unloads the top of the shoulder while still asking the scapular muscles to work."
      ),
    ],
    hold: [
      isometric(
        "scap-iso",
        "Scapular depression isometric",
        "Seated press-down hold, pain-free effort.",
        "Keeps the scapular muscles working with nothing crossing the sore joint."
      ),
    ],
  },

  forearm: {
    avoid: [...GRIP_TASKS, /Plyo Ball Reverse Throw/i, /Wrist and forearm prep/i],
    swaps: [STRAPPED_DEADLIFT, PALLOF_WITHOUT_CARRY],
    modify: [
      isometric(
        "grip-iso",
        "Grip isometric",
        "Squeeze a gripper or a rolled towel at about 70% and hold. Elbow bent, forearm supported.",
        "A loaded hold reduces forearm pain in the short term and keeps the tissue conditioned without the repeated contractions that flare it."
      ),
    ],
    hold: [
      isometric(
        "grip-iso",
        "Grip isometric",
        "Squeeze and hold at a pain-free effort, forearm supported.",
        "Keeps a stimulus on while everything that grips is out of the day."
      ),
    ],
  },

  wrist_hand: {
    avoid: [...GRIP_TASKS, /Plyo Ball/i, /Med-ball/i, /Wrist and forearm prep/i],
    swaps: [STRAPPED_DEADLIFT, PALLOF_WITHOUT_CARRY],
    modify: [
      isometric(
        "wrist-iso-both",
        "Wrist isometric — flexion and extension",
        "Forearm supported. Hold against a light load palm-up, then palm-down. Both directions each set.",
        "Loading the wrist in both directions covers whichever side is irritable without needing to know which it is."
      ),
    ],
    hold: [
      isometric(
        "wrist-iso-both",
        "Wrist isometric — flexion and extension",
        "Supported forearm, pain-free effort both directions.",
        "Maintains loading while catching and gripping are out."
      ),
    ],
  },

  lat_teres: {
    avoid: [/Chin-up/i, /High-intent pulldowns/i, /Plyo Ball Reverse Throw/i],
    swaps: [],
    modify: [
      isometric(
        "lat-iso",
        "Lat isometric pull-down hold",
        "Half-kneeling, band overhead, pull to the ribs and hold. Ribs down — do not arch to get there.",
        "The lat is a powerful internal rotator and it takes deceleration load in the throw. An isometric keeps it loaded without the end-range overhead position it objects to."
      ),
    ],
    hold: [
      {
        id: "thoracic-breathing",
        name: "Ribs-down breathing with overhead reach",
        prescription: "3 × 5 breaths, reaching one arm overhead only as far as the ribs stay down.",
        cue: "Exhale fully before you reach. The reach follows the breath.",
        why: "A guarded lat holds the ribcage flared, which changes how the shoulder blade sits and therefore how the arm moves. This restores position without loading the muscle.",
      },
    ],
  },

  low_back: {
    avoid: [
      /Trap bar deadlift/i,
      /Romanian deadlift/i,
      /Broad jump/i,
      /trap bar jump/i,
      /Push press/i,
      /Back squat/i,
      /Speed squat/i,
      /Depth jump/i,
    ],
    swaps: [
      {
        match: /Trap bar deadlift/i,
        name: "Rear-foot-elevated split squat — same sets",
        prescription: "3 × 8 each leg at a load you could do 12 with. Torso upright, no forward lean.",
        why: "Keeps the lower-body strength work in the day without a loaded spine, which is the part an irritable back objects to.",
      },
    ],
    modify: [
      {
        id: "side-plank",
        name: "Side plank",
        prescription: "3 × 30 s each side, from the knees if 30 s from the feet breaks position.",
        cue: "Straight line ear to hip. Ribs down, do not let the hip sag or twist.",
        why: "Lateral trunk endurance is the quality most consistently reduced in athletes with recurrent low-back pain, and it loads the trunk without bending the spine.",
        stop: `Stop the hold when position breaks or pain passes ${PAIN_CEILING}/10 — a longer hold in a bad position trains the wrong thing.`,
      },
      {
        id: "bird-dog",
        name: "Bird dog",
        prescription: "3 × 8 each side with a 5 s hold at the top.",
        cue: "Reach long rather than high. A glass of water on your lower back should not spill.",
        why: "Trains the trunk to resist rotation and extension — the exact demand the throw makes of it — with almost no spinal load.",
      },
    ],
    hold: [
      {
        id: "bird-dog",
        name: "Bird dog",
        prescription: "2 × 8 each side, 5 s hold, within a pain-free range.",
        cue: "Reach long, not high. Stop where it starts to talk.",
        why: "Gentle, low-load trunk work that keeps the area moving on a day everything spinal is out.",
      },
      {
        id: "walk-often",
        name: "Short walks, often",
        prescription: "5 × 10 min through the day rather than one long walk.",
        cue: "Easy pace. The point is frequency, not distance.",
        why: "Frequent easy movement beats both rest and one long session for an irritable back, and it is the one thing that reliably helps between sessions.",
      },
    ],
  },

  hip_groin: {
    avoid: [
      /Sprint/i,
      /Acceleration quality/i,
      /Rotational med-ball/i,
      /Broad jump/i,
      /Romanian deadlift/i,
      /Depth jump/i,
    ],
    swaps: [],
    modify: [
      isometric(
        "adductor-squeeze",
        "Adductor squeeze isometric",
        "Lying on your back, knees bent at 45°, ball between the knees. Squeeze and hold.",
        "The adductor squeeze is both the standard test and the standard treatment for groin pain in field sport, and it loads the tissue with no limb movement at all."
      ),
      {
        id: "copenhagen-short",
        name: "Copenhagen plank — short lever",
        prescription: "3 × 20 s each side, top knee on the bench rather than the foot.",
        cue: "Hips stacked and lifted. Come down the moment the hip drops.",
        why: "The most effective adductor-strengthening exercise available without equipment; the short lever is the entry level, and it is where a sore groin starts.",
        stop: `Stop the set if pain passes ${PAIN_CEILING}/10 or the hip cannot stay up.`,
      },
    ],
    hold: [
      isometric(
        "adductor-squeeze",
        "Adductor squeeze isometric",
        "Ball between the knees, pain-free effort, held.",
        "Loads the groin without a single step or change of direction."
      ),
    ],
  },

  knee: {
    // The split squat is listed here as well as swapped below. That is
    // deliberate: the swap keeps it at a reduced depth, and listing it means
    // that if the swap ever fails to apply the fallback is removing the
    // exercise rather than leaving it at full depth.
    avoid: [
      /Pogo/i,
      /vertical jump/i,
      /Broad jump/i,
      /trap bar jump/i,
      /Sprint/i,
      /Acceleration quality/i,
      /Rear-foot-elevated split squat/i,
      /Ankle stiffness pogos/i,
      /Depth jump/i,
      /Speed squat/i,
      /Back squat/i,
      /Split squat/i,
    ],
    swaps: [
      {
        match: /Rear-foot-elevated split squat/i,
        name: "Rear-foot-elevated split squat — reduced depth",
        prescription: "As programmed, stopping short of the depth where it complains. Load unchanged if that depth is pain-free.",
        why: "Depth, not load, is usually what an irritable knee objects to. Cutting the range keeps the strength work in the day.",
      },
    ],
    modify: [
      isometric(
        "spanish-squat",
        "Spanish squat isometric",
        "Band behind both knees anchored in front. Sit back into about 60° of knee bend and hold, torso upright.",
        "This is the population Rio's isometric analgesia work was done in. It loads the quadriceps and the patellar tendon hard while the band takes the shear off the joint."
      ),
    ],
    hold: [
      isometric(
        "quad-iso-wall",
        "Wall sit — pain-free depth",
        "Back against the wall, knees bent only as far as stays comfortable. Hold.",
        "Loads the quadriceps at whatever depth is available, which keeps a hard-working muscle working on a day the jumping is out."
      ),
    ],
  },

  ankle_foot: {
    avoid: [
      /Pogo/i,
      /vertical jump/i,
      /Broad jump/i,
      /Sprint/i,
      /Acceleration quality/i,
      /trap bar jump/i,
      /Ankle stiffness pogos/i,
      /Depth jump/i,
      // Thursday's loaded seated raise. It comes out and the isometric below
      // takes its place: same tissue, no repetitions through a painful range,
      // and without this the day would carry both a loaded calf raise and a
      // calf isometric.
      /calf raise/i,
    ],
    swaps: [],
    modify: [
      isometric(
        "calf-iso",
        "Calf raise isometric hold",
        "Up on the toes on both feet, hold at the top. Add the sore side alone only if that stays pain-free.",
        "The calf and Achilles take several times bodyweight in a stride, and an isometric hold is the loading that reduces their pain most reliably in the short term."
      ),
    ],
    hold: [
      isometric(
        "calf-iso",
        "Calf raise isometric hold",
        "Both feet, pain-free height, held at the top.",
        "Keeps load through the ankle while running and jumping are out."
      ),
    ],
  },

  other: {
    avoid: [],
    swaps: [],
    modify: [
      {
        id: "note-it",
        name: "Write down what provokes it",
        prescription: "One line after each session: what brought it on, out of 10, and whether it settled by the next morning.",
        cue: "The three answers a physio will ask for first.",
        why: "The app cannot prescribe for a region it does not model. What it can do is make sure the pattern is recorded rather than remembered.",
      },
    ],
    hold: [
      {
        id: "note-it",
        name: "Write down what provokes it",
        prescription: "One line after each session: what brought it on, out of 10, and whether it settled by the next morning.",
        cue: "The three answers a physio will ask for first.",
        why: "Nothing here is prescribed for an unmodelled region, so the useful thing is a clean record for whoever looks at it.",
      },
    ],
  },
};
