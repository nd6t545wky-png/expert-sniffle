import { Session, SessionTask } from "./programmeSessions";

/**
 * Velocity development, made explicit and made phase-aware.
 *
 * The athlete's stated goal is to throw harder. The programme did not have a
 * velocity plan — it had a velocity *day*, every week, at the same intent all
 * year, whether or not there was a game on Saturday. Two things were wrong
 * with that, and they pull in opposite directions:
 *
 *  1. **In season it was too much.** Wednesday's plyo ladder finished with
 *     three light-ball throws at 85% — fourteen maximal-intent throws with a
 *     100–150 g ball — and then asked for measured pulldowns on top, three
 *     days before a game. Reinold's randomised trial is the reason to care:
 *     24% of the weighted-ball group were injured against none of the control,
 *     and the risk sits in exactly that light-ball, maximal-intent work.
 *  2. **Out of season it was too little.** The one genuine non-competitive
 *     window in the year — the GBL Christmas break — ran at the same 85%
 *     ceiling as an in-season week. The programme labels those Wednesdays
 *     "Velocity + power · Express" and then prescribes six pulldowns. That is
 *     a maintenance dose wearing a development label.
 *
 * So this module does two things. It caps plyo intent by phase, using
 * Driveline's four published bands rather than the nine ad-hoc percentages the
 * programme had drifted into. And on the weeks that can actually carry it, it
 * turns the Wednesday exposure into a real velocity day at Tread's published
 * dose.
 *
 * **What it deliberately does not do.** It does not add a second velocity day.
 * Driveline's own guidance is one to two maximal-effort days a week and that
 * "3×/week is not recommended"; the GBL blocks play Friday *and* Sunday, and
 * the programme says outright there is "no separate velocity day" in them.
 * There is no room, and inventing one would be the same mistake in the other
 * direction.
 *
 * ## Sources
 *
 * - Reinold MM et al. (2018). *Sports Health* 10(4):327–333. 38 high-school
 *   pitchers randomised to a six-week weighted-ball programme or control.
 *   +3.3% velocity and +4.3° shoulder external rotation in the weighted-ball
 *   group, against a 24% injury rate versus 0% in control, including four
 *   elbow injuries.
 * - Driveline Baseball, published PlyoCare guidance: four intent bands
 *   (recovery 50–60%, hybrid B ~70%, hybrid A ~90%, velocity 100%), maximal
 *   effort one to two days per week, "3×/week is not recommended".
 * - Tread Athletics, Brewster & Blanc, *The Tread Athletics Guide to Throwing
 *   Harder* (free, 78 pp.): "our high intensity phases usually only have 15 or
 *   20 high effort throws, twice per week"; "a 4 week on-ramp is plenty of
 *   time to ease into throwing"; failure mode listed as "without adjusting
 *   their workouts to accommodate the most stressful periods of throwing".
 */

// --- Intent bands -----------------------------------------------------------

/**
 * Driveline's four published intent bands.
 *
 * The programme had drifted to nine distinct effort values — 45, 50, 55, 60,
 * 65, 70, 75, 80 and 85% — which is a precision nobody can feel. No athlete
 * can reliably distinguish a 65% throw from a 70% one, so the extra numbers
 * bought nothing and made the ladder impossible to reason about. Four named
 * bands is what the source material actually uses.
 */
export type IntentBand = "recovery" | "hybrid_b" | "hybrid_a" | "velocity";

export const BAND_ORDER: readonly IntentBand[] = ["recovery", "hybrid_b", "hybrid_a", "velocity"];

/** The single number each band is prescribed at. */
export const BAND_PERCENT: Record<IntentBand, number> = {
  recovery: 60,
  hybrid_b: 70,
  hybrid_a: 90,
  velocity: 100,
};

/** How each band is written on the plan, as Driveline names them. */
export const BAND_LABELS: Record<IntentBand, string> = {
  recovery: "recovery",
  hybrid_b: "hybrid B",
  hybrid_a: "hybrid A",
  velocity: "velocity",
};

/** The published range behind each band's single number. */
export const BAND_RANGES: Record<IntentBand, string> = {
  recovery: "50–60%",
  hybrid_b: "70%",
  hybrid_a: "90%",
  velocity: "100%",
};

function rank(band: IntentBand): number {
  return BAND_ORDER.indexOf(band);
}

/** The lower of two bands. Every ceiling in this file is a cap, never a target. */
export function lowerBand(a: IntentBand, b: IntentBand): IntentBand {
  return rank(a) <= rank(b) ? a : b;
}

/**
 * Which band a written percentage belongs to.
 *
 * The boundaries are set by nearest published value, with one deliberate
 * tie-break: 80% is exactly ten points from both hybrid B and hybrid A, and it
 * resolves *down*. Rounding an ambiguous throw up to 90% would raise intent
 * on the strength of a rounding rule, which is not a reason to throw harder.
 */
export function bandFor(percent: number): IntentBand {
  if (percent >= 85) return "hybrid_a";
  if (percent >= 65) return "hybrid_b";
  return "recovery";
}

// --- The year, as velocity blocks -------------------------------------------

/**
 * What each week of the year is for, as far as throwing hard is concerned.
 *
 *  - `in_season`   one game a week, so one high-intent day fits — placed as
 *                  far from it as the week allows.
 *  - `two_game`    games Friday *and* Sunday. Nothing fits; the programme's
 *                  own week plan says "no separate velocity day".
 *  - `on_ramp`     building back up to high intent, not yet at it.
 *  - `develop`     the weeks that actually try to add velocity.
 *  - `taper`       coming off a develop block into competition.
 *  - `restore`     deliberate unload. No high intent of any kind.
 */
export type VelocityBlock = "in_season" | "two_game" | "on_ramp" | "develop" | "taper" | "restore";

export const BLOCK_LABELS: Record<VelocityBlock, string> = {
  in_season: "In season",
  two_game: "Two-game week",
  on_ramp: "On-ramp",
  develop: "Velocity block",
  taper: "Taper",
  restore: "Restore",
};

export interface VelocityPolicy {
  week: number;
  block: VelocityBlock;
  /** Hard ceiling on plyo-ball intent for the week. */
  plyoCeiling: IntentBand;
  /** Whether the week carries a genuine high-intent throwing exposure. */
  velocityDay: boolean;
  /**
   * The week's whole high-effort throw budget, Tread's number — or null where
   * the programme's own week plan already states a count and this has no
   * business raising it.
   */
  highEffortThrows: number | null;
  /** Position in the block, 1-based, and its length. */
  weekInBlock: number;
  blockWeeks: number;
  /** True where the block rests on a fixture list that is not yet published. */
  provisional: boolean;
  /** One line, for the plan. */
  headline: string;
  /** The reasoning, for the athlete and for whoever audits this. */
  note: string;
}

interface BlockRange {
  from: number;
  to: number;
  block: VelocityBlock;
  plyoCeiling: IntentBand;
  velocityDay: boolean;
  highEffortThrows: number | null;
  provisional?: boolean;
  note: string;
}

/**
 * The year, week by week.
 *
 * The boundaries are not invented here — every one of them is where the
 * programme's own phase table or week plan already changes character. Weeks
 * 25–27 are the block's "Strength rebuild / Force emphasis / Strength-speed"
 * weeks, which is where the programme itself puts pulldowns and the mound
 * conversion. Weeks 23–24 are its "Christmas unload" and "Movement rebuild".
 * Week 28 is its "Term 1 re-entry taper". This table renames what is already
 * there and then makes the intent match the name.
 *
 * The uncomfortable finding, stated plainly rather than hidden in a constant:
 * **three weeks of the fifty-two can carry a genuine velocity block.** The
 * calendar runs FNCBA winter into GBL summer into GBL summer again, and the
 * only real gap is the Christmas break. That is a reason to protect those
 * three weeks and to stop the in-season light-ball work from competing with
 * the one high-intent throw set each week — not a reason to pretend there is
 * an off-season there is not.
 */
const BLOCKS: readonly BlockRange[] = [
  {
    from: 1,
    to: 8,
    block: "in_season",
    plyoCeiling: "hybrid_b",
    velocityDay: true,
    highEffortThrows: null,
    note: "FNCBA Division 1, a game every Saturday. Wednesday is three days either side of it, which is the one slot in the week a high-intent throw set belongs in. The plyo ladder in front of it is capped at hybrid B so fourteen light-ball throws at 85% do not spend the arm before the measured throws — and so the week's maximal-intent work is one set, on one day, rather than spread across the session.",
  },
  {
    from: 9,
    to: 10,
    block: "restore",
    plyoCeiling: "recovery",
    velocityDay: false,
    highEffortThrows: 0,
    note: "Deliberate unload after the final published FNCBA round. Nothing here is high intent, and the programme already removes pulldowns from a transition Wednesday. The plyo ceiling drops to the recovery band to match.",
  },
  {
    from: 11,
    to: 11,
    block: "on_ramp",
    plyoCeiling: "hybrid_b",
    velocityDay: false,
    highEffortThrows: 10,
    note: "One week to re-establish the Tuesday/Thursday team rhythm before the Coomera Cubs opener. The programme asks for \"one controlled Wednesday intent exposure\" and that is exactly right: controlled, not maximal.",
  },
  {
    from: 12,
    to: 22,
    block: "two_game",
    plyoCeiling: "hybrid_b",
    velocityDay: false,
    highEffortThrows: null,
    note: "GBL Term 4: games Friday and Sunday. There is no day in that week three clear days from a game, and the programme's own week plan says \"no separate velocity day\". Throwing hard here comes out of the games. The plyo work stays at hybrid B as patterning.",
  },
  {
    from: 23,
    to: 24,
    block: "on_ramp",
    plyoCeiling: "hybrid_b",
    velocityDay: false,
    highEffortThrows: 10,
    note: "Two weeks to unload and rebuild before the velocity block. Tread's on-ramp is four weeks off a genuine layoff; this is two, because the arm comes straight out of eleven weeks of competition rather than off the couch.",
  },
  {
    from: 25,
    to: 27,
    block: "develop",
    plyoCeiling: "hybrid_a",
    velocityDay: true,
    highEffortThrows: 20,
    note: "The one genuine velocity block in the year. No league games are assumed across the GBL Christmas break, so this is the only stretch that can carry maximal-intent throwing without a fixture three days later. Intent goes up to hybrid A and volume comes down to match — twenty high-effort throws in the session, which is Tread's published dose for a high-intensity phase.",
  },
  {
    from: 28,
    to: 28,
    block: "taper",
    plyoCeiling: "hybrid_b",
    velocityDay: false,
    highEffortThrows: 10,
    note: "Term 1 re-entry. Intent comes off before games resume so the first weekend back is not the first fatigued weekend.",
  },
  {
    from: 29,
    to: 36,
    block: "two_game",
    plyoCeiling: "hybrid_b",
    velocityDay: false,
    highEffortThrows: null,
    note: "GBL Term 1: games Friday and Sunday again, and the same conclusion. Maintain, do not build.",
  },
  {
    from: 37,
    to: 38,
    block: "restore",
    plyoCeiling: "recovery",
    velocityDay: false,
    highEffortThrows: 0,
    note: "Two lower-stress weeks after the summer season. The deepest unload of the year, and the platform the winter build stands on.",
  },
  {
    from: 39,
    to: 52,
    block: "in_season",
    plyoCeiling: "hybrid_b",
    velocityDay: true,
    highEffortThrows: null,
    provisional: true,
    note: "Winter 2027 is planned on the 2026 draw — a Saturday game every week — so it is treated as in season, with one Wednesday exposure and the plyo ladder capped. If the published 2027 draw opens a real gap, that gap is where a second velocity block goes, and this table should be revised to put one there.",
  },
];

export function velocityPolicy(week: number): VelocityPolicy {
  const range = BLOCKS.find((candidate) => week >= candidate.from && week <= candidate.to);
  // Outside the programme's fifty-two weeks there is no phase to reason from.
  // The safe reading of "I do not know what week this is" is the conservative
  // one: cap at hybrid B and assign no velocity day.
  const resolved: BlockRange = range ?? {
    from: week,
    to: week,
    block: "in_season",
    plyoCeiling: "hybrid_b",
    velocityDay: false,
    highEffortThrows: null,
    note: "Outside the planned fifty-two weeks, so intent is capped conservatively and no velocity day is assigned.",
  };

  const blockWeeks = resolved.to - resolved.from + 1;
  const weekInBlock = week - resolved.from + 1;
  const position = blockWeeks > 1 ? ` · week ${weekInBlock} of ${blockWeeks}` : "";

  return {
    week,
    block: resolved.block,
    plyoCeiling: resolved.plyoCeiling,
    velocityDay: resolved.velocityDay,
    highEffortThrows: resolved.highEffortThrows,
    weekInBlock,
    blockWeeks,
    provisional: Boolean(resolved.provisional),
    headline: `${BLOCK_LABELS[resolved.block]}${position} · plyo ceiling ${BAND_LABELS[resolved.plyoCeiling]} (${BAND_RANGES[resolved.plyoCeiling]})`,
    note: resolved.note,
  };
}

// --- Applying it to a session ------------------------------------------------

/** `85% perceived effort` from the programme, or `70% effort` from a reduced day. */
const EFFORT = /(\d+)\s*%\s*(?:perceived\s+)?effort/i;

/** The leading `2 × 3` of a plyo prescription. */
const SETS_REPS = /^(\d+)\s*×\s*(\d+)/;

const PLYO_STAGE = "Plyo Ball Preparation";

/** The measured high-intent throw set. Matched on the name, never on a cue. */
const PULLDOWN = /pulldown/i;

/**
 * How many plyo throws a develop week may take at hybrid A.
 *
 * Tread's budget is 15–20 high-effort throws for the whole session. On a
 * develop Wednesday the light balls alone were fourteen of them at the
 * programme's own 85%, which left nothing for the measured set — so raising
 * the ceiling without cutting the sets would produce thirty-plus maximal
 * throws, which is the failure mode the guide names outright.
 *
 * Sets drop to one; reps are untouched, because the rep count is the shape of
 * the drill and one throw of a rocker throw is not a rocker throw.
 */
const HYBRID_A_PLYO_THROWS = 8;

/**
 * The whole session's high-effort budget on a develop week — Tread's number.
 *
 * The measured set is *not* a fixed count. It is whatever is left of this
 * after the plyo ladder has taken its share, which is the only way the two can
 * be prescribed honestly: they are the same twenty throws. A hardcoded twelve
 * here was wrong the moment the ladder's arithmetic changed by a throw.
 */
const DEVELOP_HIGH_EFFORT_THROWS = 20;

/** The floor on the measured set, below which the day is not worth having. */
const MIN_MEASURED_THROWS = 8;

/** What a velocity day is thrown at. Two bands, because the set builds across them. */
const VELOCITY_DAY_INTENT = `${BAND_PERCENT.hybrid_a}–${BAND_PERCENT.velocity}%`;

function statedEffort(prescription: string): number | null {
  const match = prescription.match(EFFORT);
  return match ? Number(match[1]) : null;
}

/**
 * Rewrite a prescription's effort figure to a named band.
 *
 * The band replaces the number rather than sitting beside it. "70% perceived
 * effort (hybrid B)" would be two ways of saying one thing and would leave the
 * nine-value ladder intact underneath the four-band vocabulary.
 */
function withBand(prescription: string, band: IntentBand): string {
  const written = `${BAND_RANGES[band]} · ${BAND_LABELS[band]} intent`;
  if (EFFORT.test(prescription)) return prescription.replace(EFFORT, written);
  return `${prescription} · ${written}`;
}

function trimSets(prescription: string, sets: number): string {
  return prescription.replace(SETS_REPS, (_whole, _sets, reps) => `${sets} × ${reps}`);
}

function plyoThrows(prescription: string): number {
  const match = prescription.match(SETS_REPS);
  return match ? Number(match[1]) * Number(match[2]) : 0;
}

/**
 * Cap — and on a develop week, deliberately raise — the plyo ladder.
 *
 * `reduced` is the readiness flag, and it only ever blocks the raise. The cap
 * still applies on a reduced day, because a cap that stops working when the
 * athlete is tired is not a cap.
 */
function applyToPlyos(
  tasks: SessionTask[],
  policy: VelocityPolicy,
  reduced: boolean
): { tasks: SessionTask[]; hybridAThrows: number } {
  let hybridABudget = HYBRID_A_PLYO_THROWS;
  let hybridAThrows = 0;
  // A reduced day never reaches hybrid A, whatever the block permits. The
  // week's ceiling and the day's readiness are two separate limits and the
  // lower of them wins — a develop week does not entitle a tired athlete to a
  // velocity dose.
  const ceiling = reduced ? lowerBand(policy.plyoCeiling, "hybrid_b") : policy.plyoCeiling;

  const capped = tasks.map((task) => {
    if (task.stageTitle !== PLYO_STAGE) return task;
    const stated = statedEffort(task.prescription);
    if (stated === null) return task;

    // The band the programme wrote, capped by the week. Note what this does
    // *not* do: it never promotes a 60% patterning throw into a hybrid A
    // throw because the week permits one. Only a throw the programme already
    // wrote at near-maximal intent moves, and then only from 85% to the
    // band's canonical 90%.
    const target = lowerBand(bandFor(stated), ceiling);

    let prescription = task.prescription;
    if (target === "hybrid_a") {
      // Raising intent without cutting volume is the failure Tread names
      // outright. Sets drop to one as soon as the ladder has spent its share
      // of the budget; reps are untouched, because the rep count is the shape
      // of the drill and one throw of a rocker throw is not a rocker throw.
      // One set is the floor, so the total can land a little over — which is
      // why the measured set below is derived from the real count rather than
      // assumed.
      if (plyoThrows(prescription) > hybridABudget) prescription = trimSets(prescription, 1);
      const throws = plyoThrows(prescription);
      hybridABudget = Math.max(0, hybridABudget - throws);
      hybridAThrows += throws;
    }

    prescription = withBand(prescription, target);
    if (prescription === task.prescription) return task;

    return {
      ...task,
      prescription,
      cue: `${task.cue} ${BAND_LABELS[target][0].toUpperCase()}${BAND_LABELS[target].slice(1)} band — ${BAND_RANGES[target]}, and that is a ceiling for the day, not a target to reach on every throw.`,
      evidence: policy.note,
    };
  });

  return { tasks: capped, hybridAThrows };
}

/**
 * The measured throw set.
 *
 * On a develop week this becomes a genuine velocity day at Tread's dose. On
 * every other week the programme's own count stands and all that changes is
 * that the day says what it is and what the week's whole high-effort budget
 * is — because the reason the ladder in front of it mattered is that both come
 * out of the same budget.
 */
function applyToPulldowns(
  tasks: SessionTask[],
  policy: VelocityPolicy,
  reduced: boolean,
  hybridAThrows: number
): SessionTask[] {
  const measured = Math.max(MIN_MEASURED_THROWS, DEVELOP_HIGH_EFFORT_THROWS - hybridAThrows);

  return tasks.map((task) => {
    if (!PULLDOWN.test(task.name)) return task;
    // Both branches below append to text the task already carries, so running
    // twice would say everything twice. The plyo pass is self-limiting — its
    // rewrite removes the pattern it matches on — but this one is not, so it
    // is marked explicitly.
    if (task.velocityPolicy) return task;

    if (policy.block === "develop" && !reduced) {
      return {
        ...task,
        velocityPolicy: policy.block,
        name: "Velocity day — measured pulldowns",
        prescription: `${measured} measured throws · ${VELOCITY_DAY_INTENT} · regulation 5 oz ball · 90–120 s between throws`,
        cue: `This is the day the programme actually tries to make you throw harder, and it is one of ${policy.blockWeeks} such weeks in the year — so it is worth doing properly and worth stopping on time. ${DEVELOP_HIGH_EFFORT_THROWS} high-effort throws in the whole session: the light balls above are ${hybridAThrows} of them, which leaves ${measured} here. Stop at ${measured} even if it feels good.`,
        setup: `${task.setup ?? ""} Radar set up before the first throw, not after — an unmeasured velocity day is a hard throwing day with no information in it.`.trim(),
        execution:
          "Full run-in rhythm. First throw at about 90% and build only while direction and deceleration stay clean. Record peak and best-five average so the block can be judged on something other than how it felt.",
        rest: "90–120 seconds between measured throws. Under 90 seconds this stops being a velocity set and becomes conditioning.",
        stop: `${task.stop ?? ""} Stop the set for pain, for a drop of more than 2 mph across two consecutive throws, or at ${measured} throws — whichever comes first.`.trim(),
        evidence: `Tread Athletics (Brewster & Blanc), published guide: "our high intensity phases usually only have 15 or 20 high effort throws, twice per week". Driveline's published bands put maximal effort at one to two days a week and state that three times a week is not recommended — this week has one, because the plyo ladder and this set share a budget. Reinold 2018 (Sports Health 10(4):327–333) is the reason the count is a hard number: 38 pitchers randomised, +3.3% velocity and +4.3° shoulder external rotation in the weighted-ball group, against a 24% injury rate versus none in control. ${policy.note}`,
      };
    }

    const budget = policy.highEffortThrows;
    const budgetLine =
      budget === null
        ? "The count above is the week's whole high-effort budget — the plyo ladder in front of it is capped below maximal intent so it does not spend any of it."
        : `Hold the week to ${budget} high-effort throws in total.`;

    return {
      ...task,
      velocityPolicy: policy.block,
      cue: `${task.cue} ${budgetLine} ${policy.headline}.`,
      evidence: policy.note,
    };
  });
}

/**
 * Apply the week's velocity policy to a built session.
 *
 * Runs last, after the readiness reduction and after the baseline additions,
 * for one reason: every intent change here is a `min`, so applying it last is
 * both correct and idempotent. Applied earlier, a later rewrite of the
 * prescription could put a capped percentage back above the ceiling.
 */
export function applyVelocityPolicy(
  session: Session,
  options: { week: number | null; reduced?: boolean }
): Session {
  if (options.week === null) return session;
  const policy = velocityPolicy(options.week);
  const reduced = Boolean(options.reduced);

  // The ladder is capped first, because what is left of the week's high-effort
  // budget after it is what the measured set gets. Doing this the other way
  // round would mean prescribing the measured throws and then discovering how
  // many were already spent.
  const plyos = applyToPlyos(session.tasks, policy, reduced);
  const tasks = applyToPulldowns(plyos.tasks, policy, reduced, plyos.hybridAThrows);
  return { ...session, tasks };
}

/**
 * Which programme week a built session belongs to, read off its task ids.
 *
 * Every generated id is `w{week}-d{day}-…`, so the session carries its own
 * week and no caller has to remember to pass one. That matters more than it
 * looks: a policy that silently does nothing when an argument is forgotten is
 * a policy that will eventually be forgotten. A session with no parseable id
 * returns null and is left alone.
 */
export function weekFromTasks(tasks: SessionTask[]): number | null {
  for (const task of tasks) {
    const match = String(task.id).match(/^w(\d+)-d\d+/);
    if (match) return Number(match[1]);
  }
  return null;
}
