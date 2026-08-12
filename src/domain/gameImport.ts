/**
 * Importing a pitching line out of a scorekeeping export.
 *
 * None of the four devices and apps an amateur pitcher actually uses —
 * Rapsodo, TrackMan, Pocket Radar, GameChanger — offers an API an individual
 * can connect to. TrackMan's exists but is sold to organisations with signed
 * terms and org-issued credentials; the other three have none at all. What
 * every one of them does have is a file export, so that is the integration:
 * the athlete taps Export in their app and drops the file in here.
 *
 * Ball flight already had this (`pitchLog`). This is the same idea for the
 * scorebook line, and it follows the same two rules:
 *
 *   - **Tolerant about headers, strict about values.** Column names differ
 *     between GameChanger's season export, its per-game export, and whatever a
 *     coach's spreadsheet calls things, so headers are matched on a normalised
 *     form against a list of aliases. A row whose numbers cannot be read is
 *     reported with a reason rather than dropped, because a silently-shortened
 *     import is a season that looks lighter than it was.
 *   - **A total is not a game.** A season-totals export is one row holding a
 *     whole season, and filing it as a single appearance would put "42
 *     innings" against one opponent on one date. Those files are refused with
 *     an explanation instead.
 */

import { Game, gameProblems, outsFromInnings } from "./gameLog";
import { splitCsvLine } from "./pitchLog";
import { IsoDate } from "./state";

export type GameSource = "gamechanger" | "generic";

export const GAME_SOURCE_LABEL: Record<GameSource, string> = {
  gamechanger: "GameChanger",
  generic: "a stats export",
};

function headerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Column aliases, in priority order.
 *
 * Drawn from the shapes these exports actually take: GameChanger writes `IP`,
 * `BF`, `H`, `R`, `ER`, `BB`, `SO`/`K`, `HBP`, `#P`, `S`, and `FPS` or `1st P`
 * depending on the export; a coach's own sheet spells them out.
 */
const FIELD_ALIASES = {
  player: ["player", "name", "playername", "lastfirst", "last", "athlete"],
  date: ["date", "gamedate", "played", "gamedatetime", "datetime"],
  opponent: ["opponent", "opp", "vs", "against", "team2"],
  innings: ["ip", "inningspitched", "innings"],
  battersFaced: ["bf", "battersfaced", "tbf", "batters"],
  pitches: ["p", "pitches", "pitchcount", "np", "totalpitches", "numpitches"],
  strikes: ["s", "strikes", "strikesthrown"],
  firstPitchStrikes: ["fps", "1stpstrikes", "firstpitchstrikes", "1pk", "fpstrikes", "firstpitchstrike"],
  hits: ["h", "hits", "hitsallowed"],
  runs: ["r", "runs", "runsallowed"],
  earnedRuns: ["er", "earnedruns"],
  walks: ["bb", "walks", "basesonballs"],
  strikeouts: ["so", "k", "strikeouts", "ks"],
  hitBatters: ["hbp", "hitbatters", "hb", "hitbypitch"],
} as const;

type FieldName = keyof typeof FIELD_ALIASES;

/** A row that could not be read, and why. */
export interface SkippedRow {
  /** 1-based line number, so it can be found in the file again. */
  line: number;
  reason: string;
}

export interface GameImportResult {
  source: GameSource;
  /** Parsed appearances, one per row that carried a real line. */
  games: Game[];
  skipped: SkippedRow[];
  /** Fields the file did not carry, so the UI can say what is missing. */
  missingFields: FieldName[];
  /** Distinct player names seen, when the file covers a whole team. */
  players: string[];
  /**
   * Set when the file is a season summary rather than a list of games.
   * Nothing is imported in that case, and this says why.
   */
  refusedReason?: string;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || /^(na|n\/a|-|--|\.)$/i.test(text)) return null;
  const parsed = Number(text.replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** ISO date out of the shapes an export may use. */
export function toIsoDate(value: unknown, fallback: IsoDate): IsoDate {
  const text = String(value ?? "").trim();
  if (!text) return fallback;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const year = Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]);
    return `${year}-${String(Number(slash[1])).padStart(2, "0")}-${String(Number(slash[2])).padStart(2, "0")}`;
  }
  return fallback;
}

/**
 * Find the header row.
 *
 * Exports frequently carry a team name and a date range above the real header,
 * so the first line is often not it. The header is the first line carrying at
 * least two known column names.
 */
function findHeaderRow(lines: string[]): number {
  const known = new Set(Object.values(FIELD_ALIASES).flat() as string[]);
  for (let index = 0; index < Math.min(lines.length, 25); index += 1) {
    const cells = splitCsvLine(lines[index]).map(headerKey);
    if (cells.filter((cell) => known.has(cell)).length >= 2) return index;
  }
  return -1;
}

export function detectGameSource(headers: string[]): GameSource {
  const keys = new Set(headers.map(headerKey));
  // GameChanger's exports are the ones that pair innings pitched with batters
  // faced and a first-pitch-strike column.
  if (keys.has("ip") && (keys.has("bf") || keys.has("fps") || keys.has("hbp"))) {
    return "gamechanger";
  }
  return "generic";
}

let counter = 0;
function gameId(): string {
  counter += 1;
  return `gi${Date.now().toString(36)}${counter.toString(36)}`;
}

/**
 * Read a scorekeeping CSV into appearances.
 *
 * `fallbackDate` is used for rows carrying no date of their own. `player`
 * filters a team-wide export down to one athlete's rows — without it, a team
 * file would import every pitcher on the roster as though they were all this
 * athlete.
 */
export function parseGameCsv(
  text: string,
  fallbackDate: IsoDate,
  options: { player?: string } = {}
): GameImportResult {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  const headerIndex = findHeaderRow(lines);
  if (headerIndex === -1) {
    return {
      source: "generic",
      games: [],
      skipped: [{ line: 1, reason: "No recognisable column headers — is this a stats export?" }],
      missingFields: [],
      players: [],
    };
  }

  const headers = splitCsvLine(lines[headerIndex]);
  const keys = headers.map(headerKey);
  const source = detectGameSource(headers);

  const columnFor = (aliases: readonly string[]): number => {
    for (const alias of aliases) {
      const at = keys.indexOf(alias);
      if (at !== -1) return at;
    }
    return -1;
  };

  const columns = Object.fromEntries(
    Object.entries(FIELD_ALIASES).map(([field, aliases]) => [field, columnFor(aliases)])
  ) as Record<FieldName, number>;

  // A file with no date column is a season summary: one row per player holding
  // the whole season. Filing that as one appearance would put a season's
  // innings against a single opponent on a single day.
  if (columns.date === -1) {
    return {
      source,
      games: [],
      skipped: [],
      missingFields: [],
      players: [],
      refusedReason:
        "This file has no date column, so it is season totals rather than a list of games. Export the per-game stats instead — a season total imported as one appearance would put every inning you have thrown against a single opponent on a single day.",
    };
  }

  const games: Game[] = [];
  const skipped: SkippedRow[] = [];
  const players = new Set<string>();

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index]);
    const line = index + 1;
    if (cells.every((cell) => !cell)) continue;

    // Totals rows are dropped before their numbers are read — the same trap
    // the pitch importer hit, where a trailing "Average" row imported as data.
    const first = (cells[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|season|team|avg|average|summary|overall)\b/.test(first)) continue;

    const cell = (field: FieldName) => (columns[field] === -1 ? "" : (cells[columns[field]] ?? ""));
    /** The number, or undefined where the file carried no such column. */
    const declared = (field: FieldName) =>
      columns[field] === -1 ? undefined : (toNumber(cell(field)) ?? undefined);
    const read = (field: FieldName) => declared(field) ?? 0;

    const player = cell("player").trim();
    if (player) players.add(player);
    if (options.player && player && player !== options.player) continue;

    const outs = outsFromInnings(cell("innings"));
    if (outs === null) {
      skipped.push({
        line,
        reason: `Could not read innings pitched from "${cell("innings") || "(blank)"}"`,
      });
      continue;
    }
    // A row with no innings and no pitches is a player who did not pitch that
    // day, which is not an error and not an appearance either.
    if (outs === 0 && read("pitches") === 0 && read("battersFaced") === 0) continue;

    const game: Game = {
      id: gameId(),
      date: toIsoDate(cell("date"), fallbackDate),
      opponent: cell("opponent").trim() || "Unknown opponent",
      side: "home",
      outs,
      battersFaced: read("battersFaced"),
      pitches: read("pitches"),
      strikes: read("strikes"),
      firstPitchStrikes: read("firstPitchStrikes"),
      hits: read("hits"),
      runs: read("runs"),
      earnedRuns: read("earnedRuns"),
      walks: read("walks"),
      strikeouts: read("strikeouts"),
      hitBatters: read("hitBatters"),
    };

    // The same contradiction check the manual form uses — but run against only
    // the fields the file actually carried. Storing a missing column as zero
    // is right for the totals; validating against that zero is not, and it
    // rejected honest exports for lacking a batters-faced column.
    const problems = gameProblems({
      date: game.date,
      opponent: game.opponent,
      outs,
      battersFaced: declared("battersFaced"),
      pitches: declared("pitches"),
      strikes: declared("strikes"),
      firstPitchStrikes: declared("firstPitchStrikes"),
      runs: declared("runs"),
      earnedRuns: declared("earnedRuns"),
      strikeouts: declared("strikeouts"),
    });
    if (problems.length) {
      skipped.push({ line, reason: problems.join(" ") });
      continue;
    }

    games.push(game);
  }

  const missingFields = (Object.entries(columns) as [FieldName, number][])
    .filter(([, at]) => at === -1)
    .map(([field]) => field);

  return { source, games, skipped, missingFields, players: [...players].sort() };
}

/** Field names as an athlete would say them, for the import report. */
export const FIELD_LABELS: Record<FieldName, string> = {
  player: "player name",
  date: "date",
  opponent: "opponent",
  innings: "innings pitched",
  battersFaced: "batters faced",
  pitches: "pitch count",
  strikes: "strikes",
  firstPitchStrikes: "first-pitch strikes",
  hits: "hits",
  runs: "runs",
  earnedRuns: "earned runs",
  walks: "walks",
  strikeouts: "strikeouts",
  hitBatters: "hit batters",
};

export function namedFields(fields: FieldName[]): string {
  const named = fields.map((field) => FIELD_LABELS[field]);
  if (named.length === 0) return "";
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}
