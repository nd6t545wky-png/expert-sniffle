import { describe, expect, it } from "vitest";
import { MechanicsAnalysis } from "./api";
import {
  ANGLE_COVERAGE,
  CHECKPOINTS,
  DRILL_LIBRARY,
  METRIC_CHECKPOINT,
  METRIC_LABELS,
  MetricKey,
  drillsFor,
  prescribeRoutine,
  readScores,
  routineInOrder,
} from "./mechanicsDrills";

function analysis(overrides: Partial<MechanicsAnalysis> = {}): MechanicsAnalysis {
  return {
    source: "aiVideoScreen",
    sourceLabel: "AI open-side movement screen",
    analyzable: true,
    captureQuality: { score: 4, decision: "usable", blockers: [] },
    summary: "s",
    confidence: "medium",
    confidenceReason: "r",
    sequenceRating: 4,
    lowerHalfRating: 4,
    trunkRating: 4,
    armTimingRating: 4,
    releaseRating: 4,
    decelerationRating: 4,
    screening: {},
    phaseReview: [],
    observations: [],
    limitations: [],
    aiInterventions: [],
    model: "m",
    analyzedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("every quality can be worked on", () => {
  it("has at least one drill for each rated quality", () => {
    for (const key of Object.keys(METRIC_LABELS) as MetricKey[]) {
      expect(drillsFor(key).length).toBeGreaterThan(0);
    }
  });

  it("gives every drill a slot the routine knows how to order", () => {
    const slots = new Set(["warm-up", "pre-throw", "throwing", "gym", "post-throw"]);
    for (const drill of DRILL_LIBRARY) {
      expect(slots.has(drill.slot)).toBe(true);
      expect(drill.minutes).toBeGreaterThan(0);
      expect(drill.targets.length).toBeGreaterThan(0);
    }
  });

  it("uses unique drill ids", () => {
    expect(new Set(DRILL_LIBRARY.map((d) => d.id)).size).toBe(DRILL_LIBRARY.length);
  });
});

describe("reading the screen", () => {
  it("separates a low rating from one that was never taken", () => {
    const scores = readScores(analysis({ sequenceRating: 1, armTimingRating: null }));
    expect(scores.find((s) => s.key === "sequence")?.status).toBe("priority");
    expect(scores.find((s) => s.key === "armTiming")?.status).toBe("not-assessed");
  });

  it("classifies 3 as monitor and 4+ as a strength", () => {
    const scores = readScores(analysis({ trunkRating: 3, releaseRating: 5 }));
    expect(scores.find((s) => s.key === "trunk")?.status).toBe("monitor");
    expect(scores.find((s) => s.key === "release")?.status).toBe("strength");
  });

  it("always reports all six qualities, rated or not", () => {
    expect(readScores(analysis({ sequenceRating: null, armTimingRating: null }))).toHaveLength(6);
  });
});

describe("prescribing", () => {
  it("targets the lowest-scoring qualities", () => {
    const routine = prescribeRoutine(analysis({ lowerHalfRating: 1, trunkRating: 2 }));
    expect(routine.available).toBe(true);
    expect(routine.blocks.map((b) => b.metric)).toEqual(["lowerHalf", "trunk"]);
    expect(routine.blocks[0].drills.length).toBeGreaterThan(0);
  });

  it("caps the routine at two priorities so it stays a plan", () => {
    const routine = prescribeRoutine(
      analysis({ sequenceRating: 1, lowerHalfRating: 1, trunkRating: 1, armTimingRating: 1 })
    );
    expect(routine.blocks).toHaveLength(2);
  });

  it("never prescribes from a quality the capture could not rate", () => {
    // A rear-view screen returns null for sequencing and arm timing.
    const routine = prescribeRoutine(
      analysis({ sequenceRating: null, armTimingRating: null, lowerHalfRating: 2 })
    );
    const metrics = routine.blocks.map((b) => b.metric);
    expect(metrics).not.toContain("sequence");
    expect(metrics).not.toContain("armTiming");
    expect(metrics).toContain("lowerHalf");
  });

  it("falls back to the single 3/5 when nothing is worse", () => {
    const routine = prescribeRoutine(analysis({ trunkRating: 3 }));
    expect(routine.blocks).toHaveLength(1);
    expect(routine.blocks[0].metric).toBe("trunk");
  });

  it("prescribes nothing when everything is strong, and says why", () => {
    const routine = prescribeRoutine(analysis());
    expect(routine.available).toBe(false);
    expect(routine.reason).toMatch(/scored 4 or better/);
  });

  it("prescribes nothing from an unusable capture, and passes on the blockers", () => {
    const routine = prescribeRoutine(
      analysis({ analyzable: false, captureQuality: { score: 1, decision: "reject", blockers: ["too dark", "arm out of frame"] } })
    );
    expect(routine.available).toBe(false);
    expect(routine.reason).toContain("too dark");
    expect(routine.blocks).toHaveLength(0);
  });

  it("prescribes nothing when the angle rated nothing at all", () => {
    const routine = prescribeRoutine(
      analysis({
        sequenceRating: null, lowerHalfRating: null, trunkRating: null,
        armTimingRating: null, releaseRating: null, decelerationRating: null,
      })
    );
    expect(routine.available).toBe(false);
    expect(routine.reason).toMatch(/could not rate any quality/);
  });

  it("handles having no screen at all", () => {
    const routine = prescribeRoutine(null);
    expect(routine.available).toBe(false);
    expect(routine.scores).toHaveLength(0);
  });

  it("carries the weighted-ball caution when a drill uses one", () => {
    const withBalls = prescribeRoutine(analysis({ releaseRating: 1 }));
    expect(withBalls.usesWeightedBalls).toBe(true);
    expect(withBalls.weightedBallNote).toMatch(/Reinold/);

    const without = prescribeRoutine(analysis({ trunkRating: 1 }));
    expect(without.usesWeightedBalls).toBe(false);
    expect(without.weightedBallNote).toBeUndefined();
  });

  it("totals the time so the routine can be fitted into a session", () => {
    const routine = prescribeRoutine(analysis({ trunkRating: 1 }));
    const expected = routine.blocks.flatMap((b) => b.drills).reduce((n, d) => n + d.minutes, 0);
    expect(routine.minutes).toBe(expected);
    expect(routine.minutes).toBeGreaterThan(0);
  });
});

describe("routine ordering", () => {
  it("returns drills in the order a session runs, not grouped by metric", () => {
    const routine = prescribeRoutine(analysis({ sequenceRating: 1, decelerationRating: 1 }));
    const groups = routineInOrder(routine);
    const order = groups.map((g) => g.slot);
    expect(order).toEqual([...order].sort((a, b) => {
      const rank = ["warm-up", "pre-throw", "throwing", "gym", "post-throw"];
      return rank.indexOf(a) - rank.indexOf(b);
    }));
  });

  it("lists a drill once even when two priorities both call for it", () => {
    // Sequencing and lower half share the step-behind throw.
    const routine = prescribeRoutine(analysis({ sequenceRating: 1, lowerHalfRating: 1 }));
    const ids = routineInOrder(routine).flatMap((g) => g.drills.map((d) => d.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("omits empty slots rather than showing blank headings", () => {
    const routine = prescribeRoutine(analysis({ trunkRating: 1 }));
    for (const group of routineInOrder(routine)) {
      expect(group.drills.length).toBeGreaterThan(0);
    }
  });
});

describe("delivery checkpoints", () => {
  it("maps every quality to a frame of the delivery", () => {
    for (const key of Object.keys(METRIC_LABELS) as MetricKey[]) {
      const checkpoint = METRIC_CHECKPOINT[key];
      expect(CHECKPOINTS.some((c) => c.key === checkpoint)).toBe(true);
    }
  });

  it("tells the athlete where in the delivery the fault shows up", () => {
    const routine = prescribeRoutine(analysis({ lowerHalfRating: 1 }));
    expect(routine.blocks[0].checkpoint.label).toBe("Max leg lift");
    expect(routine.blocks[0].checkpoint.look).toMatch(/Balance and posture/);
  });

  it("says which qualities each camera angle can and cannot judge", () => {
    // The rear view genuinely cannot see these, and the screen agrees.
    expect(ANGLE_COVERAGE.rear.covers).not.toContain("sequence");
    expect(ANGLE_COVERAGE.rear.covers).not.toContain("armTiming");
    expect(ANGLE_COVERAGE.open_side.covers).toContain("sequence");
    expect(ANGLE_COVERAGE.dual.covers).toHaveLength(6);
  });

  it("keeps the angle coverage honest against what the screen actually rates", () => {
    // A rear capture nulls exactly the qualities ANGLE_COVERAGE excludes.
    const rear = readScores(analysis({ sequenceRating: null, armTimingRating: null }));
    const unrated = rear.filter((s) => s.rating === null).map((s) => s.key).sort();
    const missing = (Object.keys(METRIC_LABELS) as MetricKey[])
      .filter((k) => !ANGLE_COVERAGE.rear.covers.includes(k))
      .sort();
    expect(unrated).toEqual(missing);
  });
});
