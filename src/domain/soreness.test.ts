/**
 * Triage, tested as clinical rules rather than as code.
 *
 * This module decides whether a pitcher throws today. Getting it wrong in one
 * direction wastes a session; getting it wrong in the other puts an elbow
 * through a bullpen it should not have been in. So the tests are written as
 * the rules a physio would state, and each one names the reasoning it is
 * protecting.
 *
 * The hardest property here is that the escalation is monotonic: no rule may
 * talk a more serious rule down. The single exception — warming out of it — is
 * tested explicitly for what it can and cannot rescue.
 */

import { describe, expect, it } from "vitest";
import {
  ARM_REGIONS,
  BodyRegion,
  HOLD_SEVERITY,
  MONITOR_SEVERITY,
  PAIN_CEILING,
  PainQuality,
  PainTiming,
  PainTrend,
  REFER_AFTER_DAYS,
  REGION_LABELS,
  REGION_PLAYBOOK,
  REPORT_LIFETIME_DAYS,
  SorenessReport,
  activeReports,
  readReports,
  throwingCap,
  triageReport,
  worstTier,
} from "./soreness";
import { buildSession, setProgrammeContext, weekPlan } from "./programmeSessions";
import { PROGRAMME_WEEK_COUNT } from "./calendar";
import { applyBaselineProgramming } from "./programmeUpdates";

const TODAY = "2026-08-19";

/**
 * Every task name the athlete can actually be shown, built once.
 *
 * The contraindication patterns are matched against task names, so they are
 * only correct relative to what the app really calls things. Testing them
 * against invented strings would pass while the real plan went unchanged.
 *
 * `applyBaselineProgramming` is included because it adds tasks of its own —
 * "Ankle stiffness pogos", "Wrist and forearm prep", "Depth jump", "Back
 * squat" — and a corpus built from `buildSession` alone misses every one of
 * them. That gap is not hypothetical: it is how a wrist-and-forearm warm-up
 * survived a report of medial elbow pain.
 */
const PROGRAMME_TASK_NAMES: string[] = (() => {
  const pbs = {
    trainingMaxes: {
      lifts: {
        squat: { value: 140, kind: "kg" },
        bench: { value: 100, kind: "kg" },
        deadlift: { value: 180, kind: "kg" },
        press: { value: 60, kind: "kg" },
      },
    },
  };
  setProgrammeContext({ pbs });
  const names = new Set<string>();
  for (let week = 1; week <= PROGRAMME_WEEK_COUNT; week += 1) {
    const plan = weekPlan(week, pbs);
    for (let day = 0; day < 7; day += 1) {
      for (const level of [null, "reduced", "recovery"] as const) {
        const session = applyBaselineProgramming(buildSession(plan, day), level, day);
        for (const task of session.tasks) names.add(task.name);
      }
    }
  }
  return [...names];
})();

function report(overrides: Partial<SorenessReport> = {}): SorenessReport {
  return {
    id: "r1",
    date: TODAY,
    region: "elbow_medial",
    severity: 2,
    quality: "ache",
    timing: "warms_up",
    trend: "same",
    createdAt: `${TODAY}T08:00:00.000Z`,
    ...overrides,
  };
}

describe("the pain ceiling", () => {
  it("leaves a low ache that warms up alone", () => {
    // Silbernagel's model exists to stop exactly this from cancelling a
    // session. A 2/10 that eases with warm-up is the normal state of a
    // throwing arm in season.
    const triage = triageReport(report({ severity: 2, timing: "warms_up" }));
    expect(triage.tier).toBe("monitor");
    expect(triage.throwingCapPercent).toBeNull();
  });

  it("modifies between the monitoring line and the ceiling", () => {
    const triage = triageReport(report({ severity: PAIN_CEILING, timing: "during" }));
    expect(triage.tier).toBe("modify");
    expect(triage.reasons.join(" ")).toMatch(/inside the ceiling/);
  });

  it("rests the area at or above the hold line", () => {
    expect(triageReport(report({ severity: HOLD_SEVERITY, timing: "during" })).tier).toBe("hold");
    expect(triageReport(report({ severity: 10, timing: "during" })).tier).toBe("hold");
  });

  it("treats the boundary values as stated, not one either side", () => {
    expect(triageReport(report({ severity: MONITOR_SEVERITY, timing: "during" })).tier).toBe("monitor");
    expect(triageReport(report({ severity: MONITOR_SEVERITY + 1, timing: "during" })).tier).toBe("modify");
    expect(triageReport(report({ severity: HOLD_SEVERITY - 1, timing: "during" })).tier).toBe("modify");
  });
});

describe("red flags", () => {
  it("refers burning, pins and needles or numbness at any severity", () => {
    // A nerve description is not a load description. 1/10 does not make it a
    // training problem.
    const triage = triageReport(report({ severity: 1, quality: "burning" }));
    expect(triage.tier).toBe("refer");
    expect(triage.referral).toMatch(/nerve description/i);
  });

  it("refers a joint that gave way, at any severity", () => {
    const triage = triageReport(report({ severity: 1, quality: "giving_way" }));
    expect(triage.tier).toBe("refer");
    expect(triage.referral).toMatch(/instability|giving way/i);
  });

  it("refers pain that wakes you at night", () => {
    const triage = triageReport(report({ severity: 3, timing: "at_night" }));
    expect(triage.tier).toBe("refer");
    expect(triage.referral).toBeTruthy();
  });

  it("holds pain that is present at rest", () => {
    expect(triageReport(report({ severity: 2, timing: "at_rest" })).tier).toBe("hold");
  });

  it("holds anything getting worse, however mild", () => {
    // The direction matters more than the number. A 2/10 climbing is worse
    // news than a stable 4/10.
    expect(triageReport(report({ severity: 2, trend: "worse" })).tier).toBe("hold");
  });

  it("refers anything still going after the referral window", () => {
    const triage = triageReport(report({ severity: 2 }), REFER_AFTER_DAYS);
    expect(triage.tier).toBe("refer");
    expect(triage.referral).toMatch(new RegExp(String(REFER_AFTER_DAYS)));
  });

  it("holds sharp pain above the monitoring line", () => {
    expect(triageReport(report({ severity: 4, quality: "sharp", timing: "during" })).tier).toBe("hold");
  });
});

describe("warming out of it", () => {
  it("can pull a modify back to monitor", () => {
    const triage = triageReport(report({ severity: 4, timing: "warms_up", trend: "same" }));
    expect(triage.tier).toBe("monitor");
    expect(triage.reasons.join(" ")).toMatch(/eases once warm/i);
  });

  it("cannot rescue a red flag", () => {
    expect(triageReport(report({ severity: 2, timing: "warms_up", quality: "burning" })).tier).toBe("refer");
    expect(triageReport(report({ severity: 2, timing: "warms_up", quality: "giving_way" })).tier).toBe("refer");
  });

  it("cannot rescue a hold-level severity", () => {
    expect(triageReport(report({ severity: HOLD_SEVERITY, timing: "warms_up" })).tier).toBe("hold");
  });

  it("cannot rescue a worsening trend", () => {
    expect(triageReport(report({ severity: 4, timing: "warms_up", trend: "worse" })).tier).toBe("hold");
  });

  it("cannot rescue something that has run past the referral window", () => {
    expect(triageReport(report({ severity: 4, timing: "warms_up" }), REFER_AFTER_DAYS + 5).tier).toBe("refer");
  });
});

describe("still there the next morning", () => {
  it("is a modify on its own, whatever the number says", () => {
    // The second half of the pain-monitoring model, and the half people drop.
    const triage = triageReport(report({ severity: 1, timing: "next_morning" }));
    expect(triage.tier).toBe("modify");
    expect(triage.reasons.join(" ")).toMatch(/next morning/i);
  });
});

describe("throwing", () => {
  const armCases: BodyRegion[] = ["elbow_medial", "shoulder_front", "forearm", "lat_teres"];

  it("is uncapped while an arm complaint is only being monitored", () => {
    for (const region of armCases) {
      expect(triageReport(report({ region, severity: 2, timing: "warms_up" })).throwingCapPercent).toBeNull();
    }
  });

  it("is capped to catch play once an arm complaint needs modifying", () => {
    for (const region of armCases) {
      expect(triageReport(report({ region, severity: 4, timing: "during" })).throwingCapPercent).toBe(60);
    }
  });

  it("stops entirely once an arm complaint is on hold", () => {
    for (const region of armCases) {
      expect(triageReport(report({ region, severity: 8, timing: "during" })).throwingCapPercent).toBe(0);
    }
  });

  it("is not capped by a leg or a back, however bad", () => {
    // A pitcher with a sore knee has a lifting problem, not a throwing one.
    for (const region of ["knee", "low_back", "ankle_foot", "hip_groin"] as BodyRegion[]) {
      expect(triageReport(report({ region, severity: 9, timing: "at_rest" })).throwingCapPercent).toBeNull();
    }
  });

  it("takes the strictest cap across several complaints, never the average", () => {
    const active = activeReports(
      [
        report({ id: "a", region: "elbow_medial", severity: 4, timing: "during" }),
        report({ id: "b", region: "shoulder_back", severity: 8, timing: "during" }),
      ],
      TODAY
    );
    expect(throwingCap(active)).toBe(0);
  });

  it("does not let two 60% caps add up to permission", () => {
    const active = activeReports(
      [
        report({ id: "a", region: "elbow_medial", severity: 4, timing: "during" }),
        report({ id: "b", region: "shoulder_back", severity: 4, timing: "during" }),
      ],
      TODAY
    );
    expect(throwingCap(active)).toBe(60);
  });
});

describe("which reports speak for today", () => {
  it("keeps applying after the day it was made", () => {
    // Pain does not stop existing because nobody opened the app.
    const active = activeReports([report({ date: "2026-08-17", severity: 7 })], "2026-08-19");
    expect(active).toHaveLength(1);
    expect(active[0].triage.tier).toBe("hold");
  });

  it("ignores a report made for a later date", () => {
    expect(activeReports([report({ date: "2026-08-25" })], TODAY)).toEqual([]);
  });

  it("takes the newest report per region and drops the older one", () => {
    const active = activeReports(
      [
        report({ id: "old", date: "2026-08-17", severity: 8 }),
        report({ id: "new", date: "2026-08-19", severity: 1, timing: "warms_up" }),
      ],
      TODAY
    );
    expect(active).toHaveLength(1);
    expect(active[0].report.id).toBe("new");
    expect(active[0].triage.tier).toBe("monitor");
  });

  it("stops applying once it is resolved", () => {
    const active = activeReports(
      [report({ date: "2026-08-15", severity: 8, resolvedOn: "2026-08-18" })],
      TODAY
    );
    expect(active).toEqual([]);
  });

  it("does not let an older unresolved report undo a resolution", () => {
    const active = activeReports(
      [
        report({ id: "first", date: "2026-08-14", severity: 8 }),
        report({ id: "second", date: "2026-08-15", severity: 6, resolvedOn: "2026-08-18" }),
      ],
      TODAY
    );
    expect(active).toEqual([]);
  });

  it("marks a report stale once it is older than its lifetime", () => {
    const stale = activeReports(
      [report({ date: "2026-08-01", severity: 8 })],
      TODAY
    );
    expect(stale[0].stale).toBe(true);
    // And a stale report must not silently drive the plan.
    expect(worstTier(stale)).toBeNull();
    expect(throwingCap(stale)).toBeNull();
  });

  it("keeps a report inside its lifetime live", () => {
    const date = "2026-08-19";
    const madeOn = "2026-08-14"; // 5 days back, inside the window
    const active = activeReports([report({ date: madeOn, severity: 7 })], date);
    expect(active[0].stale).toBe(false);
    expect(REPORT_LIFETIME_DAYS).toBeGreaterThan(4);
  });

  it("counts an unbroken run across repeated reports and escalates on it", () => {
    // Mentioned on the 9th and again on the 14th and 19th: that is one sore
    // elbow for ten days, not three separate ones.
    const reports = [
      report({ id: "a", date: "2026-08-09", severity: 2 }),
      report({ id: "b", date: "2026-08-14", severity: 2 }),
      report({ id: "c", date: "2026-08-19", severity: 2 }),
    ];
    const active = activeReports(reports, TODAY);
    expect(active[0].daysRunning).toBeGreaterThanOrEqual(REFER_AFTER_DAYS);
    expect(active[0].triage.tier).toBe("refer");
  });

  it("treats a long gap as a fresh complaint rather than one long one", () => {
    const reports = [
      report({ id: "a", date: "2026-06-01", severity: 2 }),
      report({ id: "b", date: "2026-08-19", severity: 2, timing: "warms_up" }),
    ];
    const active = activeReports(reports, TODAY);
    expect(active[0].daysRunning).toBe(0);
    expect(active[0].triage.tier).toBe("monitor");
  });

  it("reports the worst thing going on across regions", () => {
    const active = activeReports(
      [
        report({ id: "a", region: "knee", severity: 2, timing: "warms_up" }),
        report({ id: "b", region: "elbow_medial", severity: 7 }),
      ],
      TODAY
    );
    expect(worstTier(active)).toBe("hold");
  });
});

describe("reading stored reports", () => {
  it("drops anything malformed rather than trusting it", () => {
    expect(readReports(null)).toEqual([]);
    expect(readReports("nope")).toEqual([]);
    expect(readReports([{ nope: true }, null, 7])).toEqual([]);
    expect(readReports([report()])).toHaveLength(1);
  });

  it("clamps a severity that arrived out of range", () => {
    expect(readReports([report({ severity: 99 })])[0].severity).toBe(10);
    expect(readReports([report({ severity: -4 })])[0].severity).toBe(0);
    expect(readReports([report({ severity: Number.NaN })])[0].severity).toBe(0);
  });
});

describe("the playbook", () => {
  const regions = Object.keys(REGION_LABELS) as BodyRegion[];

  it("covers every region it offers", () => {
    for (const region of regions) {
      expect(REGION_PLAYBOOK[region], region).toBeTruthy();
    }
  });

  it("always has something to prescribe, at both tiers", () => {
    // A region that removes work and adds none leaves an athlete with a
    // shorter day and no idea what to do about the pain.
    for (const region of regions) {
      expect(REGION_PLAYBOOK[region].modify.length, `${region} modify`).toBeGreaterThan(0);
      expect(REGION_PLAYBOOK[region].hold.length, `${region} hold`).toBeGreaterThan(0);
    }
  });

  it("doses every prescription with a number", () => {
    // The standing rule for this app: named movements, sets and reps, never
    // "some mobility work".
    for (const region of regions) {
      for (const rx of [...REGION_PLAYBOOK[region].modify, ...REGION_PLAYBOOK[region].hold]) {
        expect(rx.prescription, `${region} ${rx.id}`).toMatch(/\d/);
        expect(rx.name.trim().length, `${region} ${rx.id}`).toBeGreaterThan(0);
        expect(rx.cue.trim().length, `${region} ${rx.id}`).toBeGreaterThan(0);
        expect(rx.why.trim().length, `${region} ${rx.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("gives every isometric a stop rule", () => {
    // An analgesic protocol without a stop criterion is just loading a painful
    // tissue and hoping.
    for (const region of regions) {
      for (const rx of [...REGION_PLAYBOOK[region].modify, ...REGION_PLAYBOOK[region].hold]) {
        if (!/isometric|hold|plank|wall sit/i.test(rx.name)) continue;
        expect(rx.stop, `${region} ${rx.id}`).toBeTruthy();
      }
    }
  });

  it("cites the isometric protocol it is copying", () => {
    const elbow = REGION_PLAYBOOK.elbow_medial.modify.find((rx) => rx.id === "wrist-flexion-iso");
    expect(elbow?.citation?.key).toMatch(/Rio 2015/);
    expect(elbow?.prescription).toMatch(/5 × 45 s/);
  });

  it("gives each arm region something that gates throwing", () => {
    for (const region of ARM_REGIONS) {
      expect(triageReport(report({ region, severity: 8 })).throwingCapPercent, region).toBe(0);
    }
  });

  it("only swaps tasks the region actually objects to", () => {
    // Checked against the programme's real task names rather than against the
    // patterns: a swap exists to rescue a contraindicated task, so everything
    // it rewrites must be something the region would otherwise have removed.
    // Anything else is silently altering a task that was never a problem.
    for (const region of regions) {
      const playbook = REGION_PLAYBOOK[region];
      for (const swap of playbook.swaps) {
        for (const name of PROGRAMME_TASK_NAMES) {
          if (!swap.match.test(name)) continue;
          const avoided = playbook.avoid.some((pattern) => pattern.test(name));
          expect(avoided, `${region}: swaps "${name}" but never avoids it`).toBe(true);
        }
      }
    }
  });

  it("matches real tasks in the programme, not patterns that hit nothing", () => {
    // A contraindication that matches no task is a rule that silently does
    // nothing — the failure mode where an athlete reports pain, the plan looks
    // changed, and the movement that hurt is still in it.
    for (const region of regions) {
      const playbook = REGION_PLAYBOOK[region];
      for (const pattern of playbook.avoid) {
        const hits = PROGRAMME_TASK_NAMES.filter((name) => pattern.test(name));
        expect(hits.length, `${region}: ${pattern} matches no task in the programme`).toBeGreaterThan(0);
      }
      for (const swap of playbook.swaps) {
        const hits = PROGRAMME_TASK_NAMES.filter((name) => swap.match.test(name));
        expect(hits.length, `${region}: swap ${swap.match} matches no task`).toBeGreaterThan(0);
      }
    }
  });

  it("doses and justifies every swap", () => {
    for (const region of regions) {
      for (const swap of REGION_PLAYBOOK[region].swaps) {
        expect(swap.name.trim().length, `${region} swap name`).toBeGreaterThan(0);
        expect(swap.prescription.trim().length, `${region} swap prescription`).toBeGreaterThan(0);
        expect(swap.why.trim().length, `${region} swap reason`).toBeGreaterThan(0);
      }
    }
  });
});
