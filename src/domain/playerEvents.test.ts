import { describe, expect, it } from "vitest";
import { readAthleteFixtures } from "./fixtures";
import { parseSchedule, readPlayerEvents, withPlayerEvents } from "./playerEvents";

describe("parseSchedule", () => {
  it("reads the APBC 2026 schedule as it would be pasted", () => {
    const { games, skipped } = parseSchedule(
      ["2026-11-12 vs Korea · 12:00 Tokyo", "13 Nov 2026 vs Chinese Taipei · 12:00 Tokyo", "Sat 14 Nov vs Japan 12:00", "15/11/2026 Final or 3rd place (TBC)", "", "bye"].join("\n"),
      2026
    );
    expect(games).toEqual([
      { date: "2026-11-12", label: "vs Korea · 12:00 Tokyo" },
      { date: "2026-11-13", label: "vs Chinese Taipei · 12:00 Tokyo" },
      { date: "2026-11-14", label: "vs Japan 12:00" },
      { date: "2026-11-15", label: "Final or 3rd place (TBC)" },
    ]);
    expect(skipped).toEqual(["bye"]);
  });

  it("refuses dates that do not exist", () => {
    expect(parseSchedule("31/11/2026 vs Nobody").games).toEqual([]);
  });
});

describe("withPlayerEvents", () => {
  const events = readPlayerEvents([
    { id: "e1", title: "APBC 2026", games: [{ date: "2026-11-12", label: "vs Korea" }, { date: "nope" }], createdAt: "x" },
    { title: "missing id" },
  ]);

  it("adds each sent game once, as the player's own fixture", () => {
    const first = withPlayerEvents([{ id: "athlete-2026-11-07", date: "2026-11-07", label: "Club game" }], events);
    expect(first.added).toBe(1);
    const again = withPlayerEvents(first.fixtures, events);
    expect(again.added).toBe(0);
    const fixtures = readAthleteFixtures(again.fixtures);
    expect(fixtures.map((f) => [f.date, f.label])).toEqual([
      ["2026-11-07", "Club game"],
      ["2026-11-12", "APBC 2026: vs Korea"],
    ]);
    // Taken back by the owner: gone, and the player's own game stays.
    const withdrawn = withPlayerEvents(again.fixtures, []);
    expect(withdrawn.removed).toBe(1);
    expect(readAthleteFixtures(withdrawn.fixtures).map((f) => f.label)).toEqual(["Club game"]);
  });
});

describe("pitching lines from sent games", () => {
  const line = { opponent: "Korea", side: "away", outs: 5, pitches: 31, strikes: 20, battersFaced: 8, hits: 1, runs: 0, earnedRuns: 0, walks: 1, strikeouts: 3, hitBatters: 0 };
  const events = (outing: unknown) =>
    readPlayerEvents([{ id: "e1", title: "APBC 2026", games: [{ date: "2026-11-12", label: "vs Korea", outing }] }]);

  it("goes into the game log once, and is refreshed when corrected", async () => {
    const { withEventOutings } = await import("./playerEvents");
    const first = withEventOutings([], events(line));
    expect(first.added).toBe(1);
    expect(first.games[0]).toMatchObject({ id: "event-e1-0", competition: "APBC 2026", outs: 5, pitches: 31, strikeouts: 3 });
    expect(withEventOutings(first.games, events(line)).added).toBe(0);
    const corrected = withEventOutings(first.games, events({ ...line, pitches: 33 }));
    expect(corrected.updated).toBe(1);
    expect(corrected.games[0].pitches).toBe(33);
  });

  it("leaves a game the player logged themselves", async () => {
    const { withEventOutings } = await import("./playerEvents");
    const own = { id: "own", date: "2026-11-12", opponent: "Korea", side: "away", outs: 6 } as never;
    expect(withEventOutings([own], events(line)).added).toBe(0);
  });

  it("drops a line that does not hold together, and lines from a withdrawn event", async () => {
    const { withEventOutings } = await import("./playerEvents");
    expect(events({ ...line, strikes: 40 })[0].games[0].outing).toBeUndefined();
    expect(events({ ...line, outs: undefined })[0].games[0].outing).toBeUndefined();
    const first = withEventOutings([], events(line));
    expect(withEventOutings(first.games, []).removed).toBe(1);
  });
});
