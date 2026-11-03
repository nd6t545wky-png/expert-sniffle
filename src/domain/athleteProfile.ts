/**
 * Who the athlete is: the answers asked when an account is made.
 *
 * The app was built for one pitcher, so team, colours, fixtures and the
 * Ballclubz link were wired to him. With several accounts they come from here
 * instead. Stored in `state.profile` beside the fields it already held (name,
 * throwing hand, weight), so an existing profile keeps everything it had.
 */

import { WeeklySchedule, readSchedule } from "./weeklySchedule";
import { TeamColours, readTeamColours } from "./teamColours";

export type PlayerType = "pitcher" | "two-way" | "position";

export const PLAYER_TYPES: readonly { value: PlayerType; label: string; help: string }[] = [
  { value: "pitcher", label: "Pitcher", help: "Throwing programme, bullpens and game pitching." },
  { value: "two-way", label: "Two-way", help: "Pitching and hitting: the throwing programme plus at-bat tracking." },
  { value: "position", label: "Position player", help: "Hitting and strength - no throwing programme." },
];

export type Hand = "Right" | "Left";
export type BatSide = "Right" | "Left" | "Switch";

/** GBL Division 1 clubs, with their Ballclubz team id for the draw and stats. */
export const GBL_TEAMS: readonly { name: string; ballclubzId: string }[] = [
  { name: "Beenleigh Hawks", ballclubzId: "9970586" },
  { name: "Carina Red Sox", ballclubzId: "9971682" },
  { name: "Coomera Cubs", ballclubzId: "9971819" },
  { name: "Narangba Demons", ballclubzId: "10175264" },
  { name: "Pine Hills Lightning", ballclubzId: "PineHills" },
  { name: "Redcliffe Padres", ballclubzId: "9970723" },
  { name: "Redlands Rays", ballclubzId: "9970860" },
  { name: "Surfers Paradise", ballclubzId: "Surfers" },
  { name: "Wests Bulldogs", ballclubzId: "9971134" },
  { name: "Windsor Royals", ballclubzId: "9972093" },
];

export const GBL_LEAGUE = "gbld1";

export interface AthleteProfile {
  name: string;
  /** Team training nights and game days; see weeklySchedule.ts. */
  schedule: WeeklySchedule;
  /** Winter-ball club, or "" for none. */
  winterTeam: string;
  /** The team's two colours; the app is drawn in them. */
  teamColours: TeamColours;
  /** A team outside the followed leagues: its logo, found on the web ("" for none). */
  teamLogo?: string;
  /** A team outside the followed leagues: its draw, found on the web. */
  teamDraw?: { team: string; fetchedAt: string; games: unknown[]; source: string };
  /** The team the athlete plays for now - a GBL club or anything typed. */
  team: string;
  playerType: PlayerType;
  throws: Hand;
  bats: BatSide;
}

const isType = (value: unknown): value is PlayerType => PLAYER_TYPES.some((type) => type.value === value);

/**
 * The profile as stored, read defensively.
 *
 * Older profiles carry `summerTeam` and `throwingHand` rather than `team` and
 * `throws`; both are read, so the original account's answers carry over.
 */
export function readAthleteProfile(value: unknown): Partial<AthleteProfile> {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const text = (key: string) => (typeof raw[key] === "string" && (raw[key] as string).trim() ? (raw[key] as string).trim() : undefined);
  const throws = text("throws") ?? text("throwingHand");
  const bats = text("bats");
  return {
    name: text("name"),
    team: text("team") ?? text("summerTeam"),
    playerType: isType(raw.playerType) ? raw.playerType : undefined,
    throws: throws === "Left" || throws === "Right" ? throws : undefined,
    bats: bats === "Left" || bats === "Right" || bats === "Switch" ? bats : undefined,
  };
}

/**
 * Whether the sign-up questions are answered. Player type, the weekly
 * schedule and the team's colours are never assumed: the week is built around
 * the schedule, and the app is drawn in the colours.
 */
export function profileComplete(value: unknown): boolean {
  const profile = readAthleteProfile(value);
  return Boolean(
    profile.name && profile.team && profile.playerType && readSchedule(value) && readTeamColours(value, profile.team)
  );
}

export function gblTeam(team: string | undefined) {
  if (!team) return null;
  const wanted = team.trim().toLowerCase();
  return GBL_TEAMS.find((candidate) => candidate.name.toLowerCase() === wanted) ?? null;
}

/**
 * The athlete's winter club, if any. Profiles written before the question
 * existed belong to the Cubs' original athlete, who plays winter for Norths;
 * a stored answer always wins.
 */
export function winterClubOf(value: unknown): string | undefined {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  if (typeof raw.winterTeam === "string" && raw.winterTeam.trim()) return raw.winterTeam.trim();
  const team = readAthleteProfile(value).team ?? "Coomera Cubs";
  return team === "Coomera Cubs" && !isType(raw.playerType) ? "Norths" : undefined;
}

export const pitches = (type: PlayerType | undefined) => type !== "position";
export const hits = (type: PlayerType | undefined) => type === "two-way" || type === "position";
