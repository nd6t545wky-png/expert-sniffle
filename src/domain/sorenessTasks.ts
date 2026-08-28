/**
 * Rewriting the day around what hurts.
 *
 * `soreness.ts` decides *what* should happen. This puts it into the session
 * the athlete actually opens — the same task list, not a second screen with
 * advice on it that has to be reconciled by hand. Something reported as sore
 * changes the plan, or the report was pointless.
 *
 * Applied last, after the programme's own overlay and after the recovery
 * protocol, for one reason: it is the only overlay that can *remove* work, and
 * it has to be able to remove work the other two added. A protocol that
 * prescribes a band routine on day 3 must not reinstate loaded cuff work on a
 * shoulder that has been put on hold since.
 *
 * Three behaviours worth knowing about:
 *
 * **Swapping beats removing.** A sore medial elbow does not mean skipping the
 * deadlift; it means doing it with straps. Where a like-for-like alteration
 * exists the day keeps its shape and its training stimulus, and only the
 * provoking element goes. Removal is the fallback, not the first move.
 *
 * **Nothing is deleted silently.** Every change comes back as a note naming
 * the task, the region and the reason, so the athlete can see the plan was
 * changed rather than wondering why Tuesday looks different.
 *
 * **Throwing is gated separately from lifting**, and harder — see the header
 * of `soreness.ts` for why.
 */

import { Session, SessionTask } from "./programmeSessions";
import {
  ActiveReport,
  ExerciseRx,
  PAIN_SOURCES,
  REGION_LABELS,
  REGION_PLAYBOOK,
  ARM_REGIONS,
  BodyRegion,
  throwingCap,
  worstTier,
} from "./soreness";

const ARM_CARE_STAGE = { stage: 5, title: "Arm Care" };
const RECOVER_STAGE = { stage: 6, title: "Recover" };

/**
 * Stages that are throwing, and only throwing.
 *
 * Read from the stage rather than guessed from the name, because a stage is a
 * more stable thing to match than a prescription's wording — but *only* for
 * stages that hold nothing else. `Game Warm-up` and `High-Intent Prep` sound
 * like throwing and contain sprint work: "Sprint build-ups" and "Sprint
 * mechanics" are the whole of them. Gating on those took a pitcher's running
 * away because his elbow hurt, which is both useless and the kind of
 * over-reach that gets a feature switched off.
 */
const THROWING_STAGES = /^(Throw|Plyo Ball Preparation|Team Throwing|Compete)$/i;

/**
 * Team training, which contains throwing inside a session the athlete does not
 * control.
 *
 * Removing it would tell him to skip practice; leaving it alone would let the
 * arm throw anyway. So the task stays and its prescription carries the limit,
 * which is the thing he actually has to enforce on the field.
 */
const TEAM_PRACTICE_STAGE = /^Team Practice$/i;

/**
 * Throwing that is still allowed under a reduced cap.
 *
 * Catch play and easy work stay; anything off a mound, at intent, or with a
 * weighted ball goes. The distinction is effort, not volume — there is no way
 * to throw a pulldown at 60%.
 */
const LOW_INTENT_THROWING = /catch|easy|primer|recovery/i;

export interface SorenessChange {
  kind: "removed" | "swapped" | "added" | "capped";
  /** What the athlete will notice. */
  text: string;
  region: BodyRegion;
}

export interface SorenessOverlay {
  session: Session;
  changes: SorenessChange[];
  /** One line for the top of the plan, or null when nothing changed. */
  note: string | null;
  /** Said loudly and separately: this one is not a training decision. */
  referral: string | null;
}

function rxTask(
  rx: ExerciseRx,
  region: BodyRegion,
  stage: { stage: number; title: string }
): SessionTask {
  return {
    id: `soreness-${region}-${rx.id}`,
    stage: stage.stage,
    stageTitle: stage.title,
    stageDescription:
      stage.title === "Arm Care"
        ? "Restore motion and finish with low-fatigue work."
        : "Record the basics that support the next session.",
    name: `${REGION_LABELS[region]} — ${rx.name}`,
    prescription: rx.prescription,
    cue: rx.cue,
    ...(rx.stop ? { stop: rx.stop } : {}),
    // Same contract as the recovery blocks: a dose the athlete cannot trace
    // back to a paper is an assertion, and he can get assertions anywhere.
    ...(rx.citation ? { evidence: `${rx.citation.key} — ${rx.citation.detail}` } : {}),
  };
}

/** "a, b and c" — so the summary line reads as a sentence rather than a log. */
function listSentence(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Where a region's prescribed work belongs in the day. */
function stageFor(region: BodyRegion) {
  return ARM_REGIONS.includes(region) ? ARM_CARE_STAGE : RECOVER_STAGE;
}

function insertIntoStage(tasks: SessionTask[], additions: SessionTask[]): SessionTask[] {
  const merged = [...tasks];
  for (const task of additions) {
    if (merged.some((existing) => existing.id === task.id)) continue;
    // After the last task of the same stage, so the day keeps its order and
    // management work does not land in the middle of the lifting.
    let index = -1;
    for (let i = 0; i < merged.length; i += 1) {
      if (merged[i].stage === task.stage) index = i;
    }
    if (index === -1) merged.push(task);
    else merged.splice(index + 1, 0, task);
  }
  return merged;
}

/**
 * Apply every active report to the day.
 *
 * Reports that have gone stale — older than their lifetime with no update —
 * are ignored here rather than acted on. Carrying a nine-day-old report into
 * today's plan without asking is how an athlete ends up training around an
 * elbow that stopped hurting last Wednesday.
 */
export function applySorenessProtocol(session: Session, active: ActiveReport[]): SorenessOverlay {
  const live = active.filter((entry) => !entry.stale);
  if (live.length === 0) {
    return { session, changes: [], note: null, referral: null };
  }

  const changes: SorenessChange[] = [];
  let tasks = [...session.tasks];

  // --- Take out or alter what loads the sore tissue -------------------------
  for (const entry of live) {
    if (entry.triage.tier === "monitor") continue;
    const region = entry.report.region;
    const playbook = REGION_PLAYBOOK[region];

    tasks = tasks.flatMap((task) => {
      const swap = playbook.swaps.find((candidate) => candidate.match.test(task.name));
      if (swap) {
        changes.push({
          kind: "swapped",
          region,
          text: `${task.name} → ${swap.name}. ${swap.why}`,
        });
        return [
          {
            ...task,
            name: swap.name,
            prescription: swap.prescription,
            cue: swap.why,
            // The original id is kept so completion already recorded against
            // this task survives the swap.
          },
        ];
      }

      if (playbook.avoid.some((pattern) => pattern.test(task.name))) {
        changes.push({
          kind: "removed",
          region,
          text: `${task.name} is out — it loads the ${REGION_LABELS[region].toLowerCase()}.`,
        });
        return [];
      }

      return [task];
    });
  }

  // --- Gate throwing --------------------------------------------------------
  const cap = throwingCap(live);
  if (cap !== null) {
    const armRegion =
      live.find((entry) => ARM_REGIONS.includes(entry.report.region))?.report.region ?? "other";

    tasks = tasks.flatMap((task) => {
      // Practice is attended either way; what changes is what he does there.
      if (TEAM_PRACTICE_STAGE.test(String(task.stageTitle))) {
        changes.push({
          kind: "capped",
          region: armRegion,
          text:
            cap === 0
              ? `${task.name}: go, but take no part in the throwing.`
              : `${task.name}: catch play only, capped at ${cap}% effort.`,
        });
        return [
          {
            ...task,
            prescription:
              cap === 0
                ? `${task.prescription} Take no part in any throwing today — tell your coach before the session, not during it.`
                : `${task.prescription} Catch play only, capped at ${cap}% effort. No mound work.`,
          },
        ];
      }

      const throwing = THROWING_STAGES.test(String(task.stageTitle));
      if (!throwing) return [task];

      if (cap === 0) {
        changes.push({
          kind: "removed",
          region: armRegion,
          text: `${task.name} is out — no throwing while the arm is being rested.`,
        });
        return [];
      }

      if (LOW_INTENT_THROWING.test(task.name)) {
        return [
          {
            ...task,
            prescription: `${task.prescription} Cap effort at ${cap}% today.`,
            stop:
              "Stop the session if pain rises during it, or if it is worse the next morning than it was this one.",
          },
        ];
      }

      changes.push({
        kind: "removed",
        region: armRegion,
        text: `${task.name} is out — it cannot be thrown at ${cap}%, which is today's ceiling.`,
      });
      return [];
    });

    if (cap === 0) {
      changes.push({
        kind: "capped",
        region: armRegion,
        text: "No throwing today. Pitching through arm pain is one of the few risk factors for throwing injury that is both established and entirely within your control.",
      });
    } else {
      changes.push({
        kind: "capped",
        region: armRegion,
        text: `Throwing capped at ${cap}% effort, catch play only.`,
      });
    }
  }

  // --- Put the prescribed work in ------------------------------------------
  for (const entry of live) {
    if (entry.triage.tier === "monitor") continue;
    const region = entry.report.region;
    const playbook = REGION_PLAYBOOK[region];
    const rxList = entry.triage.tier === "modify" ? playbook.modify : playbook.hold;
    const stage = stageFor(region);
    const additions = rxList.map((rx) => rxTask(rx, region, stage));
    // Only the ones that were not already there: two regions can prescribe the
    // same isometric — a sore front and back of the same shoulder both want
    // external rotation holds — and the athlete should be asked for it once.
    const fresh = additions.filter((task) => !tasks.some((existing) => existing.id === task.id));
    tasks = insertIntoStage(tasks, fresh);
    for (const task of fresh) {
      changes.push({
        kind: "added",
        region,
        text: `${task.name} — ${task.prescription}`,
      });
    }
  }

  const tier = worstTier(live);
  const referral = live.find((entry) => entry.triage.referral)?.triage.referral ?? null;

  const counted = (kind: SorenessChange["kind"]) =>
    changes.filter((change) => change.kind === kind).length;

  const note =
    tier === "monitor"
      ? `${
          live.length === 1 ? "One area" : `${live.length} areas`
        } reported sore and under the monitoring line. The plan is unchanged — train it as written and log how it responds.`
      : changes.length === 0
        ? null
        : `The plan has been changed around what you reported — ${listSentence(
            [
              counted("removed") ? `${counted("removed")} out` : null,
              counted("swapped") ? `${counted("swapped")} altered` : null,
              counted("added") ? `${counted("added")} added` : null,
            ].filter((part): part is string => Boolean(part))
          )}.`;

  return {
    session: { ...session, tasks },
    changes,
    note,
    referral,
  };
}

/** The line the plan shows about training under pain at all. */
