import { describe, expect, it } from "vitest";
import { CHART, chartGeometry, ouraTrendDays, OuraTrendDay } from "./healthTrends";

function day(date: string, oura: Record<string, unknown>) {
  return { [date]: { day: date, merged: {}, sources: { oura: { connected: true, data: oura } } } };
}

describe("ouraTrendDays", () => {
  it("returns one row per known date, oldest first", () => {
    const prefill = { ...day("2026-08-03", {}), ...day("2026-08-01", {}), ...day("2026-08-02", {}) };
    expect(ouraTrendDays(prefill, {}).map((row) => row.date)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("reads every charted field off the Oura payload", () => {
    const prefill = day("2026-08-01", {
      readinessScore: 78,
      sleepScore: 84,
      activityScore: 61,
      stressHighMinutes: 120,
      recoveryHighMinutes: 300,
      spo2Average: 96.5,
      hrvMs: 64,
      restingHeartRate: 49,
    });
    expect(ouraTrendDays(prefill, {})[0]).toEqual({
      date: "2026-08-01",
      readiness: 78,
      sleep: 84,
      activity: 61,
      stress: 120,
      recovery: 300,
      spo2: 96.5,
      hrv: 64,
      restingHeartRate: 49,
    });
  });

  it("includes dates that only have a check-in, never an imported payload", () => {
    const pre = { "2026-08-05": { score: 70, inputs: { hrvMs: 55, ouraReadinessScore: 72 } } };
    const [row] = ouraTrendDays({}, pre);
    expect(row.date).toBe("2026-08-05");
    expect(row.hrv).toBe(55);
    expect(row.readiness).toBe(72);
  });

  it("prefers the imported value over the value stored on the check-in", () => {
    const prefill = day("2026-08-05", { hrvMs: 64 });
    const pre = { "2026-08-05": { inputs: { hrvMs: 55 } } };
    expect(ouraTrendDays(prefill, pre)[0].hrv).toBe(64);
  });

  it("reads older check-ins that stored their answers flat", () => {
    // Records written before submissions nested their inputs are still real
    // days and must not vanish from the chart.
    const pre = { "2026-08-05": { score: 70, hrvMs: 51 } };
    expect(ouraTrendDays({}, pre)[0].hrv).toBe(51);
  });

  it("leaves a metric null rather than guessing at it", () => {
    const [row] = ouraTrendDays(day("2026-08-01", { hrvMs: 60 }), {});
    expect(row.spo2).toBeNull();
    expect(row.readiness).toBeNull();
  });

  it("survives junk stored against a date", () => {
    expect(() => ouraTrendDays({ "2026-08-01": "nonsense" }, { "2026-08-02": 7 })).not.toThrow();
  });
});

// --- geometry ----------------------------------------------------------------

function series(values: (number | null)[]): OuraTrendDay[] {
  return values.map((value, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    readiness: value,
    sleep: null,
    activity: null,
    stress: value,
    recovery: null,
    spo2: null,
    hrv: null,
    restingHeartRate: null,
  }));
}

const readiness = (day: OuraTrendDay) => day.readiness;
const stress = (day: OuraTrendDay) => day.stress;

describe("chartGeometry", () => {
  it("returns null when there is nothing to draw", () => {
    expect(chartGeometry([], readiness)).toBeNull();
    expect(chartGeometry(series([null, null]), readiness)).toBeNull();
  });

  it("drops days the ring did not report rather than interpolating them", () => {
    const geometry = chartGeometry(series([70, null, 80]), readiness)!;
    expect(geometry.points).toHaveLength(2);
    expect(geometry.points.map((point) => point.date)).toEqual(["2026-08-01", "2026-08-03"]);
  });

  it("treats a zero as missing by default — a sleep score of zero is no reading", () => {
    expect(chartGeometry(series([0, 0]), readiness)).toBeNull();
  });

  it("keeps a zero when the series says zero is real", () => {
    // Zero high-stress minutes is a genuine, and good, day.
    const geometry = chartGeometry(series([0, 120]), stress, { allowZero: true })!;
    expect(geometry.points).toHaveLength(2);
    expect(geometry.points[0].value).toBe(0);
  });

  it("spans the plot width from first point to last", () => {
    const geometry = chartGeometry(series([10, 20, 30]), readiness)!;
    expect(geometry.points[0].x).toBe(CHART.left);
    expect(geometry.points[2].x).toBe(CHART.width - CHART.right);
  });

  it("puts a higher value higher on the page", () => {
    const geometry = chartGeometry(series([10, 90]), readiness)!;
    expect(geometry.points[1].y).toBeLessThan(geometry.points[0].y);
  });

  it("keeps every point inside the plot box", () => {
    const geometry = chartGeometry(series([1, 500, 42, 7]), readiness)!;
    for (const point of geometry.points) {
      expect(point.y).toBeGreaterThanOrEqual(CHART.top);
      expect(point.y).toBeLessThanOrEqual(CHART.height - CHART.bottom);
    }
  });

  it("does not divide by zero on a single point", () => {
    const geometry = chartGeometry(series([55]), readiness)!;
    expect(Number.isFinite(geometry.points[0].x)).toBe(true);
    expect(Number.isFinite(geometry.points[0].y)).toBe(true);
  });

  it("does not render a flat series as a cliff", () => {
    // Identical values must sit on one horizontal line, not span the box.
    const geometry = chartGeometry(series([60, 60, 60]), readiness)!;
    const ys = new Set(geometry.points.map((point) => Math.round(point.y)));
    expect(ys.size).toBe(1);
  });

  it("builds a path that starts with a move and continues with lines", () => {
    const geometry = chartGeometry(series([10, 20, 30]), readiness)!;
    expect(geometry.path.startsWith("M")).toBe(true);
    expect(geometry.path.match(/L/g)).toHaveLength(2);
  });

  it("puts the axis at the foot of the plot area", () => {
    expect(chartGeometry(series([10]), readiness)!.axisY).toBe(CHART.height - CHART.bottom);
  });
});
