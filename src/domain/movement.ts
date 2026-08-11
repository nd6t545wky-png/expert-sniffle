/**
 * The movement plot: where each pitch actually goes.
 *
 * The pitch log stored break for every imported pitch and showed it as two
 * numbers in a table. Break is not a number, it is a *place* — the whole
 * question of pitch design is whether two pitches leave the hand looking alike
 * and end up somewhere different, and no table answers that. This is the
 * standard horizontal-break × induced-vertical-break view, built so it can be
 * read by someone who has never seen one.
 *
 * Three decisions worth defending:
 *
 *   - **One inch is one inch on both axes.** The domain is square and shared,
 *     so the picture has the shape the ball has. A plot stretched to fill a
 *     wide card would show a sweeper as a slider and would be lying.
 *   - **The origin is always on screen.** Zero break is a real, meaningful
 *     place — a ball moving only under gravity — so every cluster is read
 *     against it rather than against a floating window.
 *   - **A pitch is only plotted when both breaks were measured.** Speed-only
 *     exports (a Pocket Radar file, most hand-typed readings) carry no break,
 *     and dropping them to zero would pile the whole session on the origin as
 *     a cluster that does not exist.
 *
 * Nothing here is coloured by pitch type. A scatter compares every pair of
 * series at once, and past three hues no ordering separates them for a
 * colour-blind reader; identity comes from a name printed at each cluster
 * instead, which is the one channel that always survives.
 */

import { Pitch } from "./pitchLog";

/** The plotting box. Square, because the two axes are the same unit. */
export const MOVEMENT = { size: 360, pad: 38 } as const;

/** A single plotted pitch: both breaks measured. */
export interface MovementPitch {
  id: string;
  pitchType: string;
  horzBreakIn: number;
  inducedVertBreakIn: number;
  velocityMph: number | null;
}

export interface MovementCluster {
  pitchType: string;
  count: number;
  /** Cluster centre, in inches. */
  avgHorzBreakIn: number;
  avgInducedVertBreakIn: number;
  avgVelocityMph: number | null;
  /** How tightly the pitch repeats: mean distance from the centre, in inches. */
  spreadIn: number;
  pitches: MovementPitch[];
}

/**
 * A measured number, or nothing.
 *
 * The null and empty-string guards are the whole point: `Number(null)` is 0,
 * and 0 is a perfectly finite break. Without them every speed-only export
 * would have been read as a pitch that broke exactly zero inches in both
 * directions and piled onto the origin — the precise failure this module is
 * built to avoid. Its own test caught it.
 */
function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Pitches that carry both breaks, in the order given. */
export function plottablePitches(pitches: Pitch[]): MovementPitch[] {
  const out: MovementPitch[] = [];
  for (const pitch of pitches) {
    const horzBreakIn = finite(pitch.horzBreakIn);
    const inducedVertBreakIn = finite(pitch.inducedVertBreakIn);
    if (horzBreakIn === null || inducedVertBreakIn === null) continue;
    out.push({
      id: pitch.id,
      pitchType: pitch.pitchType || "Untagged",
      horzBreakIn,
      inducedVertBreakIn,
      velocityMph: finite(pitch.velocityMph),
    });
  }
  return out;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** One cluster per pitch type, busiest first. */
export function movementClusters(pitches: Pitch[]): MovementCluster[] {
  const groups = new Map<string, MovementPitch[]>();
  for (const pitch of plottablePitches(pitches)) {
    groups.set(pitch.pitchType, [...(groups.get(pitch.pitchType) ?? []), pitch]);
  }

  return [...groups.entries()]
    .map(([pitchType, group]) => {
      const avgHorzBreakIn = mean(group.map((p) => p.horzBreakIn));
      const avgInducedVertBreakIn = mean(group.map((p) => p.inducedVertBreakIn));
      const speeds = group.map((p) => p.velocityMph).filter((v): v is number => v !== null);
      return {
        pitchType,
        count: group.length,
        avgHorzBreakIn: Math.round(avgHorzBreakIn * 10) / 10,
        avgInducedVertBreakIn: Math.round(avgInducedVertBreakIn * 10) / 10,
        avgVelocityMph: speeds.length ? Math.round(mean(speeds) * 10) / 10 : null,
        spreadIn:
          Math.round(
            mean(
              group.map((p) =>
                Math.hypot(p.horzBreakIn - avgHorzBreakIn, p.inducedVertBreakIn - avgInducedVertBreakIn)
              )
            ) * 10
          ) / 10,
        pitches: group,
      };
    })
    .sort((a, b) => b.count - a.count || a.pitchType.localeCompare(b.pitchType));
}

// --- The plotting frame ------------------------------------------------------

/**
 * Smallest half-width the axes ever shrink to.
 *
 * A session of one straight fastball would otherwise be drawn on a ±1″ frame,
 * magnifying an inch of noise into the width of the card.
 */
export const MIN_HALF_RANGE = 10;

/** Half-width of the square frame, in inches, rounded out to a tick. */
export function movementDomain(pitches: MovementPitch[]): number {
  let furthest = 0;
  for (const pitch of pitches) {
    furthest = Math.max(furthest, Math.abs(pitch.horzBreakIn), Math.abs(pitch.inducedVertBreakIn));
  }
  return Math.max(MIN_HALF_RANGE, Math.ceil(furthest / 5) * 5);
}

export interface MovementScale {
  half: number;
  /** Inches to screen coordinates inside the box. */
  project(horzBreakIn: number, inducedVertBreakIn: number): { x: number; y: number };
  /** Gridline values in inches, zero included. */
  ticks: number[];
  /** Screen position of the zero crosshair. */
  origin: { x: number; y: number };
}

export function movementScale(half: number): MovementScale {
  const inner = MOVEMENT.size - MOVEMENT.pad * 2;
  const project = (horzBreakIn: number, inducedVertBreakIn: number) => ({
    x: MOVEMENT.pad + ((horzBreakIn + half) / (half * 2)) * inner,
    // Screen y grows downward; break upward is "ride", so the sign flips here
    // and nowhere else.
    y: MOVEMENT.pad + ((half - inducedVertBreakIn) / (half * 2)) * inner,
  });

  const step = half <= 10 ? 5 : half <= 25 ? 10 : 20;
  const ticks: number[] = [];
  for (let value = -half; value <= half; value += step) ticks.push(value);

  return { half, project, ticks, origin: project(0, 0) };
}

// --- Placing the names -------------------------------------------------------

/**
 * Where each cluster's name goes.
 *
 * Pushing every label outward from the origin — the obvious rule — put the
 * slider's "9 thrown · 79.2 mph" straight through the "← glove side" axis
 * label and stacked it on the cutter's name. Two pitches on the same side of
 * the plate are common, so the naive rule fails on ordinary data.
 *
 * This tries a ring of positions around each dot and takes the first that
 * collides with nothing already placed, including the axis wording, which is
 * reserved up front. Busiest pitch first, so the pitch thrown most gets the
 * clearest spot.
 */
export interface PlacedLabel {
  pitchType: string;
  /** Baseline of the name; the count line sits `LABEL_LINE` below it. */
  x: number;
  y: number;
  anchor: "start" | "end";
}

export const LABEL_LINE = 12;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Rough text width. Exact metrics need a DOM; this only has to be close. */
function textWidth(text: string, size: number): number {
  return text.length * size * 0.53;
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Boxes the axis wording occupies, which no name may be written over. */
function reservedBoxes(): Box[] {
  const { size } = MOVEMENT;
  return [
    // "ride ↑" and "drop ↓" run across the top and bottom.
    { left: 0, right: size, top: 0, bottom: 20 },
    { left: 0, right: size, top: size - 30, bottom: size },
    // "← glove side" and "arm side →" sit either side of the middle.
    { left: 0, right: 120, top: size / 2 - 20, bottom: size / 2 },
    { left: size - 120, right: size, top: size / 2 - 20, bottom: size / 2 },
    // "no break", just past the origin.
    { left: size / 2, right: size / 2 + 60, top: size / 2, bottom: size / 2 + 18 },
  ];
}

const CANDIDATES: { dx: number; dy: number; anchor: "start" | "end" }[] = [
  { dx: 12, dy: -10, anchor: "start" },
  { dx: -12, dy: -10, anchor: "end" },
  { dx: 12, dy: 20, anchor: "start" },
  { dx: -12, dy: 20, anchor: "end" },
  { dx: 12, dy: 5, anchor: "start" },
  { dx: -12, dy: 5, anchor: "end" },
  { dx: 0, dy: -22, anchor: "start" },
  { dx: 0, dy: 34, anchor: "start" },
];

export function labelLayout(clusters: MovementCluster[], scale: MovementScale): PlacedLabel[] {
  const taken = reservedBoxes();
  const placed: PlacedLabel[] = [];

  for (const cluster of clusters) {
    const at = scale.project(cluster.avgHorzBreakIn, cluster.avgInducedVertBreakIn);
    const sub = `${cluster.count} thrown${
      cluster.avgVelocityMph === null ? "" : ` · ${cluster.avgVelocityMph.toFixed(1)} mph`
    }`;
    const width = Math.max(textWidth(cluster.pitchType, 12.5), textWidth(sub, 10.5));

    const boxFor = (candidate: (typeof CANDIDATES)[number]): Box => {
      const x = at.x + candidate.dx;
      const y = at.y + candidate.dy;
      return {
        left: candidate.anchor === "start" ? x : x - width,
        right: candidate.anchor === "start" ? x + width : x,
        top: y - 11,
        bottom: y + LABEL_LINE + 4,
      };
    };

    /**
     * How bad a position is: any collision outranks any amount of spill.
     *
     * Spill matters on its own because on a phone the plot fills the width and
     * the page clips horizontal overflow — a name running past the right edge
     * came back as "14 thrown · 87.9 mp". Scored rather than rejected outright
     * so a crowded plot still places every name somewhere sensible instead of
     * dropping them all on the first candidate.
     */
    const penalty = (box: Box): number => {
      const spill =
        Math.max(0, -box.left) +
        Math.max(0, box.right - MOVEMENT.size) +
        Math.max(0, -box.top) +
        Math.max(0, box.bottom - MOVEMENT.size);
      const collisions = taken.filter((other) => overlaps(box, other)).length;
      return collisions * 1000 + spill;
    };

    let chosen: (typeof CANDIDATES)[number] | null = null;
    let fallback = CANDIDATES[0];
    let fallbackScore = Infinity;

    for (const candidate of CANDIDATES) {
      const score = penalty(boxFor(candidate));
      if (score === 0) {
        chosen = candidate;
        break;
      }
      if (score < fallbackScore) {
        fallbackScore = score;
        fallback = candidate;
      }
    }

    chosen = chosen ?? fallback;
    taken.push(boxFor(chosen));

    placed.push({
      pitchType: cluster.pitchType,
      x: at.x + chosen.dx,
      y: at.y + chosen.dy,
      anchor: chosen.anchor,
    });
  }

  return placed;
}

// --- What the picture says ---------------------------------------------------

/**
 * How close two clusters may sit before they are worth mentioning, in inches.
 *
 * Not a rule of the sport — a conversation starter. Two pitches inside six
 * inches of each other are landing in the same place, which matters only if
 * they also arrive at the same speed, so the finding says both.
 */
export const OVERLAP_INCHES = 6;

/** Below this a "cluster" is one or two pitches, and its centre means nothing. */
export const MIN_PITCHES_FOR_FINDING = 3;

/** A speed gap this size makes two pitches distinct even from one place. */
export const SEPARATING_MPH = 6;

export interface MovementFinding {
  severity: "watch" | "note";
  text: string;
}

/**
 * Plain-English readings of the plot.
 *
 * Deliberately says what was measured and against which threshold, so it can
 * be argued with, and stops short of prescribing anything — what to do about
 * two pitches that overlap is a coaching decision, not an app's.
 */
export function movementFindings(clusters: MovementCluster[]): MovementFinding[] {
  const eligible = clusters.filter((cluster) => cluster.count >= MIN_PITCHES_FOR_FINDING);
  const findings: MovementFinding[] = [];

  for (let i = 0; i < eligible.length; i += 1) {
    for (let j = i + 1; j < eligible.length; j += 1) {
      const a = eligible[i];
      const b = eligible[j];
      const gap =
        Math.round(
          Math.hypot(
            a.avgHorzBreakIn - b.avgHorzBreakIn,
            a.avgInducedVertBreakIn - b.avgInducedVertBreakIn
          ) * 10
        ) / 10;
      if (gap >= OVERLAP_INCHES) continue;

      const speedGap =
        a.avgVelocityMph !== null && b.avgVelocityMph !== null
          ? Math.round(Math.abs(a.avgVelocityMph - b.avgVelocityMph) * 10) / 10
          : null;

      // Same place *and* same speed is the one worth flagging. Same place at a
      // very different speed is a normal, deliberate pairing.
      if (speedGap !== null && speedGap >= SEPARATING_MPH) {
        findings.push({
          severity: "note",
          text: `Your ${a.pitchType.toLowerCase()} and ${b.pitchType.toLowerCase()} land ${gap}″ apart but ${speedGap} mph apart — same place, different timing.`,
        });
      } else {
        findings.push({
          severity: "watch",
          text: `Your ${a.pitchType.toLowerCase()} and ${b.pitchType.toLowerCase()} average ${gap}″ apart${
            speedGap === null ? "" : ` and ${speedGap} mph apart`
          }, inside the ${OVERLAP_INCHES}″ mark — they finish in much the same place.`,
        });
      }
    }
  }

  return findings;
}

// --- Session against session -------------------------------------------------

export interface MovementShift {
  pitchType: string;
  todayCount: number;
  priorCount: number;
  /** How many earlier days contributed. */
  priorSessions: number;
  deltaHorzBreakIn: number;
  deltaInducedVertBreakIn: number;
  deltaVelocityMph: number | null;
  today: MovementCluster;
  prior: MovementCluster;
}

/**
 * Today's shape against every earlier session's.
 *
 * Only pitch types thrown in both windows appear — a pitch thrown for the
 * first time today has nothing to be compared with, and showing it beside a
 * blank column invites the blank to be read as zero.
 */
export function movementShift(today: Pitch[], prior: Pitch[]): MovementShift[] {
  const priorByType = new Map(movementClusters(prior).map((c) => [c.pitchType, c]));
  const priorDays = new Map<string, Set<string>>();
  for (const pitch of prior) {
    const type = pitch.pitchType || "Untagged";
    if (finite(pitch.horzBreakIn) === null || finite(pitch.inducedVertBreakIn) === null) continue;
    priorDays.set(type, (priorDays.get(type) ?? new Set()).add(pitch.date));
  }

  const shifts: MovementShift[] = [];
  for (const cluster of movementClusters(today)) {
    const before = priorByType.get(cluster.pitchType);
    if (!before) continue;
    shifts.push({
      pitchType: cluster.pitchType,
      todayCount: cluster.count,
      priorCount: before.count,
      priorSessions: priorDays.get(cluster.pitchType)?.size ?? 0,
      deltaHorzBreakIn: Math.round((cluster.avgHorzBreakIn - before.avgHorzBreakIn) * 10) / 10,
      deltaInducedVertBreakIn:
        Math.round((cluster.avgInducedVertBreakIn - before.avgInducedVertBreakIn) * 10) / 10,
      deltaVelocityMph:
        cluster.avgVelocityMph !== null && before.avgVelocityMph !== null
          ? Math.round((cluster.avgVelocityMph - before.avgVelocityMph) * 10) / 10
          : null,
      today: cluster,
      prior: before,
    });
  }
  return shifts;
}
