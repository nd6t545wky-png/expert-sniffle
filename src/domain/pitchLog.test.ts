import { describe, expect, it } from "vitest";
import {
  allPitches,
  detectSource,
  normalisePitchType,
  parsePitchCsv,
  pitchTypeSummaries,
  readPitches,
  splitCsvLine,
  toIsoDate,
  topVelocity,
  Pitch,
} from "./pitchLog";

const DAY = "2026-08-11";

/** Shaped like a TrackMan game export: its real column names, its order. */
const TRACKMAN = `PitchNo,Date,Pitcher,TaggedPitchType,RelSpeed,SpinRate,SpinAxis,Extension,InducedVertBreak,HorzBreak,RelHeight,RelSide
1,2026-08-09,"Sippel, Dylan",Fastball,91.4,2310,205,6.4,16.2,-8.1,5.9,-1.8
2,2026-08-09,"Sippel, Dylan",Slider,82.1,2480,120,6.3,1.4,9.7,5.8,-1.9
3,2026-08-09,"Sippel, Dylan",ChangeUp,83.6,1780,215,6.5,9.9,-12.4,5.9,-1.7`;

/** Rapsodo writes a title block above the header — the classic gotcha. */
const RAPSODO = `Rapsodo Pitching Report
Player: Dylan Sippel,,,,,
,,,,,
No,Date,Pitch Type,Velocity,Total Spin,Spin Efficiency (release),VB (trajectory),HB (trajectory),Release Height,Release Side
1,08/09/2026,FF,92.2,2340,96,17.1,-9.0,5.90,-1.80
2,08/09/2026,SL,81.9,2455,32,1.1,10.2,5.85,-1.90
3,08/09/2026,CH,84.0,1810,88,10.4,-13.1,5.88,-1.75`;

/** Pocket Radar exports speed and nothing else. */
const POCKET = `Date,Time,Speed (mph),Player,Tag
08/09/2026,15:04,88.1,Dylan,Bullpen
08/09/2026,15:05,89.4,Dylan,Bullpen
08/09/2026,15:06,90.2,Dylan,Bullpen`;

describe("splitCsvLine", () => {
  it("keeps a quoted field containing a comma in one piece", () => {
    expect(splitCsvLine('1,"Sippel, Dylan",91.4')).toEqual(["1", "Sippel, Dylan", "91.4"]);
  });

  it("handles an escaped quote", () => {
    expect(splitCsvLine('a,"say ""hi""",b')).toEqual(["a", 'say "hi"', "b"]);
  });
});

describe("normalisePitchType", () => {
  it("folds every spelling of one pitch into one name", () => {
    // Four spellings of the same pitch would otherwise be four summary rows.
    for (const alias of ["FF", "4-Seam", "four seam", "Fastball", "fb"]) {
      expect(normalisePitchType(alias)).toBe("Fastball");
    }
    expect(normalisePitchType("CH")).toBe("Changeup");
    expect(normalisePitchType("ChangeUp")).toBe("Changeup");
    expect(normalisePitchType("KC")).toBe("Curveball");
  });

  it("keeps an unrecognised label rather than discarding it", () => {
    // A coach's own tag is data.
    expect(normalisePitchType("Death Ball")).toBe("Death Ball");
  });

  it("returns nothing for an untagged pitch", () => {
    expect(normalisePitchType("")).toBe("");
  });
});

describe("toIsoDate", () => {
  it("reads ISO and US formats", () => {
    expect(toIsoDate("2026-08-09", DAY)).toBe("2026-08-09");
    expect(toIsoDate("08/09/2026", DAY)).toBe("2026-08-09");
    expect(toIsoDate("8/9/26", DAY)).toBe("2026-08-09");
  });

  it("falls back when the file carries no date", () => {
    expect(toIsoDate("", DAY)).toBe(DAY);
    expect(toIsoDate("not a date", DAY)).toBe(DAY);
  });
});

describe("detectSource", () => {
  it("names the device from its distinctive columns, not the filename", () => {
    expect(detectSource(["RelSpeed", "TaggedPitchType"])).toBe("trackman");
    expect(detectSource(["Velocity", "Total Spin", "HB (trajectory)"])).toBe("rapsodo");
    expect(detectSource(["Date", "Speed (mph)", "Player"])).toBe("pocketRadar");
  });
});

describe("parsePitchCsv — TrackMan", () => {
  const result = parsePitchCsv(TRACKMAN, DAY);

  it("recognises the device and reads every pitch", () => {
    expect(result.source).toBe("trackman");
    expect(result.pitches).toHaveLength(3);
    expect(result.skipped).toEqual([]);
  });

  it("maps its columns onto the app's fields", () => {
    const [fastball] = result.pitches;
    expect(fastball.pitchType).toBe("Fastball");
    expect(fastball.velocityMph).toBe(91.4);
    expect(fastball.spinRpm).toBe(2310);
    expect(fastball.inducedVertBreakIn).toBe(16.2);
    expect(fastball.horzBreakIn).toBe(-8.1);
    expect(fastball.extensionFt).toBe(6.4);
  });

  it("uses the row's own date, not the day it was imported", () => {
    expect(result.pitches[0].date).toBe("2026-08-09");
  });

  it("keeps a negative break, which is a direction not an error", () => {
    expect(result.pitches[0].horzBreakIn).toBeLessThan(0);
  });
});

describe("parsePitchCsv — Rapsodo", () => {
  const result = parsePitchCsv(RAPSODO, DAY);

  it("skips the title block above the header", () => {
    // Rapsodo writes a report title and a player name first; parsing line one
    // as the header is why naive importers return nothing.
    expect(result.source).toBe("rapsodo");
    expect(result.pitches).toHaveLength(3);
  });

  it("normalises its short pitch codes", () => {
    expect(result.pitches.map((pitch) => pitch.pitchType)).toEqual([
      "Fastball",
      "Slider",
      "Changeup",
    ]);
  });

  it("reads its trajectory break columns", () => {
    expect(result.pitches[0].inducedVertBreakIn).toBe(17.1);
    expect(result.pitches[0].horzBreakIn).toBe(-9);
    expect(result.pitches[0].spinEfficiencyPct).toBe(96);
  });

  it("converts its US dates", () => {
    expect(result.pitches[0].date).toBe("2026-08-09");
  });
});

describe("parsePitchCsv — Pocket Radar", () => {
  const result = parsePitchCsv(POCKET, DAY);

  it("reads a speed-only export", () => {
    expect(result.source).toBe("pocketRadar");
    expect(result.pitches).toHaveLength(3);
    expect(result.pitches.map((pitch) => pitch.velocityMph)).toEqual([88.1, 89.4, 90.2]);
  });

  it("leaves the fields it cannot know empty rather than zero", () => {
    // A zero spin rate would be a measurement claim the device never made.
    expect(result.pitches[0].spinRpm).toBeNull();
    expect(result.pitches[0].horzBreakIn).toBeNull();
  });

  it("says which fields the file did not carry", () => {
    expect(result.missingFields).toContain("spinRpm");
    expect(result.missingFields).toContain("horzBreakIn");
  });
});

describe("parsePitchCsv — bad input", () => {
  it("reports a file it cannot recognise instead of returning nothing quietly", () => {
    const result = parsePitchCsv("name,age\nDylan,26", DAY);
    expect(result.pitches).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/No recognisable column headers/);
  });

  it("names the line of every row it skipped", () => {
    const result = parsePitchCsv(`Date,Speed\n2026-08-09,\n2026-08-09,91.2`, DAY);
    expect(result.pitches).toHaveLength(1);
    expect(result.skipped).toEqual([{ line: 2, reason: "No pitch speed in this row" }]);
  });

  it("rejects an impossible speed rather than storing it", () => {
    const result = parsePitchCsv(`Date,Speed\n2026-08-09,910`, DAY);
    expect(result.pitches).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/outside a believable range/);
  });

  it("ignores a trailing summary row without calling it an error", () => {
    const result = parsePitchCsv(`Date,Speed\n2026-08-09,91.2\nAverage,`, DAY);
    expect(result.pitches).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });

  it("does not import a summary row that carries an average speed", () => {
    // Rapsodo writes "Average,,,87.4" under the pitches. Reading that as a
    // sixth pitch inflates the count and competes for the session max.
    const result = parsePitchCsv(
      `No,Date,Pitch Type,Velocity\n1,2026-08-09,FF,92.2\n2,2026-08-09,FF,91.6\nAverage,,,91.9`,
      DAY
    );
    expect(result.pitches).toHaveLength(2);
    expect(result.skipped).toEqual([]);
    expect(topVelocity(result.pitches)!.mph).toBe(92.2);
  });

  it("strips a unit a vendor wrote into the cell", () => {
    expect(parsePitchCsv(`Date,Speed\n2026-08-09,91.2 mph`, DAY).pitches[0].velocityMph).toBe(91.2);
  });

  it("survives an empty file", () => {
    expect(() => parsePitchCsv("", DAY)).not.toThrow();
  });
});

// --- Summaries ---------------------------------------------------------------

const pitch = (over: Partial<Pitch>): Pitch => ({
  id: Math.random().toString(36),
  date: DAY,
  pitchType: "Fastball",
  velocityMph: 90,
  spinRpm: null,
  spinEfficiencyPct: null,
  inducedVertBreakIn: null,
  horzBreakIn: null,
  releaseHeightFt: null,
  releaseSideFt: null,
  extensionFt: null,
  source: "manual",
  ...over,
});

describe("pitchTypeSummaries", () => {
  it("groups by pitch, busiest first", () => {
    const rows = pitchTypeSummaries([
      pitch({ velocityMph: 90 }),
      pitch({ velocityMph: 92 }),
      pitch({ pitchType: "Slider", velocityMph: 82 }),
    ]);
    expect(rows[0].pitchType).toBe("Fastball");
    expect(rows[0].count).toBe(2);
    expect(rows[0].avgVelocity).toBe(91);
    expect(rows[0].maxVelocity).toBe(92);
  });

  it("averages only the pitches that carried the field", () => {
    // A Pocket Radar pitch mixed in must not drag the average break to zero.
    const rows = pitchTypeSummaries([
      pitch({ horzBreakIn: -10 }),
      pitch({ horzBreakIn: -8 }),
      pitch({ horzBreakIn: null }),
    ]);
    expect(rows[0].avgHorzBreak).toBe(-9);
  });

  it("reports no average where nothing carried the field", () => {
    expect(pitchTypeSummaries([pitch({})])[0].avgSpin).toBeNull();
  });

  it("collects untagged pitches under one heading", () => {
    expect(pitchTypeSummaries([pitch({ pitchType: "" })])[0].pitchType).toBe("Untagged");
  });
});

describe("topVelocity", () => {
  it("finds the fastest pitch and names it", () => {
    expect(topVelocity([pitch({ velocityMph: 88 }), pitch({ pitchType: "Sinker", velocityMph: 93 })]))
      .toEqual({ mph: 93, pitchType: "Sinker" });
  });

  it("returns nothing for an empty log", () => {
    expect(topVelocity([])).toBeNull();
  });
});

describe("readPitches", () => {
  it("survives junk from storage", () => {
    expect(readPitches({ [DAY]: "nope" }, DAY)).toEqual([]);
    expect(readPitches({ [DAY]: [{ nope: 1 }] }, DAY)).toEqual([]);
  });

  it("collects every day, newest first", () => {
    const map = {
      "2026-08-09": [pitch({ velocityMph: 88 })],
      "2026-08-10": [pitch({ velocityMph: 91 })],
    };
    expect(allPitches(map)[0].velocityMph).toBe(91);
  });
});
