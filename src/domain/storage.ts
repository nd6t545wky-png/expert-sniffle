/**
 * Storage layer — deliberately free of any UI or DOM coupling.
 *
 * Everything here works against a minimal `StorageLike` interface rather than
 * `window.localStorage`, so it can be unit tested and later reused from React
 * without change.
 *
 * The overriding rule is: never silently destroy user data. Corrupt or
 * unreadable state is backed up before anything overwrites it.
 */

import {
  AppState,
  LEGACY_STORAGE_KEYS,
  ParseIssue,
  SCHEMA_VERSION,
  STORAGE_KEY,
  countRecords,
  parseAppState,
} from "./state";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Where a loaded state came from. */
export type LoadSource = "current" | "legacy" | "empty" | "corrupt";

export interface LoadResult {
  state: AppState | null;
  source: LoadSource;
  /** Key the state was read from, when there was one. */
  key?: string;
  issues: ParseIssue[];
  /** Set when unreadable data was preserved instead of discarded. */
  backupKey?: string;
}

/** Timestamped backup key so repeated failures never overwrite each other. */
export function backupKeyFor(key: string, now: Date = new Date()): string {
  return `${key}.corrupt.${now.toISOString().replace(/[:.]/g, "-")}`;
}

function emptyState(): AppState {
  return {
    version: SCHEMA_VERSION,
    pre: {},
    post: {},
    completedTasks: {},
    skippedTasks: {},
    taskCompletionUpdatedAt: {},
    healthPrefill: {},
    pulseImports: {},
    bullpens: {},
    weeklyReviews: {},
  };
}

/**
 * Read state, preferring the current key and falling back to any legacy key.
 *
 * If the stored JSON cannot be parsed, the raw string is copied to a
 * timestamped backup key and reported via `backupKey` — the caller gets
 * `source: "corrupt"` and can decide what to show. Nothing is deleted.
 */
export function loadAppState(storage: StorageLike, now: Date = new Date()): LoadResult {
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    const raw = storage.getItem(key);
    if (raw === null) continue;

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      const backupKey = backupKeyFor(key, now);
      storage.setItem(backupKey, raw);
      return {
        state: null,
        source: "corrupt",
        key,
        backupKey,
        issues: [{ path: "", message: "Stored data is not valid JSON; the original has been backed up." }],
      };
    }

    const { state, issues } = parseAppState(decoded);
    if (!state) {
      const backupKey = backupKeyFor(key, now);
      storage.setItem(backupKey, raw);
      return { state: null, source: "corrupt", key, backupKey, issues };
    }

    return { state, source: key === STORAGE_KEY ? "current" : "legacy", key, issues };
  }

  return { state: emptyState(), source: "empty", issues: [] };
}

/**
 * Persist state under the current key.
 *
 * Refuses to write a version this build does not understand, so a newer app
 * on the same device can't be downgraded into data loss by an older one.
 */
export function saveAppState(storage: StorageLike, state: AppState): void {
  if (state.version > SCHEMA_VERSION) {
    throw new Error(
      `Refusing to overwrite state written by a newer schema (found v${state.version}, this build understands v${SCHEMA_VERSION}).`
    );
  }
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: SCHEMA_VERSION }));
}

export interface MigrationResult {
  state: AppState;
  /** True when data was adopted from a legacy key. */
  migrated: boolean;
  fromKey?: string;
  recordsCarried: number;
  issues: ParseIssue[];
}

/**
 * Adopt legacy data into the current key, if any exists and the current key
 * is empty. The legacy entry is left in place — removing it is a separate,
 * explicit decision, not a side effect of loading.
 *
 * Migration never runs when current data already exists; overwriting live
 * data with older data would be exactly the silent loss this layer exists to
 * prevent.
 */
export function migrateIfNeeded(storage: StorageLike, now: Date = new Date()): MigrationResult {
  const current = storage.getItem(STORAGE_KEY);
  const loaded = loadAppState(storage, now);

  if (current !== null || loaded.source !== "legacy" || !loaded.state) {
    return {
      state: loaded.state ?? emptyState(),
      migrated: false,
      recordsCarried: loaded.state ? countRecords(loaded.state) : 0,
      issues: loaded.issues,
    };
  }

  saveAppState(storage, loaded.state);
  return {
    state: loaded.state,
    migrated: true,
    fromKey: loaded.key,
    recordsCarried: countRecords(loaded.state),
    issues: loaded.issues,
  };
}
