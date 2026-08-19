/**
 * Putting the recovery protocol into the day's own session.
 *
 * The protocol is not a second programme running beside the training — it is
 * part of the day, and it belongs in the same task list the athlete already
 * works through. This is the overlay that puts it there: the day's blocks
 * become tasks in the Arm Care and Recover stages, and the two blocks that
 * describe the shape of the day rather than adding to it are returned as a
 * note instead.
 *
 * Nothing here asks the athlete anything. The tier and the day come from what
 * they already logged — how many they threw, at what intent, whether it was a
 * game — so the plan simply knows.
 *
 * Kept separate from `programmeUpdates` because that overlay is about the
 * written programme's own prescriptions, and this one is about what a
 * particular outing did. They compose; neither needs to know about the other.
 */

import { Session, SessionTask } from "./programmeSessions";
import {
  COLD_POLICY,
  CONFLICT_RULES,
  GYM_SESSION_LABELS,
  GymRecoveryPlan,
  RecoveryBlock,
  RecoveryForDay,
  gymBlocksAfter,
  placementFor,
} from "./recoveryProtocol";

const ARM_CARE_STAGE = { stage: 5, title: "Arm Care" };
const RECOVER_STAGE = { stage: 6, title: "Recover" };

/**
 * Programme tasks each recovery block takes over, rather than sitting beside.
 *
 * The written programme already ends most days with three tasks that cover
 * the same ground as the protocol: a post-throw arm-care circuit, a
 * fuel-and-fluids task, and a "Recovery plan" of down-regulation and sleep.
 * Adding the protocol's versions alongside them would give the athlete two
 * protein tasks, two sleep tasks and two cuff circuits on the same day.
 *
 * So a block that covers the same work *replaces* that task instead of
 * joining it. One task per job, and the athlete's completion tracking keeps
 * working because the task keeps its id.
 *
 * One of these is a contradiction rather than a duplicate, and worth naming.
 * The programme's post-throw circuit is loaded cuff work immediately after
 * throwing; the protocol deliberately moves that off day 0 — throwing is
 * already the endurance stimulus — and puts a mobility cool-down there
 * instead, with the band work returning on day 3. So on day 0 the cool-down
 * takes that slot, and on day 3 the band routine takes it back.
 */
interface Supersession {
  /** Programme tasks this block can take over. The first one present wins. */
  targets: readonly string[];
  /**
   * How the block and the programme task combine.
   *
   * `replace` — the block *is* the work, and its prescription is the one to
   * follow. This is right where the protocol deliberately changes what the
   * programme asked for: on day 0 the cool-down exists precisely because the
   * loaded circuit should not be done then.
   *
   * `annotate` — the programme already prescribes this work, at its own dose,
   * and the protocol only wants to say why today is a day for it. The
   * prescription is left exactly as written and the block's reasoning and
   * citation are attached to it. Used where the two are the same session:
   * replacing there would silently rewrite the athlete's programme, and would
   * have cut Thursday's conditioning from 20–25 minutes to 15–20.
   */
  mode?: "replace" | "annotate";
}

const SUPERSEDES: Record<string, Supersession> = {
  // Day 0 — the cool-down replaces the loaded circuit at T+0.
  "mobility-cooldown": { targets: ["Post-throw arm-care circuit"] },
  feed: { targets: ["Post-session fuel and fluids"] },
  walkdown: { targets: ["Recovery plan"] },
  sleep: { targets: ["Recovery plan"] },
  // Day 1 — the scapular block is the day's arm-care work, not an addition to
  // it. Left beside the programme's circuit it repeated three of its four
  // movements: band row, external rotation and the serratus wall slide were
  // each prescribed twice on the same day, once light and once heavy.
  "scap-strength": { targets: ["Post-throw arm-care circuit"] },
  // Day 3 — the band work returns to the slot it belongs in.
  "band-routine": { targets: ["Post-throw arm-care circuit"] },
  // Gym track.
  "protein-spread": { targets: ["Post-session fuel and fluids"] },
  downregulate: { targets: ["Recovery plan"] },

  // The aerobic flush and the programme's own conditioning are the same
  // session: easy bike or walk, conversational, fifteen to thirty minutes.
  // Prescribed separately they gave a Thursday 20–25 minutes of "Low-intensity
  // aerobic base" *and* 15–20 minutes of "Low-intensity aerobic flush" — 45
  // minutes of easy cardio on a day whose own description is "move, throw
  // easily, restore". Annotated rather than replaced, so the programme keeps
  // its dose and gains the reason.
  "aerobic-flush": {
    targets: ["Low-intensity aerobic base", "Low-impact aerobic base", "Optional easy aerobic work", "Walk + mobility"],
    mode: "annotate",
  },
  "aerobic-flush-gym": {
    targets: ["Low-intensity aerobic base", "Low-impact aerobic base", "Optional easy aerobic work", "Walk + mobility"],
    mode: "annotate",
  },
};

/** The programme task a block takes over on this day, or null if none is here. */
function supersededName(blockId: string, tasks: SessionTask[]): string | null {
  const entry = SUPERSEDES[blockId];
  if (!entry) return null;
  return entry.targets.find((name) => tasks.some((task) => task.name === name)) ?? null;
}

function taskFor(block: RecoveryBlock, stage: { stage: number; title: string }, prefix: string): SessionTask {
  const optional = block.optional ? " Optional." : "";
  return {
    id: `${prefix}-recovery-${block.id}`,
    stage: stage.stage,
    stageTitle: stage.title,
    stageDescription:
      stage.title === "Arm Care"
        ? "Restore motion and finish with low-fatigue work."
        : "Record the basics that support the next session.",
    name: block.name,
    prescription: block.prescription,
    // The cue carries the reason. A recovery task with no reason attached is
    // the kind of thing that gets skipped first.
    cue: block.why,
    ...(block.caveat ? { stop: block.caveat } : {}),
    ...(optional ? { rest: optional.trim() } : {}),
    // The source travels with the prescription. Building this from papers was
    // the whole point; a dose the athlete cannot trace back to a study is just
    // an assertion, and an assertion is what he can already get anywhere.
    ...(block.citation
      ? { evidence: `${block.citation.key} — ${block.citation.detail}` }
      : {}),
  };
}

export interface RecoveryOverlay {
  session: Session;
  /** What the protocol says about the shape of the day, if anything. */
  note: string | null;
  /** How many tasks were added, so a caller can say so honestly. */
  added: number;
}

/**
 * Merge the day's recovery blocks into a session.
 *
 * Tasks are inserted after the last task of the stage they belong to, so the
 * session keeps its order and the athlete does not find recovery work sitting
 * in the middle of the throwing block. A stage that does not exist on this day
 * is created, because a recovery day may legitimately have no arm-care stage
 * of its own.
 *
 * A block already present — by id — is never added twice, so re-running this
 * on an already-merged session changes nothing.
 */
export interface RecoveryInputs {
  /** The gym session the day held, and which day of its own short protocol. */
  gym?: { plan: GymRecoveryPlan; dayOffset: number } | null;
  /** Tasks already completed or skipped, so pending throwing can be spotted. */
  resolvedTaskIds?: string[];
}

/** Stages that mean there is still throwing to come today. */
const THROWING_STAGES = new Set([
  "Throw",
  "High-Intent Prep",
  "Game Warm-up",
  "Team Throwing",
  "Compete",
  "Speed",
]);

/**
 * Blocks held back while throwing is still to come.
 *
 * Only the stretch: it is the one with a documented acute strength cost. The
 * scraper stays, because its literature is range of motion and pain, and
 * nothing in it reports a strength decrement — but that is a reason to allow
 * it, not a reason to be silent, so its own caveat says as much.
 */
const PRE_THROW_HELD = new Set(["sleeper-stretch"]);

export function applyRecoveryProtocol(
  session: Session,
  recovery: RecoveryForDay | null,
  inputs: RecoveryInputs = {}
): RecoveryOverlay {
  const gym = inputs.gym ?? null;
  if (!recovery && !gym) return { session, note: null, added: 0 };

  const prefix = String(session.tasks[0]?.id ?? "day").split("-").slice(0, 2).join("-");
  const tasks = [...session.tasks];
  let added = 0;

  // The two tracks share modalities, so the gym's version of a block is
  // dropped where the throwing day already prescribes it — the protocol's own
  // rules: protein is per day, and one compression period covers both.
  // The sleeper stretch acutely reduces external rotator strength, so on a day
  // that still has throwing to come it is held rather than prescribed. The
  // caveat said this already; saying it is not the same as doing it.
  //
  // Stage order does most of the work — Arm Care sits after Throw — but a day
  // whose throwing has not been resolved yet is a day where the athlete could
  // reasonably do the stretch first, and the block belongs to the app.
  const throwingPending = session.tasks.some(
    (task) => THROWING_STAGES.has(task.stageTitle) && !inputs.resolvedTaskIds?.includes(task.id)
  );
  const held = throwingPending ? PRE_THROW_HELD : new Set<string>();

  const throwingIds = (recovery?.tasks ?? []).map((block) => block.id);
  const gymBlocks = gym ? gymBlocksAfter(gym.plan, gym.dayOffset, throwingIds) : [];
  const blocks = [...(recovery?.tasks ?? []), ...gymBlocks].filter((block) => !held.has(block.id));

  // Blocks that take over a programme task are folded into it first, so the
  // day never carries the same work twice. Several can land on one task —
  // "Recovery plan" is down-regulation *and* sleep — in which case their
  // prescriptions are joined rather than one of them being dropped.
  const claims = new Map<string, RecoveryBlock[]>();
  for (const block of blocks) {
    const target = supersededName(block.id, tasks);
    if (!target) continue;
    claims.set(target, [...(claims.get(target) ?? []), block]);
  }

  for (const [name, blocks] of claims) {
    const index = tasks.findIndex((task) => task.name === name);
    if (index === -1) continue;
    // A task claimed by both kinds of block takes the stricter reading: if any
    // block means to replace the work, the prescription is the block's.
    const replacing = blocks.filter((block) => SUPERSEDES[block.id]?.mode !== "annotate");
    const citing = blocks.filter((block) => block.citation);
    tasks[index] = {
      ...tasks[index],
      ...(replacing.length
        ? { prescription: replacing.map((block) => block.prescription).join(" · ") }
        : {}),
      // The reason always comes through, whichever mode applied — it is why
      // the task is on today's list at all.
      cue: [
        ...(replacing.length ? [] : [tasks[index].cue]),
        ...blocks.map((block) => block.why),
      ]
        .filter(Boolean)
        .join(" "),
      ...(blocks.find((block) => block.caveat)
        ? { stop: blocks.find((block) => block.caveat)!.caveat }
        : {}),
      ...(citing.length
        ? {
            evidence: citing
              .map((block) => `${block.citation!.key} — ${block.citation!.detail}`)
              .join(" "),
          }
        : {}),
    };
  }

  for (const block of blocks) {
    // Already folded into a programme task above.
    if (supersededName(block.id, tasks)) continue;

    const stage = placementFor(block.id) === "arm_care" ? ARM_CARE_STAGE : RECOVER_STAGE;
    const task = taskFor(block, stage, prefix);
    if (tasks.some((existing) => existing.id === task.id)) continue;

    // After the last task of that stage, or at the end when the stage is new.
    let insertAt = tasks.length;
    for (let i = tasks.length - 1; i >= 0; i -= 1) {
      if (tasks[i].stageTitle === stage.title) {
        insertAt = i + 1;
        break;
      }
      if (tasks[i].stage < stage.stage) {
        insertAt = i + 1;
        break;
      }
    }
    tasks.splice(insertAt, 0, task);
    added += 1;
  }

  const parts: string[] = [];

  if (recovery) {
    parts.push(`Day ${recovery.dayOffset} after a ${recovery.tier} outing on ${recovery.outingDate}.`);
    const guidance = recovery.guidance.map((block) => `${block.name}: ${block.prescription}`).join(" ");
    if (guidance) parts.push(guidance);
    if (recovery.day.annotation) parts.push(recovery.day.annotation);
  }

  if (gym) {
    const label = GYM_SESSION_LABELS[gym.plan.sessionType].toLowerCase();
    parts.push(
      gym.dayOffset === 0
        ? `Recovering from today's ${label} session as well.`
        : `Day after a ${label} session.`
    );
  }

  // Both on one day is the case the protocol has explicit rules for, so say
  // the one that actually changes what the athlete does.
  if (recovery && gym && gym.dayOffset === 0 && recovery.dayOffset === 0) {
    const order = CONFLICT_RULES.find((rule) => rule.situation.includes("same day"));
    if (order) parts.push(order.rule);
  }

  // Said once, where the recovery work appears, rather than as its own panel.
  parts.push(COLD_POLICY.rule);

  return { session: { ...session, tasks }, note: parts.join(" "), added };
}
