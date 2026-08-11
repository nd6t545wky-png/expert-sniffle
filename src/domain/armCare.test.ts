import { describe, expect, it } from "vitest";
import {
  ArmExam,
  ER_IR_FLOOR,
  MIN_EXAMS_FOR_TREND,
  RETENTION_TARGET,
  armFindings,
  armScore,
  armTrend,
  erIrRatio,
  fatigueRetention,
  latestOutingPair,
  limbSymmetry,
  readExams,
  retentionForCheckIn,
  armPrompt,
} from "./armCare";

const FULL = {
  shoulderIr: 22,
  shoulderEr: 17,
  scaption: 14,
  elbowFlexion: 25,
  elbowExtension: 20,
  grip: 48,
};

function exam(over: Partial<ArmExam> = {}): ArmExam {
  return {
    id: "e1",
    date: "2026-08-11",
    timing: "fresh",
    bodyweightKg: 90,
    throwing: { ...FULL },
    nonThrowing: { ...FULL },
    ...over,
  };
}

describe("armScore", () => {
  it("is summed throwing-arm strength as a percentage of bodyweight", () => {
    // 22+17+14+25+20+48 = 146, over 90 kg = 162%.
    expect(armScore(exam())).toEqual({ score: 162, testsUsed: 6, complete: true });
  });

  it("refuses to score without a bodyweight", () => {
    // Every figure is per kilogram; a guessed weight is wrong invisibly.
    expect(armScore(exam({ bodyweightKg: 0 }))).toBeNull();
  });

  it("returns nothing when no test was taken", () => {
    expect(armScore(exam({ throwing: {} }))).toBeNull();
  });

  it("scores a partial battery but marks it incomplete", () => {
    const partial = armScore(exam({ throwing: { grip: 48, shoulderIr: 22 } }))!;
    expect(partial.testsUsed).toBe(2);
    expect(partial.complete).toBe(false);
  });
});

describe("erIrRatio", () => {
  it("divides external by internal rotation", () => {
    expect(erIrRatio({ shoulderEr: 17, shoulderIr: 22 })!.value).toBe(0.77);
  });

  it("flags internal-rotation dominance", () => {
    const low = erIrRatio({ shoulderEr: 13, shoulderIr: 22 })!;
    expect(low.value).toBeLessThan(ER_IR_FLOOR);
    expect(low.belowThreshold).toBe(true);
  });

  it("returns nothing when either rotation was not measured", () => {
    expect(erIrRatio({ shoulderEr: 17 })).toBeNull();
  });
});

describe("limbSymmetry", () => {
  it("compares throwing against the other side", () => {
    expect(limbSymmetry(exam())!.value).toBe(100);
  });

  it("compares only the tests taken on both sides", () => {
    // Summing four throwing readings against six on the other side would
    // manufacture a 33% deficit that does not exist.
    const lopsided = exam({
      throwing: { grip: 48, shoulderIr: 22 },
      nonThrowing: { ...FULL },
    });
    expect(limbSymmetry(lopsided)!.value).toBe(100);
  });

  it("flags a deficit outside the band", () => {
    const weak = exam({ throwing: { grip: 30 }, nonThrowing: { grip: 48 } });
    expect(limbSymmetry(weak)!.belowThreshold).toBe(true);
  });

  it("returns nothing when no test was taken on both sides", () => {
    expect(limbSymmetry(exam({ nonThrowing: {} }))).toBeNull();
  });
});

describe("fatigueRetention", () => {
  const pre = exam({ id: "pre", timing: "preOuting" });

  it("reports strength held as a percentage of pre-outing", () => {
    const post = exam({ id: "post", timing: "postOuting", throwing: { ...FULL, grip: 34 } });
    // 132 of 146 held.
    expect(fatigueRetention(pre, post)!.value).toBe(90);
  });

  it("flags a drop under the field target", () => {
    const post = exam({ id: "post", timing: "postOuting", throwing: { ...FULL, grip: 20 } });
    const result = fatigueRetention(pre, post)!;
    expect(result.value).toBeLessThan(RETENTION_TARGET);
    expect(result.belowThreshold).toBe(true);
  });

  it("compares only the tests present in both", () => {
    const post = exam({ id: "post", timing: "postOuting", throwing: { grip: 48 } });
    expect(fatigueRetention(pre, post)!.value).toBe(100);
  });
});

describe("armTrend", () => {
  const history = (scores: number[]) =>
    scores.map((grip, index) =>
      exam({
        id: `e${index}`,
        date: `2026-07-${String(index + 1).padStart(2, "0")}`,
        throwing: { ...FULL, grip },
      })
    );

  it("compares the latest against the athlete's own average", () => {
    const trend = armTrend(history([48, 48, 48, 48]))!;
    expect(trend.verdict).toBe("steady");
    expect(trend.observations).toBe(3);
  });

  it("refuses a verdict before enough exams exist", () => {
    const trend = armTrend(history([48, 48]))!;
    expect(trend.verdict).toBe("unknown");
    expect(trend.average).toBeNull();
    expect(trend.observations).toBeLessThan(MIN_EXAMS_FOR_TREND);
  });

  it("calls a real drop weaker", () => {
    expect(armTrend(history([48, 48, 48, 48, 20]))!.verdict).toBe("weaker");
  });

  it("treats a small move as steady, because dynamometry is not that precise", () => {
    expect(armTrend(history([48, 48, 48, 48, 50]))!.verdict).toBe("steady");
  });

  it("ignores post-outing exams, which are meant to be lower", () => {
    // A fatigued post-outing reading in the average would drag the baseline
    // down and hide a genuine loss.
    const exams = [...history([48, 48, 48, 48]), exam({ id: "p", date: "2026-07-09", timing: "postOuting", throwing: { ...FULL, grip: 10 } })];
    expect(armTrend(exams)!.verdict).toBe("steady");
  });

  it("never compares a partial battery against a complete one", () => {
    const exams = [...history([48, 48, 48, 48]), exam({ id: "short", date: "2026-07-20", throwing: { grip: 48 } })];
    // The short day is excluded, so the latest complete exam still stands.
    expect(armTrend(exams)!.latest).toBe(162);
  });

  it("returns nothing with no scoreable exam", () => {
    expect(armTrend([])).toBeNull();
  });
});

describe("latestOutingPair", () => {
  it("pairs a post-outing test with its pre-outing test on the same day", () => {
    const pre = exam({ id: "pre", date: "2026-08-10", timing: "preOuting" });
    const post = exam({ id: "post", date: "2026-08-10", timing: "postOuting" });
    expect(latestOutingPair([pre, post, exam()])).toEqual({ pre, post });
  });

  it("does not pair across days", () => {
    const pre = exam({ id: "pre", date: "2026-08-09", timing: "preOuting" });
    const post = exam({ id: "post", date: "2026-08-10", timing: "postOuting" });
    expect(latestOutingPair([pre, post])).toBeNull();
  });
});

describe("armFindings", () => {
  it("names the measurement and the threshold it crossed", () => {
    const low = exam({ throwing: { ...FULL, shoulderEr: 12 } });
    const findings = armFindings(low, null, null);
    expect(findings[0].text).toMatch(/External-to-internal rotation is 0\.55/);
    expect(findings[0].severity).toBe("watch");
  });

  it("says nothing when everything is inside its band", () => {
    expect(armFindings(exam(), null, null)).toEqual([]);
  });

  it("reports a failed retention check", () => {
    const findings = armFindings(exam(), null, { value: 82, belowThreshold: true });
    expect(findings.some((f) => /82% of pre-outing/.test(f.text))).toBe(true);
  });
});

describe("readExams", () => {
  it("survives junk and sorts oldest first", () => {
    expect(readExams("nope")).toEqual([]);
    expect(readExams([{ nope: 1 }])).toEqual([]);
    const sorted = readExams([exam({ id: "b", date: "2026-08-12" }), exam({ id: "a", date: "2026-08-01" })]);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("retentionForCheckIn — what the daily score may use", () => {
  const pre = exam({ id: "pre", date: "2026-08-09", timing: "preOuting" });
  const post = exam({
    id: "post",
    date: "2026-08-09",
    timing: "postOuting",
    throwing: { ...FULL, grip: 20 },
  });

  it("supplies a fresh retention figure", () => {
    expect(retentionForCheckIn([pre, post], "2026-08-10")!.value).toBe(81);
  });

  it("withholds a stale one rather than scoring today off old news", () => {
    // A fortnight-old post-outing reading is a fact about a fortnight ago.
    expect(retentionForCheckIn([pre, post], "2026-08-25")).toBeNull();
  });

  it("holds the figure right up to the edge of the window", () => {
    expect(retentionForCheckIn([pre, post], "2026-08-12")).not.toBeNull();
    expect(retentionForCheckIn([pre, post], "2026-08-13")).toBeNull();
  });

  it("returns nothing without a pair", () => {
    expect(retentionForCheckIn([pre], "2026-08-10")).toBeNull();
  });
});

describe("armPrompt", () => {
  const today = "2026-08-11";

  it("asks for the pre-outing screen first, because it cannot be recovered later", () => {
    const prompt = armPrompt([], today, { isOutingDay: true })!;
    expect(prompt.kind).toBe("preOuting");
  });

  it("asks for the post-outing screen once the pre one exists", () => {
    const pre = exam({ id: "pre", date: today, timing: "preOuting" });
    expect(armPrompt([pre], today, { isOutingDay: true })!.kind).toBe("postOuting");
  });

  it("stops asking once the pair is complete", () => {
    const pre = exam({ id: "pre", date: today, timing: "preOuting" });
    const post = exam({ id: "post", date: today, timing: "postOuting" });
    const fresh = exam({ id: "f", date: "2026-08-10", timing: "fresh" });
    expect(armPrompt([fresh, pre, post], today, { isOutingDay: true })).toBeNull();
  });

  it("asks for a weekly baseline when the last fresh screen has aged out", () => {
    const old = exam({ id: "old", date: "2026-08-01", timing: "fresh" });
    const prompt = armPrompt([old], today, { isOutingDay: false })!;
    expect(prompt.kind).toBe("weekly");
    expect(prompt.text).toMatch(/10 days ago/);
  });

  it("says nothing on a normal day with a current baseline", () => {
    const recent = exam({ id: "r", date: "2026-08-09", timing: "fresh" });
    expect(armPrompt([recent], today, { isOutingDay: false })).toBeNull();
  });

  it("does not nag an athlete who has never run a screen", () => {
    // The check-in is the one form filled in every day. Telling someone who
    // may not own a dynamometer that a screen is "due" is a permanent nag.
    expect(armPrompt([], today, { isOutingDay: false })).toBeNull();
  });

  it("still asks on an outing day, because that pair is time-critical", () => {
    expect(armPrompt([], today, { isOutingDay: true })!.kind).toBe("preOuting");
  });
});
