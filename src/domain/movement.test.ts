import { describe, expect, it } from "vitest";
import {
  LABEL_LINE,
  MIN_HALF_RANGE,
  MOVEMENT,
  MovementCluster,
  PlacedLabel,
  labelLayout,
  movementClusters,
  movementDomain,
  movementFindings,
  movementScale,
  movementShift,
  plottablePitches,
} from "./movement";
import { Pitch } from "./pitchLog";

let counter = 0;
const pitch = (over: Partial<Pitch>): Pitch => ({
  id: `p${(counter += 1)}`,
  date: "2026-08-05",
  pitchType: "Fastball",
  velocityMph: 88,
  spinRpm: 2200,
  spinEfficiencyPct: null,
  inducedVertBreakIn: 16,
  horzBreakIn: 9,
  releaseHeightFt: null,
  releaseSideFt: null,
  extensionFt: null,
  source: "rapsodo",
  ...over,
});

describe("plottablePitches", () => {
  it("keeps pitches that carry both breaks", () => {
    expect(plottablePitches([pitch({})])).toHaveLength(1);
  });

  it("drops a speed-only reading rather than plotting it at the origin", () => {
    // A Pocket Radar export carries no break at all. Zeroing it would build a
    // cluster at (0,0) that never happened.
    const speedOnly = pitch({ inducedVertBreakIn: null, horzBreakIn: null, source: "pocketRadar" });
    expect(plottablePitches([speedOnly])).toEqual([]);
  });

  it("drops a pitch missing only one of the two breaks", () => {
    expect(plottablePitches([pitch({ horzBreakIn: null })])).toEqual([]);
  });

  it("keeps a genuine zero, which is a real place on the plot", () => {
    expect(plottablePitches([pitch({ horzBreakIn: 0, inducedVertBreakIn: 0 })])).toHaveLength(1);
  });

  it("files an untagged pitch under a name rather than an empty one", () => {
    expect(plottablePitches([pitch({ pitchType: "" })])[0].pitchType).toBe("Untagged");
  });
});

describe("movementClusters", () => {
  it("averages each pitch type and counts it", () => {
    const [cluster] = movementClusters([
      pitch({ horzBreakIn: 8, inducedVertBreakIn: 15, velocityMph: 87 }),
      pitch({ horzBreakIn: 10, inducedVertBreakIn: 17, velocityMph: 89 }),
    ]);
    expect(cluster.pitchType).toBe("Fastball");
    expect(cluster.count).toBe(2);
    expect(cluster.avgHorzBreakIn).toBe(9);
    expect(cluster.avgInducedVertBreakIn).toBe(16);
    expect(cluster.avgVelocityMph).toBe(88);
  });

  it("measures how tightly the pitch repeats", () => {
    const tight = movementClusters([
      pitch({ horzBreakIn: 9, inducedVertBreakIn: 16 }),
      pitch({ horzBreakIn: 9, inducedVertBreakIn: 16 }),
    ]);
    expect(tight[0].spreadIn).toBe(0);

    const loose = movementClusters([
      pitch({ horzBreakIn: 3, inducedVertBreakIn: 16 }),
      pitch({ horzBreakIn: 15, inducedVertBreakIn: 16 }),
    ]);
    expect(loose[0].spreadIn).toBe(6);
  });

  it("puts the most-thrown pitch first", () => {
    const clusters = movementClusters([
      pitch({ pitchType: "Slider", horzBreakIn: -8, inducedVertBreakIn: 1 }),
      pitch({}),
      pitch({}),
    ]);
    expect(clusters.map((c) => c.pitchType)).toEqual(["Fastball", "Slider"]);
  });

  it("leaves the average speed null when nothing carried one", () => {
    expect(movementClusters([pitch({ velocityMph: null })])[0].avgVelocityMph).toBeNull();
  });
});

describe("movementDomain", () => {
  it("never shrinks below the minimum, so an inch of noise is not magnified", () => {
    expect(movementDomain(plottablePitches([pitch({ horzBreakIn: 1, inducedVertBreakIn: 1 })]))).toBe(
      MIN_HALF_RANGE
    );
  });

  it("rounds out to a whole tick past the furthest pitch", () => {
    expect(
      movementDomain(plottablePitches([pitch({ horzBreakIn: -21, inducedVertBreakIn: 4 })]))
    ).toBe(25);
  });

  it("takes the furthest of the two axes, so the frame stays square", () => {
    const half = movementDomain(
      plottablePitches([pitch({ horzBreakIn: 2, inducedVertBreakIn: 19 })])
    );
    expect(half).toBe(20);
  });
});

describe("movementScale", () => {
  const scale = movementScale(20);

  it("puts zero break at the centre of the box", () => {
    expect(scale.origin.x).toBeCloseTo(MOVEMENT.size / 2, 5);
    expect(scale.origin.y).toBeCloseTo(MOVEMENT.size / 2, 5);
  });

  it("uses the same inches-per-pixel on both axes", () => {
    // An inch right must be the same distance as an inch up, or the plot draws
    // a sweeper with the shape of a slider.
    const right = scale.project(10, 0).x - scale.origin.x;
    const up = scale.origin.y - scale.project(0, 10).y;
    expect(right).toBeCloseTo(up, 5);
  });

  it("draws ride upward and drop downward", () => {
    expect(scale.project(0, 15).y).toBeLessThan(scale.origin.y);
    expect(scale.project(0, -15).y).toBeGreaterThan(scale.origin.y);
  });

  it("keeps the furthest pitch inside the box", () => {
    const edge = scale.project(20, 20);
    expect(edge.x).toBeLessThanOrEqual(MOVEMENT.size - MOVEMENT.pad + 0.001);
    expect(edge.y).toBeGreaterThanOrEqual(MOVEMENT.pad - 0.001);
  });

  it("always includes zero among the gridlines", () => {
    expect(scale.ticks).toContain(0);
    expect(movementScale(10).ticks).toContain(0);
    expect(movementScale(40).ticks).toContain(0);
  });
});

describe("movementFindings", () => {
  const three = (over: Partial<Pitch>) => [pitch(over), pitch(over), pitch(over)];

  it("flags two pitches that finish in the same place at the same speed", () => {
    const clusters = movementClusters([
      ...three({ pitchType: "Slider", horzBreakIn: -6, inducedVertBreakIn: 2, velocityMph: 79 }),
      ...three({ pitchType: "Cutter", horzBreakIn: -3, inducedVertBreakIn: 4, velocityMph: 81 }),
    ]);
    const findings = movementFindings(clusters);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("watch");
    // Equal counts sort alphabetically, so the cutter is named first.
    expect(findings[0].text).toMatch(/cutter and slider average 3\.6″ apart/);
  });

  it("treats a big speed gap as separation, not a problem", () => {
    const clusters = movementClusters([
      ...three({ pitchType: "Fastball", horzBreakIn: 9, inducedVertBreakIn: 16, velocityMph: 89 }),
      ...three({ pitchType: "Changeup", horzBreakIn: 11, inducedVertBreakIn: 14, velocityMph: 79 }),
    ]);
    const [finding] = movementFindings(clusters);
    expect(finding.severity).toBe("note");
    expect(finding.text).toMatch(/same place, different timing/);
  });

  it("says nothing about pitches that are genuinely far apart", () => {
    const clusters = movementClusters([
      ...three({ pitchType: "Fastball", horzBreakIn: 9, inducedVertBreakIn: 16 }),
      ...three({ pitchType: "Curveball", horzBreakIn: -8, inducedVertBreakIn: -10 }),
    ]);
    expect(movementFindings(clusters)).toEqual([]);
  });

  it("will not build a finding out of one or two pitches", () => {
    const clusters = movementClusters([
      pitch({ pitchType: "Slider", horzBreakIn: -6, inducedVertBreakIn: 2, velocityMph: 79 }),
      pitch({ pitchType: "Cutter", horzBreakIn: -5, inducedVertBreakIn: 3, velocityMph: 80 }),
    ]);
    expect(movementFindings(clusters)).toEqual([]);
  });
});

describe("movementShift", () => {
  it("reports how far today's shape moved from the earlier sessions'", () => {
    const today = [pitch({ horzBreakIn: 12, inducedVertBreakIn: 18, velocityMph: 90 })];
    const prior = [
      pitch({ date: "2026-07-29", horzBreakIn: 9, inducedVertBreakIn: 16, velocityMph: 88 }),
      pitch({ date: "2026-07-22", horzBreakIn: 9, inducedVertBreakIn: 16, velocityMph: 88 }),
    ];
    const [shift] = movementShift(today, prior);
    expect(shift.deltaHorzBreakIn).toBe(3);
    expect(shift.deltaInducedVertBreakIn).toBe(2);
    expect(shift.deltaVelocityMph).toBe(2);
    expect(shift.priorSessions).toBe(2);
    expect(shift.priorCount).toBe(2);
  });

  it("omits a pitch thrown for the first time today", () => {
    const today = [pitch({ pitchType: "Splitter" })];
    const prior = [pitch({ date: "2026-07-29" })];
    expect(movementShift(today, prior)).toEqual([]);
  });

  it("counts distinct earlier days, not pitches", () => {
    const prior = [
      pitch({ date: "2026-07-29" }),
      pitch({ date: "2026-07-29" }),
      pitch({ date: "2026-07-22" }),
    ];
    expect(movementShift([pitch({})], prior)[0].priorSessions).toBe(2);
  });

  it("leaves the speed delta null when either side had no speed", () => {
    const shift = movementShift([pitch({ velocityMph: null })], [pitch({ date: "2026-07-29" })]);
    expect(shift[0].deltaVelocityMph).toBeNull();
  });

  it("returns nothing when there is no history", () => {
    expect(movementShift([pitch({})], [])).toEqual([]);
  });
});

describe("labelLayout", () => {
  const scale = movementScale(20);
  const cluster = (
    pitchType: string,
    hb: number,
    ivb: number,
    count = 5
  ): MovementCluster => ({
    pitchType,
    count,
    avgHorzBreakIn: hb,
    avgInducedVertBreakIn: ivb,
    avgVelocityMph: 85,
    spreadIn: 1.5,
    pitches: [],
  });

  /** The block a placed name occupies, matching the layout's own geometry. */
  function box(label: PlacedLabel, text: string) {
    const width = Math.max(text.length * 12.5 * 0.53, `${5} thrown · 85.0 mph`.length * 10.5 * 0.53);
    return {
      left: label.anchor === "start" ? label.x : label.x - width,
      right: label.anchor === "start" ? label.x + width : label.x,
      top: label.y - 11,
      bottom: label.y + LABEL_LINE + 4,
    };
  }

  it("places one name per cluster, in the same order", () => {
    const placed = labelLayout([cluster("Fastball", 11, 16), cluster("Slider", -6, 1)], scale);
    expect(placed.map((label) => label.pitchType)).toEqual(["Fastball", "Slider"]);
  });

  it("keeps names inside the box, so a phone does not clip them", () => {
    // A pitch out at the right edge is exactly where the naive "push outward"
    // rule wrote "14 thrown · 87.9 mp" off the side of the card.
    const placed = labelLayout([cluster("Fastball", 19, 17)], scale);
    const drawn = box(placed[0], "Fastball");
    expect(drawn.right).toBeLessThanOrEqual(MOVEMENT.size);
    expect(drawn.left).toBeGreaterThanOrEqual(0);
  });

  it("does not stack two names on each other", () => {
    // Two pitches a couple of inches apart is ordinary — a slider and a cutter.
    const placed = labelLayout([cluster("Slider", -6, 1), cluster("Cutter", -3, 4)], scale);
    const a = box(placed[0], "Slider");
    const b = box(placed[1], "Cutter");
    const overlap = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    expect(overlap).toBe(false);
  });

  it("keeps a name off the axis wording", () => {
    // A pitch sitting near the left edge at zero vertical break lands on top of
    // "← glove side" unless the axis text is reserved first.
    const placed = labelLayout([cluster("Slider", -18, 0)], scale);
    const drawn = box(placed[0], "Slider");
    const gloveSide = { left: 0, right: 120, top: MOVEMENT.size / 2 - 20, bottom: MOVEMENT.size / 2 };
    const overlap =
      drawn.left < gloveSide.right &&
      drawn.right > gloveSide.left &&
      drawn.top < gloveSide.bottom &&
      drawn.bottom > gloveSide.top;
    expect(overlap).toBe(false);
  });

  it("still places every name on a crowded plot", () => {
    const crowded = ["A", "B", "C", "D", "E", "F"].map((name, index) =>
      cluster(name, index - 3, 2)
    );
    expect(labelLayout(crowded, scale)).toHaveLength(6);
  });
});
