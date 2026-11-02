import { describe, expect, it } from "vitest";
import schedule from "./fixtures/ablSchedule.json";
import { LEAGUES, leagueTeam, mlbStatsScheduleUrl, parseMlbStatsSchedule } from "./leagues";

describe("leagues", () => {
  it("finds a team's league", () => {
    expect(leagueTeam("Brisbane Bandits")?.league.id).toBe("abl");
    expect(leagueTeam("coomera cubs")?.league.id).toBe("gbl");
    expect(leagueTeam("Logan Rays")).toBeNull();
  });

  it("gives every team a unique name across leagues", () => {
    const names = LEAGUES.flatMap((league) => league.teams.map((team) => team.name.toLowerCase()));
    expect(new Set(names).size).toBe(names.length);
  });

  it("builds the Stats API request", () => {
    const abl = LEAGUES.find((league) => league.id === "abl")!;
    if (abl.source.kind !== "mlb-stats") throw new Error("ABL reads the Stats API");
    expect(mlbStatsScheduleUrl(abl.source, "4065", "2026-11-01" as never, "2027-03-01" as never)).toBe(
      "https://statsapi.mlb.com/api/v1/schedule?sportId=17&leagueId=595&teamId=4065&startDate=2026-11-01&endDate=2027-03-01"
    );
  });
});

describe("parseMlbStatsSchedule", () => {
  const bandits = leagueTeam("Brisbane Bandits")!.team;

  it("reads the Bandits' opening series in Adelaide, doubleheader included", () => {
    const games = parseMlbStatsSchedule(schedule, bandits);
    expect(games.slice(0, 4).map((game) => [game.date, game.opponent, game.home])).toEqual([
      ["2026-11-19", "Adelaide Giants", false],
      ["2026-11-20", "Adelaide Giants", false],
      ["2026-11-21", "Adelaide Giants", false],
      ["2026-11-21", "Adelaide Giants", false],
    ]);
    // 08:30 UTC is 6:30 pm in Brisbane, the time zone the app reads it in for the Bandits.
    expect(games[0].detail).toBe("6:30 pm");
  });

  it("shows a result once a game is final, and drops a postponement", () => {
    const body = {
      dates: [
        {
          games: [
            {
              officialDate: "2026-11-26",
              status: { abstractGameState: "Final", detailedState: "Final" },
              teams: { away: { team: { id: 4068, name: "Perth Heat" }, score: 3 }, home: { team: { id: 4065, name: "Brisbane Bandits" }, score: 5 } },
            },
            {
              officialDate: "2026-11-27",
              status: { abstractGameState: "Preview", detailedState: "Postponed" },
              teams: { away: { team: { id: 4068, name: "Perth Heat" } }, home: { team: { id: 4065, name: "Brisbane Bandits" } } },
            },
          ],
        },
      ],
    };
    expect(parseMlbStatsSchedule(body, bandits)).toEqual([
      { date: "2026-11-26", opponent: "Perth Heat", home: true, detail: "W 5–3" },
    ]);
  });

  it("reads nothing out of a broken response", () => {
    expect(parseMlbStatsSchedule(null, bandits)).toEqual([]);
    expect(parseMlbStatsSchedule({ dates: "nope" }, bandits)).toEqual([]);
  });
});
