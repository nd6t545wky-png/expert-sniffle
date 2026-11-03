import { describe, expect, it } from "vitest";
import {
  PlateAppearance,
  avgFormat,
  fieldZone,
  gameLine,
  hitStats,
  pctFormat,
  qabReasons,
  readHittingGames,
  tendency,
} from "./hitting";
import { IsoDate } from "./state";

const pa = (res: string, extra: Partial<PlateAppearance> = {}): PlateAppearance => ({ res, rbi: 0, ...extra });

describe("hitting stats - the BQ app's formulas", () => {
  const game = [pa("1B", { hh: 1 }), pa("2B", { rbi: 2, hh: 1 }), pa("KS"), pa("BB"), pa("GO", { hh: 0, adv: 1 }), pa("SF", { rbi: 1 })];

  it("counts the line", () => {
    const t = hitStats(game);
    expect([t.pa, t.ab, t.h, t.tb, t.bb, t.k, t.sf, t.rbi, t.xbh]).toEqual([6, 4, 2, 3, 1, 1, 1, 3, 1]);
    expect(t.avg).toBeCloseTo(0.5);
    expect(t.obp).toBeCloseTo(3 / 6); // (2 + 1) / (4 + 1 + 0 + 1)
    expect(t.slg).toBeCloseTo(0.75);
    expect(t.ops).toBeCloseTo(1.25);
    expect(t.hardp).toBeCloseTo(2 / 3);
  });

  it("applies the quality at-bat rule", () => {
    expect(qabReasons(pa("1B"))).toEqual(["hit"]);
    expect(qabReasons(pa("GO", { adv: 1 }))).toEqual(["moved the runner"]);
    expect(qabReasons(pa("SH"))).toEqual(["sacrifice"]);
    expect(qabReasons(pa("KS", { two: 1 }))).toEqual(["battled with 2 strikes"]);
    expect(qabReasons(pa("PO"))).toEqual([]);
    expect(hitStats(game).qab).toBe(5); // all but the strikeout
  });

  it("writes the game line the way the BQ app does", () => {
    expect(gameLine(game)).toBe("2-for-4, 2B, BB, K · 3 RBI · QAB 5/6");
  });

  it("formats averages and percentages", () => {
    expect(avgFormat(1 / 3)).toBe(".333");
    expect(avgFormat(1)).toBe("1.000");
    expect(avgFormat(null)).toBe("–");
    expect(pctFormat(0.456)).toBe("46%");
  });

  it("zones the field", () => {
    expect(fieldZone(0.5, 0.2)).toBe("CF");
    expect(fieldZone(0.5, 0.8)).toBe("Up the middle");
    expect(fieldZone(0.05, 0.95)).toBe("Foul");
  });
});

describe("tendency", () => {
  it("waits for five games", () => {
    expect(tendency([], "Right")).toBeNull();
  });

  it("calls a pull hitter", () => {
    // Left of centre, deep: a right-handed batter's pull side.
    const pulled = pa("FO", { x: 0.25, y: 0.3, zone: "LF" });
    const games = Array.from({ length: 5 }, (_, i) => ({ date: `2026-10-0${i + 1}` as IsoDate, pas: [pulled, pulled] }));
    expect(tendency(games, "Right")?.[0]).toMatch(/^Pull hitter/);
  });
});

describe("reading stored games", () => {
  it("keeps valid games and drops unknown results", () => {
    const games = readHittingGames({
      "2026-11-01": { opp: "Redcliffe", pas: [{ res: "1B", rbi: 0 }, { res: "XX", rbi: 0 }] },
      bad: { pas: [] },
    });
    expect(games).toHaveLength(1);
    expect(games[0].pas).toHaveLength(1);
  });
});
