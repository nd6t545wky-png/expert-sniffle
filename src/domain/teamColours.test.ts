import { describe, expect, it } from "vitest";
import { contrast, inkOn, mix, readTeamColours, teamThemeVars } from "./teamColours";

describe("team colours", () => {
  it("reads the colours stored on the profile, else the team's known ones", () => {
    expect(readTeamColours({ teamColours: { primary: "#003DA5", secondary: "#c8102e" } })).toEqual({
      primary: "#003da5",
      secondary: "#c8102e",
    });
    expect(readTeamColours({}, "Coomera Cubs")).toEqual({ primary: "#3a2268", secondary: "#24909f" });
    expect(readTeamColours({ teamColours: { primary: "red" } }, "Logan Rays")).toBeNull();
  });

  it("mixes colours", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("puts readable ink on the team colour", () => {
    expect(inkOn("#3a2268")).toBe("#ffffff");
    expect(inkOn("#ffd100")).toBe("#0b0b0c");
  });

  it("keeps text in the team colour readable in both modes, however light or dark the colour", () => {
    for (const primary of ["#ffd100", "#003da5", "#0b0b0c", "#f2f2f2", "#c8102e"]) {
      const vars = teamThemeVars({ primary, secondary: "#24909f" });
      expect(contrast(vars["--tc-accent-light"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(vars["--tc-accent-dark"], "#0b0b0c")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(vars["--tc-fill"], vars["--tc-on-fill"])).toBeGreaterThanOrEqual(3);
    }
    for (const secondary of ["#f2b33d", "#ffd100", "#0b0b0c", "#24909f"]) {
      const vars = teamThemeVars({ primary: "#003da5", secondary });
      expect(contrast(vars["--tc-secondary-light"], "#ffffff")).toBeGreaterThanOrEqual(3);
      expect(contrast(vars["--tc-secondary-dark"], "#0b0b0c")).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("league teams", () => {
  it("has colours for every GBL and ABL team", async () => {
    const { LEAGUES } = await import("./leagues");
    const { KNOWN_TEAM_COLOURS } = await import("./teamColours");
    for (const league of LEAGUES) for (const team of league.teams) expect(KNOWN_TEAM_COLOURS[team.name], team.name).toBeTruthy();
  });
});
