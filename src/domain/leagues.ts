import { GBL_LEAGUE, GBL_TEAMS } from "./athleteProfile";
import type { BallclubzOuting, TeamFixture } from "./ballclubz";
import type { IsoDate } from "./state";

/**
 * The leagues the app can follow.
 *
 * A league is a list of teams, the days it usually plays, and where its draw
 * comes from. Following a league means a player on one of its teams gets that
 * team's draw imported, and their week built around the games in it.
 *
 * Adding a league means adding an entry here. A league whose draw comes from a
 * source not handled yet also needs a reader for that source on the server
 * (`leagueTeam` in src/index.ts).
 */
export type LeagueSource =
  /** Ballclubz league pages, e.g. https://ballclubz.com/gbld1/schedule. */
  | { kind: "ballclubz"; league: string }
  /** MLB's Stats API, which carries the winter leagues including the ABL. */
  | { kind: "mlb-stats"; sportId: number; leagueId: number };

export interface LeagueTeam {
  name: string;
  /** The team's id at the league's source. */
  id: string;
  /** Where its home games are played, for game times. */
  timeZone?: string;
}

export interface League {
  id: string;
  name: string;
  short: string;
  source: LeagueSource;
  teams: readonly LeagueTeam[];
  /** The weekdays its games usually fall on (0 = Monday), to start the sign-up answer from. */
  usualGameDays: readonly number[];
}

export const LEAGUES: readonly League[] = [
  {
    id: "gbl",
    name: "GBL Division 1",
    short: "GBL",
    source: { kind: "ballclubz", league: GBL_LEAGUE },
    teams: GBL_TEAMS.map((team) => ({ name: team.name, id: team.ballclubzId, timeZone: "Australia/Brisbane" })),
    usualGameDays: [4, 6],
  },
  {
    id: "abl",
    name: "Australian Baseball League",
    short: "ABL",
    source: { kind: "mlb-stats", sportId: 17, leagueId: 595 },
    teams: [
      { name: "Adelaide Giants", id: "4064", timeZone: "Australia/Adelaide" },
      { name: "Brisbane Bandits", id: "4065", timeZone: "Australia/Brisbane" },
      { name: "Perth Heat", id: "4068", timeZone: "Australia/Perth" },
      { name: "Sydney Blue Sox", id: "4069", timeZone: "Australia/Sydney" },
    ],
    // Four-game series, Thursday to Sunday.
    usualGameDays: [3, 4, 5, 6],
  },
];

/** The league a team plays in, and the team's entry there. */
export function leagueTeam(team: string | undefined): { league: League; team: LeagueTeam } | null {
  const wanted = team?.trim().toLowerCase();
  if (!wanted) return null;
  for (const league of LEAGUES) {
    const found = league.teams.find((candidate) => candidate.name.toLowerCase() === wanted);
    if (found) return { league, team: found };
  }
  return null;
}

/** The MLB Stats API schedule request for a team, over a date range. */
export function mlbStatsScheduleUrl(source: Extract<LeagueSource, { kind: "mlb-stats" }>, teamId: string, start: IsoDate, end: IsoDate): string {
  const params = new URLSearchParams({
    sportId: String(source.sportId),
    leagueId: String(source.leagueId),
    teamId,
    startDate: start,
    endDate: end,
  });
  return `https://statsapi.mlb.com/api/v1/schedule?${params}`;
}

interface StatsGame {
  officialDate?: string;
  gameDate?: string;
  gameType?: string;
  status?: { abstractGameState?: string; detailedState?: string };
  teams?: {
    away?: { team?: { id?: number; name?: string }; score?: number };
    home?: { team?: { id?: number; name?: string }; score?: number };
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A team's games out of a Stats API schedule response. `officialDate` is the
 * game's local date, which is the day it goes on the plan.
 */
export function parseMlbStatsSchedule(body: unknown, team: LeagueTeam): TeamFixture[] {
  const dates = (body as { dates?: { games?: StatsGame[] }[] } | null)?.dates;
  if (!Array.isArray(dates)) return [];
  const fixtures: TeamFixture[] = [];
  for (const day of dates) {
    for (const game of day.games ?? []) {
      const date = game.officialDate;
      if (!date || !ISO.test(date)) continue;
      if (/postponed|cancel/i.test(game.status?.detailedState ?? "")) continue;
      const home = String(game.teams?.home?.team?.id ?? "") === team.id;
      const away = String(game.teams?.away?.team?.id ?? "") === team.id;
      if (!home && !away) continue;
      const opponent = (home ? game.teams?.away?.team?.name : game.teams?.home?.team?.name) ?? "TBC";
      const final = game.status?.abstractGameState === "Final";
      const ours = home ? game.teams?.home?.score : game.teams?.away?.score;
      const theirs = home ? game.teams?.away?.score : game.teams?.home?.score;
      fixtures.push({
        date: date as IsoDate,
        opponent,
        home,
        detail: final && typeof ours === "number" && typeof theirs === "number"
          ? `${ours > theirs ? "W" : ours < theirs ? "L" : "T"} ${ours}–${theirs}`
          : gameTime(game.gameDate, team.timeZone),
      });
    }
  }
  return fixtures;
}

function gameTime(value: string | undefined, timeZone = "Australia/Brisbane"): string {
  const when = value ? new Date(value) : null;
  if (!when || Number.isNaN(when.getTime())) return "";
  try {
    return when
      .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone })
      .replace(/\s+/g, " ")
      .toLowerCase();
  } catch {
    return "";
  }
}

/** A team's finished games in a Stats API schedule response, newest first. */
export function mlbStatsFinals(body: unknown, team: LeagueTeam): { gamePk: number; date: IsoDate; opponent: string; home: boolean }[] {
  const dates = (body as { dates?: { games?: (StatsGame & { gamePk?: number })[] }[] } | null)?.dates;
  if (!Array.isArray(dates)) return [];
  const out: { gamePk: number; date: IsoDate; opponent: string; home: boolean }[] = [];
  for (const day of dates) {
    for (const game of day.games ?? []) {
      if (game.status?.abstractGameState !== "Final" || !game.gamePk || !game.officialDate || !ISO.test(game.officialDate)) continue;
      const home = String(game.teams?.home?.team?.id ?? "") === team.id;
      if (!home && String(game.teams?.away?.team?.id ?? "") !== team.id) continue;
      out.push({
        gamePk: game.gamePk,
        date: game.officialDate as IsoDate,
        opponent: (home ? game.teams?.away?.team?.name : game.teams?.home?.team?.name) ?? "TBC",
        home,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

const sameName = (a: string, b: string) => {
  const key = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");
  return key(a) !== "" && key(a) === key(b);
};

/** One player's pitching line out of a Stats API box score, or null if they did not pitch. */
export function parseMlbStatsOuting(
  box: unknown,
  game: { date: IsoDate; opponent: string; home: boolean },
  playerName: string
): BallclubzOuting | null {
  const side = (box as { teams?: Record<string, { players?: Record<string, unknown> }> } | null)?.teams?.[game.home ? "home" : "away"];
  for (const entry of Object.values(side?.players ?? {})) {
    const player = entry as { person?: { fullName?: string }; stats?: { pitching?: Record<string, unknown> } };
    const line = player.stats?.pitching;
    if (!line || line.inningsPitched === undefined || !sameName(player.person?.fullName ?? "", playerName)) continue;
    const number = (key: string) => (Number.isFinite(Number(line[key])) ? Number(line[key]) : 0);
    return {
      date: game.date,
      opponent: game.opponent,
      side: game.home ? "home" : "away",
      outs: number("outs"),
      hits: number("hits"),
      runs: number("runs"),
      earnedRuns: number("earnedRuns"),
      strikeouts: number("strikeOuts"),
      walks: number("baseOnBalls"),
      hitBatters: number("hitByPitch"),
      pitches: number("numberOfPitches"),
      strikes: number("strikes"),
      battersFaced: number("battersFaced"),
    };
  }
  return null;
}
