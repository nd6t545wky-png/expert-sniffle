import { describe, expect, it, vi } from "vitest";
import { ApiError, PitchingOsApi } from "./api";

const KEY = "a".repeat(64);

function stub(body: unknown, status = 200, capture?: { calls: [string, RequestInit][] }) {
  return vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    capture?.calls.push([String(url), init]);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("auth headers", () => {
  it("sends the sync key as a bearer token", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ ok: true }, 200, capture), syncKey: KEY });
    await api.health();
    const headers = capture.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it("omits the header when there is no key", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ ok: true }, 200, capture) });
    await api.health();
    expect((capture.calls[0][1].headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("picks up a key set after construction", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ ok: true }, 200, capture) });
    api.setSyncKey(KEY);
    await api.health();
    expect((capture.calls[0][1].headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });
});

describe("error handling", () => {
  it("throws ApiError carrying the status", async () => {
    const api = new PitchingOsApi({ fetcher: stub({ error: "Invalid recovery key" }, 401) });
    await expect(api.getSync()).rejects.toBeInstanceOf(ApiError);
    await expect(api.getSync()).rejects.toThrow("Invalid recovery key");
  });

  it("exposes the status code and body for callers to branch on", async () => {
    const api = new PitchingOsApi({ fetcher: stub({ error: "Too many requests" }, 429) });
    await api.health().catch((error: ApiError) => {
      expect(error.status).toBe(429);
      expect(error.body).toEqual({ error: "Too many requests" });
    });
  });

  it("falls back to a generic message when the body has no error field", async () => {
    const api = new PitchingOsApi({ fetcher: stub({}, 500) });
    await expect(api.health()).rejects.toThrow(/Request failed \(500\)/);
  });

  it("tolerates a non-JSON body", async () => {
    const api = new PitchingOsApi({ fetcher: stub("upstream exploded", 502) });
    await expect(api.health()).rejects.toThrow(/Request failed \(502\)/);
  });

  it("handles an empty body on success", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 200 })) as unknown as typeof fetch;
    const api = new PitchingOsApi({ fetcher });
    await expect(api.health()).resolves.toBeUndefined();
  });
});

describe("sync", () => {
  it("PUTs payload and expected revision", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ saved: true, revision: 3 }, 200, capture), syncKey: KEY });
    const result = await api.putSync("ciphertext", 2);

    expect(result.revision).toBe(3);
    const [url, init] = capture.calls[0];
    expect(url).toContain("/api/sync");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ payload: "ciphertext", expectedRevision: 2 });
  });

  it("surfaces a sync conflict as an ApiError with the code intact", async () => {
    const api = new PitchingOsApi({
      fetcher: stub({ error: "A newer encrypted save exists.", code: "sync_conflict", currentRevision: 5 }, 409),
      syncKey: KEY,
    });
    await api.putSync("x", 2).catch((error: ApiError) => {
      expect(error.status).toBe(409);
      expect((error.body as { code: string }).code).toBe("sync_conflict");
      expect((error.body as { currentRevision: number }).currentRevision).toBe(5);
    });
  });

  it("reads a stored snapshot", async () => {
    const api = new PitchingOsApi({
      fetcher: stub({ found: true, payload: "ciphertext", revision: 4 }),
      syncKey: KEY,
    });
    const result = await api.getSync();
    expect(result.found).toBe(true);
    expect(result.revision).toBe(4);
  });
});

describe("integrations", () => {
  it("requests an Oura authorize URL", async () => {
    const api = new PitchingOsApi({ fetcher: stub({ authorizeUrl: "https://cloud.ouraring.com/oauth/authorize?x=1" }), syncKey: KEY });
    expect((await api.ouraConnect()).authorizeUrl).toContain("ouraring.com");
  });

  it("reports Oura status", async () => {
    const api = new PitchingOsApi({ fetcher: stub({ configured: true, connected: false, scopes: "", updatedAt: "" }), syncKey: KEY });
    const status = await api.ouraStatus();
    expect(status.configured).toBe(true);
    expect(status.connected).toBe(false);
  });

  it("returns the Apple upload token exactly once", async () => {
    const api = new PitchingOsApi({
      fetcher: stub({ connected: true, uploadToken: "b".repeat(64), endpoint: "https://x/api/integrations/apple/ingest", note: "shown once" }),
      syncKey: KEY,
    });
    const setup = await api.appleSetup();
    expect(setup.uploadToken).toHaveLength(64);
    expect(setup.note).toContain("once");
  });

  it("builds the daily health query with refresh", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ day: "2026-08-05", merged: {}, sources: {} }, 200, capture), syncKey: KEY });
    await api.dailyHealth("2026-08-05", true);
    expect(capture.calls[0][0]).toContain("day=2026-08-05");
    expect(capture.calls[0][0]).toContain("refresh=1");
  });

  it("omits refresh when not asked for", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({}, 200, capture), syncKey: KEY });
    await api.dailyHealth("2026-08-05");
    expect(capture.calls[0][0]).not.toContain("refresh");
  });
});

describe("nutrition", () => {
  it("posts a meal description with the day", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ estimate: {}, notice: "" }, 200, capture), syncKey: KEY });
    await api.analyzeMealText("chicken and rice", "2026-08-05");
    expect(JSON.parse(String(capture.calls[0][1].body))).toEqual({ description: "chicken and rice", day: "2026-08-05" });
  });

  it("encodes barcode lookups", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ found: false }, 200, capture), syncKey: KEY });
    await api.lookupBarcode("9300605123457");
    expect(capture.calls[0][0]).toContain("code=9300605123457");
  });

  it("encodes restaurant queries so separators cannot inject parameters", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ found: false }, 200, capture), syncKey: KEY });
    await api.lookupRestaurant("Grill'd", "Beef & Bacon");
    const url = capture.calls[0][0];

    // The ampersand is the dangerous one — unencoded it would start a new
    // query parameter. (encodeURIComponent intentionally leaves ' alone.)
    expect(url).toContain("item=Beef%20%26%20Bacon");
    expect(url.split("?")[1].split("&")).toHaveLength(2);
  });

  it("cannot be tricked into adding a parameter via user input", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ found: false }, 200, capture), syncKey: KEY });
    await api.lookupRestaurant("x&admin=1", "y");
    const params = new URLSearchParams(capture.calls[0][0].split("?")[1]);
    expect(params.get("admin")).toBeNull();
    expect(params.get("restaurant")).toBe("x&admin=1");
  });

  it("sends a meal photo as the raw body with its content type", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ estimate: {} }, 200, capture), syncKey: KEY });
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    await api.analyzeMealPhoto(blob, "2026-08-05", "post training");

    const [url, init] = capture.calls[0];
    expect(url).toContain("day=2026-08-05");
    expect(url).toContain("notes=post+training");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("image/jpeg");
    expect(init.body).toBe(blob);
  });
});

describe("mechanics", () => {
  it("uploads a video with its metadata in the query", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ saved: true, id: "x", playbackUrl: "/p" }, 200, capture), syncKey: KEY });
    const blob = new Blob([new Uint8Array([1])], { type: "video/mp4" });
    await api.uploadMechanicsVideo("abcdefghijkl", blob, {
      fileName: "bullpen.mp4",
      angle: "open_side",
      capturedOn: "2026-08-05",
    });

    const [url, init] = capture.calls[0];
    expect(url).toContain("/api/mechanics/videos/abcdefghijkl");
    expect(url).toContain("angle=open_side");
    expect(url).toContain("capturedOn=2026-08-05");
    expect(init.method).toBe("PUT");
  });

  it("requests AI screening with angle and capture date", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ analysis: {} }, 200, capture), syncKey: KEY });
    const sheet = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
    await api.analyzeMechanics(sheet, { angle: "rear", capturedOn: "2026-08-05" });
    expect(capture.calls[0][0]).toContain("angle=rear");
    expect(capture.calls[0][0]).toContain("capturedOn=2026-08-05");
  });

  it("deletes by id", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ deleted: true }, 200, capture), syncKey: KEY });
    await api.deleteMechanicsVideo("abcdefghijkl");
    expect(capture.calls[0][1].method).toBe("DELETE");
  });
});

describe("account", () => {
  it("reads status", async () => {
    const api = new PitchingOsApi({ fetcher: stub({ signedIn: true, workspaceReady: true, syncKey: KEY }) });
    const status = await api.accountStatus();
    expect(status.signedIn).toBe(true);
    expect(status.syncKey).toBe(KEY);
  });

  it("adopts an existing recovery key when creating a workspace", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ workspaceReady: true, syncKey: KEY, adoptedExistingData: true }, 200, capture) });
    await api.createWorkspace(KEY);
    expect(JSON.parse(String(capture.calls[0][1].body))).toEqual({ legacySyncKey: KEY });
  });

  it("sends an empty body when there is no legacy key", async () => {
    const capture = { calls: [] as [string, RequestInit][] };
    const api = new PitchingOsApi({ fetcher: stub({ workspaceReady: true }, 200, capture) });
    await api.createWorkspace();
    expect(JSON.parse(String(capture.calls[0][1].body))).toEqual({});
  });
});
