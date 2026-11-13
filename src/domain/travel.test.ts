import { describe, expect, it } from "vitest";
import { readPlayerEvents, withPlayerEvents } from "./playerEvents";
import { asPositionPlayer } from "./positionPlayer";
import { weekPlan } from "./programmeSessions";
import { travelSession, tripDaysFromEvents } from "./travel";

const events = [
  {
    id: "trip1",
    title: "Vietnam & Cambodia",
    games: [
      { date: "2026-11-19", label: "Fansipan: 600 steps", trip: "move" },
      { date: "2026-11-17", label: "Hanoi city tour", trip: "light" },
      { date: "2026-11-23", label: "Free morning in Da Nang", trip: "full" },
      { date: "2026-11-20", label: "not a load", trip: "sprint" },
    ],
  },
  { id: "apbc", title: "APBC", games: [{ date: "2026-11-12", label: "vs Korea" }] },
];

describe("training on a trip", () => {
  it("reads trip days out of sent events, in date order, and ignores games", () => {
    expect(tripDaysFromEvents(events).map((day) => [day.date, day.load])).toEqual([
      ["2026-11-17", "light"],
      ["2026-11-19", "move"],
      ["2026-11-23", "full"],
    ]);
  });

  it("does not turn a trip day into a game", () => {
    const merged = withPlayerEvents([], readPlayerEvents(events));
    expect(merged.fixtures.map((fixture) => (fixture as { date: string }).date)).toEqual(["2026-11-12"]);
  });

  it("scales the session to the day, with nothing that needs a gym", () => {
    const [light, move, full] = tripDaysFromEvents(events).map((day) => travelSession(weekPlan(19), 0, day));
    expect(move.tasks.map((task) => task.name)).toEqual(["Travel mobility flow"]);
    expect(light.tasks.map((task) => task.name)).toEqual(["Travel mobility flow", "Band arm care"]);
    expect(full.tasks.map((task) => task.stageTitle)).toContain("Room Strength");
    expect(full.tasks.at(-1)?.name).toBe("Towel drill");
    expect(JSON.stringify(full)).not.toMatch(/glove|a ball\b|catch/i);
    expect(JSON.stringify(full)).not.toMatch(/barbell|trap bar|bullpen/i);
    expect(new Set(full.tasks.map((task) => task.id)).size).toBe(full.tasks.length);
  });

  it("drops to mobility on a red check-in, and still works for a position player", () => {
    const full = tripDaysFromEvents(events)[2];
    expect(travelSession(weekPlan(19), 0, full, true).tasks).toHaveLength(1);
    expect(asPositionPlayer(travelSession(weekPlan(19), 0, full)).tasks.length).toBeGreaterThan(3);
  });
});
