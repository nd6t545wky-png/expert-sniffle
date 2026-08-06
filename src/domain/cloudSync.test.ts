import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { PitchingOsApi } from "./api";
import { AppState } from "./state";
import { encryptCloudSnapshot } from "./sync";
import { pullAndMerge, pushState, syncNow } from "./cloudSync";

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

/** Minimal in-memory server implementing the revision semantics. */
function fakeServer(initial: { payload?: string; revision: number }) {
  const store = { ...initial };
  const fetcher = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const path = String(url);
    if (path.includes("/api/sync") && (init.method ?? "GET") === "GET") {
      return new Response(
        JSON.stringify(
          store.payload ? { found: true, payload: store.payload, revision: store.revision } : { found: false, revision: 0 }
        ),
        { status: 200 }
      );
    }
    if (path.includes("/api/sync") && init.method === "PUT") {
      const body = JSON.parse(String(init.body));
      if (body.expectedRevision !== store.revision) {
        return new Response(
          JSON.stringify({ error: "A newer encrypted save exists.", code: "sync_conflict", currentRevision: store.revision }),
          { status: 409 }
        );
      }
      store.payload = body.payload;
      store.revision += 1;
      return new Response(JSON.stringify({ saved: true, revision: store.revision }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }) as unknown as typeof fetch;

  return { store, api: new PitchingOsApi({ fetcher, syncKey: KEY }) };
}

describe("pullAndMerge", () => {
  it("reports no-remote when the server has nothing", async () => {
    const { api } = fakeServer({ revision: 0 });
    const result = await pullAndMerge({ api, syncKey: KEY, subtle }, state());
    expect(result.status).toBe("no-remote");
    expect(result.changed).toBe(false);
  });

  it("merges remote records into local state", async () => {
    const remote = state({ pre: { "2026-08-01": { score: 70, submittedAt: "2026-08-01T00:00:00Z" } } });
    const payload = await encryptCloudSnapshot(remote, KEY, subtle);
    const { api } = fakeServer({ payload, revision: 3 });

    const local = state({ pre: { "2026-08-05": { score: 90, submittedAt: "2026-08-05T00:00:00Z" } } });
    const result = await pullAndMerge({ api, syncKey: KEY, subtle }, local);

    expect(result.status).toBe("synced");
    expect(result.revision).toBe(3);
    expect(Object.keys(result.state.pre).sort()).toEqual(["2026-08-01", "2026-08-05"]);
    expect(result.changed).toBe(true);
  });

  it("keeps the newer of two conflicting records", async () => {
    const remote = state({ pre: { d: { score: 10, submittedAt: "2026-08-01T00:00:00Z" } } });
    const payload = await encryptCloudSnapshot(remote, KEY, subtle);
    const { api } = fakeServer({ payload, revision: 1 });

    const local = state({ pre: { d: { score: 99, submittedAt: "2026-08-05T00:00:00Z" } } });
    const result = await pullAndMerge({ api, syncKey: KEY, subtle }, local);
    expect((result.state.pre.d as { score: number }).score).toBe(99);
  });
});

describe("pushState", () => {
  it("writes and advances the revision", async () => {
    const { api, store } = fakeServer({ revision: 0 });
    const result = await pushState({ api, syncKey: KEY, subtle }, state({ pre: { d: { score: 1 } } }), 0);

    expect(result.status).toBe("synced");
    expect(result.revision).toBe(1);
    expect(store.payload).toBeDefined();
  });

  it("stores ciphertext, not readable training data", async () => {
    const { api, store } = fakeServer({ revision: 0 });
    await pushState({ api, syncKey: KEY, subtle }, state({ pre: { d: { note: "shoulder soreness" } } }), 0);
    expect(store.payload).not.toContain("shoulder");
  });

  it("recovers from a conflict by merging and retrying", async () => {
    // Server already at revision 5 with another device's record.
    const remote = state({ pre: { "2026-08-01": { score: 70, submittedAt: "2026-08-01T00:00:00Z" } } });
    const payload = await encryptCloudSnapshot(remote, KEY, subtle);
    const { api, store } = fakeServer({ payload, revision: 5 });

    // We think we're at revision 2 — stale.
    const local = state({ pre: { "2026-08-05": { score: 90, submittedAt: "2026-08-05T00:00:00Z" } } });
    const result = await pushState({ api, syncKey: KEY, subtle }, local, 2);

    expect(result.status).toBe("conflict-resolved");
    expect(store.revision).toBe(6);

    // Neither device's data was lost.
    const { decryptCloudSnapshot } = await import("./sync");
    const stored = await decryptCloudSnapshot(store.payload as string, KEY, subtle);
    expect(Object.keys(stored.pre as object).sort()).toEqual(["2026-08-01", "2026-08-05"]);
  });

  it("does not swallow a non-conflict error", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 })) as unknown as typeof fetch;
    const api = new PitchingOsApi({ fetcher, syncKey: KEY });
    await expect(pushState({ api, syncKey: KEY, subtle }, state(), 0)).rejects.toThrow("boom");
  });
});

describe("syncNow", () => {
  it("completes a full round trip", async () => {
    const { api, store } = fakeServer({ revision: 0 });
    const result = await syncNow({ api, syncKey: KEY, subtle }, state({ pre: { d: { score: 5 } } }));
    expect(result.status).toBe("synced");
    expect(store.revision).toBe(1);
  });

  it("merges an existing remote snapshot rather than clobbering it", async () => {
    const remote = state({ pre: { "2026-08-01": { score: 70, submittedAt: "2026-08-01T00:00:00Z" } } });
    const payload = await encryptCloudSnapshot(remote, KEY, subtle);
    const { api, store } = fakeServer({ payload, revision: 1 });

    const local = state({ pre: { "2026-08-05": { score: 90, submittedAt: "2026-08-05T00:00:00Z" } } });
    await syncNow({ api, syncKey: KEY, subtle }, local);

    const { decryptCloudSnapshot } = await import("./sync");
    const stored = await decryptCloudSnapshot(store.payload as string, KEY, subtle);
    expect(Object.keys(stored.pre as object).sort()).toEqual(["2026-08-01", "2026-08-05"]);
  });

  it("reports failure without throwing, so the UI can stay usable offline", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const api = new PitchingOsApi({ fetcher, syncKey: KEY });

    const local = state({ pre: { d: { score: 1 } } });
    const result = await syncNow({ api, syncKey: KEY, subtle }, local);

    expect(result.status).toBe("failed");
    expect(result.message).toContain("Failed to fetch");
    // Local data must be handed back untouched.
    expect(result.state).toEqual(local);
  });

  it("never returns a state missing local records after a failure", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    const api = new PitchingOsApi({ fetcher, syncKey: KEY });
    const local = state({ pre: { a: { x: 1 }, b: { x: 2 } } });
    const result = await syncNow({ api, syncKey: KEY, subtle }, local);
    expect(Object.keys(result.state.pre).sort()).toEqual(["a", "b"]);
  });
});
