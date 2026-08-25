import { IsoDate } from "./state";

/**
 * The one number that decides what to work on next.
 *
 * The constraint profile calls this the key missing diagnostic, and it is
 * right: the gap between what the athlete throws off flat ground with a run-up
 * and what he throws off a mound separates two completely different problems.
 *
 *   mound 78 / pulldown 80–82  → the engine is the limit. Build force, speed
 *                                and reactive ability; mechanics are a
 *                                secondary question.
 *   mound 78 / pulldown 88–90  → the engine is fine and the mound is losing it.
 *                                Sequencing, direction and transfer move to the
 *                                front, and high-speed video earns its place.
 *
 * Until the number exists, both stories fit the evidence equally well — which
 * is exactly why the profile says not to overstate mechanics before it is
 * measured. The app has recorded a velocity and a velocity type at check-out
 * since the beginning; nothing had ever read the two together.
 */

export type Scenario = "unknown" | "engine" | "transfer" | "borderline";

export interface VelocityReport {
  bestVelocity?: unknown;
  velocityType?: unknown;
}

export interface Transfer {
  scenario: Scenario;
  mound: { mph: number; on: IsoDate } | null;
  pulldown: { mph: number; on: IsoDate } | null;
  /** Pulldown minus mound, where both are known. */
  gap: number | null;
  headline: string;
  detail: string;
}

/**
 * Where the line sits between the two stories.
 *
 * A pulldown is thrown with a run-up, no pitch to command and no plate to hit,
 * so it is expected to beat mound velocity by a few miles an hour in anyone.
 * The profile's own worked examples put "engine" at about +2–4 and "transfer"
 * at +10 or more. The band between them is real and is reported as such rather
 * than being forced to one side.
 */
const ENGINE_CEILING = 5;
const TRANSFER_FLOOR = 8;

/** Velocity types that count as a flat-ground pulldown. */
const PULLDOWN = /pull.?down|run.?and.?gun/i;
/** Types thrown off a mound — a game, a bullpen, a start. */
const MOUND = /mound|game|bullpen|start/i;

function best(
  reports: Record<string, VelocityReport | undefined> | undefined,
  match: RegExp
): { mph: number; on: IsoDate } | null {
  let found: { mph: number; on: IsoDate } | null = null;
  for (const [date, report] of Object.entries(reports ?? {})) {
    const mph = Number(report?.bestVelocity);
    const type = String(report?.velocityType ?? "");
    if (!Number.isFinite(mph) || mph <= 0 || !match.test(type)) continue;
    if (!found || mph > found.mph) found = { mph, on: date as IsoDate };
  }
  return found;
}

export function velocityTransfer(
  reports: Record<string, VelocityReport | undefined> | undefined
): Transfer {
  const mound = best(reports, MOUND);
  const pulldown = best(reports, PULLDOWN);

  if (!pulldown) {
    return {
      scenario: "unknown",
      mound,
      pulldown: null,
      gap: null,
      headline: "No pulldown velocity recorded yet.",
      detail:
        "Wednesday already throws eight measured pulldowns. Record the best one at check-out with the type set to Pulldown, and this answers the question the testing could not: whether the ceiling is the engine or the mound. Until then, neither a mechanical fix nor more strength work can be justified over the other.",
    };
  }

  if (!mound) {
    return {
      scenario: "unknown",
      mound: null,
      pulldown,
      gap: null,
      headline: `Pulldown ${pulldown.mph} mph recorded. Mound velocity still needed.`,
      detail:
        "Log a game or bullpen best with the type set to Mound and the comparison completes. One number on its own says nothing about transfer.",
    };
  }

  const gap = Number((pulldown.mph - mound.mph).toFixed(1));

  if (gap <= ENGINE_CEILING) {
    return {
      scenario: "engine",
      mound,
      pulldown,
      gap,
      headline: `Pulldown is only ${gap} mph above the mound — the engine is the limit.`,
      detail:
        "The raw throwing ceiling is close to what already reaches the mound, so there is little being lost in transfer and not much waiting to be released by a mechanical change. This is the case for building force, speed of force and reactive ability — which is what the programme is already pointed at. Mechanics stay a secondary question.",
    };
  }

  if (gap >= TRANSFER_FLOOR) {
    return {
      scenario: "transfer",
      mound,
      pulldown,
      gap,
      headline: `Pulldown is ${gap} mph above the mound — velocity is being lost in transfer.`,
      detail:
        "The arm can already produce meaningfully more than the mound is getting. That moves sequencing, direction and lead-leg braking up the priority list, and it is the point at which high-speed side-on video earns its place. It does not mean stopping the physical work — it means it is no longer the only thing worth doing.",
    };
  }

  return {
    scenario: "borderline",
    mound,
    pulldown,
    gap,
    headline: `Pulldown is ${gap} mph above the mound — between the two cases.`,
    detail:
      "A few miles an hour of difference is normal: a pulldown has a run-up, no pitch to command and no plate to hit. This gap is larger than a pure engine limit and smaller than a clear transfer loss, so it argues for keeping the physical work as the priority while collecting a couple more readings before drawing a conclusion.",
  };
}
