/**
 * Reading a pitcher's game log off Ballclubz.
 *
 * Ballclubz hosts the GBL's published draw and stats, and every player has a
 * public page with a "Pitching Game Log": one row per outing with the date,
 * the opponent, IP, H, R, ER, K, BB, HBP and the pitch count. That page is the
 * only source of a league game line that needs nothing from the athlete - no
 * export, no file, no typing - so the app reads it and files each outing in
 * the game log by itself.
 *
 * The page itself stops at the pitch count. Strikes, batters faced and
 * first-pitch strikes come from each game's box score (below). Where a box
 * score cannot be read they stay absent (null) rather than zero: a zero would
 * read as "no strikes thrown" and drag every strike rate to nothing.
 *
 * Pure: the Worker fetches the page (Ballclubz sends no CORS headers, so the
 * browser cannot), and both halves call into here.
 */

import type { Game, GameSide } from "./gameLog";
import type { IsoDate } from "./state";

export interface BallclubzPage {
  league: string;
  team: string;
  player: string;
}

/**
 * The parts of a Ballclubz player-page link, or null for anything else.
 *
 * Strict on purpose: the Worker fetches whatever this accepts, so it accepts
 * only a player page on ballclubz.com and rebuilds the URL from the parts.
 */
export function parsePlayerPageUrl(value: string): BallclubzPage | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname !== "ballclubz.com" && url.hostname !== "www.ballclubz.com") return null;
  const match = /^\/([a-z0-9]{2,40})\/teams\/([A-Za-z0-9]{1,40})\/(\d{1,12})\/?$/.exec(url.pathname);
  return match ? { league: match[1], team: match[2], player: match[3] } : null;
}

export function playerPageUrl(page: BallclubzPage): string {
  return `https://ballclubz.com/${page.league}/teams/${page.team}/${page.player}`;
}

/** One row of the pitching game log. */
export interface BallclubzOuting {
  date: IsoDate;
  opponent: string;
  side: GameSide;
  outs: number;
  hits: number;
  runs: number;
  earnedRuns: number;
  strikeouts: number;
  walks: number;
  hitBatters: number;
  pitches: number;
  /** From the game's box score, when it could be read. */
  strikes?: number;
  battersFaced?: number;
  firstPitchStrikes?: number;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function rows(html: string): string[][] {
  return [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((row) =>
    [...row[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => text(cell[1]))
  );
}

/** "2.1" → 7 outs. A line the scorer wrote as ".1" or "2" is read the same way. */
function outsFrom(ip: string): number | null {
  const match = /^(\d*)(?:\.([012]))?$/.exec(ip.trim());
  if (!match || (match[1] === "" && match[2] === undefined)) return null;
  return Number(match[1] || 0) * 3 + Number(match[2] || 0);
}

/**
 * The season's first year, read off the page title ("GBL D1 2026-27").
 *
 * The game log writes dates as "Sun 10/04" with no year. A summer season
 * spans two years, so July onwards is the first year and the rest the second.
 */
function seasonStartYear(html: string, now: Date): number {
  const titled = /\b(20\d{2})-(\d{2})\b/.exec(text(html.slice(0, 4000)));
  if (titled) return Number(titled[1]);
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

/**
 * Every outing in the page's pitching game log.
 *
 * Columns are found by their headers, not their position, so a column added
 * or moved on the site does not shift every number into the wrong field. A row
 * that cannot be read is left out rather than guessed at; the totals row is
 * not an outing and is skipped.
 */
export function parsePitchingGameLog(html: string, now: Date = new Date()): BallclubzOuting[] {
  const start = html.search(/Pitching Game Log/i);
  if (start < 0) return [];
  const section = html.slice(start);
  const table = /<table[\s\S]*?<\/table>/i.exec(section)?.[0] ?? section;
  const all = rows(table);
  const header = all.find((cells) => cells.some((cell) => /^IP$/i.test(cell)) && cells.some((cell) => /^PIT$/i.test(cell)));
  if (!header) return [];
  const col = (name: string) => header.findIndex((cell) => cell.toUpperCase() === name);
  const at = {
    date: col("DATE"),
    team: col("TEAM"),
    ip: col("IP"),
    h: col("H"),
    r: col("R"),
    er: col("ER"),
    k: col("K"),
    bb: col("BB"),
    hbp: col("HBP"),
    pit: col("PIT"),
  };
  if (at.date < 0 || at.team < 0 || at.ip < 0 || at.pit < 0) return [];

  const firstYear = seasonStartYear(html, now);
  const outings: BallclubzOuting[] = [];
  for (const cells of all) {
    if (cells === header) continue;
    const when = /\b(\d{1,2})\/(\d{1,2})\b/.exec(cells[at.date] ?? "");
    if (!when) continue;
    const month = Number(when[1]);
    const day = Number(when[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const year = month >= 7 ? firstYear : firstYear + 1;
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as IsoDate;

    const team = /^(vs\.?|@|at)\s+(.+)$/i.exec(cells[at.team] ?? "");
    if (!team) continue;
    const outs = outsFrom(cells[at.ip] ?? "");
    const num = (index: number) => {
      if (index < 0) return 0;
      const value = Number(cells[index]);
      return Number.isFinite(value) && value >= 0 ? value : NaN;
    };
    const pitches = num(at.pit);
    if (outs === null || !Number.isFinite(pitches)) continue;
    const counts = [num(at.h), num(at.r), num(at.er), num(at.k), num(at.bb), num(at.hbp)];
    if (counts.some((value) => !Number.isFinite(value))) continue;
    const [hits, runs, earnedRuns, strikeouts, walks, hitBatters] = counts;

    outings.push({
      date,
      opponent: team[2].trim(),
      side: /^vs/i.test(team[1]) ? "home" : "away",
      outs,
      hits,
      runs,
      earnedRuns,
      strikeouts,
      walks,
      hitBatters,
      pitches,
    });
  }
  return outings;
}

export const BALLCLUBZ_ID_PREFIX = "ballclubz-";

/**
 * File the page's outings into the game log.
 *
 * - A date with no game gets one, marked as coming from Ballclubz.
 * - A game Ballclubz added before is refreshed, because the league corrects
 *   its scorebook after the fact - keeping anything the athlete added to it
 *   (strikes, first-pitch strikes, batters faced, notes).
 * - A game the athlete entered themselves is never touched: their line wins.
 *
 * Returns the merged list and how many outings were added or changed, so the
 * caller can skip saving when nothing moved.
 */
export function mergeBallclubzOutings(
  games: readonly Game[],
  outings: readonly BallclubzOuting[]
): { games: Game[]; added: number; updated: number } {
  const next = [...games];
  let added = 0;
  let updated = 0;
  for (const outing of outings) {
    const id = `${BALLCLUBZ_ID_PREFIX}${outing.date}`;
    const index = next.findIndex((game) => game.date === outing.date);
    if (index < 0) {
      next.push({
        id,
        ...outing,
        competition: "GBL",
        // When the box score could not be read these stay absent, not zero -
        // see the module comment.
        battersFaced: (outing.battersFaced ?? null) as number,
        strikes: (outing.strikes ?? null) as number,
        firstPitchStrikes: (outing.firstPitchStrikes ?? null) as number,
      });
      added += 1;
      continue;
    }
    const current = next[index];
    if (!current.id.startsWith(BALLCLUBZ_ID_PREFIX)) continue;
    // Fields the box score could not supply this time are left as they are.
    const supplied = Object.fromEntries(
      Object.entries(outing).filter(([, value]) => value !== undefined && value !== null)
    ) as Partial<BallclubzOuting>;
    const refreshed: Game = { ...current, ...supplied, id: current.id };
    const changed = (Object.keys(supplied) as (keyof BallclubzOuting)[]).some((key) => current[key] !== supplied[key]);
    if (changed) {
      next[index] = refreshed;
      updated += 1;
    }
  }
  return { games: next, added, updated };
}

// --- Box scores: strikes, batters faced, first-pitch strikes -------------------
//
// The player page stops at the pitch count, but every game on the schedule has
// a scorer's file behind its box score, and that file has the rest: the
// official strike count on the pitcher's line, and a play-by-play from which
// batters faced and first-pitch strikes follow. Checked against the official
// totals on the 1 November game: for all nine pitchers, the pitches and
// strikes counted from the plays match the line exactly.

/** The pitcher's name and team, from the player page header. */
export function parsePlayerHeader(html: string): { name: string; team: string } | null {
  const match = /<h2>([^<]+)<\/h2>\s*<a [^>]*>([^<]+)<\/a>/i.exec(html.slice(html.search(/bz-roster-header-player-info/i)));
  if (!match) return null;
  return { name: text(match[1]), team: text(match[2]) };
}

export interface ScheduleGame {
  /** "11/01", as the schedule writes the day. */
  monthDay: string;
  /** "/gbld1/live/2ceff3f". */
  path: string;
  /** The box's text - venue, teams, score. */
  text: string;
}

/** Every game on the schedule page, with the day it sits under. */
export function parseScheduleGames(html: string): ScheduleGame[] {
  const games: ScheduleGame[] = [];
  let monthDay = "";
  const pattern =
    /class="bz-schedule-separator"[^>]*>\s*[A-Za-z]{3}\s+(\d{1,2})\/(\d{1,2})\s*<|class="bz-game-box(?:\s[^"]*)?"\s+data-href="(\/[a-z0-9]{2,40}\/live\/[0-9a-f]{1,16})"([\s\S]*?)(?=class="bz-game-box(?:\s[^"]*)?"\s+data-href|class="bz-schedule-separator"|<\/ul>|$)/gi;
  for (const match of html.matchAll(pattern)) {
    if (match[1]) {
      monthDay = `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}`;
    } else if (monthDay) {
      games.push({ monthDay, path: match[3], text: text(`<x ${match[4]}`) });
    }
  }
  return games;
}

/** The schedule game an outing was pitched in: same day, both teams in the box. */
export function gameForOuting(games: readonly ScheduleGame[], outing: BallclubzOuting, team: string): ScheduleGame | null {
  const monthDay = `${outing.date.slice(5, 7)}/${outing.date.slice(8, 10)}`;
  const has = (game: ScheduleGame, name: string) => game.text.toLowerCase().includes(name.toLowerCase());
  return games.find((game) => game.monthDay === monthDay && has(game, team) && has(game, outing.opponent)) ?? null;
}

/** The scorer's file a box-score page loads: `LoadLiveGame('343943', '…')`. */
export function parseLiveGameRef(html: string): { id: string; code: string } | null {
  const match = /LoadLiveGame\(\s*'(\d{1,12})'\s*,\s*'([0-9a-f]{8,64})'\s*\)/i.exec(html);
  return match ? { id: match[1], code: match[2] } : null;
}

export function liveGameFileUrl(ref: { id: string; code: string }): string {
  return `https://game.ballclubz.com/${ref.id}/${ref.code}.json`;
}

export interface BoxScoreLine {
  pitches: number;
  strikes: number;
  battersFaced: number;
  firstPitchStrikes: number;
}

interface Play {
  /** Plate appearance. */
  a?: number;
  /** Batter and pitcher lineup slots. */
  b?: number;
  pi?: number;
  /** Kind: 4 a pitch, 5–6 a pitch with a base-running event, 7 the plate appearance's result. */
  g?: number;
  /** Outcome. On a pitch: -2 ball, -4 called strike, -5 swinging strike, -6 foul. */
  r?: number;
}

const STRIKE_PITCH = new Set([-4, -5, -6]);
/** Results whose last pitch was not a strike: walk, intentional walk, hit by pitch. */
const BALL_RESULT = new Set([13, 14, 15]);
const INTENTIONAL_WALK = 14;

const isPitch = (play: Play) =>
  play.g === 4 || play.g === 5 || play.g === 6 || (play.g === 7 && play.r !== INTENTIONAL_WALK);
const isStrike = (play: Play) =>
  play.g === 7 ? !BALL_RESULT.has(Number(play.r)) : STRIKE_PITCH.has(Number(play.r));

/**
 * A pitcher's line out of the scorer's file, found by name.
 *
 * Pitches and strikes are the official figures on the line where the file
 * has them; batters faced and first-pitch strikes are counted from the plays,
 * because the line does not carry them. Null when the pitcher is not in the
 * file, so a game that cannot be read is left as it was rather than zeroed.
 */
export function pitchingFromGameFile(file: unknown, name: string): BoxScoreLine | null {
  if (!file || typeof file !== "object") return null;
  const { lineup, plays } = file as { lineup?: Record<string, Record<string, unknown>>; plays?: Play[] };
  if (!lineup || !Array.isArray(plays)) return null;
  const wanted = name.trim().toLowerCase().replace(/\s+/g, " ");
  const entry = Object.entries(lineup).find(
    ([, person]) =>
      person &&
      "pitch_pitches" in person &&
      `${person.firstname ?? ""} ${person.lastname ?? ""}`.trim().toLowerCase().replace(/\s+/g, " ") === wanted
  );
  if (!entry) return null;
  const slot = Number(entry[0]);
  const line = entry[1];

  const mine = plays.filter((play) => play && play.pi === slot);
  const pitches = mine.filter(isPitch);
  const results = mine.filter((play) => play.g === 7);
  let firstPitchStrikes = 0;
  for (const appearance of new Set(results.map((play) => play.a))) {
    const first = mine.find((play) => play.a === appearance && isPitch(play));
    if (first && isStrike(first)) firstPitchStrikes += 1;
  }

  const official = (key: string, fallback: number) => {
    const value = Number(line[key]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  return {
    pitches: official("pitch_pitches", pitches.length),
    strikes: official("pitch_strikes", pitches.filter(isStrike).length),
    battersFaced: results.length,
    firstPitchStrikes,
  };
}

// --- Any team: its draw, and the player's own page -----------------------------

export interface RosterPlayer {
  first: string;
  last: string;
  number: string;
  /** "/gbld1/teams/9971819/687154". */
  path: string;
}

/** The roster table on a team page. */
export function parseRoster(html: string): RosterPlayer[] {
  const players: RosterPlayer[] = [];
  for (const row of html.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const link = /href="(\/[a-z0-9]{2,40}\/teams\/[A-Za-z0-9]{1,40}\/\d{1,12})"/i.exec(row[0]);
    if (!link) continue;
    const cells = [...row[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => text(cell[1]));
    const at = cells.findIndex((cell, index) => index > 0 && cell && row[0].includes(`>${cell}</a>`));
    if (at < 0) continue;
    players.push({ number: cells[0] ?? "", last: cells[at], first: cells[at + 1] ?? "", path: link[1] });
  }
  return players;
}

const fold = (value: string) => value.normalize("NFKD").replace(/[^\p{L}]/gu, "").toLowerCase();

/** A roster player by full name - first and last, in either order, ignoring case and accents. */
export function findOnRoster(roster: readonly RosterPlayer[], name: string): RosterPlayer | null {
  const words = name.split(/\s+/).map(fold).filter(Boolean);
  if (words.length < 2) return null;
  return (
    roster.find((player) => {
      const first = fold(player.first);
      const last = fold(player.last);
      return words.includes(first) && words.includes(last);
    }) ?? null
  );
}

export interface TeamFixture {
  date: IsoDate;
  opponent: string;
  home: boolean;
  /** "7:00 pm", or the final score once played. */
  detail: string;
}

/**
 * A team's games, off the league schedule.
 *
 * Each game box lists the away team first and the home team second, the same
 * order as the published draw; dates come from the day headers, with the year
 * read off the season title.
 */
export function teamFixtures(html: string, team: string, now: Date = new Date()): TeamFixture[] {
  const firstYear = seasonStartYear(html, now);
  const wanted = team.trim().toLowerCase();
  const fixtures: TeamFixture[] = [];
  let monthDay: [number, number] | null = null;
  const pattern =
    /class="bz-schedule-separator"[^>]*>\s*[A-Za-z]{3}\s+(\d{1,2})\/(\d{1,2})\s*<|class="bz-game-box(?:\s[^"]*)?"\s+data-href="[^"]*"([\s\S]*?)(?=class="bz-game-box(?:\s[^"]*)?"\s+data-href|class="bz-schedule-separator"|<\/ul>|$)/gi;
  for (const match of html.matchAll(pattern)) {
    if (match[1]) {
      monthDay = [Number(match[1]), Number(match[2])];
      continue;
    }
    if (!monthDay) continue;
    const cols = [...match[3].matchAll(/class="bz-game-box-col"[^>]*>([\s\S]*?)<\/div>/gi)].map((cell) => text(cell[1]));
    // [venue, status], [away, score or time], [home, score]
    if (cols.length < 6) continue;
    const away = cols[2];
    const home = cols[4];
    const isHome = home.toLowerCase() === wanted;
    if (!isHome && away.toLowerCase() !== wanted) continue;
    const [month, day] = monthDay;
    const year = month >= 7 ? firstYear : firstYear + 1;
    fixtures.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as IsoDate,
      opponent: isHome ? away : home,
      home: isHome,
      detail: [cols[1], cols[3], cols[5]].filter(Boolean).join(" "),
    });
  }
  return fixtures;
}

// --- Batting ------------------------------------------------------------------

/** One game of the official batting line, off a player page's Batting Game Log. */
export interface BattingLine {
  date: IsoDate;
  opponent: string;
  side: GameSide;
  pa: number;
  ab: number;
  r: number;
  h: number;
  rbi: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  so: number;
  sb: number;
  cs: number;
}

export function parseBattingGameLog(html: string, now: Date = new Date()): BattingLine[] {
  const start = html.search(/Batting Game Log/i);
  if (start < 0) return [];
  const table = /<table[\s\S]*?<\/table>/i.exec(html.slice(start))?.[0] ?? "";
  const all = rows(table);
  const header = all.find((cells) => cells.includes("PA") && cells.includes("AB"));
  if (!header) return [];
  const col = (name: string) => header.indexOf(name);
  const firstYear = seasonStartYear(html, now);
  const lines: BattingLine[] = [];
  for (const cells of all) {
    if (cells === header) continue;
    const when = /\b(\d{1,2})\/(\d{1,2})\b/.exec(cells[col("DATE")] ?? "");
    const team = /^(vs\.?|@|at)\s+(.+)$/i.exec(cells[col("TEAM")] ?? "");
    if (!when || !team) continue;
    const month = Number(when[1]);
    const day = Number(when[2]);
    const year = month >= 7 ? firstYear : firstYear + 1;
    const num = (name: string) => {
      const value = Number(cells[col(name)]);
      return col(name) >= 0 && Number.isFinite(value) && value >= 0 ? value : 0;
    };
    lines.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as IsoDate,
      opponent: team[2].trim(),
      side: /^vs/i.test(team[1]) ? "home" : "away",
      pa: num("PA"),
      ab: num("AB"),
      r: num("R"),
      h: num("H"),
      rbi: num("RBI"),
      doubles: num("2B"),
      triples: num("3B"),
      hr: num("HR"),
      bb: num("BB"),
      so: num("SO"),
      sb: num("SB"),
      cs: num("CS"),
    });
  }
  return lines;
}

/** Season totals of the official line, with AVG / OBP / SLG as far as the line allows. */
export function battingTotals(lines: readonly BattingLine[]) {
  const sum = (key: keyof Omit<BattingLine, "date" | "opponent" | "side">) => lines.reduce((total, line) => total + line[key], 0);
  const t = {
    games: lines.length,
    pa: sum("pa"),
    ab: sum("ab"),
    r: sum("r"),
    h: sum("h"),
    rbi: sum("rbi"),
    doubles: sum("doubles"),
    triples: sum("triples"),
    hr: sum("hr"),
    bb: sum("bb"),
    so: sum("so"),
    sb: sum("sb"),
    cs: sum("cs"),
  };
  const singles = t.h - t.doubles - t.triples - t.hr;
  const tb = singles + 2 * t.doubles + 3 * t.triples + 4 * t.hr;
  // The log has no HBP or sacrifice column. Plate appearances not accounted
  // for by at-bats and walks are counted as reaching base over all plate
  // appearances, which is how Ballclubz computes its own published OBP - the
  // test checks a real player's line comes out the same.
  const other = Math.max(0, t.pa - t.ab - t.bb);
  return {
    ...t,
    avg: t.ab ? t.h / t.ab : null,
    obp: t.pa ? (t.h + t.bb + other) / t.pa : null,
    slg: t.ab ? tb / t.ab : null,
  };
}
