import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { AppState } from "./state";
import {
  appendHistoryEvents,
  hydrateTrainingHistory,
  markHistoryEventsUploaded,
  mergeTrainingHistories,
  pendingHistoryEvents,
  recordStateChanges,
} from "./trainingHistory";

if (!globalThis.crypto?.getRandomValues) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

const AT = "2026-10-06T08:00:00.000Z";

function state(overrides: Partial<AppState> = {}): AppState {
  return {
    version: 1,
    pre: {},
    post: {},
    completedTasks: {},
    skippedTasks: {},
    taskCompletionUpdatedAt: {},
    healthPrefill: {},
    pulseImports: {},
    bullpens: {},
    weeklyReviews: {},
    ...overrides,
  };
}

function ids() {
  let n = 0;
  return () => `history_${String((n += 1)).padStart(24, "0")}`;
}

const events = (s: AppState) => hydrateTrainingHistory(s.trainingHistory).events;

describe("recordStateChanges", () => {
  it("logs a check-in when it is submitted, and again when corrected", () => {
    const newId = ids();
    const a = state();
    const b = recordStateChanges(a, { ...a, pre: { "2026-10-06": { score: 80 } } }, AT, newId);
    const c = recordStateChanges(b, { ...b, pre: { "2026-10-06": { score: 72 } } }, "2026-10-06T09:00:00.000Z", newId);

    const log = events(c);
    expect(log.map((e) => e.type)).toEqual(["health_check_in_submitted", "health_check_in_corrected"]);
    expect(log[0].payload).toEqual({ date: "2026-10-06", record: { score: 80 } });
    expect(log[1].payload).toEqual({ date: "2026-10-06", record: { score: 72 } });
    // The correction points at what it replaced; the original is still there.
    expect(log[1].supersedesId).toBe(log[0].id);
    expect(log[1].revision).toBe(2);
  });

  it("logs each task tick and reopen separately", () => {
    const newId = ids();
    const a = state();
    const b = recordStateChanges(a, { ...a, completedTasks: { "2026-10-06": ["warmup", "throwing"] } }, AT, newId);
    const c = recordStateChanges(b, { ...b, completedTasks: { "2026-10-06": ["warmup"] } }, AT, newId);

    const log = events(c).map((e) => [e.type, e.payload.taskId]);
    expect(log).toEqual(
      expect.arrayContaining([
        ["task_completed", "warmup"],
        ["task_completed", "throwing"],
        ["task_reopened", "throwing"],
      ])
    );
    expect(log).toHaveLength(3);
    const reopen = events(c).find((e) => e.type === "task_reopened")!;
    const original = events(c).find((e) => e.type === "task_completed" && e.payload.taskId === "throwing")!;
    expect(reopen.supersedesId).toBe(original.id);
  });

  it("logs skips, check-outs and throwing entries", () => {
    const a = state();
    const b = recordStateChanges(
      a,
      {
        ...a,
        skippedTasks: { "2026-10-06": { lift: { reason: "sore" } } },
        post: { "2026-10-06": { armFeel: 8 } },
        bullpens: { "2026-10-06": { throws: 35 } },
      },
      AT,
      ids()
    );
    expect(events(b).map((e) => [e.collection, e.type]).sort()).toEqual(
      [
        ["checkOuts", "session_check_out_submitted"],
        ["performanceResults", "throwing_result_submitted"],
        ["taskChanges", "task_skipped"],
      ].sort()
    );
  });

  it("logs nothing when nothing tracked changed", () => {
    const a = state({ pre: { "2026-10-06": { score: 80 } } });
    const b = recordStateChanges(a, { ...a, profile: { name: "x" } }, AT);
    expect(b.trainingHistory).toBeUndefined();
  });

  it("never drops existing history when the new state omits it", () => {
    const newId = ids();
    const before = recordStateChanges(state(), state({ pre: { "2026-10-06": { score: 1 } } }), AT, newId);
    const { trainingHistory: _dropped, ...withoutHistory } = before;
    const after = recordStateChanges(before, { ...(withoutHistory as AppState), post: { "2026-10-06": {} } }, AT, newId);
    expect(events(after)).toHaveLength(2);
  });
});

describe("history bookkeeping", () => {
  it("tracks what is pending upload and survives a merge with an older copy", () => {
    const one = appendHistoryEvents(undefined, [
      { collection: "checkIns", date: "2026-10-06", type: "health_check_in_submitted", payload: {}, occurredAt: AT },
    ]);
    const older = one;
    const uploaded = markHistoryEventsUploaded(one, [one.events[0].id], AT);
    expect(pendingHistoryEvents(uploaded)).toHaveLength(0);

    // A sync result computed from the pre-upload copy must not resurrect the
    // pending mark, and must not lose anything.
    const merged = mergeTrainingHistories(uploaded, older);
    expect(merged.events).toHaveLength(1);
    expect(merged.events[0].uploadedAt).toBe(AT);
  });

  it("drops unreadable events rather than failing the whole read", () => {
    const history = hydrateTrainingHistory({
      events: [{ id: "bad" }, { id: "history_000000000001", collection: "checkIns", date: "2026-10-06", type: "x1", occurredAt: AT, payload: {} }],
    });
    expect(history.events.map((e) => e.id)).toEqual(["history_000000000001"]);
  });
});

describe("prototype compatibility", () => {
  // The prototype ships its own copy of this logic. History written there has
  // to read here unchanged, or a device that used it loses its record.
  const source = readFileSync(join(__dirname, "..", "..", "public", "training-history.js"), "utf8");
  const sandbox: { PitchingHistory?: Record<string, (...args: unknown[]) => unknown>; crypto: Crypto } = {
    crypto: globalThis.crypto,
  };
  runInNewContext(`${source}\nthis.PitchingHistory = PitchingHistory;`, sandbox);
  const legacy = sandbox.PitchingHistory!;

  it("reads events the prototype wrote", () => {
    const written = legacy.appendHistoryEvent(legacy.emptyTrainingHistory(), "checkIns", "2026-10-06", "health_check_in_submitted", {
      score: 80,
    });
    const read = hydrateTrainingHistory(JSON.parse(JSON.stringify(written)));
    expect(read.events).toHaveLength(1);
    expect(read.events[0].payload).toEqual({ score: 80 });
  });

  it("writes events the prototype can read", () => {
    const ours = recordStateChanges(state(), state({ pre: { "2026-10-06": { score: 80 } } }), AT);
    const theirs = legacy.hydrateTrainingHistory(JSON.parse(JSON.stringify(ours.trainingHistory))) as {
      events: unknown[];
    };
    expect(theirs.events).toHaveLength(1);
  });
});
