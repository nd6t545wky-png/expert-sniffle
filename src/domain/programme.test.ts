import { describe, expect, it } from "vitest";
import {
  PROGRAMME_PHASES,
  PROGRAMME_WEEKS,
  phaseById,
  phaseForWeek,
  phaseLength,
  weekWithinPhase,
  weeksInPhase,
  isProgrammeWeek,
} from "./programme";

describe("programme structure", () => {
  it("covers exactly 52 weeks with no gaps or overlaps", () => {
    const covered = PROGRAMME_PHASES.flatMap(weeksInPhase);
    expect(covered).toHaveLength(PROGRAMME_WEEKS);
    expect(new Set(covered).size).toBe(PROGRAMME_WEEKS);
    expect(covered.slice().sort((a, b) => a - b)).toEqual(
      Array.from({ length: PROGRAMME_WEEKS }, (_, index) => index + 1)
    );
  });

  it("is contiguous — each phase starts the week after the previous ends", () => {
    for (let index = 1; index < PROGRAMME_PHASES.length; index += 1) {
      expect(PROGRAMME_PHASES[index].startWeek).toBe(PROGRAMME_PHASES[index - 1].endWeek + 1);
    }
  });

  it("matches the confirmed phase lengths", () => {
    expect(PROGRAMME_PHASES.map((phase) => [phase.name, phaseLength(phase)])).toEqual([
      ["Winter Ball", 12],
      ["Transition", 2],
      ["Velocity Development", 12],
      ["Preseason", 10],
      ["Summer Season", 16],
    ]);
  });
});

describe("phaseForWeek — boundaries", () => {
  // Every documented boundary, checked on both sides of the seam.
  const boundaries: [number, string][] = [
    [1, "Winter Ball"],
    [12, "Winter Ball"],
    [13, "Transition"],
    [14, "Transition"],
    [15, "Velocity Development"],
    [26, "Velocity Development"],
    [27, "Preseason"],
    [36, "Preseason"],
    [37, "Summer Season"],
    [52, "Summer Season"],
  ];

  it.each(boundaries)("week %i is %s", (week, name) => {
    expect(phaseForWeek(week)?.name).toBe(name);
  });

  it("resolves a phase for every week in 1..52", () => {
    for (let week = 1; week <= PROGRAMME_WEEKS; week += 1) {
      expect(phaseForWeek(week), `week ${week}`).not.toBeNull();
    }
  });
});

describe("phaseForWeek — out of range and invalid input", () => {
  it.each([0, -1, 53, 100])("returns null for week %i", (week) => {
    expect(phaseForWeek(week)).toBeNull();
  });

  it.each([1.5, NaN, Infinity])("returns null for non-integer %s", (week) => {
    expect(phaseForWeek(week)).toBeNull();
  });

  it("rejects the same values via isProgrammeWeek", () => {
    expect(isProgrammeWeek(0)).toBe(false);
    expect(isProgrammeWeek(53)).toBe(false);
    expect(isProgrammeWeek(1.5)).toBe(false);
    expect(isProgrammeWeek(1)).toBe(true);
    expect(isProgrammeWeek(52)).toBe(true);
  });
});

describe("weekWithinPhase", () => {
  it("is 1 on the first week of each phase", () => {
    for (const phase of PROGRAMME_PHASES) {
      expect(weekWithinPhase(phase.startWeek), phase.name).toBe(1);
    }
  });

  it("equals the phase length on the last week of each phase", () => {
    for (const phase of PROGRAMME_PHASES) {
      expect(weekWithinPhase(phase.endWeek), phase.name).toBe(phaseLength(phase));
    }
  });

  it("counts from the phase start, not the year start", () => {
    expect(weekWithinPhase(15)).toBe(1); // first week of Velocity Development
    expect(weekWithinPhase(20)).toBe(6);
    expect(weekWithinPhase(37)).toBe(1); // first week of Summer Season
  });

  it("returns null outside the programme", () => {
    expect(weekWithinPhase(0)).toBeNull();
    expect(weekWithinPhase(53)).toBeNull();
  });
});

describe("phaseById", () => {
  it("round-trips every phase id", () => {
    for (const phase of PROGRAMME_PHASES) {
      expect(phaseById(phase.id)).toEqual(phase);
    }
  });
});
