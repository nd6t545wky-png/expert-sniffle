import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeBallclubzOutings, parsePitchingGameLog, parsePlayerPageUrl, playerPageUrl } from "./ballclubz";
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
