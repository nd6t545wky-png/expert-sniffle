/**
 * Blood work.
 *
 * Two things in this module can do real harm if they are wrong, and most of
 * what follows guards them. The first is units: every range here is SI,
 * because the athlete tests in Australia, and a testosterone of 15 is
 * mid-range in nmol/L and profoundly low in ng/dL. The second is the line the
 * page must not cross — it reports numbers against the range printed on the
 * athlete's own report, and it never explains one.
 */

import { describe, expect, it } from "vitest";
import {
  BloodPanel,
  GROUP_LABELS,
  MARKERS,
  MarkerGroup,
  describeContext,
  drawContext,
  flagFor,
  formatRange,
  formatValue,
  needsReview,
  rangeFor,
  readPanel,
  readPanels,
} from "./bloods";

const byId = new Map(MARKERS.map((marker) => [marker.id, marker]));
const marker = (id: string) => byId.get(id)!;

const panel = (date: string, results: BloodPanel["results"]): BloodPanel => ({ date, results });

describe("the marker table", () => {
  it("gives every marker a unit, a group and a reason it is there", () => {
    for (const item of MARKERS) {
      expect(item.unit.length, item.id).toBeGreaterThan(0);
      expect(GROUP_LABELS[item.group], item.id).toBeTruthy();
      expect(item.note.length, item.id).toBeGreaterThan(30);
      expect(item.places, item.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("has no duplicate ids", () => {
    expect(new Set(MARKERS.map((item) => item.id)).size).toBe(MARKERS.length);
  });

  it("covers every group it declares", () => {
    const groups = new Set(MARKERS.map((item) => item.group));
    for (const group of Object.keys(GROUP_LABELS) as MarkerGroup[]) {
      expect(groups.has(group), group).toBe(true);
    }
  });

  it("reads in SI, the way an Australian report does", () => {
    // The single most dangerous mistake available here is a US reference range
    // pasted onto an Australian report. These four are the ones where the two
    // conventions differ by orders of magnitude.
    expect(marker("testosterone").unit).toBe("nmol/L");
    expect(marker("testosterone").typical.high!).toBeLessThan(40);
    expect(marker("glucose").unit).toBe("mmol/L");
    expect(marker("glucose").typical.high!).toBeLessThan(10);
    expect(marker("vitaminD").unit).toBe("nmol/L");
    expect(marker("vitaminD").typical.low!).toBeGreaterThan(25);
    expect(marker("creatinine").unit).toBe("µmol/L");
  });

  it("keeps every typical range the right way round", () => {
    for (const item of MARKERS) {
      if (item.typical.low === null || item.typical.high === null) continue;
      expect(item.typical.low, item.id).toBeLessThan(item.typical.high);
    }
  });

  it("marks the ones that run high in a trained athlete", () => {
    for (const id of ["ck", "urea", "creatinine"]) {
      expect(marker(id).expectedToVary, id).toBe(true);
    }
    expect(marker("haemoglobin").expectedToVary).toBeUndefined();
    expect(marker("ferritin").expectedToVary).toBeUndefined();
  });
});

describe("reading panels out of stored state", () => {
  it("keeps a well-formed panel", () => {
    const read = readPanels([{ date: "2026-08-20", lab: "QML", results: { ferritin: { value: 64 } } }]);
    expect(read).toHaveLength(1);
    expect(read[0].lab).toBe("QML");
    expect(read[0].results.ferritin.value).toBe(64);
  });

  it("keeps the range printed on the report alongside the value", () => {
    const read = readPanels([
      { date: "2026-08-20", results: { ferritin: { value: 64, low: 20, high: 320 } } },
    ]);
    expect(read[0].results.ferritin).toEqual({ value: 64, low: 20, high: 320 });
  });

  it("drops zeroes, which are emptied inputs rather than results", () => {
    const read = readPanels([{ date: "2026-08-20", results: { ferritin: { value: 0 }, ck: { value: 320 } } }]);
    expect(read[0].results.ferritin).toBeUndefined();
    expect(read[0].results.ck.value).toBe(320);
  });

  it("drops markers it does not know, and panels with nothing left", () => {
    expect(readPanels([{ date: "2026-08-20", results: { unobtainium: { value: 5 } } }])).toEqual([]);
    expect(readPanels([{ date: "whenever", results: { ck: { value: 300 } } }])).toEqual([]);
    expect(readPanels("not an array")).toEqual([]);
    expect(readPanels(undefined)).toEqual([]);
    expect(readPanels([null, 7, { date: "2026-08-20" }])).toEqual([]);
  });

  it("returns newest first, one panel per date", () => {
    const read = readPanels([
      { date: "2026-02-10", results: { ck: { value: 210 } } },
      { date: "2026-08-20", results: { ck: { value: 300 } } },
      { date: "2026-08-20", results: { ck: { value: 320 } } },
    ]);
    expect(read.map((item) => item.date)).toEqual(["2026-08-20", "2026-02-10"]);
    // A second entry on the same date is a correction to a mistyped result.
    expect(read[0].results.ck.value).toBe(320);
  });
});

describe("the range a result is judged against", () => {
  it("prefers the range printed on the athlete's own report", () => {
    const range = rangeFor(marker("ferritin"), { value: 64, low: 20, high: 320 });
    expect(range).toEqual({ low: 20, high: 320, ownRange: true });
  });

  it("falls back to a typical range only until that is entered", () => {
    const range = rangeFor(marker("ferritin"), { value: 64 });
    expect(range.ownRange).toBe(false);
    expect(range.low).toBe(marker("ferritin").typical.low);
  });

  it("honours a one-sided range from the report", () => {
    // Plenty of reports print only an upper limit — "< 5.0" for CRP.
    const range = rangeFor(marker("hsCrp"), { value: 1.2, high: 5 });
    expect(range).toEqual({ low: null, high: 5, ownRange: true });
    expect(formatRange({ marker: marker("hsCrp"), ...range })).toBe("< 5.0");
  });
});

describe("flagging", () => {
  it("says in range when it is", () => {
    expect(flagFor(marker("ferritin"), { value: 64 })).toBe("in-range");
  });

  it("names which side it fell off", () => {
    expect(flagFor(marker("ferritin"), { value: 8 })).toBe("below");
    expect(flagFor(marker("ferritin"), { value: 900 })).toBe("above");
  });

  it("judges against the printed range, not the typical one", () => {
    // 25 is below the built-in 30 but inside a lab that prints 20–320.
    expect(flagFor(marker("ferritin"), { value: 25 })).toBe("below");
    expect(flagFor(marker("ferritin"), { value: 25, low: 20, high: 320 })).toBe("in-range");
  });

  it("does not cry wolf over a post-session creatine kinase", () => {
    // A CK of 900 two days after a start is unremarkable. Flagging it red
    // alongside a genuinely low ferritin teaches the athlete to skip red.
    expect(flagFor(marker("ck"), { value: 900 })).toBe("expected-to-vary");
    expect(flagFor(marker("urea"), { value: 9.4 })).toBe("expected-to-vary");
  });

  it("admits when it has no range rather than inventing one", () => {
    expect(flagFor(marker("ck"), { value: 900, low: undefined, high: undefined })).toBe("expected-to-vary");
    const noRange = { ...marker("ck"), typical: { low: null, high: null } };
    expect(flagFor(noRange, { value: 900 })).toBe("no-range");
    expect(formatRange({ marker: noRange, low: null, high: null })).toBe("no range");
  });
});

describe("reading a panel", () => {
  const history = [
    panel("2026-08-20", { ferritin: { value: 42 }, ck: { value: 900 }, testosterone: { value: 21.4 } }),
    panel("2026-02-10", { ferritin: { value: 58 }, testosterone: { value: 20.9 } }),
  ];

  it("returns only the markers the panel actually tested", () => {
    const readings = readPanel(history[0], history);
    expect(readings.map((reading) => reading.marker.id).sort()).toEqual(["ck", "ferritin", "testosterone"]);
  });

  it("keeps the table's order rather than the order they were entered", () => {
    const readings = readPanel(history[0], history);
    const order = MARKERS.map((item) => item.id);
    const positions = readings.map((reading) => order.indexOf(reading.marker.id));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("shows the change since the last panel that measured the same marker", () => {
    const readings = readPanel(history[0], history);
    const ferritin = readings.find((reading) => reading.marker.id === "ferritin")!;
    expect(ferritin.previous).toEqual({ value: 58, date: "2026-02-10" });
    expect(ferritin.change).toBe(-16);
  });

  it("says nothing about a change when the marker is new", () => {
    const ck = readPanel(history[0], history).find((reading) => reading.marker.id === "ck")!;
    expect(ck.previous).toBeNull();
    expect(ck.change).toBeNull();
  });

  it("never looks forward for a previous value", () => {
    const readings = readPanel(history[1], history);
    expect(readings.find((reading) => reading.marker.id === "ferritin")!.previous).toBeNull();
  });

  it("sends only genuinely out-of-range results to a doctor", () => {
    const readings = readPanel(
      panel("2026-08-20", { ferritin: { value: 8 }, ck: { value: 1400 }, testosterone: { value: 21.4 } }),
      []
    );
    expect(needsReview(readings).map((reading) => reading.marker.id)).toEqual(["ferritin"]);
  });

  it("reads each marker back at its own precision", () => {
    expect(formatValue(marker("haemoglobin"), 152)).toBe("152 g/L");
    expect(formatValue(marker("urea"), 6)).toBe("6.0 mmol/L");
    expect(formatValue(marker("magnesium"), 0.87)).toBe("0.87 mmol/L");
  });
});

describe("the training week the sample was taken in", () => {
  const outings = [
    { date: "2026-08-14" as const, gamePitches: 62, competitiveStart: true },
    { date: "2026-08-17" as const, totalThrows: 40, intentPercent: 70 },
    { date: "2026-08-19" as const, totalThrows: 30, intentPercent: 60 },
  ];
  const input = {
    outings,
    sleepByDate: { "2026-08-16": 7, "2026-08-18": 8, "2026-07-01": 4 },
    tonnageByDate: { "2026-08-17": 4200, "2026-08-19": 3800, "2026-07-01": 9000 },
  };

  it("counts days back to the last hard throwing day", () => {
    const context = drawContext("2026-08-20", input);
    expect(context.hardThrowOn).toBe("2026-08-14");
    expect(context.daysSinceHardThrow).toBe(6);
  });

  it("counts a competitive start as hard regardless of intent", () => {
    const context = drawContext("2026-08-20", {
      ...input,
      outings: [{ date: "2026-08-14" as const, gamePitches: 62, competitiveStart: true }],
    });
    expect(context.daysSinceHardThrow).toBe(6);
  });

  it("does not count a submaximal bullpen as a hard day", () => {
    const context = drawContext("2026-08-20", {
      ...input,
      outings: [{ date: "2026-08-19" as const, totalThrows: 30, intentPercent: 60 }],
    });
    expect(context.hardThrowOn).toBeNull();
    expect(context.daysSinceHardThrow).toBeNull();
  });

  it("sums the seven days up to and including the draw", () => {
    const context = drawContext("2026-08-20", input);
    // A seven-day inclusive window reaches back to the 14th, so the start
    // counts; the July entries are far outside it.
    expect(context.throwsInWeek).toBe(132);
    expect(context.throwingDays).toBe(3);
    expect(context.tonnageKg).toBe(8000);
    expect(context.meanSleepHours).toBe(7.5);
  });

  it("ignores anything logged after the draw", () => {
    const context = drawContext("2026-08-18", input);
    // The 19th is two days in the future of this draw and must not count.
    expect(context.throwsInWeek).toBe(102);
    expect(context.throwingDays).toBe(2);
    expect(context.tonnageKg).toBe(4200);
  });

  it("drops out of the window on the eighth day, not the seventh", () => {
    expect(drawContext("2026-08-20", input).throwsInWeek).toBe(132);
    expect(drawContext("2026-08-21", input).throwsInWeek).toBe(70);
  });

  it("says so plainly when there is nothing to report", () => {
    const empty = drawContext("2026-08-20", { outings: [], sleepByDate: {}, tonnageByDate: {} });
    expect(empty.meanSleepHours).toBeNull();
    expect(empty.tonnageKg).toBe(0);
    expect(describeContext(empty)).toMatch(/No training logged/);
  });

  it("describes the week in one readable line", () => {
    const line = describeContext(drawContext("2026-08-20", input));
    expect(line).toMatch(/^6 days after the last high-intent throwing day/);
    expect(line).toContain("132 throws across 3 sessions");
    expect(line).toContain("8,000 kg lifted");
    expect(line).toContain("7.5 h mean sleep");
  });

  it("reads the day of the draw itself as day zero", () => {
    const context = drawContext("2026-08-14", input);
    expect(context.daysSinceHardThrow).toBe(0);
    const line = describeContext(context);
    expect(line).toMatch(/^Drawn on a high-intent throwing day/);
    // One session is one session, not "1 sessions".
    expect(line).toContain("62 throws across 1 session in the week before");
  });
});
