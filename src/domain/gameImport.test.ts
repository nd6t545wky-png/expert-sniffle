import { describe, expect, it } from "vitest";
import { detectGameSource, namedFields, parseGameCsv, toIsoDate } from "./gameImport";

const perGame = [
  "Player,Date,Opponent,IP,BF,#P,S,FPS,H,R,ER,BB,SO,HBP",
  '"Sippel, Dylan",08/07/2026,Coomera Cubs,5.0,20,78,50,13,4,2,2,2,6,0',
  '"Sippel, Dylan",07/31/2026,Redlands,3.2,17,71,42,9,6,4,3,4,4,1',
].join("\n");

describe("detectGameSource", () => {
  it("recognises a GameChanger-shaped export", () => {
    expect(detectGameSource(["Player", "Date", "IP", "BF", "H"])).toBe("gamechanger");
    expect(detectGameSource(["Date", "IP", "FPS"])).toBe("gamechanger");
  });

  it("falls back to generic for a coach's own sheet", () => {
    expect(detectGameSource(["Date", "Innings", "Strikeouts"])).toBe("generic");
  });
});

describe("toIsoDate", () => {
  it("reads the US-style dates these exports write", () => {
    expect(toIsoDate("08/07/2026", "2026-01-01")).toBe("2026-08-07");
    expect(toIsoDate("8/7/26", "2026-01-01")).toBe("2026-08-07");
  });

  it("passes an ISO date through", () => {
    expect(toIsoDate("2026-08-07T18:00:00Z", "2026-01-01")).toBe("2026-08-07");
  });

  it("falls back when there is no date to read", () => {
    expect(toIsoDate("", "2026-01-01")).toBe("2026-01-01");
    expect(toIsoDate("sometime", "2026-01-01")).toBe("2026-01-01");
  });
});

describe("parseGameCsv", () => {
  it("reads a per-game export into appearances", () => {
    const result = parseGameCsv(perGame, "2026-08-12");
    expect(result.source).toBe("gamechanger");
    expect(result.games).toHaveLength(2);
    expect(result.games[0].date).toBe("2026-08-07");
    expect(result.games[0].opponent).toBe("Coomera Cubs");
    expect(result.games[0].strikeouts).toBe(6);
  });

  it("stores innings as outs, so the scorebook notation survives the import", () => {
    // "3.2" is three innings and two outs — eleven outs, not 3.2 of anything.
    expect(parseGameCsv(perGame, "2026-08-12").games[1].outs).toBe(11);
  });

  it("refuses a season-totals file rather than filing it as one game", () => {
    const totals = ["Player,IP,BF,H,R,ER,BB,SO", '"Sippel, Dylan",42.1,160,30,15,12,14,55'].join("\n");
    const result = parseGameCsv(totals, "2026-08-12");
    expect(result.games).toEqual([]);
    expect(result.refusedReason).toMatch(/season totals rather than a list of games/);
  });

  it("skips a totals row inside a per-game file", () => {
    const withTotals = `${perGame}\nTotals,,,8.2,37,149,92,22,10,6,5,6,10,1`;
    expect(parseGameCsv(withTotals, "2026-08-12").games).toHaveLength(2);
  });

  it("reports every player in a team export", () => {
    const team = `${perGame}\n"Smith, Alex",08/07/2026,Coomera Cubs,2.0,8,31,20,5,2,1,1,1,3,0`;
    expect(parseGameCsv(team, "2026-08-12").players).toEqual(["Sippel, Dylan", "Smith, Alex"]);
  });

  it("filters a team export down to one athlete", () => {
    const team = `${perGame}\n"Smith, Alex",08/07/2026,Coomera Cubs,2.0,8,31,20,5,2,1,1,1,3,0`;
    const mine = parseGameCsv(team, "2026-08-12", { player: "Sippel, Dylan" });
    expect(mine.games).toHaveLength(2);
    // Without the filter the roster would import as this athlete's season.
    expect(parseGameCsv(team, "2026-08-12").games).toHaveLength(3);
  });

  it("passes over a player who did not pitch that day", () => {
    const idle = `${perGame}\n"Smith, Alex",08/07/2026,Coomera Cubs,0.0,0,0,0,0,0,0,0,0,0,0`;
    const result = parseGameCsv(idle, "2026-08-12");
    expect(result.games).toHaveLength(2);
    // Not an error either — nothing to report about it.
    expect(result.skipped).toEqual([]);
  });

  it("reports a row it cannot read rather than dropping it", () => {
    const broken = "Player,Date,Opponent,IP,BF,#P\nSippel,08/07/2026,Cubs,three,20,78";
    const result = parseGameCsv(broken, "2026-08-12");
    expect(result.games).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/Could not read innings pitched from "three"/);
  });

  it("refuses an imported line that contradicts itself", () => {
    // More strikes than pitches. Harder to spot in an import than in a form,
    // so it gets the same check.
    const bad = "Date,Opponent,IP,BF,#P,S\n08/07/2026,Cubs,5.0,20,40,60";
    const result = parseGameCsv(bad, "2026-08-12");
    expect(result.games).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/More strikes than pitches/);
  });

  it("finds the header under a title block", () => {
    const titled = `Coomera Cubs 2026\nSeason to 12 Aug\n\n${perGame}`;
    expect(parseGameCsv(titled, "2026-08-12").games).toHaveLength(2);
  });

  it("says which fields the export did not carry", () => {
    const thin = "Date,Opponent,IP,SO\n08/07/2026,Cubs,5.0,6";
    const result = parseGameCsv(thin, "2026-08-12");
    expect(result.missingFields).toContain("pitches");
    expect(result.missingFields).toContain("firstPitchStrikes");
    expect(result.games).toHaveLength(1);
  });

  it("names an opponent the file did not give rather than leaving it blank", () => {
    const noOpp = "Date,IP,BF,#P,S\n08/07/2026,5.0,20,78,50";
    expect(parseGameCsv(noOpp, "2026-08-12").games[0].opponent).toBe("Unknown opponent");
  });

  it("reports a file that is not a stats export at all", () => {
    const result = parseGameCsv("hello,world\n1,2", "2026-08-12");
    expect(result.games).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/No recognisable column headers/);
  });
});

describe("namedFields", () => {
  it("reads as a sentence", () => {
    expect(namedFields(["pitches"])).toBe("pitch count");
    expect(namedFields(["pitches", "strikes"])).toBe("pitch count and strikes");
    expect(namedFields(["pitches", "strikes", "hits"])).toBe("pitch count, strikes and hits");
    expect(namedFields([])).toBe("");
  });
});
