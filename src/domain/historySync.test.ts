import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { PitchingOsApi } from "./api";
import { encryptJsonEnvelope } from "./sync";
import { pullRemoteHistory, pushPendingHistory } from "./historySync";
import { appendHistoryEvents, hydrateTrainingHistory, pendingHistoryEvents } from "./trainingHistory";

const subtle = (webcrypto as unknown as Crypto).subtle;
if (!globalThis.crypto?.getRandomValues) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

const KEY = "b".repeat(64);
const AT = "2026-10-06T08:00:00.000Z";

interface Row {
  id: string;
  eventType: string;
  sessionDay: string;
  occurredAt: string;
  encryptedPayload: string;
  createdAt: string;
}

/** In-memory `/api/history`: insert-or-ignore by id, cursor paging. */
function fakeServer(options: { pageSize?: number; failPosts?: number } = {}) {
  const rows: Row[] = [];
  let failPosts = options.failPosts ?? 0;
  const fetcher = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const parsed = new URL(String(url), "https://x");
    if ((init.method ?? "GET") === "POST") {
      if (failPosts > 0) {
        failPosts -= 1;
        return new Response(JSON.stringify({ error: "offline" }), { status: 503 });
      }
      const body = JSON.parse(String(init.body)) as { events: Omit<Row, "createdAt">[] };
      for (const event of body.events) {
        if (!rows.some((row) => row.id === event.id)) rows.push({ ...event, createdAt: AT });
      }
      return new Response(JSON.stringify({ saved: true, createdAt: AT }), { status: 201 });
    }
    const limit = Math.min(options.pageSize ?? 500, Number(parsed.searchParams.get("limit")) || 500);
    const after = parsed.searchParams.get("after");
    const afterId = parsed.searchParams.get("afterId") ?? "";
    const sorted = [...rows].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
    const page = sorted
      .filter((row) => !after || row.occurredAt > after || (row.occurredAt === after && row.id > afterId))
      .slice(0, limit);
    const last = page.at(-1);
    return new Response(
      JSON.stringify({
        events: page,
        limit,
        nextCursor: page.length >= limit && last ? { occurredAt: last.occurredAt, id: last.id } : null,
      }),
      { status: 200 }
    );
  });
  return { rows, api: new PitchingOsApi({ fetcher: fetcher as never, syncKey: KEY }) };
}

function history(count: number) {
  return appendHistoryEvents(
    undefined,
    Array.from({ length: count }, (_, i) => ({
      collection: "taskChanges" as const,
      date: "2026-10-06",
      type: "task_completed",
      payload: { taskId: `t${i}` },
      occurredAt: new Date(Date.parse(AT) + i * 1000).toISOString(),
    }))
  );
}

describe("pushPendingHistory", () => {
  it("uploads everything pending, encrypted, and marks it uploaded", async () => {
    const server = fakeServer();
    const result = await pushPendingHistory({ api: server.api, syncKey: KEY, subtle }, history(45));

    expect(result.error).toBeUndefined();
    expect(result.uploaded).toBe(45);
    expect(pendingHistoryEvents(result.history)).toHaveLength(0);
    expect(server.rows).toHaveLength(45);
    expect(server.rows[0].eventType).toBe("task_completion");
    // The server sees the day and coarse type; the task itself is ciphertext.
    expect(server.rows.some((row) => row.encryptedPayload.includes("taskId") || row.encryptedPayload.includes("task_completed"))).toBe(false);
  });

  it("keeps the batches that succeeded when a later one fails", async () => {
    const server = fakeServer();
    const first = await pushPendingHistory({ api: server.api, syncKey: KEY, subtle }, history(5));
    const more = appendHistoryEvents(first.history, [
      { collection: "checkIns", date: "2026-10-07", type: "health_check_in_submitted", payload: {}, occurredAt: AT },
    ]);
    const offline = fakeServer({ failPosts: 1 });
    const result = await pushPendingHistory({ api: offline.api, syncKey: KEY, subtle }, more);
    expect(result.error).toBe("offline");
    expect(pendingHistoryEvents(result.history)).toHaveLength(1);
  });
});

describe("pullRemoteHistory", () => {
  it("reads every page back into a second device's empty history", async () => {
    const server = fakeServer({ pageSize: 7 });
    await pushPendingHistory({ api: server.api, syncKey: KEY, subtle }, history(20));

    const pulled = await pullRemoteHistory({ api: server.api, syncKey: KEY, subtle }, undefined);
    expect(pulled.events).toHaveLength(20);
    expect(pendingHistoryEvents(pulled)).toHaveLength(0);
    expect(pulled.events.map((e) => e.payload.taskId)).toContain("t19");
  });

  it("refuses a row whose ciphertext does not match the row it arrived in", async () => {
    const server = fakeServer();
    const event = hydrateTrainingHistory(history(1)).events[0];
    server.rows.push({
      id: "history_aaaaaaaaaaaaaaaaaaaaaaaa",
      eventType: "task_completion",
      sessionDay: event.date,
      occurredAt: event.occurredAt,
      encryptedPayload: await encryptJsonEnvelope(event, KEY, subtle),
      createdAt: AT,
    });
    await expect(pullRemoteHistory({ api: server.api, syncKey: KEY, subtle }, undefined)).rejects.toThrow(
      /integrity check/
    );
  });
});
