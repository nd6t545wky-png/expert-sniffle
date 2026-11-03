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
