import type { IsoDate } from "./state";
import type { Game, GameSide } from "./gameLog";

/**
 * Games sent to one player by the app's owner - a tournament, a rep squad's
 * schedule - that the player's own team draw does not have.
 *
 * A player's data is encrypted on their device, so nobody else can write into
 * it. The owner sends the games to the server against that player's account;
 * the player's app picks them up and adds them to their own games. Nobody
 * else's account sees them.
 */
export interface EventGame {
  date: IsoDate;
  /** "vs Korea · 12:00 Tokyo". */
  label: string;
  /** The player's pitching line from the game's box score, once it is played. */
  outing?: EventOuting;
}

/** A pitching line, as the box score gives it. Absent fields stay absent, not zero. */
export interface EventOuting {
  opponent: string;
  side: GameSide;
  outs: number;
  pitches?: number;
  strikes?: number;
  battersFaced?: number;
  hits: number;
  runs: number;
  earnedRuns: number;
  walks: number;
  strikeouts: number;
  hitBatters: number;
}

export interface PlayerEvent {
  id: string;
  title: string;
  games: EventGame[];
  createdAt: string;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(year: number, month: number, day: number): IsoDate | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10) as IsoDate;
}

/**
 * A pasted schedule, one game a line. The date comes first, in any of
 * "2026-11-12", "12/11/2026", "12 Nov 2026" or "Thu 12 Nov" (this year, or
 * `year` when given); the rest of the line is the game.
 *
 *   2026-11-12 vs Korea 12:00
 *   13 Nov vs Chinese Taipei 12:00
 */
export function parseSchedule(text: string, year = new Date().getFullYear()): { games: EventGame[]; skipped: string[] } {
  const games: EventGame[] = [];
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let date: IsoDate | null = null;
    let rest = "";
    let match = /^(\d{4})-(\d{1,2})-(\d{1,2})\b[\s,:·-]*(.*)$/.exec(line);
    if (match) {
      date = iso(Number(match[1]), Number(match[2]), Number(match[3]));
      rest = match[4];
    } else if ((match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b[\s,:·-]*(.*)$/.exec(line))) {
      const y = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : year;
      date = iso(y, Number(match[2]), Number(match[1]));
      rest = match[4];
    } else if ((match = /^(?:[a-z]{3,9},?\s+)?(\d{1,2})\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?\b[\s,:·-]*(.*)$/i.exec(line))) {
      const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
      date = month ? iso(match[3] ? Number(match[3]) : year, month, Number(match[1])) : null;
      rest = match[4];
    }
    if (!date) {
      skipped.push(line);
      continue;
    }
    games.push({ date, label: rest.trim().slice(0, 80) || "Game" });
  }
  return { games: games.sort((a, b) => a.date.localeCompare(b.date)), skipped };
}

const count = (value: unknown, max = 999): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : undefined;

/** A pitching line, or null if it does not hold together. */
export function readOuting(value: unknown): EventOuting | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const outs = count(raw.outs, 60);
  const needed = [outs, count(raw.hits), count(raw.runs), count(raw.earnedRuns), count(raw.walks), count(raw.strikeouts)];
  if (needed.some((part) => part === undefined)) return null;
  const pitches = count(raw.pitches, 200);
  const strikes = count(raw.strikes, 200);
  if (pitches !== undefined && strikes !== undefined && strikes > pitches) return null;
  const outing: EventOuting = {
    opponent: typeof raw.opponent === "string" ? raw.opponent.slice(0, 60) : "",
    side: raw.side === "home" ? "home" : "away",
    outs: outs!,
    hits: count(raw.hits)!,
    runs: count(raw.runs)!,
    earnedRuns: count(raw.earnedRuns)!,
    walks: count(raw.walks)!,
    strikeouts: count(raw.strikeouts)!,
    hitBatters: count(raw.hitBatters) ?? 0,
  };
  if (pitches !== undefined) outing.pitches = pitches;
  if (strikes !== undefined) outing.strikes = strikes;
  const faced = count(raw.battersFaced, 99);
  if (faced !== undefined) outing.battersFaced = faced;
  return outing;
}

/** Events as the server returns them, read defensively. */
export function readPlayerEvents(value: unknown): PlayerEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== "string" || typeof raw.title !== "string") return [];
    const games = (Array.isArray(raw.games) ? raw.games : []).flatMap((game) => {
      const g = (game && typeof game === "object" ? game : {}) as Record<string, unknown>;
      return typeof g.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(g.date)
        ? [
            {
              date: g.date as IsoDate,
              label: typeof g.label === "string" ? g.label.slice(0, 80) : "Game",
              ...(readOuting(g.outing) ? { outing: readOuting(g.outing)! } : {}),
            },
          ]
        : [];
    });
    return [{ id: raw.id, title: raw.title.slice(0, 80), games, createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "" }];
  });
}

/**
 * The player's stored games with the sent events added. Each sent game has a
 * fixed id, so adding the same event twice changes nothing, and a game the
 * owner corrects (a time, or which game it turned out to be) is updated in
 * place. Games from an event that is no longer sent are taken out.
 */
export function withPlayerEvents(
  fixtures: unknown,
  events: readonly PlayerEvent[]
): { fixtures: unknown[]; added: number; removed: number; updated: number } {
  // An event the owner has taken back goes from the player's games too.
  const live = new Set(events.map((event) => event.id));
  const all = Array.isArray(fixtures) ? [...fixtures] : [];
  const current = all.filter((entry) => {
    const id = entry && typeof entry === "object" ? String((entry as { id?: unknown }).id ?? "") : "";
    const match = /^event-([^-]+)-\d+$/.exec(id);
    return !match || live.has(match[1]);
  });
  const removed = all.length - current.length;
  const idOf = (entry: unknown) => (entry && typeof entry === "object" ? String((entry as { id?: unknown }).id ?? "") : "");
  let added = 0;
  let updated = 0;
  for (const event of events) {
    event.games.forEach((game, index) => {
      const id = `event-${event.id}-${index}`;
      const fixture = { id, date: game.date, team: event.title, label: `${event.title}: ${game.label}` };
      const at = current.findIndex((entry) => idOf(entry) === id);
      if (at < 0) {
        current.push(fixture);
        added += 1;
        return;
      }
      // The owner corrected the game (a time, or which game it turned out to be).
      const existing = current[at] as Record<string, unknown>;
      if (existing.date !== fixture.date || existing.label !== fixture.label || existing.team !== fixture.team) {
        current[at] = { ...existing, ...fixture };
        updated += 1;
      }
    });
  }
  return { fixtures: current, added, removed, updated };
}

/**
 * The player's game log with the pitching lines from sent events in it.
 *
 * A line goes in as its own game, keyed to the event game, and is refreshed if
 * the owner corrects it. A game the player logged themselves on that date is
 * left alone - their own count of a game wins. Lines from an event that is no
 * longer sent are taken out.
 */
export function withEventOutings(
  games: readonly Game[],
  events: readonly PlayerEvent[]
): { games: Game[]; added: number; updated: number; removed: number } {
  const live = new Set(events.map((event) => event.id));
  const kept = games.filter((game) => {
    const match = /^event-([^-]+)-\d+$/.exec(game.id);
    return !match || live.has(match[1]);
  });
  const removed = games.length - kept.length;
  const next = [...kept];
  let added = 0;
  let updated = 0;
  for (const event of events) {
    event.games.forEach((game, index) => {
      if (!game.outing) return;
      const id = `event-${event.id}-${index}`;
      const line: Game = {
        id,
        date: game.date,
        competition: event.title,
        firstPitchStrikes: null as unknown as number,
        pitches: (game.outing.pitches ?? null) as number,
        strikes: (game.outing.strikes ?? null) as number,
        battersFaced: (game.outing.battersFaced ?? null) as number,
        opponent: game.outing.opponent,
        side: game.outing.side,
        outs: game.outing.outs,
        hits: game.outing.hits,
        runs: game.outing.runs,
        earnedRuns: game.outing.earnedRuns,
        walks: game.outing.walks,
        strikeouts: game.outing.strikeouts,
        hitBatters: game.outing.hitBatters,
      };
      const at = next.findIndex((existing) => existing.id === id);
      if (at >= 0) {
        if (JSON.stringify(next[at]) !== JSON.stringify(line)) {
          next[at] = line;
          updated += 1;
        }
        return;
      }
      if (next.some((existing) => existing.date === game.date && !existing.id.startsWith("event-"))) return;
      next.push(line);
      added += 1;
    });
  }
  return { games: next, added, updated, removed };
}
