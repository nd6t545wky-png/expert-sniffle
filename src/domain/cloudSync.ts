/**
 * Cloud sync orchestration: pull, merge, push, and conflict recovery.
 *
 * Kept separate from both the API client and the crypto so the ordering
 * rules — which are where data actually gets lost — can be tested directly.
 *
 * The rule throughout: never overwrite the server with a snapshot that has
 * not been merged against what the server currently holds.
 */

import { ApiError, PitchingOsApi } from "./api";
import { AppState } from "./state";
import { decryptCloudSnapshot, encryptCloudSnapshot, mergeCloudSnapshot } from "./sync";

export interface SyncOutcome {
  status: "synced" | "no-remote" | "conflict-resolved" | "failed";
  state: AppState;
  revision: number;
  message?: string;
  /** True when the local state changed as a result of syncing. */
  changed: boolean;
}

export interface SyncDeps {
  api: PitchingOsApi;
  syncKey: string;
  subtle?: SubtleCrypto;
}

/**
 * Pull the remote snapshot and merge it into local state without pushing.
 * Used on startup so a second device sees existing data before writing.
 */
export async function pullAndMerge(deps: SyncDeps, local: AppState): Promise<SyncOutcome> {
  const remote = await deps.api.getSync();

  if (!remote.found || !remote.payload) {
    return { status: "no-remote", state: local, revision: remote.revision ?? 0, changed: false };
  }

  const snapshot = await decryptCloudSnapshot(remote.payload, deps.syncKey, deps.subtle);
  const merged = mergeCloudSnapshot(snapshot, local);
  return {
    status: "synced",
    state: merged,
    revision: remote.revision,
    changed: JSON.stringify(merged) !== JSON.stringify(local),
  };
}

/**
 * Push local state, merging first and retrying once on a version conflict.
 *
 * A 409 means another device wrote while we were working. The only safe
 * response is to re-read, merge again, and retry with the revision the
 * server actually has — never to force the write through.
 */
export async function pushState(deps: SyncDeps, local: AppState, knownRevision: number): Promise<SyncOutcome> {
  const attempt = async (state: AppState, revision: number): Promise<SyncOutcome> => {
    const payload = await encryptCloudSnapshot(state, deps.syncKey, deps.subtle);
    const response = await deps.api.putSync(payload, revision);
    return {
      status: "synced",
      state,
      revision: response.revision ?? revision + 1,
      changed: false,
    };
  };

  try {
    return await attempt(local, knownRevision);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error;

    // Conflict: take what the server has, merge, and try once more.
    const pulled = await pullAndMerge(deps, local);
    const retried = await attempt(pulled.state, pulled.revision);
    return {
      ...retried,
      status: "conflict-resolved",
      changed: pulled.changed,
      message: "Another device had newer data; the two have been merged.",
    };
  }
}

/**
 * Full round trip: pull, merge, push the merged result.
 * This is what a "Sync now" action should call.
 */
export async function syncNow(deps: SyncDeps, local: AppState): Promise<SyncOutcome> {
  try {
    const pulled = await pullAndMerge(deps, local);
    const pushed = await pushState(deps, pulled.state, pulled.revision);
    return {
      ...pushed,
      status: pushed.status === "conflict-resolved" ? "conflict-resolved" : "synced",
      changed: pulled.changed,
    };
  } catch (error) {
    return {
      status: "failed",
      state: local,
      revision: 0,
      changed: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
