import { describe, expect, it } from "vitest";
import { coachAction, isCoachSignIn, parseCoachingSession, readCoachAccess } from "./coach";

describe("parseCoachingSession", () => {
  it("reads a stored session", () => {
    const raw = JSON.stringify({ coachId: "coach1", athleteId: "athlete1", athleteName: " Luke " });
    expect(parseCoachingSession(raw)).toEqual({ coachId: "coach1", athleteId: "athlete1", athleteName: "Luke" });
  });

  it("rejects anything malformed", () => {
    expect(parseCoachingSession(null)).toBeNull();
    expect(parseCoachingSession("not json")).toBeNull();
    expect(parseCoachingSession(JSON.stringify({ coachId: "a" }))).toBeNull();
    expect(parseCoachingSession(JSON.stringify({ coachId: "a", athleteId: "a" }))).toBeNull();
  });

  it("names an unnamed athlete", () => {
    expect(parseCoachingSession(JSON.stringify({ coachId: "a", athleteId: "b" }))?.athleteName).toBe("Athlete");
  });
});

describe("isCoachSignIn", () => {
  const session = { coachId: "coach1", athleteId: "athlete1", athleteName: "Luke" };
  it("recognises the coach's own sign-in while coaching", () => {
    expect(isCoachSignIn(session, "coach1")).toBe(true);
  });
  it("treats anyone else, or no coaching, as a normal sign-in", () => {
    expect(isCoachSignIn(session, "someone")).toBe(false);
    expect(isCoachSignIn(null, "coach1")).toBe(false);
  });
});

describe("access", () => {
  it("only knows three states", () => {
    expect(readCoachAccess("active")).toBe("active");
    expect(readCoachAccess("pending")).toBe("pending");
    expect(readCoachAccess("granted")).toBe("none");
    expect(readCoachAccess(undefined)).toBe("none");
  });
  it("maps access to the coach's next step", () => {
    expect(coachAction("none")).toBe("ask");
    expect(coachAction("pending")).toBe("waiting");
    expect(coachAction("active")).toBe("open");
  });
});

import { athleteSummary, summaryLine } from "./coach";

describe("an athlete at a glance", () => {
  const state = {
    profile: { team: "Redlands Rays", baseline: { metrics: {} } },
    pre: { "2026-11-10": { score: 70 }, "2026-11-12": { score: 82.4, planLevel: "full" } },
    completedTasks: { "2026-11-12": ["a", "b", "c"] },
    games: [{ date: "2026-11-08", opponent: "Cubs", pitches: 64 }, { date: "2026-11-01", opponent: "Hawks", pitches: 40 }],
  };
  it("reads today's check-in, the week and the last game", () => {
    const summary = athleteSummary(state, "2026-11-12");
    expect(summary).toMatchObject({ team: "Redlands Rays", readiness: { score: 82, level: "full" }, checkInsThisWeek: 2, tasksDoneToday: 3, hasBaseline: true });
    expect(summaryLine(summary, "2026-11-12")).toBe(
      "Checked in today · readiness 82 (full) · 2/7 check-ins this week · 3 tasks done today · last game 8 Nov, 64 pitches"
    );
  });
  it("says when nothing has been done", () => {
    expect(summaryLine(athleteSummary({}, "2026-11-12"), "2026-11-12")).toBe("Never checked in · 0/7 check-ins this week · no baseline testing yet");
  });
});
