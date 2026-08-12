import { describe, expect, it } from "vitest";
import {
  FIRST_PITCH_STRIKE_MARK,
  Game,
  STRIKE_PCT_MARK,
  THIN_SAMPLE_INNINGS,
  appearance,
  formatInnings,
  gameProblems,
  inningsPitched,
  outsFromInnings,
  readGames,
  seasonFindings,
  seasonRates,
  seasonTotals,
} from "./gameLog";

let counter = 0;
const game = (over: Partial<Game> = {}): Game => ({
  id: `g${(counter += 1)}`,
  date: "2026-08-07",
  opponent: "Coomera Cubs",
  side: "home",
  outs: 15,
  battersFaced: 20,
  pitches: 78,
  strikes: 50,
  firstPitchStrikes: 13,
  hits: 4,
  runs: 2,
  earnedRuns: 2,
  walks: 2,
  strikeouts: 6,
  hitBatters: 0,
  ...over,
});

describe("innings", () => {
  it("writes outs the way a scorebook does", () => {
    expect(formatInnings(11)).toBe("3.2");
    expect(formatInnings(15)).toBe("5.0");
    expect(formatInnings(1)).toBe("0.1");
    expect(formatInnings(0)).toBe("0.0");
  });

  it("adds correctly, which the decimal form cannot", () => {
    // Two outings of 3.2 are 7.1 innings, not 6.4. Storing outs is the whole
    // reason the app can never print an innings count that does not exist.
    expect(formatInnings(11 + 11)).toBe("7.1");
  });

  it("converts outs to true innings for rates", () => {
    expect(inningsPitched(11)).toBeCloseTo(3.6667, 3);
    expect(inningsPitched(-4)).toBe(0);
  });

  it("reads typed innings in either notation", () => {
    expect(outsFromInnings("3.2")).toBe(11);
    expect(outsFromInnings("5")).toBe(15);
    expect(outsFromInnings("3 2/3")).toBe(11);
    expect(outsFromInnings("0.1")).toBe(1);
  });

  it("refuses a third that cannot exist", () => {
    // ".3" would be three thirds, which is the next whole inning.
    expect(outsFromInnings("3.3")).toBeNull();
    expect(outsFromInnings("")).toBeNull();
    expect(outsFromInnings("abc")).toBeNull();
  });
});

describe("appearance", () => {
  it("works out the command rates for one outing", () => {
    const line = appearance(game());
    expect(line.innings).toBe("5.0");
    expect(line.strikePct).toBe(64.1);
    expect(line.firstPitchStrikePct).toBe(65);
    expect(line.pitchesPerInning).toBe(15.6);
    expect(line.pitchesPerBatter).toBe(3.9);
  });

  it("returns nothing rather than dividing by zero", () => {
    const line = appearance(game({ outs: 0, pitches: 0, battersFaced: 0 }));
    expect(line.strikePct).toBeNull();
    expect(line.firstPitchStrikePct).toBeNull();
    expect(line.pitchesPerInning).toBeNull();
    expect(line.pitchesPerBatter).toBeNull();
  });
});

describe("seasonTotals", () => {
  it("adds outs rather than decimal innings", () => {
    const totals = seasonTotals([game({ outs: 11 }), game({ outs: 11 })]);
    expect(totals.outs).toBe(22);
    expect(totals.innings).toBe("7.1");
  });

  it("sums every counting stat", () => {
    const totals = seasonTotals([game(), game()]);
    expect(totals.games).toBe(2);
    expect(totals.pitches).toBe(156);
    expect(totals.strikeouts).toBe(12);
    expect(totals.earnedRuns).toBe(4);
  });

  it("is all zeroes with no games", () => {
    const totals = seasonTotals([]);
    expect(totals.games).toBe(0);
    expect(totals.innings).toBe("0.0");
  });
});

describe("seasonRates", () => {
  const rates = (games: Game[]) => seasonRates(seasonTotals(games));
  const value = (games: Game[], id: string) => rates(games).find((r) => r.id === id)?.value ?? null;

  it("works out ERA per nine innings", () => {
    // 4 earned runs in 10 innings is 3.60.
    expect(value([game({ outs: 15, earnedRuns: 2 }), game({ outs: 15, earnedRuns: 2 })], "era")).toBe(3.6);
  });

  it("works out WHIP per inning", () => {
    // 12 baserunners (4 walks + 8 hits) over 10 innings is 1.20.
    expect(value([game({ outs: 15, walks: 2, hits: 4 }), game({ outs: 15, walks: 2, hits: 4 })], "whip")).toBe(1.2);
  });

  it("gives strikeouts and walks per batter, not only per nine", () => {
    const list = rates([game(), game()]);
    expect(list.find((r) => r.id === "kPct")?.value).toBe(30);
    expect(list.find((r) => r.id === "bbPct")?.value).toBe(10);
  });

  it("marks every rate thin below the sample line", () => {
    expect(rates([game({ outs: 9 })]).every((rate) => rate.thin)).toBe(true);
    expect(rates([game({ outs: 15 }), game({ outs: 21 })]).every((rate) => rate.thin)).toBe(false);
  });

  it("shows a dash rather than a number with nothing to divide", () => {
    for (const rate of rates([])) expect(rate.display).toBe("—");
  });
});

describe("gameProblems", () => {
  it("catches more strikes than pitches", () => {
    expect(gameProblems({ ...game({ pitches: 40, strikes: 50 }) })).toContain(
      "More strikes than pitches — one of the two is wrong."
    );
  });

  it("catches more first-pitch strikes than batters", () => {
    expect(gameProblems(game({ battersFaced: 10, firstPitchStrikes: 12 }))).toContain(
      "More first-pitch strikes than batters faced."
    );
  });

  it("catches earned runs above total runs", () => {
    expect(gameProblems(game({ runs: 1, earnedRuns: 3 }))).toContain(
      "Earned runs cannot be more than total runs."
    );
  });

  it("catches more strikeouts than batters faced", () => {
    expect(gameProblems(game({ battersFaced: 5, strikeouts: 7 }))).toContain(
      "More strikeouts than batters faced."
    );
  });

  it("catches fewer batters than the innings imply", () => {
    // Nine innings cannot be pitched against four batters.
    expect(gameProblems(game({ outs: 27, battersFaced: 4 }))).toContain(
      "Fewer batters faced than innings pitched — check both."
    );
  });

  it("requires a date and an opponent", () => {
    const problems = gameProblems({ ...game(), date: "" as never, opponent: "  " });
    expect(problems).toContain("Pick the date the game was played.");
    expect(problems).toContain("Name the opponent.");
  });

  it("passes a coherent line", () => {
    expect(gameProblems(game())).toEqual([]);
  });
});

describe("readGames", () => {
  it("returns games newest first", () => {
    const games = readGames([game({ date: "2026-07-01" }), game({ date: "2026-08-01" })]);
    expect(games.map((entry) => entry.date)).toEqual(["2026-08-01", "2026-07-01"]);
  });

  it("survives junk in the store", () => {
    expect(readGames(null)).toEqual([]);
    expect(readGames([{ id: 1 }, "x", game()])).toHaveLength(1);
  });
});

describe("seasonFindings", () => {
  const findingsFor = (games: Game[]) => {
    const totals = seasonTotals(games);
    return seasonFindings(totals, seasonRates(totals));
  };

  it("claims nothing at all on a thin sample", () => {
    const findings = findingsFor([game({ outs: 9, strikes: 10, pitches: 100 })]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("note");
    expect(findings[0].text).toMatch(new RegExp(`${THIN_SAMPLE_INNINGS} or so`));
  });

  it("says nothing whatsoever with no games", () => {
    expect(findingsFor([])).toEqual([]);
  });

  it("flags a strike rate under the coaching mark once the sample is real", () => {
    const findings = findingsFor([
      game({ outs: 21, pitches: 100, strikes: 50 }),
      game({ outs: 21, pitches: 100, strikes: 50 }),
    ]);
    expect(findings.some((f) => f.text.includes(`under the ${STRIKE_PCT_MARK}% mark`))).toBe(true);
  });

  it("credits first-pitch strikes when they clear the mark", () => {
    const findings = findingsFor([
      game({ outs: 21, battersFaced: 25, firstPitchStrikes: 20 }),
      game({ outs: 21, battersFaced: 25, firstPitchStrikes: 20 }),
    ]);
    expect(
      findings.some((f) => f.severity === "note" && f.text.includes(`clear of the ${FIRST_PITCH_STRIKE_MARK}%`))
    ).toBe(true);
  });

  it("flags an inning that costs too many pitches", () => {
    const findings = findingsFor([
      game({ outs: 15, pitches: 120, strikes: 90, battersFaced: 25, firstPitchStrikes: 20 }),
      game({ outs: 15, pitches: 120, strikes: 90, battersFaced: 25, firstPitchStrikes: 20 }),
    ]);
    expect(findings.some((f) => f.text.includes("pitches an inning"))).toBe(true);
  });
});
