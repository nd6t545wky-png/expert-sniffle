/**
 * The physio share, tested for the two things that would actually hurt.
 *
 * One is disclosure: the link must not carry the sync key, the key must not be
 * anywhere a server can see it, and the summary must not quietly widen to
 * include the whole workspace.
 *
 * The other is a summary that lies. A physio reads soreness, throwing volume
 * and arm strength and makes a call on them, so a day that was never recorded
 * must be absent rather than shown as a zero, and a partial arm screen must
 * come through as "not measured" rather than as a number.
 */

import { describe, expect, it } from "vitest";
import {
  SHARE_DAYS,
  SHARE_PANELS,
  buildPhysioSummary,
  newShareId,
  newShareKey,
  readPhysioSummary,
  readShareLink,
  shareLink,
} from "./physioShare";
import { decryptJsonEnvelope, encryptJsonEnvelope, generateSyncKey } from "./sync";
import { ArmExam } from "./armCare";

const TODAY = "2026-08-19";

function exam(overrides: Partial<ArmExam> = {}): ArmExam {
  return {
    id: "exam-1",
    date: "2026-08-18",
    timing: "fresh",
    bodyweightKg: 90,
    throwing: { shoulderIr: 20, shoulderEr: 16, scaption: 18, elbowFlexion: 22, elbowExtension: 20, grip: 50 },
    nonThrowing: { shoulderIr: 21, shoulderEr: 17, scaption: 19, elbowFlexion: 23, elbowExtension: 21, grip: 52 },
    ...overrides,
  };
}

describe("share links", () => {
  it("puts the key in the fragment, where no server sees it", () => {
    const id = newShareId();
    const key = newShareKey();
    const link = shareLink("https://example.test", id, key);

    const url = new URL(link);
    // The path and query are what a server logs. The key must not be in either.
    expect(`${url.pathname}${url.search}`).not.toContain(key);
    expect(url.hash).toBe(`#${key}`);
    expect(url.searchParams.get("share")).toBe(id);
  });

  it("round-trips back into an id and a key", () => {
    const id = newShareId();
    const key = newShareKey();
    const url = new URL(shareLink("https://example.test", id, key));
    expect(readShareLink(url.search, url.hash)).toEqual({ id, key });
  });

  it("refuses a link missing the fragment, rather than half-opening", () => {
    const id = newShareId();
    expect(readShareLink(`?share=${id}`, "")).toBeNull();
    expect(readShareLink(`?share=${id}`, "#short")).toBeNull();
    expect(readShareLink("?share=nope", `#${newShareKey()}`)).toBeNull();
  });

  it("makes a key that is not the sync key, and not derived from one", () => {
    const key = newShareKey();
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toBe(generateSyncKey());
    // Distinct every time — two links must not open each other.
    expect(new Set(Array.from({ length: 20 }, () => newShareKey())).size).toBe(20);
    expect(new Set(Array.from({ length: 20 }, () => newShareId())).size).toBe(20);
  });

  it("only opens under its own key", async () => {
    const summary = buildPhysioSummary({ today: TODAY });
    const key = newShareKey();
    const payload = await encryptJsonEnvelope(summary, key);

    await expect(decryptJsonEnvelope(payload, newShareKey())).rejects.toThrow();
    expect(readPhysioSummary(await decryptJsonEnvelope(payload, key))).toMatchObject({ version: 1 });
  });
});

describe("the summary", () => {
  it("leaves out days with nothing recorded, rather than shipping blanks", () => {
    const summary = buildPhysioSummary({
      today: TODAY,
      pre: { [TODAY]: { score: 78, planLevel: "full", inputs: { shoulder: 2, elbow: 0, forearm: 1 } } },
    });
    expect(summary.days).toHaveLength(1);
    expect(summary.days[0].date).toBe(TODAY);
    expect(summary.days[0].readiness).toEqual({ score: 78, planLevel: "full" });
    expect(summary.days[0].soreness).toEqual({ shoulder: 2, elbow: 0, forearm: 1 });
  });

  it("keeps soreness of zero, which is a reading, not a missing value", () => {
    const summary = buildPhysioSummary({
      today: TODAY,
      pre: { [TODAY]: { score: 90, inputs: { shoulder: 0, elbow: 0, forearm: 0 } } },
    });
    expect(summary.days[0].soreness).toEqual({ shoulder: 0, elbow: 0, forearm: 0 });
  });

  it("reports throwing and game pitches on the same day together", () => {
    const summary = buildPhysioSummary({
      today: TODAY,
      bullpens: { [TODAY]: { date: TODAY, throws: 32, intent: "high" } },
      games: [{ date: TODAY, pitches: 61 }],
    });
    expect(summary.days[0].throwing).toEqual({ throws: 32, intent: "high", gamePitches: 61 });
  });

  it("counts a session against what the plan actually held", () => {
    const summary = buildPhysioSummary({
      today: TODAY,
      completedTasks: { [TODAY]: ["a", "b"] },
      skippedTasks: { [TODAY]: { c: { reason: "sore" } } },
      plannedTaskCount: () => 9,
    });
    expect(summary.days[0].session).toEqual({ completed: 2, skipped: 1, total: 9 });
  });

  it("never reports a total smaller than the work resolved against it", () => {
    // A plan that cannot be rebuilt (a past programme week, a caught error)
    // returns zero tasks. Reporting "3/0 done" would read as corrupt data.
    const summary = buildPhysioSummary({
      today: TODAY,
      completedTasks: { [TODAY]: ["a", "b", "c"] },
      plannedTaskCount: () => 0,
    });
    expect(summary.days[0].session).toEqual({ completed: 3, skipped: 0, total: 3 });
  });

  it("carries the protocol's own words for the day", () => {
    const summary = buildPhysioSummary({
      today: TODAY,
      recoveryLabel: (date) => (date === TODAY ? "heavy protocol, day 1 — Offload" : null),
    });
    expect(summary.days[0].recovery).toBe("heavy protocol, day 1 — Offload");
  });

  it("stops at the window, however much history exists", () => {
    const pre: Record<string, unknown> = {};
    for (let back = 0; back < 90; back += 1) {
      const date = new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86_400_000)
        .toISOString()
        .slice(0, 10);
      pre[date] = { score: 70 };
    }
    const summary = buildPhysioSummary({ today: TODAY, pre });
    expect(summary.days).toHaveLength(SHARE_DAYS);
    expect(summary.days[0].date).toBe(TODAY);
  });

  it("orders days newest first", () => {
    const summary = buildPhysioSummary({
      today: TODAY,
      pre: { "2026-08-17": { score: 60 }, [TODAY]: { score: 80 }, "2026-08-18": { score: 70 } },
    });
    expect(summary.days.map((day) => day.date)).toEqual([TODAY, "2026-08-18", "2026-08-17"]);
  });

  it("reports an arm screen as the three numbers a physio reads", () => {
    const summary = buildPhysioSummary({ today: TODAY, exams: [exam()] });
    expect(summary.armScreens).toHaveLength(1);
    expect(summary.armScreens[0]).toMatchObject({
      date: "2026-08-18",
      armScorePercent: 162,
      erIrRatio: 0.8,
      limbSymmetryPercent: 95,
    });
  });

  it("says a missing measurement is missing rather than zero", () => {
    const summary = buildPhysioSummary({
      today: TODAY,
      exams: [exam({ throwing: { grip: 50 }, nonThrowing: {}, bodyweightKg: 0 })],
    });
    expect(summary.armScreens[0].armScorePercent).toBeNull();
    expect(summary.armScreens[0].erIrRatio).toBeNull();
    expect(summary.armScreens[0].limbSymmetryPercent).toBeNull();
  });

  it("carries the workload band and the rest problems verbatim", () => {
    const summary = buildPhysioSummary({
      today: TODAY,
      workload: { ratio: 1.62, inBand: false },
      restProblems: ["Three consecutive days throwing: 2026-08-10 to 2026-08-12."],
    });
    expect(summary.workload).toEqual({ ratio: 1.62, inBand: false });
    expect(summary.restProblems).toEqual([
      "Three consecutive days throwing: 2026-08-10 to 2026-08-12.",
    ]);
  });

  it("carries only the clinical fields, never the workspace", () => {
    const summary = buildPhysioSummary({
      today: TODAY,
      athlete: "Dylan",
      throwingHand: "right",
      pre: {
        [TODAY]: {
          score: 78,
          planLevel: "full",
          // Things a check-in also holds, which are none of a physio's business
          // and must not travel just because they sat next to something that
          // does.
          inputs: { shoulder: 1, elbow: 0, forearm: 0, mood: 2, stress: 4, hrvMs: 61 },
          bodyweightKg: 91.4,
        },
      },
      nutrition: undefined,
    } as never);

    const day = summary.days[0];
    expect(Object.keys(day).sort()).toEqual(["date", "readiness", "soreness"]);
    expect(Object.keys(day.soreness ?? {}).sort()).toEqual(["elbow", "forearm", "shoulder"]);
    const serialised = JSON.stringify(summary);
    expect(serialised).not.toContain("hrvMs");
    expect(serialised).not.toContain("91.4");
  });

  it("names the athlete without inventing one", () => {
    expect(buildPhysioSummary({ today: TODAY }).athlete).toBe("Athlete");
    expect(buildPhysioSummary({ today: TODAY, athlete: "  " }).athlete).toBe("Athlete");
    expect(buildPhysioSummary({ today: TODAY, athlete: "Dylan" }).athlete).toBe("Dylan");
  });
});

describe("blood results, which travel only when asked for", () => {
  const panel = (date: string, results: Record<string, { value: number; low?: number; high?: number }>) => ({
    date,
    results,
  });
  const panels = [
    panel("2026-08-14", { ferritin: { value: 24, low: 30, high: 300 }, ck: { value: 1420 } }),
    panel("2026-02-10", { ferritin: { value: 58, low: 30, high: 300 } }),
  ];

  it("is absent unless the caller passes any", () => {
    expect(buildPhysioSummary({ today: TODAY }).bloodPanels).toBeUndefined();
    expect(buildPhysioSummary({ today: TODAY, bloods: { panels: [] } }).bloodPanels).toBeUndefined();
  });

  it("flattens a panel so the reader needs no marker table", () => {
    const [latest] = buildPhysioSummary({ today: TODAY, bloods: { panels } }).bloodPanels!;
    expect(latest.date).toBe("2026-08-14");
    const ferritin = latest.markers.find((marker) => marker.label === "Ferritin")!;
    expect(ferritin).toMatchObject({
      unit: "µg/L",
      display: "24 µg/L",
      range: "30–300",
      ownRange: true,
      flag: "below",
    });
  });

  it("carries the previous draw, which is what makes one number mean anything", () => {
    const [latest] = buildPhysioSummary({ today: TODAY, bloods: { panels } }).bloodPanels!;
    const ferritin = latest.markers.find((marker) => marker.label === "Ferritin")!;
    expect(ferritin.previous).toEqual({ display: "58 µg/L", date: "2026-02-10" });
  });

  it("does not call a trained athlete's creatine kinase abnormal", () => {
    const [latest] = buildPhysioSummary({ today: TODAY, bloods: { panels } }).bloodPanels!;
    expect(latest.markers.find((marker) => marker.label === "Creatine kinase")!.flag).toBe(
      "expected-to-vary"
    );
  });

  it("says where the range came from, because labs differ", () => {
    const [latest] = buildPhysioSummary({ today: TODAY, bloods: { panels } }).bloodPanels!;
    expect(latest.markers.find((marker) => marker.label === "Ferritin")!.ownRange).toBe(true);
    expect(latest.markers.find((marker) => marker.label === "Creatine kinase")!.ownRange).toBe(false);
  });

  it("includes the training week around the draw when it can", () => {
    const summary = buildPhysioSummary({
      today: TODAY,
      bloods: {
        panels,
        context: () => ({
          daysSinceHardThrow: 2,
          hardThrowOn: "2026-08-12",
          throwsInWeek: 92,
          throwingDays: 3,
          meanSleepHours: 7.4,
          tonnageKg: 5200,
        }),
      },
    });
    expect(summary.bloodPanels![0].context).toMatch(/2 days after the last high-intent throwing day/);
  });

  it("leaves the context line off rather than inventing one", () => {
    const summary = buildPhysioSummary({ today: TODAY, bloods: { panels } });
    expect(summary.bloodPanels![0].context).toBeUndefined();
  });

  it("carries newest first, and not a medical history", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      panel(`2026-0${index + 1}-01`, { ferritin: { value: 40 + index } })
    );
    const out = buildPhysioSummary({ today: TODAY, bloods: { panels: many } }).bloodPanels!;
    expect(out).toHaveLength(SHARE_PANELS);
    expect(out[0].date).toBe("2026-09-01");
    expect(out.map((entry) => entry.date)).toEqual([...out.map((entry) => entry.date)].sort().reverse());
  });

  it("carries nothing else out of the workspace with them", () => {
    const summary = buildPhysioSummary({ today: TODAY, bloods: { panels } });
    const serialised = JSON.stringify(summary.bloodPanels);
    // No marker ids, no raw panel objects, nothing the athlete did not enter.
    expect(serialised).not.toContain("ferritin");
    expect(serialised).not.toContain("results");
  });
});

describe("reading a summary back", () => {
  it("refuses anything that is not one", () => {
    expect(readPhysioSummary(null)).toBeNull();
    expect(readPhysioSummary("a string")).toBeNull();
    expect(readPhysioSummary({ version: 2, days: [], armScreens: [] })).toBeNull();
    expect(readPhysioSummary({ version: 1, days: "no", armScreens: [] })).toBeNull();
  });

  it("survives a payload missing the optional parts", () => {
    const summary = readPhysioSummary({ version: 1, days: [], armScreens: [] });
    expect(summary).toMatchObject({ athlete: "Athlete", restProblems: [] });
    expect(summary?.workload).toBeUndefined();
  });

  it("drops a blood panel that arrives with nothing in it", () => {
    // An empty draw would read to a physio as "tested, nothing found".
    const summary = readPhysioSummary({
      version: 1,
      days: [],
      armScreens: [],
      bloodPanels: [
        { date: "2026-08-14", markers: [] },
        { date: "2026-02-10", markers: [{ label: "Ferritin", value: 58 }] },
        { markers: [{ label: "Ferritin", value: 12 }] },
        "not a panel",
      ],
    });
    expect(summary?.bloodPanels?.map((panel) => panel.date)).toEqual(["2026-02-10"]);
  });

  it("leaves blood results absent when the payload has none", () => {
    expect(readPhysioSummary({ version: 1, days: [], armScreens: [] })?.bloodPanels).toBeUndefined();
  });

  it("round-trips blood results through encryption unchanged", async () => {
    const original = buildPhysioSummary({
      today: TODAY,
      bloods: {
        panels: [{ date: "2026-08-14", lab: "QML", results: { ferritin: { value: 24, low: 30, high: 300 } } }],
      },
    });
    const key = newShareKey();
    const back = readPhysioSummary(await decryptJsonEnvelope(await encryptJsonEnvelope(original, key), key));
    expect(back?.bloodPanels).toEqual(original.bloodPanels);
  });

  it("round-trips through encryption unchanged", async () => {
    const original = buildPhysioSummary({
      today: TODAY,
      athlete: "Dylan",
      throwingHand: "right",
      pre: { [TODAY]: { score: 78, planLevel: "full", inputs: { shoulder: 2 } } },
      exams: [exam()],
      workload: { ratio: 1.1, inBand: true },
    });
    const key = newShareKey();
    const back = readPhysioSummary(await decryptJsonEnvelope(await encryptJsonEnvelope(original, key), key));
    expect(back).toEqual(original);
  });
});
