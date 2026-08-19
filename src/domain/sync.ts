/**
 * Encrypted cloud sync.
 *
 * The server only ever stores an opaque ciphertext blob: encryption and
 * decryption happen here, on the device, keyed by the athlete's sync key.
 * The key never leaves the client, so the server cannot read training data.
 *
 * Crypto and merge semantics are ported verbatim from the prototype
 * (`legacy/app.js`) — the key-derivation string, envelope shape and
 * last-write-wins rules must stay byte-compatible or existing cloud backups
 * become unreadable.
 */

import { AppState, EPHEMERAL_KEYS } from "./state";

export const SYNC_KEY_PATTERN = /^[a-f0-9]{64}$/i;

/** Key-derivation salt. Changing this orphans every existing backup. */
const KEY_MATERIAL_PREFIX = "pitching-os-data-v1:";

export interface CloudEnvelope {
  version: 1;
  iv: string;
  data: string;
}

export function generateSyncKey(random: Crypto = crypto): string {
  const bytes = random.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isValidSyncKey(value: unknown): value is string {
  return typeof value === "string" && SYNC_KEY_PATTERN.test(value);
}

export function normalizeSyncKey(value: string): string {
  return String(value || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Copy into a concrete ArrayBuffer — SubtleCrypto will not take a view
 *  whose buffer might be a SharedArrayBuffer. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function deriveCloudEncryptionKey(syncKey: string, subtle: SubtleCrypto = crypto.subtle): Promise<CryptoKey> {
  const material = new TextEncoder().encode(`${KEY_MATERIAL_PREFIX}${syncKey}`);
  const digest = await subtle.digest("SHA-256", material);
  return subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * The snapshot pushed to the cloud. UI position and locally-derived training
 * history are excluded — they are per-device, not shared state.
 */
export function cloudSnapshot(state: AppState): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...state };
  for (const key of [...EPHEMERAL_KEYS, "editingPost", "trainingHistory"]) delete copy[key];
  return { ...copy, version: 1 };
}

export async function encryptJsonEnvelope(value: unknown, syncKey: string, subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveCloudEncryptionKey(syncKey, subtle);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const envelope: CloudEnvelope = {
    version: 1,
    iv: bytesToBase64Url(iv),
    data: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

export async function decryptJsonEnvelope(payload: string, syncKey: string, subtle: SubtleCrypto = crypto.subtle): Promise<unknown> {
  const envelope = JSON.parse(payload);
  if (envelope?.version !== 1 || typeof envelope.iv !== "string" || typeof envelope.data !== "string") {
    throw new Error("Unsupported cloud backup");
  }
  const key = await deriveCloudEncryptionKey(syncKey, subtle);
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64UrlToBytes(envelope.iv)) },
    key,
    toArrayBuffer(base64UrlToBytes(envelope.data))
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function encryptCloudSnapshot(state: AppState, syncKey: string, subtle?: SubtleCrypto): Promise<string> {
  return encryptJsonEnvelope(cloudSnapshot(state), syncKey, subtle);
}

export async function decryptCloudSnapshot(payload: string, syncKey: string, subtle?: SubtleCrypto): Promise<Record<string, unknown>> {
  const parsed = (await decryptJsonEnvelope(payload, syncKey, subtle)) as Record<string, unknown> | null;
  if (!parsed || parsed.version !== 1 || typeof parsed.pre !== "object" || typeof parsed.post !== "object") {
    throw new Error("Invalid cloud backup");
  }
  return parsed;
}

// --- Merge ------------------------------------------------------------------

const TIMESTAMP_FIELDS = [
  "updatedAt",
  "fetchedAt",
  "recordedAt",
  "completedAt",
  "submittedAt",
  "createdAt",
  "approvedAt",
] as const;

/** Best available timestamp on a record, for last-write-wins comparison. */
export function recordTimestamp(record: unknown, fallback = 0): number {
  if (!record || typeof record !== "object") return fallback;
  const map = record as Record<string, unknown>;
  for (const field of TIMESTAMP_FIELDS) {
    const parsed = Date.parse(String(map[field] ?? ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

type AnyMap = Record<string, unknown> | undefined;

/** Per-key last-write-wins. Records present on only one side are kept. */
export function mergeRecordMaps(remoteMap: AnyMap = {}, localMap: AnyMap = {}, remoteFallback = 0, localFallback = 0) {
  const output: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(remoteMap || {}), ...Object.keys(localMap || {})])) {
    const remote = remoteMap?.[key];
    const local = localMap?.[key];
    if (remote === undefined) output[key] = local;
    else if (local === undefined) output[key] = remote;
    else output[key] = recordTimestamp(local, localFallback) >= recordTimestamp(remote, remoteFallback) ? local : remote;
  }
  return output;
}

/**
 * Completed tasks merge by union when neither side is timestamped, so a task
 * logged on two devices offline is not lost. Once either side carries an
 * update time, the newer side wins outright.
 */
export function mergeTaskCompletion(
  remoteMap: Record<string, string[]> = {},
  localMap: Record<string, string[]> = {},
  remoteUpdated: Record<string, string> = {},
  localUpdated: Record<string, string> = {}
): Record<string, string[]> {
  const output: Record<string, string[]> = {};
  for (const key of new Set([...Object.keys(remoteMap || {}), ...Object.keys(localMap || {})])) {
    const remoteTime = Date.parse(remoteUpdated?.[key] || "") || 0;
    const localTime = Date.parse(localUpdated?.[key] || "") || 0;
    output[key] =
      remoteTime || localTime
        ? [...(localTime >= remoteTime ? remoteMapFallback(localMap, key) : remoteMapFallback(remoteMap, key))]
        : [...new Set([...remoteMapFallback(remoteMap, key), ...remoteMapFallback(localMap, key)])];
  }
  return output;
}

function remoteMapFallback(map: Record<string, string[]> | undefined, key: string): string[] {
  return map?.[key] || [];
}

export function mergeTimestampMaps(
  remoteMap: Record<string, string> = {},
  localMap: Record<string, string> = {}
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const key of new Set([...Object.keys(remoteMap || {}), ...Object.keys(localMap || {})])) {
    const remoteTime = Date.parse(remoteMap?.[key] || "") || 0;
    const localTime = Date.parse(localMap?.[key] || "") || 0;
    output[key] = (localTime >= remoteTime ? localMap?.[key] : remoteMap?.[key]) as string;
  }
  return output;
}

/** Merge arrays of records by id, newest wins. */
export function mergeRecordsById<T extends { id?: string }>(
  remoteItems: T[] = [],
  localItems: T[] = [],
  remoteFallback = 0,
  localFallback = 0
): T[] {
  const output = new Map<string, T>();
  for (const item of [...remoteItems, ...localItems]) {
    const id = item?.id || JSON.stringify(item);
    const existing = output.get(id);
    if (!existing) {
      output.set(id, item);
      continue;
    }
    const itemFallback = localItems.includes(item) ? localFallback : remoteFallback;
    const existingFallback = localItems.includes(existing) ? localFallback : remoteFallback;
    if (recordTimestamp(item, itemFallback) >= recordTimestamp(existing, existingFallback)) output.set(id, item);
  }
  return [...output.values()];
}

/**
 * Merge a remote snapshot into local state.
 *
 * Union-of-keys throughout: a record that exists on only one side always
 * survives. Conflicts resolve by timestamp, never by dropping a side.
 */
export function mergeCloudSnapshot(remote: Record<string, unknown>, local: AppState): AppState {
  const remoteFallback = Date.parse(String(remote.syncUpdatedAt ?? "")) || 0;
  const localFallback = Date.parse(String(local.syncUpdatedAt ?? "")) || 0;

  return {
    ...local,
    ...remote,
    version: local.version,
    pre: mergeRecordMaps(remote.pre as AnyMap, local.pre, remoteFallback, localFallback),
    post: mergeRecordMaps(remote.post as AnyMap, local.post, remoteFallback, localFallback),
    bullpens: mergeRecordMaps(remote.bullpens as AnyMap, local.bullpens, remoteFallback, localFallback),
    weeklyReviews: mergeRecordMaps(remote.weeklyReviews as AnyMap, local.weeklyReviews, remoteFallback, localFallback),
    healthPrefill: mergeRecordMaps(remote.healthPrefill as AnyMap, local.healthPrefill, remoteFallback, localFallback),
    pulseImports: mergeRecordMaps(remote.pulseImports as AnyMap, local.pulseImports, remoteFallback, localFallback),
    completedTasks: mergeTaskCompletion(
      remote.completedTasks as Record<string, string[]>,
      local.completedTasks as Record<string, string[]>,
      remote.taskCompletionUpdatedAt as Record<string, string>,
      local.taskCompletionUpdatedAt as Record<string, string>
    ),
    taskCompletionUpdatedAt: mergeTimestampMaps(
      remote.taskCompletionUpdatedAt as Record<string, string>,
      local.taskCompletionUpdatedAt as Record<string, string>
    ),
    skippedTasks: mergeRecordMaps(remote.skippedTasks as AnyMap, local.skippedTasks, remoteFallback, localFallback),
    ...mergeIdArrays(remote, local, remoteFallback, localFallback),
    syncUpdatedAt: new Date(Math.max(remoteFallback, localFallback) || Date.now()).toISOString(),
  } as AppState;
}

/**
 * State that is a list of records with ids rather than a map keyed by date.
 *
 * These went through the spread above and so were resolved whole-list: the
 * remote copy replaced the local one, and anything added on this device since
 * the last sync was gone. `mergeRecordsById` existed and was tested for
 * precisely this and had never been wired in.
 *
 * It matters most for `soreness`. Losing a game or an arm screen costs a row
 * of history; losing a pain report means the app stops knowing an elbow hurts
 * and puts the throwing back in.
 */
const ID_ARRAY_FIELDS = ["games", "armExams", "kinematics", "soreness"] as const;

function mergeIdArrays(
  remote: Record<string, unknown>,
  local: AppState,
  remoteFallback: number,
  localFallback: number
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const field of ID_ARRAY_FIELDS) {
    const remoteItems = remote[field];
    const localItems = local[field];
    // Absent on both sides stays absent, rather than becoming an empty array
    // that a later reader cannot tell from "cleared".
    if (!Array.isArray(remoteItems) && !Array.isArray(localItems)) continue;
    merged[field] = mergeRecordsById(
      Array.isArray(remoteItems) ? (remoteItems as { id?: string }[]) : [],
      Array.isArray(localItems) ? (localItems as { id?: string }[]) : [],
      remoteFallback,
      localFallback
    );
  }
  return merged;
}

// --- Conflict handling -------------------------------------------------------

export interface SyncGetResponse {
  found: boolean;
  payload?: string;
  revision: number;
  updatedAt?: string;
}

export interface SyncPutResponse {
  saved?: boolean;
  revision?: number;
  updatedAt?: string;
  error?: string;
  code?: string;
  currentRevision?: number;
}

export function isSyncConflict(response: SyncPutResponse): boolean {
  return response.code === "sync_conflict";
}
