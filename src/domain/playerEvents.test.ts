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
