/**
 * Retesting.
 *
 * The subtle requirement here is direction. Half these metrics improve by
 * going up and half by going down — a drop-jump ground contact of 0.30 s is
 * better than 0.348, a jump height of 23 cm is better than 19.8 — and a change
 * column that reported raw arithmetic would show the single most important
 * improvement in the programme as a negative number. So most of what follows
 * is about "better", not about "more".
 */

import { describe, expect, it } from "vitest";
import {
  RETEST_METRICS,
  RETEST_INTERVAL_WEEKS,
  isRetestWeek,
  nextRetestWeek,
  readRetests,
  readings,
  retestSummary,
  formatMetric,
} from "./retest";
import { buildSession, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";

const entry = (date: string, values: Record<string, number>) => ({ date, values });

describe("the battery", () => {
  it("carries the report's own baselines where one was measured", () => {
    const byId = new Map(RETEST_METRICS.map((metric) => [metric.id, metric]));
    expect(byId.get("djContact")?.baseline).toBe(0.348);
    expect(byId.get("djRsi")?.baseline).toBe(0.96);
    expect(byId.get("sj")?.baseline).toBe(19.8);
    expect(byId.get("cmj")?.baseline).toBe(32.6);
    expect(byId.get("cmjContraction")?.baseline).toBe(730);
  });

  it("admits where nothing was ever measured rather than inventing a number", () => {
    const byId = new Map(RETEST_METRICS.map((metric) => [metric.id, metric]));
    expect(byId.get("sprint10")?.baseline).toBeNull();
    expect(byId.get("medBall")?.baseline).toBeNull();
    expect(byId.get("barVel65")?.baseline).toBeNull();
  });

  it("knows which way is better for each one", () => {
    const byId = new Map(RETEST_METRICS.map((metric) => [metric.id, metric]));
    expect(byId.get("djContact")?.direction).toBe("down");
    expect(byId.get("cmjContraction")?.direction).toBe("down");
    expect(byId.get("sprint10")?.direction).toBe("down");
    expect(byId.get("djRsi")?.direction).toBe("up");
    expect(byId.get("sj")?.direction).toBe("up");
  });

  it("tells the athlete how to take every measurement", () => {
    for (const metric of RETEST_METRICS) {
      expect(metric.how.length, metric.id).toBeGreaterThan(20);
      expect(metric.label.length, metric.id).toBeGreaterThan(3);
    }
  });

  it("puts the jumps first, while completely fresh", () => {
    const order = RETEST_METRICS.map((metric) => metric.id);
    expect(order.indexOf("sj")).toBeLessThan(order.indexOf("sprint10"));
    expect(order.indexOf("djContact")).toBeLessThan(order.indexOf("sprint10"));
    expect(order.indexOf("djContact")).toBeLessThan(order.indexOf("medBall"));
  });
});

describe("the cadence", () => {
  it("runs every third week, anchored so the dates are predictable", () => {
    expect(RETEST_INTERVAL_WEEKS).toBe(3);
    for (const week of [1, 4, 7, 10, 13, 52]) expect(isRetestWeek(week), `week ${week}`).toBe(true);
    for (const week of [2, 3, 5, 6, 8, 9, 51]) expect(isRetestWeek(week), `week ${week}`).toBe(false);
  });

  it("says no to a week that is not a week", () => {
    for (const week of [null, 0, -3, 1.5]) expect(isRetestWeek(week as number)).toBe(false);
  });

  it("finds the next one from anywhere", () => {
    expect(nextRetestWeek(7)).toBe(7);
    expect(nextRetestWeek(8)).toBe(10);
    expect(nextRetestWeek(9)).toBe(10);
  });

  it("never leaves more than three weeks between tests", () => {
    const weeks = Array.from({ length: 52 }, (_, index) => index + 1).filter(isRetestWeek);
    for (let index = 1; index < weeks.length; index += 1) {
      expect(weeks[index] - weeks[index - 1]).toBe(RETEST_INTERVAL_WEEKS);
    }
  });
});

describe("reading entries out of stored state", () => {
  it("keeps a well-formed entry", () => {
    const read = readRetests([entry("2026-08-24", { djContact: 0.31, djRsi: 1.1 })]);
    expect(read).toHaveLength(1);
    expect(read[0].values).toEqual({ djContact: 0.31, djRsi: 1.1 });
  });

  it("drops readings of zero, which are not measurements", () => {
    // A blank input coerces to zero, and zero is not a jump height, a contact
    // time or a bar speed. Storing it would put a false low point on a chart.
    const read = readRetests([entry("2026-08-24", { djContact: 0, sj: 21 })]);
    expect(read[0].values).toEqual({ sj: 21 });
  });

  it("drops metrics it does not recognise, and entries with nothing left", () => {
    expect(readRetests([entry("2026-08-24", { madeUp: 5 })])).toEqual([]);
    expect(readRetests([{ date: "nonsense", values: { sj: 21 } }])).toEqual([]);
    expect(readRetests("not an array")).toEqual([]);
    expect(readRetests(undefined)).toEqual([]);
  });

  it("returns newest first, with one entry per date", () => {
    const read = readRetests([
      entry("2026-07-06", { sj: 20 }),
      entry("2026-08-24", { sj: 21 }),
      entry("2026-08-24", { sj: 22 }),
    ]);
    expect(read.map((item) => item.date)).toEqual(["2026-08-24", "2026-07-06"]);
    // A second entry on the same date is a correction, not a second reading.
    expect(read[0].values.sj).toBe(22);
  });
});

describe("what it says about progress", () => {
  it("reports a falling contact time as an improvement, not a loss", () => {
    // The single most important number in the report improves by getting
    // smaller. Raw arithmetic would show that as negative.
    const [contact] = readings([entry("2026-08-24", { djContact: 0.31 })]).filter(
      (reading) => reading.metric.id === "djContact"
    );
    expect(contact.latest).toBe(0.31);
    expect(contact.improvement).toBeGreaterThan(0);
    expect(contact.metTarget).toBe(false);
    expect(contact.toTarget).toBeCloseTo(0.01, 3);
  });

  it("reports a rising jump height as an improvement too", () => {
    const [sj] = readings([entry("2026-08-24", { sj: 21.5 })]).filter((r) => r.metric.id === "sj");
    expect(sj.improvement).toBeCloseTo(1.7, 1);
    expect(sj.toTarget).toBeCloseTo(1.5, 1);
  });

  it("marks a target met, and the longer-term one separately", () => {
    const met = readings([entry("2026-08-24", { djRsi: 1.3 })]).find((r) => r.metric.id === "djRsi")!;
    expect(met.metTarget).toBe(true);
    expect(met.metStretch).toBe(false);
    expect(met.toTarget).toBeNull();

    const both = readings([entry("2026-08-24", { djRsi: 1.6 })]).find((r) => r.metric.id === "djRsi")!;
    expect(both.metStretch).toBe(true);
  });

  it("says nothing at all about a metric never measured", () => {
    const [sprint] = readings([]).filter((r) => r.metric.id === "sprint10");
    expect(sprint.latest).toBeNull();
    expect(sprint.improvement).toBeNull();
    expect(sprint.metTarget).toBe(false);
  });

  it("takes the most recent reading of each metric, not the newest entry only", () => {
    // A partial retest is normal — the plate was busy, the gates were not set
    // up. A metric measured three weeks ago still counts as the latest one.
    const entries = readRetests([
      entry("2026-08-03", { sj: 20.5, sprint10: 1.82 }),
      entry("2026-08-24", { sj: 21.5 }),
    ]);
    const all = readings(entries);
    expect(all.find((r) => r.metric.id === "sj")!.latest).toBe(21.5);
    expect(all.find((r) => r.metric.id === "sprint10")!.latest).toBe(1.82);
    expect(all.find((r) => r.metric.id === "sprint10")!.latestOn).toBe("2026-08-03");
  });

  it("summarises how much of the battery has been done", () => {
    const entries = readRetests([entry("2026-08-24", { sj: 21.5, djContact: 0.31 })]);
    const summary = retestSummary(entries);
    expect(summary.measured).toBe(2);
    expect(summary.total).toBe(RETEST_METRICS.length);
    expect(summary.improved).toBe(2);
    expect(summary.lastOn).toBe("2026-08-24");
  });

  it("reads each metric back at its own precision", () => {
    const byId = new Map(RETEST_METRICS.map((metric) => [metric.id, metric]));
    expect(formatMetric(byId.get("djContact")!, 0.3)).toBe("0.300 s");
    expect(formatMetric(byId.get("cmjContraction")!, 705)).toBe("705 ms");
    expect(formatMetric(byId.get("djRsi")!, 1.1)).toBe("1.10");
  });
});

describe("on the plan", () => {
  const monday = (week: number) =>
    applyBaselineProgramming(buildSession(weekPlan(week), 0), null, 0).tasks.map((task) => String(task.name));

  it("puts the battery on a retest Monday", () => {
    expect(monday(7).some((name) => /Retest battery/.test(name))).toBe(true);
  });

  it("stands in for the depth jump rather than joining it", () => {
    // The battery contains drop jumps. Training the quality and then measuring
    // it on the same day would measure the fatigue.
    const tasks = monday(7);
    expect(tasks.some((name) => /Retest battery/.test(name))).toBe(true);
    expect(tasks.some((name) => /Depth jump/.test(name))).toBe(false);
  });

  it("leaves every other Monday alone", () => {
    for (const week of [5, 6, 8, 9]) {
      expect(monday(week).some((name) => /Retest battery/.test(name)), `week ${week}`).toBe(false);
      expect(monday(week).some((name) => /Depth jump/.test(name)), `week ${week}`).toBe(true);
    }
  });

  it("never appears on a day that is not Monday", () => {
    for (const day of [1, 2, 3, 4, 5, 6]) {
      const tasks = applyBaselineProgramming(buildSession(weekPlan(7), day), null, day).tasks;
      expect(tasks.some((task) => /Retest battery/.test(String(task.name))), `day ${day}`).toBe(false);
    }
  });

  it("names every metric it expects back", () => {
    const battery = applyBaselineProgramming(buildSession(weekPlan(7), 0), null, 0).tasks.find((task) =>
      /Retest battery/.test(String(task.name))
    )!;
    for (const fragment of ["SJ", "CMJ", "drop jump", "10 m sprint", "bar velocity", "med-ball"]) {
      expect(String(battery.prescription)).toContain(fragment);
    }
    expect(String(battery.cue)).toMatch(/Enter the numbers on the Athlete page/);
  });
});
