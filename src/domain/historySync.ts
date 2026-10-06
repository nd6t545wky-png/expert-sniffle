/**
 * Moving training history to and from `/api/history`.
 *
 * Each event is encrypted whole under the sync key, exactly as the prototype
 * does it, so the server holds only the day, the coarse event type and
 * ciphertext. Reading back checks the decrypted event against the row it came
 * in — a row whose ciphertext says a different id, day or type than the row
 * itself is refused rather than imported.
 *
 * Uploads are idempotent: the server ignores an id it already has, so a batch
 * that succeeded but whose response was lost is simply sent again.
 */

import { PitchingOsApi } from "./api";
import { decryptJsonEnvelope, encryptJsonEnvelope } from "./sync";
import {
  HISTORY_EVENT_TYPE,
  TrainingHistory,
  hydrateTrainingHistory,
  importRemoteHistoryEvents,
  markHistoryEventsUploaded,
  pendingHistoryEvents,
} from "./trainingHistory";

export interface HistorySyncDeps {
  api: PitchingOsApi;
  syncKey: string;
  subtle?: SubtleCrypto;
  now?: () => string;
}

/** The server accepts at most 50 per request; 20 keeps each well under 1 MB. */
const UPLOAD_BATCH = 20;
const PAGE_LIMIT = 500;
/** 50,000 events. Far beyond a real history; a loop guard, not a quota. */
const MAX_PAGES = 100;

/**
 * Upload everything not yet accepted. Returns the history with those events
 * marked uploaded. A failure part-way keeps the batches that did succeed.
 */
export async function pushPendingHistory(
  deps: HistorySyncDeps,
  historyValue: unknown
): Promise<{ history: TrainingHistory; uploaded: number; error?: string }> {
  let history = hydrateTrainingHistory(historyValue);
  const pending = pendingHistoryEvents(history);
  let uploaded = 0;
  try {
    for (let index = 0; index < pending.length; index += UPLOAD_BATCH) {
      const batch = pending.slice(index, index + UPLOAD_BATCH);
      const events = await Promise.all(
        batch.map(async (event) => ({
          id: event.id,
          eventType: HISTORY_EVENT_TYPE[event.collection],
          sessionDay: event.date,
          occurredAt: event.occurredAt,
          encryptedPayload: await encryptJsonEnvelope(event, deps.syncKey, deps.subtle),
        }))
      );
      const result = await deps.api.postHistory(events);
      history = markHistoryEventsUploaded(
        history,
        batch.map((event) => event.id),
        result.createdAt || (deps.now?.() ?? new Date().toISOString())
      );
      uploaded += batch.length;
    }
    return { history, uploaded };
  } catch (error) {
    return { history, uploaded, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Read the whole server-side history and merge it into the local copy. */
export async function pullRemoteHistory(deps: HistorySyncDeps, historyValue: unknown): Promise<TrainingHistory> {
  let history = hydrateTrainingHistory(historyValue);
  let cursor: { occurredAt: string; id: string } | null = null;
  let pages = 0;
  do {
    const result = await deps.api.getHistory({ limit: PAGE_LIMIT, after: cursor ?? undefined });
    const decrypted: unknown[] = [];
    for (const row of result.events ?? []) {
      const event = (await decryptJsonEnvelope(row.encryptedPayload, deps.syncKey, deps.subtle)) as Record<string, unknown> | null;
      const collection = event?.collection as keyof typeof HISTORY_EVENT_TYPE | undefined;
      if (
        !event ||
        event.id !== row.id ||
        event.date !== row.sessionDay ||
        !collection ||
        HISTORY_EVENT_TYPE[collection] !== row.eventType
      ) {
        throw new Error("A training-history record failed its integrity check");
      }
      decrypted.push(event);
    }
    history = importRemoteHistoryEvents(history, decrypted, deps.now?.() ?? new Date().toISOString());
    cursor = isCursor(result.nextCursor) ? result.nextCursor : null;
    pages += 1;
    if (pages >= MAX_PAGES && cursor) throw new Error("Training history exceeded the safe transfer limit");
  } while (cursor);
  return history;
}

function isCursor(value: unknown): value is { occurredAt: string; id: string } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { occurredAt?: unknown }).occurredAt === "string" &&
    typeof (value as { id?: unknown }).id === "string"
  );
}
