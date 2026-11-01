import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  battingTotals,
  findOnRoster,
  gameForOuting,
  liveGameFileUrl,
  mergeBallclubzOutings,
  parseBattingGameLog,
  parseLiveGameRef,
  parseRoster,
  parsePitchingGameLog,
  parsePlayerHeader,
  parsePlayerPageUrl,
  parseScheduleGames,
  pitchingFromGameFile,
  playerPageUrl,
  teamFixtures,
} from "./ballclubz";
import { Game, seasonRates, seasonTotals } from "./gameLog";

// The real page, trimmed to its title and the game log (1 Nov 2026).
const PAGE = readFileSync(join(__dirname, "fixtures", "ballclubzPitcher.html"), "utf8");
const NOW = new Date("2026-11-01T12:00:00Z");

describe("parsePlayerPageUrl", () => {
  it("accepts a Ballclubz player page and rebuilds it", () => {
    const page = parsePlayerPageUrl("https://ballclubz.com/gbld1/teams/9971819/687154");
    expect(page).toEqual({ league: "gbld1", team: "9971819", player: "687154" });
    expect(playerPageUrl(page!)).toBe("https://ballclubz.com/gbld1/teams/9971819/687154");
  });

  it("refuses anything else, because the server fetches what it accepts", () => {
    expect(parsePlayerPageUrl("https://evil.example/gbld1/teams/9971819/687154")).toBeNull();
    expect(parsePlayerPageUrl("https://ballclubz.com.evil.example/gbld1/teams/1/2")).toBeNull();
    expect(parsePlayerPageUrl("https://ballclubz.com/gbld1/stats")).toBeNull();
    expect(parsePlayerPageUrl("https://ballclubz.com/gbld1/teams/9971819")).toBeNull();
    expect(parsePlayerPageUrl("not a url")).toBeNull();
  });
});

describe("parsePitchingGameLog", () => {
  const outings = parsePitchingGameLog(PAGE, NOW);

  it("reads every outing and skips the totals row", () => {
    expect(outings).toHaveLength(5);
    expect(outings.reduce((sum, outing) => sum + outing.pitches, 0)).toBe(191);
  });

  it("dates outings in the right year and reads the line", () => {
    expect(outings[0]).toEqual({
      date: "2026-10-04",
      opponent: "Surfers Paradise",
      side: "home",
      outs: 7,
      hits: 3,
      runs: 2,
      earnedRuns: 2,
      strikeouts: 3,
      walks: 1,
      hitBatters: 0,
      pitches: 34,
    });
    const redcliffe = outings.find((outing) => outing.date === "2026-11-01")!;
    expect(redcliffe).toMatchObject({ opponent: "Redcliffe Padres", side: "away", outs: 4, walks: 4, pitches: 42 });
  });

  it("puts January games in the season's second year", () => {
    const january = PAGE.replace("Sun 11/01 2:00pm", "Wed 1/06 7:00pm");
    expect(parsePitchingGameLog(january, NOW).some((outing) => outing.date === "2027-01-06")).toBe(true);
  });

  it("returns nothing for a page without a pitching log", () => {
    expect(parsePitchingGameLog("<html><body><h2>Batting</h2></body></html>", NOW)).toEqual([]);
  });
});

describe("mergeBallclubzOutings", () => {
  const outings = parsePitchingGameLog(PAGE, NOW);

  it("adds every outing to an empty log", () => {
    const merged = mergeBallclubzOutings([], outings);
    expect(merged.added).toBe(5);
    expect(merged.games.every((game) => game.id.startsWith("ballclubz-"))).toBe(true);
    // Not on the page, so absent rather than zero.
    expect(merged.games[0].strikes).toBeNull();
  });

  it("is a no-op the second time", () => {
    const once = mergeBallclubzOutings([], outings);
    const twice = mergeBallclubzOutings(once.games, outings);
    expect(twice.added + twice.updated).toBe(0);
    expect(twice.games).toHaveLength(5);
  });

  it("never touches a game the athlete entered for that date", () => {
    const mine = { id: "game-1", date: "2026-11-01", opponent: "Redcliffe", pitches: 40, strikes: 25 } as Game;
    const merged = mergeBallclubzOutings([mine], outings);
    expect(merged.games.find((game) => game.date === "2026-11-01")).toBe(mine);
    expect(merged.added).toBe(4);
  });

  it("refreshes its own game when the league corrects it, keeping what the athlete added", () => {
    const first = mergeBallclubzOutings([], outings).games.map((game) =>
      game.date === "2026-11-01" ? { ...game, strikes: 22, notes: "Lost the zone in the 2nd" } : game
    );
    const corrected = outings.map((outing) => (outing.date === "2026-11-01" ? { ...outing, pitches: 44 } : outing));
    const merged = mergeBallclubzOutings(first, corrected);
    expect(merged.updated).toBe(1);
    expect(merged.games.find((game) => game.date === "2026-11-01")).toMatchObject({
      pitches: 44,
      strikes: 22,
      notes: "Lost the zone in the 2nd",
    });
  });

  it("leaves the strike rate unknown rather than 0% when no game has strikes", () => {
    const games = mergeBallclubzOutings([], outings).games;
    const strike = seasonRates(seasonTotals(games)).find((rate) => rate.id === "strikePct");
    expect(strike).toBeDefined();
    expect(strike!.value).toBeNull();
  });
});

describe("box scores", () => {
  const SCHEDULE = readFileSync(join(__dirname, "fixtures", "ballclubzSchedule.html"), "utf8");
  const LIVE = readFileSync(join(__dirname, "fixtures", "ballclubzLive.html"), "utf8");
  const FILE = JSON.parse(readFileSync(join(__dirname, "fixtures", "ballclubzGame.json"), "utf8"));
  const outings = parsePitchingGameLog(PAGE, NOW);

  it("reads the pitcher's name and team off the player page", () => {
    expect(parsePlayerHeader(PAGE)).toEqual({ name: "Dylan Sippel", team: "Coomera Cubs" });
  });

  it("finds the game each outing was pitched in", () => {
    const games = parseScheduleGames(SCHEDULE);
    expect(games.length).toBeGreaterThan(80);
    const redcliffe = outings.find((outing) => outing.date === "2026-11-01")!;
    expect(gameForOuting(games, redcliffe, "Coomera Cubs")?.path).toBe("/gbld1/live/2ceff3f");
    // Every one of this season's outings has a box score to read.
    expect(outings.every((outing) => gameForOuting(games, outing, "Coomera Cubs") !== null)).toBe(true);
  });

  it("reads the scorer's file reference off the box-score page", () => {
    const ref = parseLiveGameRef(LIVE);
    expect(ref).toEqual({ id: "343943", code: "ba3a9e9ca7ddc1985678062d8eb1d492" });
    expect(liveGameFileUrl(ref!)).toBe("https://game.ballclubz.com/343943/ba3a9e9ca7ddc1985678062d8eb1d492.json");
  });

  it("gets strikes, batters faced and first-pitch strikes", () => {
    expect(pitchingFromGameFile(FILE, "Dylan Sippel")).toEqual({
      pitches: 42,
      strikes: 19,
      battersFaced: 9,
      firstPitchStrikes: 7,
    });
  });

  it("counts from the plays exactly what the official line says", () => {
    // Strip the official figures and the play-by-play must reproduce them.
    for (const [slot, person] of Object.entries(FILE.lineup as Record<string, Record<string, unknown>>)) {
      if (!("pitch_pitches" in person)) continue;
      const bare = {
        ...FILE,
        lineup: { [slot]: { ...person, pitch_pitches: undefined, pitch_strikes: undefined } },
      };
      const counted = pitchingFromGameFile(bare, `${person.firstname} ${person.lastname}`)!;
      expect([counted.pitches, counted.strikes], String(person.lastname)).toEqual([
        person.pitch_pitches,
        person.pitch_strikes,
      ]);
    }
  });

  it("returns null for someone not in the game", () => {
    expect(pitchingFromGameFile(FILE, "Nobody Here")).toBeNull();
    expect(pitchingFromGameFile({}, "Dylan Sippel")).toBeNull();
  });

  it("files the box-score numbers with the outing", () => {
    const enriched = outings.map((outing) =>
      outing.date === "2026-11-01" ? { ...outing, ...pitchingFromGameFile(FILE, "Dylan Sippel")! } : outing
    );
    const game = mergeBallclubzOutings([], enriched).games.find((g) => g.date === "2026-11-01")!;
    expect(game).toMatchObject({ pitches: 42, strikes: 19, battersFaced: 9, firstPitchStrikes: 7 });
  });
});

describe("any team", () => {
  const SCHEDULE = readFileSync(join(__dirname, "fixtures", "ballclubzSchedule.html"), "utf8");
  const ROSTER = readFileSync(join(__dirname, "fixtures", "ballclubzRoster.html"), "utf8");

  it("reads the roster and finds a player by name", () => {
    const roster = parseRoster(ROSTER);
    expect(roster.length).toBeGreaterThan(25);
    expect(findOnRoster(roster, "Dylan Sippel")?.path).toBe("/gbld1/teams/9971819/687154");
    expect(findOnRoster(roster, "sippel dylan")?.path).toBe("/gbld1/teams/9971819/687154");
    expect(findOnRoster(roster, "Ty Iddon")?.path).toBe("/gbld1/teams/9971819/687142");
    expect(findOnRoster(roster, "Dylan")).toBeNull();
    expect(findOnRoster(roster, "Someone Else")).toBeNull();
  });

  it("builds a team's draw from the schedule, home and away", () => {
    const cubs = teamFixtures(SCHEDULE, "Coomera Cubs", NOW);
    expect(cubs.length).toBe(36);
    expect(cubs.find((game) => game.date === "2026-11-01")).toMatchObject({ opponent: "Redcliffe Padres", home: false });
    expect(cubs.find((game) => game.date === "2027-01-06")).toMatchObject({ opponent: "Carina Red Sox", home: true });
    // Another club reads the same way.
    const rays = teamFixtures(SCHEDULE, "Redlands Rays", NOW);
    expect(rays.length).toBe(36);
    expect(rays.every((game) => game.opponent !== "Redlands Rays")).toBe(true);
  });
});

describe("batting", () => {
  const HITTER = readFileSync(join(__dirname, "fixtures", "ballclubzHitter.html"), "utf8");

  it("reads the batting game log", () => {
    const lines = parseBattingGameLog(HITTER, NOW);
    expect(lines).toHaveLength(7);
    expect(lines[0]).toMatchObject({ date: "2026-10-02", opponent: "Surfers Paradise", side: "home", pa: 4, ab: 2, h: 1, bb: 2, so: 0, sb: 1 });
  });

  it("comes out at the line Ballclubz publishes (.235/.536/.294)", () => {
    const t = battingTotals(parseBattingGameLog(HITTER, NOW));
    expect([t.pa, t.ab, t.h, t.bb, t.so, t.sb]).toEqual([28, 17, 4, 9, 5, 5]);
    expect(t.avg?.toFixed(3)).toBe("0.235");
    expect(t.obp?.toFixed(3)).toBe("0.536");
    expect(t.slg?.toFixed(3)).toBe("0.294");
  });

  it("finds no batting on a pitcher-only page", () => {
    expect(parseBattingGameLog(PAGE, NOW)).toEqual([]);
  });
});
