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
const SUPERSEDES: Record<string, string> = {
  // Day 0 — the cool-down replaces the loaded circuit at T+0.
  "mobility-cooldown": "Post-throw arm-care circuit",
  feed: "Post-session fuel and fluids",
  walkdown: "Recovery plan",
  sleep: "Recovery plan",
  // Day 3 — the band work returns to the slot it belongs in.
  "band-routine": "Post-throw arm-care circuit",
  // Gym track.
  "protein-spread": "Post-session fuel and fluids",
  downregulate: "Recovery plan",
};

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
}

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
  const throwingIds = (recovery?.tasks ?? []).map((block) => block.id);
  const gymBlocks = gym ? gymBlocksAfter(gym.plan, gym.dayOffset, throwingIds) : [];
  const blocks = [...(recovery?.tasks ?? []), ...gymBlocks];

  // Blocks that take over a programme task are folded into it first, so the
  // day never carries the same work twice. Several can land on one task —
  // "Recovery plan" is down-regulation *and* sleep — in which case their
  // prescriptions are joined rather than one of them being dropped.
  const claims = new Map<string, RecoveryBlock[]>();
  for (const block of blocks) {
    const target = SUPERSEDES[block.id];
    if (!target) continue;
    claims.set(target, [...(claims.get(target) ?? []), block]);
  }

  for (const [name, blocks] of claims) {
    const index = tasks.findIndex((task) => task.name === name);
    if (index === -1) continue;
    tasks[index] = {
      ...tasks[index],
      prescription: blocks.map((block) => block.prescription).join(" · "),
      cue: blocks.map((block) => block.why).join(" "),
      ...(blocks.find((block) => block.caveat)
        ? { stop: blocks.find((block) => block.caveat)!.caveat }
        : {}),
    };
  }

  for (const block of blocks) {
    // Already folded into a programme task above.
    if (SUPERSEDES[block.id] && tasks.some((task) => task.name === SUPERSEDES[block.id])) continue;

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
