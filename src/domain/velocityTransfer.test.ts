/**
 * Engine or mound.
 *
 * The point of this module is that it must not answer before it can. Two of
 * the tests below are about refusing to pick a side — with one reading, or
 * with a gap in the ambiguous band, "I do not know yet" is the correct output
 * and anything more confident is a fabrication that would redirect a training
 * block.
 */

import { describe, expect, it } from "vitest";
import { velocityTransfer } from "./velocityTransfer";

const day = (mph: number, type: string) => ({ bestVelocity: mph, velocityType: type });

describe("before there is anything to compare", () => {
  it("says so when there is nothing at all", () => {
    const out = velocityTransfer({});
    expect(out.scenario).toBe("unknown");
    expect(out.gap).toBeNull();
    expect(out.headline).toMatch(/No pulldown velocity recorded/);
    expect(out.detail).toMatch(/type set to Pulldown/);
  });

  it("refuses to conclude from a mound reading alone", () => {
    const out = velocityTransfer({ "2026-08-22": day(78, "Mound") });
    expect(out.scenario).toBe("unknown");
    expect(out.mound?.mph).toBe(78);
    expect(out.pulldown).toBeNull();
  });

  it("refuses to conclude from a pulldown alone either", () => {
    const out = velocityTransfer({ "2026-08-26": day(84, "Pulldown") });
    expect(out.scenario).toBe("unknown");
    expect(out.pulldown?.mph).toBe(84);
    expect(out.headline).toMatch(/Mound velocity still needed/);
  });

  it("ignores a reading with no velocity on it", () => {
    const out = velocityTransfer({
      "2026-08-26": { bestVelocity: 0, velocityType: "Pulldown" },
      "2026-08-27": { velocityType: "Pulldown" },
    });
    expect(out.pulldown).toBeNull();
  });
});

describe("the two cases the profile describes", () => {
  it("calls a small gap an engine limit", () => {
    // The profile's own worked example: mound 78, pulldown 80–82.
    const out = velocityTransfer({
      "2026-08-22": day(78, "Mound"),
      "2026-08-26": day(81, "Pulldown"),
    });
    expect(out.scenario).toBe("engine");
    expect(out.gap).toBe(3);
    expect(out.headline).toMatch(/engine is the limit/);
    expect(out.detail).toMatch(/Mechanics stay a secondary question/);
  });

  it("calls a large gap a transfer loss", () => {
    // The profile's other example: mound 78, pulldown 88–90.
    const out = velocityTransfer({
      "2026-08-22": day(78, "Mound"),
      "2026-08-26": day(89, "Pulldown"),
    });
    expect(out.scenario).toBe("transfer");
    expect(out.gap).toBe(11);
    expect(out.headline).toMatch(/lost in transfer/);
    expect(out.detail).toMatch(/high-speed side-on video/);
  });

  it("refuses to pick a side in the band between them", () => {
    const out = velocityTransfer({
      "2026-08-22": day(78, "Mound"),
      "2026-08-26": day(84.5, "Pulldown"),
    });
    expect(out.scenario).toBe("borderline");
    expect(out.detail).toMatch(/couple more readings/);
  });
});

describe("finding the right readings", () => {
  it("takes the best of each, not the most recent", () => {
    const out = velocityTransfer({
      "2026-08-05": day(80, "Pulldown"),
      "2026-08-12": day(76, "Mound"),
      "2026-08-19": day(78, "Mound"),
      "2026-08-26": day(83, "Pulldown"),
    });
    expect(out.mound?.mph).toBe(78);
    expect(out.pulldown?.mph).toBe(83);
    expect(out.gap).toBe(5);
  });

  it("counts a game and a bullpen as mound readings", () => {
    for (const type of ["Mound", "Game fastball", "Bullpen", "Start"]) {
      const out = velocityTransfer({ "2026-08-22": day(78, type), "2026-08-26": day(81, "Pulldown") });
      expect(out.mound?.mph, type).toBe(78);
    }
  });

  it("counts run-and-gun as a pulldown", () => {
    const out = velocityTransfer({ "2026-08-22": day(78, "Mound"), "2026-08-26": day(81, "run and gun") });
    expect(out.pulldown?.mph).toBe(81);
  });

  it("ignores a type it does not recognise rather than guessing", () => {
    const out = velocityTransfer({
      "2026-08-22": day(78, "Mound"),
      "2026-08-26": day(95, "long toss"),
    });
    expect(out.pulldown).toBeNull();
    expect(out.scenario).toBe("unknown");
  });

  it("reports the date each reading came from", () => {
    const out = velocityTransfer({
      "2026-08-22": day(78, "Mound"),
      "2026-08-26": day(81, "Pulldown"),
    });
    expect(out.mound?.on).toBe("2026-08-22");
    expect(out.pulldown?.on).toBe("2026-08-26");
  });

  it("survives junk in stored state", () => {
    const out = velocityTransfer({
      a: undefined,
      b: { bestVelocity: "fast", velocityType: "Pulldown" } as never,
      c: { bestVelocity: NaN, velocityType: "Mound" } as never,
    });
    expect(out.scenario).toBe("unknown");
  });
});
