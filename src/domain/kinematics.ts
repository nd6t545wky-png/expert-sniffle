/**
 * Measured kinematics from the athlete's own video.
 *
 * The mechanics screen rated six qualities one to five. Useful, and entirely
 * qualitative — "your sequencing is a 2" is a judgement, not a measurement,
 * and nothing in the app produced a joint angle or a timing in milliseconds.
 * This does: the athlete scrubs their video to a checkpoint, taps a handful of
 * body points on the frame, and the app works out the angles.
 *
 * Digitising frames by hand is what biomechanics did before motion capture and
 * what coaches still do in video software. It is slower than pose estimation
 * and has one large advantage: it is deterministic and inspectable. Every
 * number here is trigonometry on points the athlete placed, so a figure that
 * looks wrong can be traced to a tap that was in the wrong place, rather than
 * to a model that cannot be argued with.
 *
 * Three things this refuses to pretend:
 *
 *   - **A camera measures a projection, not a joint.** A 2D frame sees the
 *     component of a 3D angle facing the lens, and the error grows with how
 *     far the camera is from square-on. Every measurement carries that, and
 *     the app only offers the measurements a given camera view can actually
 *     see.
 *   - **A missing landmark is missing.** A measurement whose points were not
 *     all placed is absent, never estimated from the ones that were.
 *   - **Reference bands are real measurements of other pitchers, not targets.**
 *     They come from the OpenBiomechanics Project — 411 pitches from 100
 *     college and professional pitchers, marker-based 3D capture in a lab. Two
 *     things follow. The population is elite, so the middle of their range
 *     describes them rather than setting a goal for anyone else. And they were
 *     measured in three dimensions where this app sees a projection, so a band
 *     is only published where the two constructions actually correspond — four
 *     of the six measurements here. The athlete's own history remains the
 *     better comparison and the UI leads with it.
 */

import { IsoDate } from "./state";
import { OBP_SOURCE, obpBandFor } from "./obpReference";

/** A tap on the frame, normalised to 0–1 of width and height. */
export interface Point {
  x: number;
  y: number;
}

export type KinematicView = "side" | "front";

export const VIEW_LABELS: Record<KinematicView, string> = {
  side: "From the side",
  front: "From the front or behind",
};

/** One body point to place, in the order the form asks for them. */
export interface Landmark {
  id: string;
  label: string;
  /** Where to tap, in words. */
  hint: string;
}

export const LANDMARKS: Record<KinematicView, Landmark[]> = {
  side: [
    { id: "shoulder", label: "Throwing shoulder", hint: "The point of the shoulder on your throwing arm." },
    { id: "elbow", label: "Throwing elbow", hint: "The point of the elbow." },
    { id: "wrist", label: "Throwing wrist", hint: "The middle of the wrist." },
    { id: "hip", label: "Hip", hint: "The hip joint on the same side as the camera." },
    { id: "leadKnee", label: "Lead knee", hint: "The front knee — the leg you land on." },
    { id: "leadAnkle", label: "Lead ankle", hint: "The front ankle." },
  ],
  front: [
    { id: "leftShoulder", label: "Left shoulder", hint: "The point of the shoulder on your left." },
    { id: "rightShoulder", label: "Right shoulder", hint: "The point of the shoulder on your right." },
    { id: "leftHip", label: "Left hip", hint: "The left hip joint." },
    { id: "rightHip", label: "Right hip", hint: "The right hip joint." },
  ],
};

/** Points placed on one frame, keyed by landmark id. */
export type Frame = Partial<Record<string, Point>>;

// --- Geometry ----------------------------------------------------------------

/**
 * Undo the normalisation before measuring an angle.
 *
 * Points are stored as fractions of width and height, which makes them
 * resolution-independent — and makes every angle wrong if used directly. On a
 * 16:9 frame a horizontal step of 0.1 is nearly twice the real distance of a
 * vertical one, so an arm at a true 45° digitises as 62°. Scaling x by the
 * aspect ratio puts both axes back in the same unit.
 */
function toSquare(point: Point, aspect: number): Point {
  return { x: point.x * aspect, y: point.y };
}

function degrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * The angle at `vertex`, between the rays to `a` and `b`, in degrees 0–180.
 *
 * Returns null on a degenerate placement — two taps on the same pixel have no
 * angle between them, and returning 0 would look like a measurement.
 */
export function angleAt(vertex: Point, a: Point, b: Point, aspect = 1): number | null {
  const v = toSquare(vertex, aspect);
  const p = toSquare(a, aspect);
  const q = toSquare(b, aspect);

  const u = { x: p.x - v.x, y: p.y - v.y };
  const w = { x: q.x - v.x, y: q.y - v.y };
  const lu = Math.hypot(u.x, u.y);
  const lw = Math.hypot(w.x, w.y);
  if (lu === 0 || lw === 0) return null;

  const cosine = Math.min(1, Math.max(-1, (u.x * w.x + u.y * w.y) / (lu * lw)));
  return Math.round(degrees(Math.acos(cosine)) * 10) / 10;
}

/**
 * How far the line `from`→`to` leans off vertical, in degrees 0–180.
 *
 * Screen y grows downward, so "up" is (0, −1). Unsigned on purpose: a single
 * camera cannot tell which way the pitcher is facing, and a signed figure
 * would be asserting a direction the frame does not carry.
 */
export function tiltFromVertical(from: Point, to: Point, aspect = 1): number | null {
  const a = toSquare(from, aspect);
  const b = toSquare(to, aspect);
  const v = { x: b.x - a.x, y: b.y - a.y };
  const length = Math.hypot(v.x, v.y);
  if (length === 0) return null;
  const cosine = Math.min(1, Math.max(-1, -v.y / length));
  return Math.round(degrees(Math.acos(cosine)) * 10) / 10;
}

/**
 * The angle between two lines, folded to 0–90.
 *
 * Lines here are undirected — the shoulder line does not have a front and a
 * back — so 170° and 10° are the same separation and must not read as
 * opposites.
 */
export function angleBetweenLines(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
  aspect = 1
): number | null {
  const u = { x: (a2.x - a1.x) * aspect, y: a2.y - a1.y };
  const w = { x: (b2.x - b1.x) * aspect, y: b2.y - b1.y };
  const lu = Math.hypot(u.x, u.y);
  const lw = Math.hypot(w.x, w.y);
  if (lu === 0 || lw === 0) return null;

  const cosine = Math.min(1, Math.max(-1, Math.abs(u.x * w.x + u.y * w.y) / (lu * lw)));
  return Math.round(degrees(Math.acos(cosine)) * 10) / 10;
}

// --- The measurements --------------------------------------------------------

export interface ReferenceBand {
  low: number;
  high: number;
  /** Where the band comes from, printed beside it. */
  source: string;
}

export interface Measurement {
  id: string;
  label: string;
  unit: "°" | "ms";
  view: KinematicView;
  /** Landmarks that must all be placed for this to be computed. */
  needs: string[];
  /** What it means, for a reader who has not met it before. */
  why: string;
  band?: ReferenceBand;
  compute: (frame: Frame, aspect: number) => number | null;
}

/**
 * Where a band comes from.
 *
 * Previously two measurements carried a range quoted from memory of the
 * literature. Both were wrong: the hip–shoulder separation band said 40–60°,
 * where 411 measured pitches put the middle half at 25–35°, and the elbow band
 * sat low. They are now derived from real data, and the two measurements whose
 * geometry does not correspond to anything OBP publishes carry no band at all
 * rather than a plausible-looking one.
 */
const LAB = `measured across ${OBP_SOURCE.pitches} pitches from ${OBP_SOURCE.athletes} college and professional pitchers (${OBP_SOURCE.cite})`;

/**
 * The measurements, per camera view.
 *
 * Bands are attached below from measured data, and only where this app's
 * geometry matches what the reference population measured. Trunk lean and
 * shoulder tilt get none: the lab splits trunk angle into signed anterior and
 * lateral components, while this app reports one unsigned lean off vertical.
 * They are different quantities, and a band over the wrong quantity is worse
 * than no band — it turns an individual, coachable trait into a mark out of ten
 * against something that was never measured.
 */
export const MEASUREMENTS: Measurement[] = [
  {
    id: "elbowFlexion",
    label: "Elbow angle",
    unit: "°",
    view: "side",
    needs: ["shoulder", "elbow", "wrist"],
    why: "How bent the throwing elbow is. 180° would be a straight arm.",
    compute: (frame, aspect) =>
      frame.elbow && frame.shoulder && frame.wrist
        ? angleAt(frame.elbow, frame.shoulder, frame.wrist, aspect)
        : null,
  },
  {
    id: "shoulderAbduction",
    label: "Arm slot",
    unit: "°",
    view: "side",
    needs: ["hip", "shoulder", "elbow"],
    why: "How far the upper arm is lifted away from the trunk. Highly individual — the number to watch is your own, session to session.",
    compute: (frame, aspect) =>
      frame.shoulder && frame.hip && frame.elbow
        ? angleAt(frame.shoulder, frame.hip, frame.elbow, aspect)
        : null,
  },
  {
    id: "trunkTilt",
    label: "Trunk lean",
    unit: "°",
    view: "side",
    needs: ["hip", "shoulder"],
    why: "How far the trunk leans off vertical. Unsigned, because one camera cannot tell forward from back.",
    compute: (frame, aspect) =>
      frame.hip && frame.shoulder ? tiltFromVertical(frame.hip, frame.shoulder, aspect) : null,
  },
  {
    id: "leadKnee",
    label: "Lead knee angle",
    unit: "°",
    view: "side",
    needs: ["hip", "leadKnee", "leadAnkle"],
    why: "How bent the front knee is. Straightening it between foot strike and release is the lead-leg block.",
    compute: (frame, aspect) =>
      frame.leadKnee && frame.hip && frame.leadAnkle
        ? angleAt(frame.leadKnee, frame.hip, frame.leadAnkle, aspect)
        : null,
  },
  {
    id: "hipShoulderSeparation",
    label: "Hip–shoulder separation",
    unit: "°",
    view: "front",
    needs: ["leftShoulder", "rightShoulder", "leftHip", "rightHip"],
    why: "How far the shoulders have stayed closed while the hips have opened. The most-studied single number in pitching mechanics.",
    compute: (frame, aspect) =>
      frame.leftShoulder && frame.rightShoulder && frame.leftHip && frame.rightHip
        ? angleBetweenLines(
            frame.leftShoulder,
            frame.rightShoulder,
            frame.leftHip,
            frame.rightHip,
            aspect
          )
        : null,
  },
  {
    id: "shoulderLineTilt",
    label: "Shoulder tilt",
    unit: "°",
    view: "front",
    needs: ["leftShoulder", "rightShoulder"],
    why: "How far the shoulder line is off level. Rises through the delivery as the trunk tilts to the glove side.",
    compute: (frame, aspect) => {
      if (!frame.leftShoulder || !frame.rightShoulder) return null;
      const fromVertical = tiltFromVertical(frame.leftShoulder, frame.rightShoulder, aspect);
      // Off *level*, not off vertical, and folded so left-high and right-high
      // read as the same amount of tilt.
      return fromVertical === null ? null : Math.round(Math.abs(90 - fromVertical) * 10) / 10;
    },
  },
];

/**
 * Attach the measured reference bands.
 *
 * Done here rather than inline so the numbers have exactly one source — the
 * generated table — and a measurement with no honest counterpart in that table
 * simply never gets a `band`, which every reader downstream already handles.
 *
 * The band is the middle half of the reference population, matching how the
 * rest of the app talks about a usual range. Not the full spread: p10–p90 on
 * this data is wide enough to contain almost anything, which would make the
 * band true and useless.
 */
for (const measurement of MEASUREMENTS) {
  const reference = obpBandFor(measurement.id);
  if (reference) {
    measurement.band = { low: reference.p25, high: reference.p75, source: LAB };
  }
}

export function measurementsFor(view: KinematicView): Measurement[] {
  return MEASUREMENTS.filter((measurement) => measurement.view === view);
}

// --- A digitised capture -----------------------------------------------------

export interface Capture {
  id: string;
  date: IsoDate;
  view: KinematicView;
  /** Frame width ÷ height, needed before any angle is meaningful. */
  aspect: number;
  /** Video time of each digitised checkpoint, in seconds. */
  times: Partial<Record<string, number>>;
  /** Placed points per checkpoint. */
  frames: Partial<Record<string, Frame>>;
  /** Which video this came from, when it came from the library. */
  videoId?: string;
  notes?: string;
}

export interface Reading {
  measurement: Measurement;
  value: number | null;
  /** Landmarks still to place before this can be read. */
  missing: string[];
  /** Set only where a band exists and the value falls outside it. */
  outsideBand: boolean;
}

/** Everything a single digitised frame yields. */
export function readFrame(capture: Capture, checkpoint: string): Reading[] {
  const frame = capture.frames[checkpoint] ?? {};
  const aspect = Number.isFinite(capture.aspect) && capture.aspect > 0 ? capture.aspect : 1;

  return measurementsFor(capture.view).map((measurement) => {
    const missing = measurement.needs.filter((id) => !frame[id]);
    const value = missing.length === 0 ? measurement.compute(frame, aspect) : null;
    return {
      measurement,
      value,
      missing,
      outsideBand:
        value !== null && measurement.band
          ? value < measurement.band.low || value > measurement.band.high
          : false,
    };
  });
}

/**
 * Lead-leg block: how far the front knee straightens between foot strike and
 * release.
 *
 * Returns null unless *both* frames carry the knee, because a change computed
 * against a missing frame is not a small change, it is no measurement at all.
 */
export function leadLegBlock(capture: Capture): number | null {
  const at = (checkpoint: string) =>
    readFrame(capture, checkpoint).find((row) => row.measurement.id === "leadKnee")?.value ?? null;
  const strike = at("footStrike");
  const release = at("release");
  if (strike === null || release === null) return null;
  return Math.round((release - strike) * 10) / 10;
}

/**
 * Milliseconds between two checkpoints.
 *
 * Precision is bounded by the video's frame rate — 60 fps is 17 ms a frame —
 * so the UI rounds to whole milliseconds and says where that limit is.
 */
export function intervalMs(capture: Capture, from: string, to: string): number | null {
  const start = capture.times[from];
  const end = capture.times[to];
  if (typeof start !== "number" || typeof end !== "number") return null;
  const gap = Math.round((end - start) * 1000);
  return gap > 0 ? gap : null;
}

/** How much of a capture has actually been digitised. */
export function captureProgress(
  capture: Capture,
  checkpoints: string[]
): { done: number; total: number } {
  const needed = LANDMARKS[capture.view].length;
  let done = 0;
  for (const checkpoint of checkpoints) {
    const frame = capture.frames[checkpoint] ?? {};
    if (Object.keys(frame).length >= needed) done += 1;
  }
  return { done, total: checkpoints.length };
}

// --- History -----------------------------------------------------------------

function isCapture(value: unknown): value is Capture {
  if (typeof value !== "object" || value === null) return false;
  const capture = value as Capture;
  return typeof capture.id === "string" && typeof capture.date === "string";
}

/** Captures read defensively out of synced state, oldest first. */
export function readCaptures(value: unknown): Capture[] {
  return Array.isArray(value)
    ? value.filter(isCapture).sort((a, b) => a.date.localeCompare(b.date))
    : [];
}

/**
 * One measurement across every capture that produced it, oldest first.
 *
 * Only captures of the same camera view are compared. A side-view arm slot and
 * a front-view one are not the same number seen twice; putting them on one
 * line would manufacture a change out of a camera move.
 */
export function measurementHistory(
  captures: Capture[],
  measurementId: string,
  checkpoint: string
): { date: IsoDate; value: number }[] {
  const measurement = MEASUREMENTS.find((row) => row.id === measurementId);
  if (!measurement) return [];

  return captures
    .filter((capture) => capture.view === measurement.view)
    .map((capture) => ({
      date: capture.date,
      value: readFrame(capture, checkpoint).find((row) => row.measurement.id === measurementId)
        ?.value,
    }))
    .filter((row): row is { date: IsoDate; value: number } => typeof row.value === "number")
    .sort((a, b) => a.date.localeCompare(b.date));
}

// --- Plain-English findings --------------------------------------------------

export interface KinematicFinding {
  severity: "watch" | "note";
  text: string;
}

/**
 * What the frame says, in words.
 *
 * Every finding names the measurement, the number and the band it fell
 * outside, so it can be argued with — and every one of them ends up beside the
 * standing caveat that a phone camera measures a projection. Nothing here says
 * what to do about it; that is a coaching decision.
 */
export function kinematicFindings(readings: Reading[], block: number | null): KinematicFinding[] {
  const findings: KinematicFinding[] = [];

  for (const reading of readings) {
    if (!reading.outsideBand || reading.value === null || !reading.measurement.band) continue;
    const { low, high } = reading.measurement.band;
    findings.push({
      severity: "watch",
      text: `${reading.measurement.label} measured ${reading.value}${reading.measurement.unit}, outside the ${low}–${high}${reading.measurement.unit} range ${reading.measurement.band.source}.`,
    });
  }

  if (block !== null) {
    // The reference population's own middle half, so the number has somewhere
    // to stand. Deliberately not a pass mark: a quarter of measured college and
    // professional pitchers sit below this band and a quarter above it.
    const reference = obpBandFor("leadLegBlock");
    const where = reference
      ? ` The middle half of ${OBP_SOURCE.athletes} measured pitchers straightened ${reference.p25}–${reference.p75}°.`
      : "";

    findings.push({
      severity: block > 0 ? "note" : "watch",
      text:
        block > 0
          ? `Your front knee straightened ${block}° between foot strike and release — that is the lead leg blocking.${where}`
          : `Your front knee bent a further ${Math.abs(block)}° between foot strike and release rather than straightening.${where}`,
    });
  }

  return findings;
}
