import { describe, expect, it } from "vitest";
import { gblTeam, hits, pitches, profileComplete, readAthleteProfile, winterClubOf } from "./athleteProfile";
import { builtInFixturesFor } from "./fixtures";
import { IsoDate } from "./state";

describe("athlete profile", () => {
  it("reads the original athlete's older field names", () => {
    expect(readAthleteProfile({ name: "Dylan Sippel", summerTeam: "Coomera Cubs", throwingHand: "Right" })).toMatchObject({
      name: "Dylan Sippel",
      team: "Coomera Cubs",
      throws: "Right",
    });
  });

  it("is incomplete until the player type is answered", () => {
    expect(profileComplete({ name: "Dylan Sippel", summerTeam: "Coomera Cubs" })).toBe(false);
    expect(profileComplete({ name: "Dylan Sippel", team: "Coomera Cubs", playerType: "pitcher" })).toBe(false);
    expect(
      profileComplete({
        name: "Dylan Sippel",
        team: "Coomera Cubs",
        playerType: "pitcher",
        schedule: { training: [1, 3], games: [4, 6], winterGames: [5] },
      })
    ).toBe(true);
    expect(profileComplete({ name: "Ty Iddon", team: "Coomera Cubs", playerType: "batter" })).toBe(false);
  });

  it("knows the GBL clubs whatever the case", () => {
    expect(gblTeam("redlands rays")?.ballclubzId).toBe("9970860");
    expect(gblTeam("Gold Coast Sharks")).toBeNull();
  });

  it("says who pitches and who hits", () => {
    expect([pitches("pitcher"), hits("pitcher")]).toEqual([true, false]);
    expect([pitches("two-way"), hits("two-way")]).toEqual([true, true]);
    expect([pitches("position"), hits("position")]).toEqual([false, true]);
  });

  it("keeps Norths as the original athlete's winter club, and only theirs", () => {
    expect(winterClubOf({ name: "Dylan Sippel" })).toBe("Norths");
    expect(winterClubOf({ team: "Coomera Cubs", playerType: "position" })).toBeUndefined();
    expect(winterClubOf({ team: "Coomera Cubs", playerType: "pitcher", winterTeam: "Norths" })).toBe("Norths");
    expect(winterClubOf({ team: "Redlands Rays" })).toBeUndefined();
  });
});

describe("fixtures by team", () => {
  it("gives a Cubs player the Cubs draw, without Norths unless they play there", () => {
    const ty = builtInFixturesFor("Coomera Cubs", undefined);
    expect(ty.length).toBe(36);
    expect(ty.every((fixture) => fixture.team === "Coomera Cubs")).toBe(true);
    const dylan = builtInFixturesFor("Coomera Cubs", "Norths");
    expect(dylan.some((fixture) => fixture.team === "Norths")).toBe(true);
  });

  it("gives another club's player that club's draw", () => {
    const rays = builtInFixturesFor("Redlands Rays", undefined, [
      { date: "2026-11-06" as IsoDate, opponent: "Wests Bulldogs", home: true },
    ]);
    expect(rays).toEqual([
      expect.objectContaining({ date: "2026-11-06", team: "Redlands Rays", label: "vs Wests Bulldogs (Friday)" }),
    ]);
  });

  it("gives a team outside the GBL nothing built in", () => {
    expect(builtInFixturesFor("Brisbane North", undefined)).toEqual([]);
  });
});
