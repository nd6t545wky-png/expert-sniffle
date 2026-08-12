/**
 * What actually happened in a game.
 *
 * The app tracked throwing *load* — intent and a throw count — and nothing
 * about competition. No opponent, no date, no innings, no pitch count by
 * inning, no result. For a pitcher in a season that is the largest hole of
 * all: the training exists to serve outings, and the outings were invisible.
 *
 * This is the pitcher's own scorebook line, plus the two command numbers that
 * predict more than any other and that nothing else in the app could produce.
 *
 * Two structural decisions, both there to prevent a specific wrong number:
 *
 *   - **Innings are stored as outs.** Baseball writes 3.2 innings meaning
 *     three and two thirds, and every app that stores that as a decimal
 *     eventually adds 3.2 + 3.2 and prints 6.4 — an innings count that cannot
 *     exist. Outs add correctly, and the decimal is produced only for display.
 *   - **A rate is never shown without its sample.** ERA over four innings is
 *     arithmetic, not information. Every rate here carries how much it was
 *     built from, and the thin ones say so in words.
 */

import { IsoDate } from "./state";

export type GameSide = "home" | "away";

export interface Game {
  id: string;
  date: IsoDate;
  opponent: string;
  side: GameSide;
  /** Optional: "Coomera Cubs", a grade, a competition. */
  competition?: string;

  /** Outs recorded. 11 outs is the line "3.2 IP". */
  outs: number;
  battersFaced: number;

  /** Total pitches thrown in the appearance. */
  pitches: number;
  /** Of those, how many were strikes. */
  strikes: number;
  /** Batters whose first pitch was a strike. Never more than battersFaced. */
  firstPitchStrikes: number;

  hits: number;
  runs: number;
  earnedRuns: number;
  walks: number;
  strikeouts: number;
  hitBatters: number;

  /** Pitch count per inning, in order, for the workload picture. */
  pitchesByInning?: number[];
  notes?: string;
}

// --- Innings -----------------------------------------------------------------

/**
 * Outs as the scorebook writes them: "3.2" is three innings and two outs.
 *
 * Deliberately a string. Returning 3.2 as a number invites it straight back
 * into arithmetic, which is the bug this whole representation exists to stop.
 */
export function formatInnings(outs: number): string {
  const whole = Math.floor(Math.max(0, outs) / 3);
  return `${whole}.${Math.max(0, outs) % 3}`;
}

/** Outs as true innings, for rates that divide by nine. */
export function inningsPitched(outs: number): number {
  return Math.max(0, outs) / 3;
}

/** "3.2" or "3 2/3" back into outs, for typed input. */
export function outsFromInnings(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const dotted = text.match(/^(\d+)(?:\.([012]))?$/);
  if (dotted) return Number(dotted[1]) * 3 + Number(dotted[2] ?? 0);

  const fraction = text.match(/^(\d+)\s+([12])\/3$/);
  if (fraction) return Number(fraction[1]) * 3 + Number(fraction[2]);

  return null;
}

// --- One appearance ----------------------------------------------------------

export interface Appearance {
  game: Game;
  innings: string;
  /** Strikes as a percentage of pitches, or null with no pitches recorded. */
  strikePct: number | null;
  /** First-pitch strikes as a percentage of batters faced. */
  firstPitchStrikePct: number | null;
  pitchesPerInning: number | null;
  /** Pitches per batter faced — efficiency, in the unit a pitcher feels. */
  pitchesPerBatter: number | null;
}

function pct(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export function appearance(game: Game): Appearance {
  const innings = inningsPitched(game.outs);
  return {
    game,
    innings: formatInnings(game.outs),
    strikePct: pct(game.strikes, game.pitches),
    firstPitchStrikePct: pct(game.firstPitchStrikes, game.battersFaced),
    pitchesPerInning: innings > 0 ? Math.round((game.pitches / innings) * 10) / 10 : null,
    pitchesPerBatter:
      game.battersFaced > 0 ? Math.round((game.pitches / game.battersFaced) * 10) / 10 : null,
  };
}

// --- A season ----------------------------------------------------------------

export interface SeasonTotals {
  games: number;
  outs: number;
  innings: string;
  battersFaced: number;
  pitches: number;
  strikes: number;
  firstPitchStrikes: number;
  hits: number;
  runs: number;
  earnedRuns: number;
  walks: number;
  strikeouts: number;
  hitBatters: number;
}

export function seasonTotals(games: Game[]): SeasonTotals {
  const sum = (pick: (game: Game) => number) =>
    games.reduce((total, game) => total + (Number(pick(game)) || 0), 0);

  const outs = sum((game) => game.outs);
  return {
    games: games.length,
    outs,
    innings: formatInnings(outs),
    battersFaced: sum((game) => game.battersFaced),
    pitches: sum((game) => game.pitches),
    strikes: sum((game) => game.strikes),
    firstPitchStrikes: sum((game) => game.firstPitchStrikes),
    hits: sum((game) => game.hits),
    runs: sum((game) => game.runs),
    earnedRuns: sum((game) => game.earnedRuns),
    walks: sum((game) => game.walks),
    strikeouts: sum((game) => game.strikeouts),
    hitBatters: sum((game) => game.hitBatters),
  };
}

/**
 * Innings below which a rate is not worth reading.
 *
 * Not a rule of the sport — a line drawn so the app stops presenting four
 * innings of results as though they described a pitcher.
 */
export const THIN_SAMPLE_INNINGS = 10;

export interface SeasonRate {
  id: string;
  label: string;
  value: number | null;
  /** How it is written — "3.60", "62.4%". */
  display: string;
  /** What it means, for a reader who does not already know. */
  why: string;
  /** True when built on too little to mean much. */
  thin: boolean;
}

/**
 * The season's rates.
 *
 * Percentages of batters faced are given alongside the per-nine figures, and
 * for a small sample they are the better read — K/9 swings wildly on a short
 * outing, while K% moves with each batter.
 */
export function seasonRates(totals: SeasonTotals): SeasonRate[] {
  const innings = inningsPitched(totals.outs);
  const thin = innings < THIN_SAMPLE_INNINGS;
  const per9 = (count: number) => (innings > 0 ? Math.round((count * 9) / innings * 100) / 100 : null);

  const rate = (
    id: string,
    label: string,
    value: number | null,
    display: string,
    why: string
  ): SeasonRate => ({ id, label, value, display, why, thin });

  const era = per9(totals.earnedRuns);
  const whip =
    innings > 0 ? Math.round(((totals.walks + totals.hits) / innings) * 100) / 100 : null;
  const strikePct = pct(totals.strikes, totals.pitches);
  const fpsPct = pct(totals.firstPitchStrikes, totals.battersFaced);
  const kPct = pct(totals.strikeouts, totals.battersFaced);
  const bbPct = pct(totals.walks, totals.battersFaced);

  return [
    rate(
      "strikePct",
      "Strike rate",
      strikePct,
      strikePct === null ? "—" : `${strikePct.toFixed(1)}%`,
      "Share of your pitches that were strikes. The simplest measure of whether you are around the zone."
    ),
    rate(
      "firstPitchStrikePct",
      "First-pitch strikes",
      fpsPct,
      fpsPct === null ? "—" : `${fpsPct.toFixed(1)}%`,
      "Share of batters whose first pitch was a strike. Getting ahead changes every count that follows."
    ),
    rate(
      "kPct",
      "Strikeout rate",
      kPct,
      kPct === null ? "—" : `${kPct.toFixed(1)}%`,
      "Strikeouts per batter faced. Steadier than K/9 on a short season, because it moves one batter at a time."
    ),
    rate(
      "bbPct",
      "Walk rate",
      bbPct,
      bbPct === null ? "—" : `${bbPct.toFixed(1)}%`,
      "Walks per batter faced. Lower is better."
    ),
    rate(
      "whip",
      "WHIP",
      whip,
      whip === null ? "—" : whip.toFixed(2),
      "Walks and hits per inning. Roughly, how many runners you put on each inning."
    ),
    rate(
      "era",
      "ERA",
      era,
      era === null ? "—" : era.toFixed(2),
      "Earned runs per nine innings. The most quoted number in the sport and the noisiest on a short season."
    ),
    rate(
      "pitchesPerInning",
      "Pitches per inning",
      innings > 0 ? Math.round((totals.pitches / innings) * 10) / 10 : null,
      innings > 0 ? (totals.pitches / innings).toFixed(1) : "—",
      "How much work each inning costs you. This is what decides how deep you get."
    ),
  ];
}

// --- Reading the log ---------------------------------------------------------

function isGame(value: unknown): value is Game {
  if (typeof value !== "object" || value === null) return false;
  const game = value as Game;
  return typeof game.id === "string" && typeof game.date === "string";
}

/** Games read defensively out of synced state, newest first. */
export function readGames(value: unknown): Game[] {
  return Array.isArray(value)
    ? value.filter(isGame).sort((a, b) => b.date.localeCompare(a.date))
    : [];
}

/**
 * Contradictions a scorebook line cannot contain.
 *
 * Checked on save rather than silently stored, because a game with more
 * strikes than pitches poisons every rate that touches it and there is no way
 * to notice afterwards.
 */
export function gameProblems(game: Partial<Game>): string[] {
  const problems: string[] = [];
  const n = (value: unknown) => Number(value) || 0;

  if (!game.date) problems.push("Pick the date the game was played.");
  if (!String(game.opponent ?? "").trim()) problems.push("Name the opponent.");
  if (n(game.strikes) > n(game.pitches)) {
    problems.push("More strikes than pitches — one of the two is wrong.");
  }
  if (n(game.firstPitchStrikes) > n(game.battersFaced)) {
    problems.push("More first-pitch strikes than batters faced.");
  }
  if (n(game.earnedRuns) > n(game.runs)) {
    problems.push("Earned runs cannot be more than total runs.");
  }
  if (n(game.strikeouts) > n(game.battersFaced)) {
    problems.push("More strikeouts than batters faced.");
  }
  if (n(game.outs) > 0 && n(game.battersFaced) < n(game.outs) / 3) {
    problems.push("Fewer batters faced than innings pitched — check both.");
  }
  return problems;
}

// --- Plain-English findings --------------------------------------------------

export interface GameFinding {
  severity: "watch" | "note";
  text: string;
}

/**
 * Reference marks for the two command rates.
 *
 * These are the widely-used coaching figures rather than a league average for
 * any particular grade, and the copy says so. They exist to give a number
 * somewhere to stand, not to grade an athlete.
 */
export const STRIKE_PCT_MARK = 62;
export const FIRST_PITCH_STRIKE_MARK = 60;

export function seasonFindings(totals: SeasonTotals, rates: SeasonRate[]): GameFinding[] {
  const findings: GameFinding[] = [];
  const innings = inningsPitched(totals.outs);

  // Below the sample line nothing is claimed at all. A rate built on three
  // innings is a description of three innings.
  if (innings > 0 && innings < THIN_SAMPLE_INNINGS) {
    findings.push({
      severity: "note",
      text: `${formatInnings(totals.outs)} innings on record. These rates will move a lot until there are ${THIN_SAMPLE_INNINGS} or so — read them as a description of what happened, not as a measure of you.`,
    });
    return findings;
  }

  const find = (id: string) => rates.find((rate) => rate.id === id)?.value ?? null;

  const strikePct = find("strikePct");
  if (strikePct !== null && strikePct < STRIKE_PCT_MARK) {
    findings.push({
      severity: "watch",
      text: `Strike rate is ${strikePct.toFixed(1)}%, under the ${STRIKE_PCT_MARK}% mark coaches usually work to.`,
    });
  }

  const fps = find("firstPitchStrikePct");
  if (fps !== null && fps < FIRST_PITCH_STRIKE_MARK) {
    findings.push({
      severity: "watch",
      text: `First-pitch strikes are ${fps.toFixed(1)}%, under the ${FIRST_PITCH_STRIKE_MARK}% mark — the count you start in shapes the whole at-bat.`,
    });
  }
  if (fps !== null && fps >= FIRST_PITCH_STRIKE_MARK) {
    findings.push({
      severity: "note",
      text: `First-pitch strikes are ${fps.toFixed(1)}%, clear of the ${FIRST_PITCH_STRIKE_MARK}% mark.`,
    });
  }

  const perInning = find("pitchesPerInning");
  if (perInning !== null && perInning > 20) {
    findings.push({
      severity: "watch",
      text: `${perInning.toFixed(1)} pitches an inning. At that rate a pitch limit runs out before the innings do.`,
    });
  }

  return findings;
}
