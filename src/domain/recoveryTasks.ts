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
import { RecoveryBlock, RecoveryForDay, placementFor } from "./recoveryProtocol";

const ARM_CARE_STAGE = { stage: 5, title: "Arm Care" };
const RECOVER_STAGE = { stage: 6, title: "Recover" };

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
export function applyRecoveryProtocol(session: Session, recovery: RecoveryForDay | null): RecoveryOverlay {
  if (!recovery) return { session, note: null, added: 0 };

  const prefix = String(session.tasks[0]?.id ?? "day").split("-").slice(0, 2).join("-");
  const tasks = [...session.tasks];
  let added = 0;

  for (const block of recovery.tasks) {
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

  const guidance = recovery.guidance
    .map((block) => `${block.name}: ${block.prescription}`)
    .join(" ");
  const dayLabel = `Day ${recovery.dayOffset} after a ${recovery.tier} outing on ${recovery.outingDate}.`;
  const annotation = recovery.day.annotation ? ` ${recovery.day.annotation}` : "";
  const note = `${dayLabel}${guidance ? ` ${guidance}` : ""}${annotation}`;

  return { session: { ...session, tasks }, note, added };
}
