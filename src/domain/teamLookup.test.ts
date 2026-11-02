import { describe, expect, it } from "vitest";
import { parseTeamLookup, teamLookupPrompt } from "./teamLookup";

const NOW = new Date("2026-11-02T00:00:00Z");

describe("parseTeamLookup", () => {
  it("keeps what holds up", () => {
    const found = parseTeamLookup(
      "Logan Rays",
      {
        league: "Brisbane Metro",
        colours: { primary: "#1E3A8A", secondary: "#F59E0B" },
        logoUrl: "https://loganrays.example/logo.png",
        sourceUrl: "https://league.example/draw",
        fixtures: [
          { date: "2026-11-14", opponent: "Wynnum", home: true, detail: "1:00 pm" },
          { date: "2026-11-07", opponent: "Sharks", home: false },
        ],
      },
      NOW
    );
    expect(found.colours).toEqual({ primary: "#1e3a8a", secondary: "#f59e0b" });
    expect(found.logoUrl).toBe("https://loganrays.example/logo.png");
    expect(found.fixtures.map((game) => game.date)).toEqual(["2026-11-07", "2026-11-14"]);
    expect(found.fixtures[1]).toEqual({ date: "2026-11-14", opponent: "Wynnum", home: true, detail: "1:00 pm" });
  });

  it("drops anything that does not", () => {
    const found = parseTeamLookup(
      "Logan Rays",
      {
        colours: { primary: "navy", secondary: "#fff" },
        logoUrl: "javascript:alert(1)",
        sourceUrl: "not a url",
        fixtures: [{ date: "next Saturday" }, { date: "2031-01-01" }, { date: "2026-02-30" }, "nope"],
      },
      NOW
    );
    expect(found.colours).toBeNull();
    expect(found.logoUrl).toBeNull();
    expect(found.sourceUrl).toBeNull();
    expect(found.fixtures).toEqual([]);
  });

  it("survives a reply that is not an object", () => {
    expect(parseTeamLookup("X", null, NOW)).toEqual({ team: "X", colours: null, logoUrl: null, fixtures: [], sourceUrl: null, league: null });
  });

  it("asks for the team by name, and not to invent anything", () => {
    const prompt = teamLookupPrompt("Logan Rays", "Queensland");
    expect(prompt).toMatch(/"Logan Rays" \(Queensland\)/);
    expect(prompt).toMatch(/never invent/);
  });
});
