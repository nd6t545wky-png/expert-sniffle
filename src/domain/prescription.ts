/**
 * Reading a prescription as a list of movements, when it is one.
 *
 * Prescriptions are single strings with middot separators, and the separator
 * does two completely different jobs depending on the task:
 *
 *     "Cat-camel 8 slow · dead bug 6/side · single-leg pelvic-control hold …"
 *          three movements, each with its own dose
 *
 *     "2 × 10 · low amplitude · minimal ground contact"
 *          one movement, a dose, and two qualifiers
 *
 * Rendered as a paragraph both look the same, and the first kind — the warm-up
 * tasks especially — arrives as five wrapped lines you cannot read one at a
 * time. Rendered as a list, the second kind would be mangled into three
 * exercises that do not exist.
 *
 * So this decides which is which, and refuses when it cannot tell. Splitting
 * is presentation only: no prescription string is edited, and a task that does
 * not split renders exactly as it always has.
 *
 * The rule, derived from every prescription the programme can produce:
 *
 *   1. at least two segments; and
 *   2. every segment carries a number of its own — a movement without a dose
 *      is a qualifier, not an exercise; and
 *   3. no segment *opens* with a dose. This is the one that does the work.
 *      "45–60 total throws", "2 × 10", "RPE 2–3/10" and "15–20 minutes bike"
 *      all begin with a measurement, which is what a parameter looks like.
 *      A movement begins with its name — including "90/90 switch 6/side",
 *      where the digits are the name of a position rather than a count.
 */

/**
 * A segment that opens with a measurement rather than a movement name.
 *
 * Anchored, so it only ever matches at the start. The unit list is closed on
 * purpose: an unrecognised unit means the segment is treated as a movement and
 * the prescription splits, which is the recoverable direction to be wrong in —
 * a cosmetic mis-split rather than an invented exercise.
 */
const OPENS_WITH_DOSE =
  /^\d+(?:\s*[–—-]\s*\d+)?\s*(?:×|x\b|%|min\b|minutes?\b|sec\b|secs?\b|s\b|m\b|ft\b|kg\b|g\b|total\b|throws?\b|reps?\b|sets?\b)/i;

/** The trailing dose of a movement: the first number-led run to the end. */
const TRAILING_DOSE = /^(.*?)\s(\d[^·]*)$/;

export interface Movement {
  /** What to do — "Half-kneeling hip flexor with posterior tilt". */
  name: string;
  /** How much of it — "2 × 20 s/side". Absent when it cannot be separated. */
  dose?: string;
}

function hasDigit(text: string): boolean {
  return /\d/.test(text);
}

/**
 * Split a prescription into movements, or return null to render it as written.
 *
 * Null is the common answer and the safe one: most tasks are a single movement
 * and must not be turned into a list.
 */
export function splitPrescription(prescription: unknown): Movement[] | null {
  if (typeof prescription !== "string") return null;

  const segments = prescription
    .split("·")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) return null;
  if (!segments.every(hasDigit)) return null;
  if (segments.some((segment) => OPENS_WITH_DOSE.test(segment))) return null;

  return segments.map((segment) => {
    const match = TRAILING_DOSE.exec(segment);
    if (!match) return { name: segment };
    const [, name, dose] = match;
    // A name that survives only as punctuation is not a name; keep the segment
    // whole rather than showing an empty left column.
    return /[a-z]/i.test(name) ? { name: name.trim(), dose: dose.trim() } : { name: segment };
  });
}
