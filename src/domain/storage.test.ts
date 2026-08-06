import { beforeEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, STORAGE_KEY, countRecords, parseAppState } from "./state";
import { StorageLike, loadAppState, migrateIfNeeded, saveAppState } from "./storage";
import { importAppState, serializeExport } from "./importExport";

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

const SAVED = {
  version: 1,
  onboardingComplete: true,
  pre: { "2026-08-05": { readiness: 7, planLevel: "full" } },
  post: { "2026-08-05": { gamePitches: 42 } },
  bullpens: { "2026-08-05": { throws: 30 } },
  completedTasks: { "2026-08-05": ["warmup"] },
  profile: { name: "Dylan Sippel" },
};

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
});

describe("loadAppState", () => {
  it("returns an empty state when nothing is stored", () => {
    const result = loadAppState(storage);
    expect(result.source).toBe("empty");
    expect(countRecords(result.state!)).toBe(0);
  });

  it("reads state from the current key", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify(SAVED));
    const result = loadAppState(storage);
    expect(result.source).toBe("current");
    expect(result.state?.pre["2026-08-05"]).toEqual({ readiness: 7, planLevel: "full" });
    expect(countRecords(result.state!)).toBe(4);
  });

  it("preserves fields the schema does not know about", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...SAVED, somethingNew: { keep: "me" } }));
    const result = loadAppState(storage);
    expect(result.state?.somethingNew).toEqual({ keep: "me" });
  });

  it("backs up unparseable JSON instead of discarding it", () => {
    storage.setItem(STORAGE_KEY, "{ this is not json");
    const result = loadAppState(storage);

    expect(result.source).toBe("corrupt");
    expect(result.state).toBeNull();
    expect(result.backupKey).toBeDefined();
    // The original bytes must still be recoverable.
    expect(storage.getItem(result.backupKey!)).toBe("{ this is not json");
    expect(storage.getItem(STORAGE_KEY)).toBe("{ this is not json");
  });

  it("does not let one corrupt load overwrite a previous backup", () => {
    storage.setItem(STORAGE_KEY, "bad-one");
    const first = loadAppState(storage, new Date("2026-08-05T10:00:00Z"));
    storage.setItem(STORAGE_KEY, "bad-two");
    const second = loadAppState(storage, new Date("2026-08-05T11:00:00Z"));

    expect(first.backupKey).not.toBe(second.backupKey);
    expect(storage.getItem(first.backupKey!)).toBe("bad-one");
    expect(storage.getItem(second.backupKey!)).toBe("bad-two");
  });
});

describe("parseAppState — non-destructive behaviour", () => {
  it("keeps entries whose keys are not valid dates, and reports them", () => {
    const { state, issues } = parseAppState({ version: 1, pre: { "not-a-date": { readiness: 5 } } });
    expect(state?.pre["not-a-date"]).toEqual({ readiness: 5 });
    expect(issues.some((issue) => issue.path === "pre.not-a-date")).toBe(true);
  });

  it("preserves a malformed map under __unparsed__ rather than dropping it", () => {
    const { state, issues } = parseAppState({ version: 1, pre: "corrupted-string" });
    expect(state?.pre).toEqual({});
    expect((state?.__unparsed__ as Record<string, unknown>).pre).toBe("corrupted-string");
    expect(issues.some((issue) => issue.path === "pre")).toBe(true);
  });

  it("rejects non-objects outright", () => {
    expect(parseAppState("nope").state).toBeNull();
    expect(parseAppState(null).state).toBeNull();
    expect(parseAppState([1, 2, 3]).state).toBeNull();
  });
});

describe("saveAppState", () => {
  it("round-trips through storage", () => {
    const { state } = parseAppState(SAVED);
    saveAppState(storage, state!);
    expect(loadAppState(storage).state?.post["2026-08-05"]).toEqual({ gamePitches: 42 });
  });

  it("refuses to downgrade state written by a newer schema", () => {
    const { state } = parseAppState({ ...SAVED, version: SCHEMA_VERSION + 1 });
    expect(() => saveAppState(storage, state!)).toThrow(/newer schema/);
  });
});

describe("migrateIfNeeded", () => {
  it("adopts legacy data when the current key is empty", () => {
    storage.setItem("dylanCleanV1", JSON.stringify(SAVED));
    const result = migrateIfNeeded(storage);

    expect(result.migrated).toBe(true);
    expect(result.fromKey).toBe("dylanCleanV1");
    expect(result.recordsCarried).toBe(4);
    expect(loadAppState(storage).state?.pre["2026-08-05"]).toBeDefined();
  });

  it("leaves the legacy entry in place", () => {
    storage.setItem("dylanCleanV1", JSON.stringify(SAVED));
    migrateIfNeeded(storage);
    expect(storage.getItem("dylanCleanV1")).not.toBeNull();
  });

  it("never overwrites existing current data with older legacy data", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, pre: { "2026-01-01": { readiness: 9 } } }));
    storage.setItem("dylanCleanV1", JSON.stringify(SAVED));

    const result = migrateIfNeeded(storage);

    expect(result.migrated).toBe(false);
    const after = loadAppState(storage).state!;
    expect(after.pre["2026-01-01"]).toEqual({ readiness: 9 });
    expect(after.pre["2026-08-05"]).toBeUndefined();
  });

  it("is a no-op when there is nothing stored at all", () => {
    const result = migrateIfNeeded(storage);
    expect(result.migrated).toBe(false);
    expect(result.recordsCarried).toBe(0);
  });
});

describe("import / export", () => {
  it("round-trips a full state", () => {
    const { state } = parseAppState(SAVED);
    const result = importAppState(serializeExport(state!));

    expect(result.ok).toBe(true);
    expect(result.recordCount).toBe(4);
    expect(result.state?.pre["2026-08-05"]).toEqual({ readiness: 7, planLevel: "full" });
  });

  it("strips UI position but keeps user data", () => {
    const { state } = parseAppState({ ...SAVED, page: "nutrition", selectedWeek: 12 });
    const result = importAppState(serializeExport(state!));

    expect(result.state?.page).toBeUndefined();
    expect(result.state?.selectedWeek).toBeUndefined();
    expect(result.state?.profile).toEqual({ name: "Dylan Sippel" });
  });

  it("rejects invalid JSON with a reason", () => {
    const result = importAppState("{ nope");
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toMatch(/not valid JSON/);
  });

  it("rejects a foreign export format", () => {
    const result = importAppState(JSON.stringify({ format: "someone-elses-app", state: SAVED }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.path === "format")).toBe(true);
  });

  it("rejects a newer export format rather than guessing", () => {
    const result = importAppState(
      JSON.stringify({ format: "dylan-pitching-os.export", formatVersion: 99, state: SAVED })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.path === "formatVersion")).toBe(true);
  });

  it("rejects a newer schema rather than silently downgrading", () => {
    const result = importAppState(
      JSON.stringify({
        format: "dylan-pitching-os.export",
        formatVersion: 1,
        state: { ...SAVED, version: SCHEMA_VERSION + 1 },
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0].path).toBe("state.version");
  });

  it("accepts a bare state object with a warning", () => {
    const result = importAppState(JSON.stringify(SAVED));
    expect(result.ok).toBe(true);
    expect(result.warnings.some((issue) => /no export envelope/.test(issue.message))).toBe(true);
  });

  it("warns when the declared record count disagrees with the contents", () => {
    const result = importAppState(
      JSON.stringify({ format: "dylan-pitching-os.export", formatVersion: 1, recordCount: 99, state: SAVED })
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.some((issue) => issue.path === "recordCount")).toBe(true);
  });

  it("never partially applies a rejected file", () => {
    const result = importAppState("{ broken");
    expect(result.ok).toBe(false);
    expect(result.state).toBeUndefined();
  });
});
