/**
 * Explicit numbers for a reduced session.
 *
 * When readiness drops the plan, the programme replaces each prescription
 * with an instruction to work the new dose out yourself — "Remove the final
 * work set · use no more than 90% of the listed load · cap at RPE 7", or
 * "Complete about 75% of listed reps". That is arithmetic handed to an
 * athlete mid-session, and arithmetic under fatigue is how a reduced day
 * quietly becomes a full one.
 *
 * This reads the original prescription and states the reduced dose outright:
 * 3 × 5 @ 100 kg becomes 2 × 5 @ 90 kg. The guidance is kept after it, so
 * nothing is lost — it just stops being the only thing on offer.
 *
 * Where a prescription cannot be parsed into numbers, the original guidance
 * stands unchanged. Inventing a set count for something this cannot read
 * would be worse than asking.
 */

export type ReducedLevel = "reduced" | "recovery";

/** How the programme's own copy describes each reduction. */
export const REDUCTION_RULES = {
  reduced: {
    output: "Remove the final work set, no more than 90% of the listed load, cap at RPE 7.",
    plyo: "About 75% of the listed reps, capped at 65–70% perceived effort.",
    throw: "About 75% of the assigned volume, at the lower end of the listed range.",
    conditioning: "About 75% of the listed duration.",
    generic: "Remove one set and keep at least three reps in reserve.",
  },
  recovery: {
    output: "Technique only — 1–2 light sets at RPE 5–6, no loaded jumps or ballistic work.",
    plyo: "Omitted today, unless it is the 1,000 g reverse throw and you are symptom-free.",
    throw: "About 50% of the assigned volume, 45–75 ft, capped at 60%.",
    conditioning: "10–20 minutes easy movement, or complete rest.",
    generic: "One easy set only if it improves how you feel; otherwise omit.",
  },
} as const;

export type PrescriptionKind = keyof typeof REDUCTION_RULES.reduced;

/**
 * Sets × reps, with whatever unit trails the rep count. "3 × 20 s/side" is
 * three sets of a twenty-second hold per side — dropping the "s/side" leaves
 * "2 × 20", which reads as twenty reps.
 */
const SETS_REPS = /(\d+)\s*×\s*(\d+)\s*(s\b)?\s*(\/\s*(?:leg|side|arm))?/;
const LOAD_KG = /(\d+(?:\.\d+)?)\s*kg/;
const LOAD_RANGE_KG = /(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*kg/;
const THROW_COUNT = /(\d+)\s*[–-]\s*(\d+)\s*total throws/i;
const DURATION = /(\d+)\s*[–-]\s*(\d+)\s*(minutes|min)\b/i;
const SECONDS_HOLD = /(\d+)\s*s\b/;
const PERCEIVED_EFFORT = /(\d+)\s*%\s*perceived effort/i;

/** Barbell loads round to 2.5 kg; dumbbells and everything else to 1 kg. */
function roundLoad(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Volume rounds *down*, never up. Half of 45 throws is 22.5, and rounding
 * that to 25 hands back more work than the reduction asked for — which is
 * exactly the failure this whole module exists to prevent.
 */
function floorTo(value: number, step: number, min = step): number {
  return Math.max(min, Math.floor(value / step) * step);
}

/**
 * The reduced dose, stated in the same shape as the original.
 *
 * Returns null when the prescription has no numbers this can safely change —
 * the caller then keeps the programme's guidance rather than guessing.
 */
export function reduceSetsAndReps(
  original: string,
  kind: PrescriptionKind,
  level: ReducedLevel
): string | null {
  const parts: string[] = [];

  const setsReps = original.match(SETS_REPS);
  if (setsReps) {
    const sets = Number(setsReps[1]);
    const reps = Number(setsReps[2]);
    const seconds = setsReps[3] ? " s" : "";
    const perSide = setsReps[4] ? setsReps[4].replace(/\s+/g, "") : "";
    const unit = `${seconds}${perSide}`;

    if (level === "recovery") {
      // Recovery is not a smaller version of the session; it is a different
      // session. One or two light sets, and the rep count is unchanged.
      if (kind === "output" || kind === "generic") {
        parts.push(`1–2 × ${reps}${unit}`);
      } else {
        return null;
      }
    } else if (kind === "output" || kind === "generic") {
      // "Remove the final work set" — but never below one set.
      parts.push(`${Math.max(1, sets - 1)} × ${reps}${unit}`);
    } else {
      // 75% of reps, keeping the set count so the shape of the work survives.
      const reduced = Math.max(1, Math.floor(reps * 0.75));
      parts.push(`${sets} × ${reduced}${unit}`);
    }
  }

  // Load: 90% on a reduced day, untouched on recovery (which is light by RPE).
  if (level === "reduced") {
    const range = original.match(LOAD_RANGE_KG);
    const single = !range && original.match(LOAD_KG);
    if (range) {
      const step = 1;
      parts.push(
        `${roundLoad(Number(range[1]) * 0.9, step)}–${roundLoad(Number(range[2]) * 0.9, step)} kg`
      );
    } else if (single) {
      const value = Number(single[1]);
      // A barbell load is heavy enough that 2.5 kg is the smallest honest step.
      parts.push(`${roundLoad(value * 0.9, value >= 60 ? 2.5 : 1)} kg`);
    }
  }

  const throws = original.match(THROW_COUNT);
  if (throws) {
    const scale = level === "recovery" ? 0.5 : 0.75;
    const low = floorTo(Number(throws[1]) * scale, 5);
    const high = floorTo(Number(throws[2]) * scale, 5);
    parts.push(`${low}–${high} total throws`);
  }

  const duration = original.match(DURATION);
  if (duration) {
    if (level === "recovery") {
      parts.push("10–20 minutes");
    } else {
      const low = floorTo(Number(duration[1]) * 0.75, 5);
      const high = floorTo(Number(duration[2]) * 0.75, 5);
      parts.push(`${low}–${high} minutes`);
    }
  }

  // An isometric hold is time, not reps — scale it the same way.
  if (!setsReps && !throws && !duration) {
    const hold = original.match(SECONDS_HOLD);
    if (hold) {
      const scale = level === "recovery" ? 0.5 : 0.75;
      parts.push(`${floorTo(Number(hold[1]) * scale, 5)} s`);
    }
  }

  if (parts.length === 0) return null;

  // The effort ceiling is part of the dose, so it belongs in the numbers.
  //
  // It is a *cap*, not a target. Writing the cap in unconditionally raised a
  // throw prescribed at 50% to "65–70% effort" on a reduced day — a reduction
  // that increases intent, which is the opposite of the point. So the lower of
  // the two always wins, and a prescription already under the cap keeps its
  // own number.
  if (kind === "output" || kind === "generic") {
    parts.push(level === "recovery" ? "RPE 5–6" : "cap RPE 7");
  } else if (kind === "plyo") {
    const ceiling = level === "recovery" ? 50 : 70;
    const stated = original.match(PERCEIVED_EFFORT);
    const effort = stated ? Math.min(Number(stated[1]), ceiling) : ceiling;
    parts.push(`${effort}% effort`);
  }

  return parts.join(" · ");
}

/** Which reduction rule applies, inferred from the stage the task sits in. */
export function prescriptionKind(stageTitle: string, name: string): PrescriptionKind {
  if (/plyo/i.test(stageTitle)) return "plyo";
  if (/throw/i.test(stageTitle)) return "throw";
  if (/condition/i.test(stageTitle)) return "conditioning";
  if (/force|power|speed/i.test(stageTitle)) return "output";
  if (/carry|jump|squat|deadlift|press|row|curl/i.test(name)) return "output";
  return "generic";
}

/** The original prescription the programme stashed on an adapted task. */
export function originalPrescription(adaptationNote: unknown): string | null {
  if (typeof adaptationNote !== "string") return null;
  const match = adaptationNote.match(/^Original plan:\s*(.+)$/s);
  return match ? match[1].trim() : null;
}
