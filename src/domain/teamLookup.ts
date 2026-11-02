import type { TeamFixture } from "./ballclubz";
import type { IsoDate } from "./state";
import { TeamColours, isHexColour } from "./teamColours";

/**
 * A team outside the leagues the app follows, found on the web at sign-up:
 * its logo, its colours and its draw, in one search.
 *
 * What comes back is a model's reading of web pages, so nothing in it is
 * trusted as given: colours must be real hex colours, the logo and source
 * must be http(s) links, and only games with a real date inside a year either
 * side of today are kept. The athlete sees what was found, with the source,
 * before it is saved.
 */
export interface TeamLookup {
  team: string;
  colours: TeamColours | null;
  logoUrl: string | null;
  fixtures: TeamFixture[];
  sourceUrl: string | null;
  league: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A calendar date that exists: 2026-02-30 does not, though Date would roll it into March. */
function realDate(value: string): boolean {
  if (!ISO.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** The model's JSON, checked field by field. Anything that does not hold up is dropped. */
export function parseTeamLookup(team: string, raw: unknown, now: Date = new Date()): TeamLookup {
  const record = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const colours = (record.colours && typeof record.colours === "object" ? record.colours : {}) as Record<string, unknown>;
  const primary = typeof colours.primary === "string" ? colours.primary.trim().toLowerCase() : "";
  const secondary = typeof colours.secondary === "string" ? colours.secondary.trim().toLowerCase() : "";
  const earliest = new Date(now.getTime() - 366 * 864e5).toISOString().slice(0, 10);
  const latest = new Date(now.getTime() + 366 * 864e5).toISOString().slice(0, 10);
  const fixtures: TeamFixture[] = (Array.isArray(record.fixtures) ? record.fixtures : [])
    .map((game) => (game && typeof game === "object" ? (game as Record<string, unknown>) : {}))
    .filter((game) => typeof game.date === "string" && realDate(game.date))
    .filter((game) => (game.date as string) >= earliest && (game.date as string) <= latest)
    .map((game) => ({
      date: game.date as IsoDate,
      opponent: text(game.opponent, 60) || "TBC",
      home: game.home === true,
      detail: text(game.detail, 40),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 80);
  return {
    team,
    colours: isHexColour(primary) && isHexColour(secondary) ? { primary, secondary } : null,
    logoUrl: httpUrl(record.logoUrl),
    fixtures,
    sourceUrl: httpUrl(record.sourceUrl),
    league: text(record.league, 80) || null,
  };
}

/** What the model is asked for. */
export function teamLookupPrompt(team: string, where: string): string {
  return [
    `Find the baseball team "${team}"${where ? ` (${where})` : ""}.`,
    "Search the web for the club's official website or league page.",
    "Return JSON only:",
    `{"league":string,"colours":{"primary":"#rrggbb","secondary":"#rrggbb"},"logoUrl":string,"sourceUrl":string,"fixtures":[{"date":"YYYY-MM-DD","opponent":string,"home":boolean,"detail":string}]}`,
    "colours: the club's two main colours as hex, from its logo or kit.",
    "logoUrl: a direct link to the club's logo image file (png, jpg, svg or webp) on the club's or league's site.",
    "fixtures: the team's games in the current or next season from the published draw, with the game's local date. detail is the start time, if given.",
    "sourceUrl: the page the draw came from.",
    "Leave out anything you cannot find on a real page; never invent games, colours or links.",
  ].join("\n");
}
