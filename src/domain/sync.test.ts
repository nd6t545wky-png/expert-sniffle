import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { AppState } from "./state";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  cloudSnapshot,
  decryptCloudSnapshot,
  decryptJsonEnvelope,
  encryptCloudSnapshot,
  encryptJsonEnvelope,
  generateSyncKey,
  isSyncConflict,
  isValidSyncKey,
  mergeCloudSnapshot,
  mergeRecordMaps,
  mergeRecordsById,
  mergeTaskCompletion,
  mergeTimestampMaps,
  normalizeSyncKey,
  recordTimestamp,
} from "./sync";

// jsdom does not provide SubtleCrypto; Node's does.
const subtle = (webcrypto as unknown as Crypto).subtle;
if (!globalThis.crypto?.getRandomValues) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

const KEY = "a".repeat(64);

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

describe("sync keys", () => {
  it("generates a 64-character hex key", () => {
    const key = generateSyncKey(webcrypto as unknown as Crypto);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates a different key each time", () => {
    const a = generateSyncKey(webcrypto as unknown as Crypto);
    const b = generateSyncKey(webcrypto as unknown as Crypto);
    expect(a).not.toBe(b);
  });

  it("validates shape", () => {
    expect(isValidSyncKey(KEY)).toBe(true);
    expect(isValidSyncKey("too-short")).toBe(false);
    expect(isValidSyncKey("g".repeat(64))).toBe(false);
    expect(isValidSyncKey(null)).toBe(false);
  });

  it("normalises pasted keys", () => {
    expect(normalizeSyncKey(" AAAA-BBBB ")).toBe("aaaabbbb");
    expect(normalizeSyncKey("zzz")).toBe("");
  });
});

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 250, 255, 128, 64]);
    expect(Array.from(base64UrlToBytes(bytesToBase64Url(bytes)))).toEqual(Array.from(bytes));
  });

  it("produces url-safe output with no padding", () => {
    const encoded = bytesToBase64Url(new Uint8Array([251, 255, 190]));
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe("encryption", () => {
  it("round-trips a snapshot", async () => {
    const payload = await encryptJsonEnvelope({ hello: "world" }, KEY, subtle);
    expect(await decryptJsonEnvelope(payload, KEY, subtle)).toEqual({ hello: "world" });
  });

  it("produces an opaque envelope that does not leak plaintext", async () => {
    const payload = await encryptJsonEnvelope({ secret: "shoulder pain" }, KEY, subtle);
    expect(payload).not.toContain("shoulder");
    const envelope = JSON.parse(payload);
    expect(envelope.version).toBe(1);
    expect(typeof envelope.iv).toBe("string");
    expect(typeof envelope.data).toBe("string");
  });

  it("uses a fresh IV each time, so identical data differs on the wire", async () => {
    const a = await encryptJsonEnvelope({ x: 1 }, KEY, subtle);
    const b = await encryptJsonEnvelope({ x: 1 }, KEY, subtle);
    expect(a).not.toBe(b);
    expect(await decryptJsonEnvelope(a, KEY, subtle)).toEqual(await decryptJsonEnvelope(b, KEY, subtle));
  });

  it("cannot be decrypted with the wrong key", async () => {
    const payload = await encryptJsonEnvelope({ x: 1 }, KEY, subtle);
    await expect(decryptJsonEnvelope(payload, "b".repeat(64), subtle)).rejects.toThrow();
  });

  it("rejects an unsupported envelope version", async () => {
    await expect(decryptJsonEnvelope(JSON.stringify({ version: 2, iv: "x", data: "y" }), KEY, subtle)).rejects.toThrow(
      /Unsupported/
    );
  });

  it("round-trips a full app state snapshot", async () => {
    const source = state({ pre: { "2026-08-05": { score: 88 } }, post: { "2026-08-05": { armFeel: 7 } } });
    const payload = await encryptCloudSnapshot(source, KEY, subtle);
    const restored = await decryptCloudSnapshot(payload, KEY, subtle);
    expect((restored.pre as Record<string, { score: number }>)["2026-08-05"].score).toBe(88);
  });

  it("rejects a decrypted blob that is not a valid snapshot", async () => {
    const payload = await encryptJsonEnvelope({ version: 1, nope: true }, KEY, subtle);
    await expect(decryptCloudSnapshot(payload, KEY, subtle)).rejects.toThrow(/Invalid cloud backup/);
  });
});

describe("cloudSnapshot", () => {
  it("excludes per-device UI position", () => {
    const snapshot = cloudSnapshot(state({ page: "nutrition", selectedWeek: 12, lastOpenDate: "2026-08-05" }));
    expect(snapshot.page).toBeUndefined();
    expect(snapshot.selectedWeek).toBeUndefined();
    expect(snapshot.lastOpenDate).toBeUndefined();
  });

  it("keeps training data", () => {
    const snapshot = cloudSnapshot(state({ pre: { "2026-08-05": { score: 1 } } }));
    expect(snapshot.pre).toEqual({ "2026-08-05": { score: 1 } });
  });
});

describe("recordTimestamp", () => {
  it("reads the first available timestamp field", () => {
    expect(recordTimestamp({ submittedAt: "2026-08-05T00:00:00Z" })).toBe(Date.parse("2026-08-05T00:00:00Z"));
    expect(recordTimestamp({ updatedAt: "2026-08-06T00:00:00Z" })).toBe(Date.parse("2026-08-06T00:00:00Z"));
  });

  it("falls back when there is no usable timestamp", () => {
    expect(recordTimestamp({ nothing: true }, 42)).toBe(42);
    expect(recordTimestamp(null, 7)).toBe(7);
  });
});

describe("mergeRecordMaps", () => {
  it("keeps records that exist on only one side", () => {
    const merged = mergeRecordMaps({ a: { v: 1 } }, { b: { v: 2 } });
    expect(merged).toEqual({ a: { v: 1 }, b: { v: 2 } });
  });

  it("resolves conflicts in favour of the newer record", () => {
    const remote = { a: { v: "remote", updatedAt: "2026-08-01T00:00:00Z" } };
    const local = { a: { v: "local", updatedAt: "2026-08-05T00:00:00Z" } };
    expect((mergeRecordMaps(remote, local) as Record<string, { v: string }>).a.v).toBe("local");
  });

  it("prefers remote when remote is newer", () => {
    const remote = { a: { v: "remote", updatedAt: "2026-08-09T00:00:00Z" } };
    const local = { a: { v: "local", updatedAt: "2026-08-05T00:00:00Z" } };
    expect((mergeRecordMaps(remote, local) as Record<string, { v: string }>).a.v).toBe("remote");
  });

  it("never drops data when both sides are untimestamped", () => {
    const merged = mergeRecordMaps({ a: { v: 1 } }, { a: { v: 2 } });
    expect(merged.a).toBeDefined();
  });
});

describe("mergeTaskCompletion", () => {
  it("unions when neither side is timestamped, so nothing is lost offline", () => {
    const merged = mergeTaskCompletion({ d: ["warmup"] }, { d: ["bullpen"] }, {}, {});
    expect(merged.d.sort()).toEqual(["bullpen", "warmup"]);
  });

  it("takes the newer side outright once timestamps exist", () => {
    const merged = mergeTaskCompletion(
      { d: ["warmup", "bullpen"] },
      { d: ["warmup"] },
      { d: "2026-08-01T00:00:00Z" },
      { d: "2026-08-05T00:00:00Z" }
    );
    expect(merged.d).toEqual(["warmup"]);
  });

  it("keeps a date present on only one side", () => {
    const merged = mergeTaskCompletion({ a: ["x"] }, { b: ["y"] }, {}, {});
    expect(Object.keys(merged).sort()).toEqual(["a", "b"]);
  });
});

describe("mergeTimestampMaps", () => {
  it("keeps the later timestamp per key", () => {
    const merged = mergeTimestampMaps({ a: "2026-08-01T00:00:00Z" }, { a: "2026-08-05T00:00:00Z" });
    expect(merged.a).toBe("2026-08-05T00:00:00Z");
  });
});

describe("mergeRecordsById", () => {
  it("dedupes by id, newest wins", () => {
    const merged = mergeRecordsById(
      [{ id: "1", v: "remote", updatedAt: "2026-08-01T00:00:00Z" }],
      [{ id: "1", v: "local", updatedAt: "2026-08-05T00:00:00Z" }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].v).toBe("local");
  });

  it("keeps distinct ids from both sides", () => {
    const merged = mergeRecordsById([{ id: "1" }], [{ id: "2" }]);
    expect(merged.map((item) => item.id).sort()).toEqual(["1", "2"]);
  });
});

describe("mergeCloudSnapshot", () => {
  it("unions records across both sides", () => {
    const remote = { version: 1, pre: { "2026-08-01": { score: 70 } }, post: {} };
    const local = state({ pre: { "2026-08-05": { score: 90 } } });
    const merged = mergeCloudSnapshot(remote, local);
    expect(Object.keys(merged.pre).sort()).toEqual(["2026-08-01", "2026-08-05"]);
  });

  it("keeps the local schema version", () => {
    const merged = mergeCloudSnapshot({ version: 99, pre: {}, post: {} }, state());
    expect(merged.version).toBe(1);
  });

  it("does not lose a local-only record when remote is newer overall", () => {
    const remote = { version: 1, pre: {}, post: {}, syncUpdatedAt: "2027-01-01T00:00:00Z" };
    const local = state({ pre: { "2026-08-05": { score: 90 } }, syncUpdatedAt: "2026-08-05T00:00:00Z" });
    const merged = mergeCloudSnapshot(remote, local);
    expect(merged.pre["2026-08-05"]).toBeDefined();
  });
});

describe("conflict detection", () => {
  it("recognises the server's conflict code", () => {
    expect(isSyncConflict({ code: "sync_conflict", error: "newer save exists" })).toBe(true);
    expect(isSyncConflict({ saved: true, revision: 2 })).toBe(false);
  });
});

/**
 * Lists of records with ids, which the snapshot merge used to resolve
 * whole-list — remote replaced local, and anything added on this device since
 * the last sync was gone. `mergeRecordsById` was written and tested for this
 * and had never been connected to `mergeCloudSnapshot`.
 */
describe("merging id-keyed lists", () => {
  const local = {
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
  } as AppState;

  it("keeps a pain report made on this device when the remote has not seen it", () => {
    // The failure that matters: the phone logs a sore elbow, the laptop syncs
    // first, and the app stops knowing about it — putting the throwing back in.
    const merged = mergeCloudSnapshot(
      { soreness: [{ id: "old", region: "knee" }] },
      { ...local, soreness: [{ id: "fresh", region: "elbow_medial" }] }
    );
    const ids = (merged.soreness as { id: string }[]).map((entry) => entry.id);
    expect(new Set(ids)).toEqual(new Set(["old", "fresh"]));
  });

  it("does the same for games, arm screens and captures", () => {
    for (const field of ["games", "armExams", "kinematics"] as const) {
      const merged = mergeCloudSnapshot(
        { [field]: [{ id: "remote" }] },
        { ...local, [field]: [{ id: "local" }] }
      );
      const ids = (merged[field] as { id: string }[]).map((entry) => entry.id);
      expect(new Set(ids), field).toEqual(new Set(["remote", "local"]));
    }
  });

  it("resolves a genuine conflict on the same id by timestamp", () => {
    const merged = mergeCloudSnapshot(
      { soreness: [{ id: "a", severity: 2, createdAt: "2026-08-01T00:00:00.000Z" }] },
      { ...local, soreness: [{ id: "a", severity: 8, createdAt: "2026-08-19T00:00:00.000Z" }] }
    );
    expect((merged.soreness as { severity: number }[])[0].severity).toBe(8);
  });

  it("leaves a field absent when neither side has it", () => {
    const merged = mergeCloudSnapshot({}, local);
    expect("soreness" in merged).toBe(false);
    expect("games" in merged).toBe(false);
  });

  it("takes one side's list when the other has none", () => {
    expect(
      (mergeCloudSnapshot({ soreness: [{ id: "a" }] }, local).soreness as unknown[]).length
    ).toBe(1);
    expect(
      (mergeCloudSnapshot({}, { ...local, soreness: [{ id: "a" }] }).soreness as unknown[]).length
    ).toBe(1);
  });
});
